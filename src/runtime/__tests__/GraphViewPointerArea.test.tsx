// happy-dom must be registered BEFORE any testing-library import binds to globals
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.document) GlobalRegistrator.register();

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";

const { mock } = require("bun:test");

const mockGraphData = {
  nodes: [
    { id: "/", label: "Home", routePath: "/" },
    { id: "/guide", label: "Guide", routePath: "/guide" },
  ],
  links: [{ source: "/", target: "/guide" }],
};

mock.module("virtual-graph-data", () => ({ graphData: mockGraphData, default: mockGraphData }));
mock.module("@rspress/core/runtime", () => ({
  useLocation: () => ({ pathname: "/guide", search: "", hash: "", state: null, key: "" }),
  useNavigate: () => () => {},
}));

// Capture the props the plugin passes to react-force-graph-2d so we can
// assert the pointer-area painter is wired and paints the node radius.
let capturedProps: Record<string, unknown> | null = null;

mock.module("react-force-graph-2d", () => ({
  default: (props: Record<string, unknown>) => {
    capturedProps = props;
    return null;
  },
}));

const { default: GraphView } = await import("../GraphView");

describe("GraphView nodePointerAreaPaint", () => {
  afterEach(() => {
    cleanup();
    capturedProps = null;
  });

  test("registers a pointer-area painter matching the visible node radius", async () => {
    // Render GraphView; the lazy `import("react-force-graph-2d")` resolves to
    // the mock, so await the microtask before asserting captured props.
    render(<GraphView width={400} height={300} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedProps).not.toBeNull();

    // The pointer-area painter is required: without it the default hit radius
    // (`sqrt(nodeVal) * nodeRelSize` at `nodeRelSize={1}`) collapses to ~1px,
    // making hover/click nearly impossible at typical zoom levels.
    expect(typeof capturedProps?.nodePointerAreaPaint).toBe("function");

    // Verify the painter fills a circle of the same radius as the rendered
    // node — the observable hit-testing contract.
    const painter = capturedProps?.nodePointerAreaPaint as (
      node: { x?: number; y?: number },
      paintColor: string,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => void;
    expect(painter).toBeTypeOf("function");

    let lastArc: { x: number; y: number; radius: number } = { x: 0, y: 0, radius: 0 };
    let lastFillStyle: unknown = null;

    const ctx = new Proxy(
      {},
      {
        get: (_, prop) => {
          if (prop === "arc") {
            return (x: number, y: number, radius: number) => {
              lastArc = { x, y, radius };
            };
          }
          if (prop === "beginPath" || prop === "fill") {
            return () => {};
          }
          return undefined;
        },
        set: (_, prop, value) => {
          if (prop === "fillStyle") {
            lastFillStyle = value;
          }
          return true;
        },
      },
    ) as CanvasRenderingContext2D;

    painter({ x: 12, y: 34 }, "#ff00ff", ctx, 1);

    // Node dot radius is 5 (NODE_HIT_RADIUS) for normal graphs.
    expect(lastArc.x).toBe(12);
    expect(lastArc.y).toBe(34);
    expect(lastArc.radius).toBe(5);
    expect(lastFillStyle).toBe("#ff00ff");
  });
});
