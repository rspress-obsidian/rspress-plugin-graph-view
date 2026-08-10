import { describe, expect, test } from "bun:test";
import type { GraphData } from "../types";
import {
  createGraphIndex,
  deriveGraphViewData,
  LARGE_GRAPH_LINK_THRESHOLD,
  LARGE_GRAPH_NODE_THRESHOLD,
  normalizeClientRoutePath,
} from "./deriveGraphViewData";

describe("deriveGraphViewData", () => {
  test("returns the current node neighborhood without re-scanning the entire graph", () => {
    const graphData: GraphData = {
      nodes: [
        { id: "/", label: "Home", routePath: "/" },
        { id: "/guide", label: "Guide", routePath: "/guide" },
        { id: "/api", label: "API", routePath: "/api" },
      ],
      links: [
        { source: "/", target: "/guide" },
        { source: "/guide", target: "/api" },
      ],
    };

    const graphIndex = createGraphIndex(graphData);
    const derived = deriveGraphViewData(graphIndex, "/guide");

    expect(derived.nodes.map((node) => node.id).sort()).toEqual(["/", "/api", "/guide"]);
    expect(derived.links.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: "/", target: "/guide" },
      { source: "/guide", target: "/api" },
    ]);
    expect(derived.isEmpty).toBe(false);
    expect(derived.nodes.find((node) => node.id === "/guide")?.isCurrent).toBe(true);
  });

  test("returns an empty view when the current route is not present", () => {
    const graphData: GraphData = {
      nodes: [
        { id: "/", label: "Home", routePath: "/" },
        { id: "/guide", label: "Guide", routePath: "/guide" },
      ],
      links: [{ source: "/", target: "/guide" }],
    };

    const graphIndex = createGraphIndex(graphData);
    const derived = deriveGraphViewData(graphIndex, "/missing");

    expect(derived.nodes).toEqual([]);
    expect(derived.links).toEqual([]);
    expect(derived.isEmpty).toBe(true);
  });

  test("marks dense graphs so rendering can disable expensive adornments", () => {
    const graphData: GraphData = {
      nodes: Array.from({ length: LARGE_GRAPH_NODE_THRESHOLD + 1 }, (_, index) => ({
        id: `/node-${index}`,
        label: `Node ${index}`,
        routePath: `/node-${index}`,
      })),
      links: Array.from({ length: LARGE_GRAPH_LINK_THRESHOLD + 1 }, (_, index) => ({
        source: `/node-${index % LARGE_GRAPH_NODE_THRESHOLD}`,
        target: `/node-${(index + 1) % LARGE_GRAPH_NODE_THRESHOLD}`,
      })),
    };

    const graphIndex = createGraphIndex(graphData);
    const derived = deriveGraphViewData(graphIndex, "/node-1");

    expect(derived.isLargeGraph).toBe(false);
    expect(derived.isEmpty).toBe(false);
    expect(derived.nodes.length).toBeGreaterThan(0);
    expect(derived.links.length).toBeGreaterThan(0);
  });

  test("flags reciprocal link pairs with curvature", () => {
    const graphData: GraphData = {
      nodes: [
        { id: "/a", label: "A", routePath: "/a" },
        { id: "/b", label: "B", routePath: "/b" },
      ],
      links: [
        { source: "/a", target: "/b" },
        { source: "/b", target: "/a" },
      ],
    };

    const graphIndex = createGraphIndex(graphData);
    const derived = deriveGraphViewData(graphIndex, "/a");

    expect(derived.isEmpty).toBe(false);
    expect(derived.links).toEqual([
      { source: "/a", target: "/b" },
      { source: "/b", target: "/a" },
    ]);
  });

  test("keeps single-direction links straight", () => {
    const graphData: GraphData = {
      nodes: [
        { id: "/a", label: "A", routePath: "/a" },
        { id: "/b", label: "B", routePath: "/b" },
        { id: "/c", label: "C", routePath: "/c" },
      ],
      links: [
        { source: "/a", target: "/b" },
        { source: "/a", target: "/c" },
      ],
    };

    const graphIndex = createGraphIndex(graphData);
    const derived = deriveGraphViewData(graphIndex, "/a");

    expect(derived.links.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: "/a", target: "/b" },
      { source: "/a", target: "/c" },
    ]);
  });

  test("flags an isolated current page as empty", () => {
    const graphData: GraphData = {
      nodes: [
        { id: "/lonely", label: "Lonely", routePath: "/lonely" },
        { id: "/other", label: "Other", routePath: "/other" },
      ],
      links: [],
    };

    const graphIndex = createGraphIndex(graphData);
    const derived = deriveGraphViewData(graphIndex, "/lonely");

    expect(derived.isEmpty).toBe(true);
    expect(derived.nodes.map((node) => node.id)).toEqual(["/lonely"]);
  });
});

describe("normalizeClientRoutePath", () => {
  test("strips .html suffix", () => {
    expect(normalizeClientRoutePath("/guide/configuration.html")).toBe("/guide/configuration");
  });

  test("strips trailing slashes", () => {
    expect(normalizeClientRoutePath("/guide/")).toBe("/guide");
    expect(normalizeClientRoutePath("/guide//")).toBe("/guide");
  });

  test("handles root", () => {
    expect(normalizeClientRoutePath("/")).toBe("/");
    expect(normalizeClientRoutePath("/index.html")).toBe("/");
  });

  test("maps nested index.html to its directory", () => {
    expect(normalizeClientRoutePath("/guide/index.html")).toBe("/guide");
    expect(normalizeClientRoutePath("/guide/")).toBe("/guide");
  });

  test("leaves clean paths unchanged", () => {
    expect(normalizeClientRoutePath("/guide/getting-started")).toBe("/guide/getting-started");
  });
});
