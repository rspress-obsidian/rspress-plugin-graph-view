import { readFile, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  createGraphSignature,
  type GraphBuildCache,
  hashContent,
  maybeLogGraphBuild,
  pruneStaleDocuments,
  type ScannedRouteDocument,
} from "./cache";
import { buildGraphData } from "./graph-builder";
import { extractDisplayTitle, extractMarkdownLinks } from "./link-extractor";
import type { CollectedRoute, GraphBuildOptions, GraphBuildResult } from "./types";

export { createGraphBuildCache, loadDiskCache, saveDiskCache } from "./cache";
export type {
  CollectedRoute,
  GraphBuildDiagnostics,
  GraphBuildOptions,
  GraphBuildResult,
} from "./types";

export async function buildGraphModule(
  routes: CollectedRoute[],
  cache: GraphBuildCache,
  options: GraphBuildOptions = {},
): Promise<GraphBuildResult> {
  pruneStaleDocuments(cache, routes);

  const diagnostics: GraphBuildResult["diagnostics"] = {
    routeCount: routes.length,
    linkCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    reusedModule: false,
    totalMs: 0,
    statMs: 0,
    parseMs: 0,
    resolveMs: 0,
    serializeMs: 0,
  };

  const shouldProfile = options.profile ?? false;
  const totalStart = performance.now();
  const scannedDocuments = await Promise.all(
    routes.map(async (route) => {
      const statStart = shouldProfile ? performance.now() : 0;
      const fileStat = await stat(route.absolutePath);
      if (shouldProfile) {
        diagnostics.statMs += performance.now() - statStart;
      }

      const cachedDocument = cache.documents.get(route.absolutePath);
      if (
        cachedDocument &&
        cachedDocument.mtimeMs === fileStat.mtimeMs &&
        cachedDocument.size === fileStat.size
      ) {
        diagnostics.cacheHits += 1;
        return {
          route,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
          contentHash: cachedDocument.contentHash,
          inferredTitle: cachedDocument.inferredTitle,
          rawLinks: cachedDocument.rawLinks,
        } satisfies ScannedRouteDocument;
      }

      const parseStart = shouldProfile ? performance.now() : 0;
      const content = await readFile(route.absolutePath, "utf8");
      const inferredTitle = extractDisplayTitle(content);
      const rawLinks = extractMarkdownLinks(content);
      const contentHash = hashContent(content);
      if (shouldProfile) {
        diagnostics.parseMs += performance.now() - parseStart;
      }
      diagnostics.cacheMisses += 1;

      const scannedDocument = {
        route,
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
        contentHash,
        inferredTitle,
        rawLinks,
      } satisfies ScannedRouteDocument;

      cache.documents.set(route.absolutePath, {
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
        contentHash,
        inferredTitle,
        rawLinks,
      });

      return scannedDocument;
    }),
  );

  const signature = createGraphSignature(scannedDocuments);
  if (cache.lastResult?.signature === signature) {
    diagnostics.reusedModule = true;
    diagnostics.linkCount = cache.lastResult.graphData.links.length;
    diagnostics.totalMs = performance.now() - totalStart;
    maybeLogGraphBuild(diagnostics, options.logger, shouldProfile);

    return {
      graphData: cache.lastResult.graphData,
      moduleSource: cache.lastResult.moduleSource,
      diagnostics,
    };
  }

  const resolveStart = shouldProfile ? performance.now() : 0;
  const graphData = buildGraphData(routes, scannedDocuments);
  if (shouldProfile) {
    diagnostics.resolveMs = performance.now() - resolveStart;
  }
  diagnostics.linkCount = graphData.links.length;

  const serializeStart = shouldProfile ? performance.now() : 0;
  const moduleSource = `export const graphData = ${JSON.stringify(graphData)}; export default graphData;`;
  if (shouldProfile) {
    diagnostics.serializeMs = performance.now() - serializeStart;
  }
  diagnostics.totalMs = performance.now() - totalStart;

  cache.lastResult = {
    signature,
    graphData,
    moduleSource,
  };

  maybeLogGraphBuild(diagnostics, options.logger, shouldProfile);

  return {
    graphData,
    moduleSource,
    diagnostics,
  };
}
