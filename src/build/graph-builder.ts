import * as path from "node:path";
import type { GraphData, GraphLink, GraphNode } from "../types";
import { normalizeRoutePath } from "../utils";
import type { ScannedRouteDocument } from "./cache";
import type { CollectedRoute } from "./types";

export function buildGraphData(
  routes: CollectedRoute[],
  scannedDocuments: ScannedRouteDocument[],
): GraphData {
  const routeByPath = new Map<string, CollectedRoute>();
  const routeByFile = new Map<string, CollectedRoute>();
  const titleByRoute = new Map<string, string | undefined>();

  for (const route of routes) {
    routeByPath.set(route.routePath, route);
    for (const alias of buildFileAliases(route)) {
      routeByFile.set(alias, route);
    }
  }

  for (const scannedDocument of scannedDocuments) {
    titleByRoute.set(scannedDocument.route.routePath, scannedDocument.inferredTitle);
  }

  const links: GraphLink[] = [];
  const seenLinks = new Set<string>();
  const unresolvedLinks = new Map<string, Set<string>>();

  for (const scannedDocument of scannedDocuments) {
    for (const rawLink of scannedDocument.rawLinks) {
      const targetRoute = resolveLinkedRoute(
        scannedDocument.route.absolutePath,
        rawLink,
        routeByPath,
        routeByFile,
      );

      if (!targetRoute) {
        const source = scannedDocument.route.routePath;
        const bucket = unresolvedLinks.get(source);
        if (bucket) {
          bucket.add(rawLink);
        } else {
          unresolvedLinks.set(source, new Set([rawLink]));
        }
        continue;
      }

      const source = scannedDocument.route.routePath;
      const target = targetRoute.routePath;
      const linkKey = `${source}→${target}`;

      if (seenLinks.has(linkKey)) {
        continue;
      }

      seenLinks.add(linkKey);
      links.push({ source, target });
    }
  }

  if (unresolvedLinks.size > 0) {
    const lines: string[] = [];
    for (const [source, targets] of unresolvedLinks) {
      for (const target of targets) {
        lines.push(`  ${source} -> ${target}`);
      }
    }
    console.warn(
      `[rspress-plugin-graph-view] ${unresolvedLinks.size} page(s) reference ${countTargets(unresolvedLinks)} unresolved internal link(s):\n${lines.join("\n")}`,
    );
  }

  const nodes: GraphNode[] = routes.map((route) => ({
    id: route.routePath,
    label: makeNodeLabel(route, titleByRoute.get(route.routePath)),
    routePath: route.routePath,
  }));

  return { nodes, links };
}

function countTargets(unresolvedLinks: Map<string, Set<string>>): number {
  let count = 0;
  for (const targets of unresolvedLinks.values()) {
    count += targets.size;
  }
  return count;
}

function buildFileAliases(route: CollectedRoute): string[] {
  const aliases = new Set<string>();
  const absolute = path.normalize(route.absolutePath);
  aliases.add(absolute);

  const extension = path.extname(absolute);
  const withoutExtension = extension ? absolute.slice(0, -extension.length) : absolute;

  aliases.add(withoutExtension);

  if (path.basename(withoutExtension) === "index") {
    aliases.add(path.dirname(withoutExtension));
  }

  return [...aliases];
}

function resolveLinkedRoute(
  sourceAbsolutePath: string,
  rawLink: string,
  routeByPath: Map<string, CollectedRoute>,
  routeByFile: Map<string, CollectedRoute>,
): CollectedRoute | undefined {
  if (rawLink.startsWith("/")) {
    const normalized = normalizeRoutePath(normalizeAbsoluteLinkTarget(rawLink));

    return routeByPath.get(normalized);
  }

  const basePath = path.resolve(path.dirname(sourceAbsolutePath), rawLink);
  const candidates = new Set<string>();
  const normalizedBase = path.normalize(basePath);
  candidates.add(normalizedBase);

  const extension = path.extname(normalizedBase);
  if (extension) {
    const withoutExtension = normalizedBase.slice(0, -extension.length);
    candidates.add(withoutExtension);
    if (path.basename(withoutExtension) === "index") {
      candidates.add(path.dirname(withoutExtension));
    }
  } else {
    candidates.add(`${normalizedBase}.md`);
    candidates.add(`${normalizedBase}.mdx`);
    candidates.add(path.join(normalizedBase, "index.md"));
    candidates.add(path.join(normalizedBase, "index.mdx"));
  }

  for (const candidate of candidates) {
    const matchedRoute = routeByFile.get(path.normalize(candidate));
    if (matchedRoute) {
      return matchedRoute;
    }
  }

  return undefined;
}

function normalizeAbsoluteLinkTarget(rawLink: string): string {
  return (
    rawLink
      .replace(/\/+$/g, "")
      .replace(/\.(md|mdx)$/i, "")
      .replace(/\/index$/i, "") || "/"
  );
}

function makeNodeLabel(route: CollectedRoute, inferredTitle?: string): string {
  if (inferredTitle) {
    return inferredTitle;
  }

  if (route.routePath === "/") {
    return "Home";
  }

  return route.pageName || route.routePath;
}
