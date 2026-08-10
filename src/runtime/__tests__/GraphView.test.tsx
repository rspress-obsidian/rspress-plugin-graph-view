// happy-dom must be registered BEFORE any testing-library import binds to globals
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.document) GlobalRegistrator.register();

import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

const { mock } = require("bun:test");

// `virtual-graph-data` is a build-time module; provide a stable fixture.
const mockGraphData = {
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

mock.module("virtual-graph-data", () => ({ graphData: mockGraphData, default: mockGraphData }));
mock.module("@rspress/core/runtime", () => ({
  useLocation: () => ({ pathname: "/guide", search: "", hash: "", state: null, key: "" }),
  useNavigate: () => () => {},
}));
mock.module("react-force-graph-2d", () => ({ default: () => null }));

// Re-import the component under test AFTER mocks are registered.
const { GraphErrorBoundary, GraphFallback } = await import("../GraphView");

function textIn(container: HTMLElement, text: string): boolean {
  return [...container.querySelectorAll("*")].some((el) => el.textContent === text);
}

describe("GraphView error boundary", () => {
  beforeEach(() => {
    cleanup();
  });

  test("renders fallback UI when a child throws", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("render failure");
    };

    const { container } = render(
      <GraphErrorBoundary fallback={<GraphFallback width={100} height={100} color="#333" />}>
        <Boom />
      </GraphErrorBoundary>,
    );

    expect(textIn(container, "Graph view unavailable")).toBe(true);
    errorSpy.mockRestore();
  });

  test("renders children when no error occurs", () => {
    const { container } = render(
      <GraphErrorBoundary fallback={<GraphFallback width={100} height={100} color="#333" />}>
        <div>working child</div>
      </GraphErrorBoundary>,
    );

    expect(textIn(container, "working child")).toBe(true);
    expect(textIn(container, "Graph view unavailable")).toBe(false);
  });
});
