// happy-dom must be registered BEFORE any testing-library import binds to globals
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.document) GlobalRegistrator.register();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";

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
mock.module("react-force-graph-2d", () => ({ default: () => null }));

const { default: GraphPanel } = await import("../GraphPanel");

function openPanel() {
  const { container } = render(<GraphPanel />);
  return container;
}

describe("GraphPanel accessibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  test("opens on G key and closes on Escape with focus returning to the FAB", () => {
    const container = openPanel();
    const fab = container.querySelector(
      "button[aria-label='Open graph view']",
    ) as HTMLButtonElement;

    // Initially closed: FAB present, no panel
    expect(container.querySelector("#rspress-graph-view-panel")).toBeNull();

    // Press G → opens
    fireEvent.keyDown(window, { key: "g" });
    expect(container.querySelector("#rspress-graph-view-panel")).toBeTruthy();

    // Escape → closes, focus returns to FAB
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector("#rspress-graph-view-panel")).toBeFalsy();
    expect(document.activeElement).toBe(fab);
  });

  test("toggles open/closed via the FAB button", () => {
    const container = openPanel();
    const fab = container.querySelector(
      "button[aria-label='Open graph view']",
    ) as HTMLButtonElement;

    fireEvent.click(fab);
    expect(container.querySelector("#rspress-graph-view-panel")).toBeTruthy();
    expect(fab.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(fab);
    expect(container.querySelector("#rspress-graph-view-panel")).toBeFalsy();
    expect(fab.getAttribute("aria-expanded")).toBe("false");
  });

  test("ignores G key when typing in an input", () => {
    const container = openPanel();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: "g" });
    expect(container.querySelector("#rspress-graph-view-panel")).toBeNull();

    input.remove();
  });
});
