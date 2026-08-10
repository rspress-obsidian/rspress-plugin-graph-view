import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CollectedRoute,
  GraphBuildDiagnostics,
  GraphBuildOptions,
  GraphBuildResult,
} from "./types";

/** Bump when the cached document schema changes to invalidate old caches. */
const CACHE_SCHEMA_VERSION = 1;

interface CachedRouteDocument {
  mtimeMs: number;
  size: number;
  contentHash: string;
  inferredTitle?: string;
  rawLinks: string[];
}

interface CachedGraphBuildResult {
  signature: string;
  graphData: GraphBuildResult["graphData"];
  moduleSource: string;
}

export interface GraphBuildCache {
  documents: Map<string, CachedRouteDocument>;
  lastResult?: CachedGraphBuildResult;
}

interface ScannedRouteDocument {
  route: CollectedRoute;
  mtimeMs: number;
  size: number;
  contentHash: string;
  inferredTitle?: string;
  rawLinks: string[];
}

interface DiskCacheFile {
  version: number;
  documents: Record<string, CachedRouteDocument>;
}

export function createGraphBuildCache(cacheDir?: string): GraphBuildCache {
  const cache: GraphBuildCache = {
    documents: new Map<string, CachedRouteDocument>(),
  };

  if (cacheDir) {
    loadDiskCache(cache, cacheDir);
  }

  return cache;
}

/** Load persisted parse results from disk (best-effort; never throws). */
export function loadDiskCache(cache: GraphBuildCache, cacheDir: string): void {
  const filePath = join(cacheDir, "cache.json");
  try {
    const content = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content) as DiskCacheFile;
    if (parsed.version !== CACHE_SCHEMA_VERSION) {
      return;
    }
    for (const [absolutePath, document] of Object.entries(parsed.documents)) {
      cache.documents.set(absolutePath, document);
    }
  } catch {
    // No cache file yet, or it's corrupt — start fresh.
  }
}

/** Persist parse results to disk (best-effort; never throws). */
export function saveDiskCache(cache: GraphBuildCache, cacheDir: string): Promise<void> {
  const filePath = join(cacheDir, "cache.json");
  const payload: DiskCacheFile = {
    version: CACHE_SCHEMA_VERSION,
    documents: Object.fromEntries(cache.documents),
  };

  return mkdir(cacheDir, { recursive: true })
    .then(() => writeFile(filePath, JSON.stringify(payload)))
    .catch(() => {
      // Cache is best-effort; a write failure must not break the build.
    });
}

export function pruneStaleDocuments(cache: GraphBuildCache, routes: CollectedRoute[]): void {
  const activePaths = new Set(routes.map((route) => route.absolutePath));

  for (const absolutePath of cache.documents.keys()) {
    if (!activePaths.has(absolutePath)) {
      cache.documents.delete(absolutePath);
    }
  }
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function createGraphSignature(documents: ScannedRouteDocument[]): string {
  const signatureEntries = documents.map(({ route, mtimeMs, size, contentHash }) => ({
    routePath: route.routePath,
    payload: [
      route.routePath,
      route.absolutePath,
      route.relativePath,
      route.pageName,
      mtimeMs,
      size,
      contentHash,
    ] as const,
  }));

  return JSON.stringify(
    signatureEntries
      .sort((entryA, entryB) => entryA.routePath.localeCompare(entryB.routePath))
      .map((entry) => entry.payload),
  );
}

export function maybeLogGraphBuild(
  diagnostics: GraphBuildDiagnostics,
  logger: GraphBuildOptions["logger"],
  enabled?: boolean,
): void {
  if (!enabled) {
    return;
  }

  const writeLog = logger ?? console.info;
  writeLog(
    [
      "[rspress-plugin-graph-view] graph build",
      `routes=${diagnostics.routeCount}`,
      `links=${diagnostics.linkCount}`,
      `cacheHits=${diagnostics.cacheHits}`,
      `cacheMisses=${diagnostics.cacheMisses}`,
      `reusedModule=${diagnostics.reusedModule}`,
      `total=${diagnostics.totalMs.toFixed(1)}ms`,
      `stat=${diagnostics.statMs.toFixed(1)}ms`,
      `parse=${diagnostics.parseMs.toFixed(1)}ms`,
      `resolve=${diagnostics.resolveMs.toFixed(1)}ms`,
      `serialize=${diagnostics.serializeMs.toFixed(1)}ms`,
    ].join(" | "),
  );
}

export type { ScannedRouteDocument };
