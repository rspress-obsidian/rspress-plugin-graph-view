import { useLocation } from "@rspress/core/runtime";
import {
  Component,
  type ElementType,
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { graphData } from "virtual-graph-data";
import {
  DARK_COLORS,
  FONT_STACK,
  type GraphViewColors,
  LIGHT_COLORS,
  mergeColors,
} from "./canvas/colors";
import {
  createGraphIndex,
  deriveGraphViewData,
  type ForceGraphLink,
  type ForceGraphNode,
  normalizeClientRoutePath,
} from "./deriveGraphViewData";

export type { GraphViewColors } from "./canvas/colors";

interface GraphViewProps {
  width: number;
  height: number;
  onNodeClick?: (routePath: string) => void;
  onNodeHoverChange?: (label: string | null, x: number, y: number) => void;
  colors?: GraphViewColors;
}

interface D3ForceHandle {
  strength?: (value: number) => unknown;
  distance?: (value: number) => unknown;
}

interface ForceGraphHandleRef {
  d3ReheatSimulation?: () => void;
  d3Force?: (forceName: string, forceFn?: D3ForceHandle) => D3ForceHandle | undefined;
  zoom?: {
    (): number;
    (scale: number, durationMs?: number): void;
  };
  zoomToFit?: (durationMs?: number, padding?: number) => void;
  centerAt?: (x?: number, y?: number, durationMs?: number) => void;
}

function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  return (
    html.classList.contains("dark") ||
    html.getAttribute("data-theme") === "dark" ||
    html.closest("[data-theme='dark']") !== null
  );
}

function useTheme(): boolean {
  const [dark, setDark] = useState(() => isDarkMode());

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(isDarkMode());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return dark;
}

// ─── Error Boundary ────────────────────────────────────────────────

export class GraphErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function GraphFallback({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 8,
        color,
        fontFamily: FONT_STACK,
        fontSize: 13,
      }}
    >
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>Graph view unavailable</span>
    </div>
  );
}

export interface GraphViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  zoomToFit: () => void;
  centerOnCurrent: () => void;
  getStats: () => { nodes: number; links: number };
}

/**
 * Visual node radius in CSS pixels. Must match the radius used by
 * `nodeCanvasObject` — the pointer-area painter relies on it so the
 * hit region exactly matches the rendered dot.
 */
const NODE_HIT_RADIUS = 5;

export default forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(
  { width, height, onNodeClick, onNodeHoverChange, colors: customColors },
  ref,
) {
  const { pathname } = useLocation();
  const dark = useTheme();
  const baseColors = dark ? DARK_COLORS : LIGHT_COLORS;
  const colors = useMemo(() => mergeColors(baseColors, customColors), [baseColors, customColors]);
  const [ForceGraph, setForceGraph] = useState<ElementType | null>(null);
  const [forceGraphError, setForceGraphError] = useState(false);
  const hoveredNodeRef = useRef<string | null>(null);
  const connectedSetRef = useRef<Set<string>>(new Set());
  const hoveredLinkRef = useRef<ForceGraphLink | null>(null);
  const forceRef = useRef<ForceGraphHandleRef | null>(null);
  const statsRef = useRef({ nodes: 0, links: 0 });

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        const fg = forceRef.current;
        if (fg?.zoom) {
          const current = fg.zoom();
          fg.zoom(current * 1.3, 300);
        }
      },
      zoomOut: () => {
        const fg = forceRef.current;
        if (fg?.zoom) {
          const current = fg.zoom();
          fg.zoom(current / 1.3, 300);
        }
      },
      zoomReset: () => {
        const fg = forceRef.current;
        if (fg?.zoom) {
          fg.zoom(1, 300);
        }
      },
      zoomToFit: () => {
        const fg = forceRef.current;
        if (fg?.zoomToFit) {
          fg.zoomToFit(300, 16);
        }
      },
      centerOnCurrent: () => {
        const fg = forceRef.current;
        if (fg?.centerAt && currentRoutePathRef.current) {
          fg.centerAt(0, 0, 0);
        }
      },
      getStats: () => ({ ...statsRef.current }),
    }),
    [],
  );

  useEffect(() => {
    let active = true;
    import("react-force-graph-2d")
      .then((mod) => {
        if (active) setForceGraph(() => mod.default);
      })
      .catch(() => {
        if (active) setForceGraphError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentRoutePath = useMemo(() => normalizeClientRoutePath(pathname), [pathname]);

  const currentRoutePathRef = useRef(currentRoutePath);
  currentRoutePathRef.current = currentRoutePath;

  const graphIndex = useMemo(() => createGraphIndex(graphData), []);
  const {
    nodes: fgNodes,
    links: fgLinks,
    isLargeGraph,
    isEmpty,
  } = useMemo(() => {
    const derived = deriveGraphViewData(graphIndex, currentRoutePath);
    statsRef.current = { nodes: derived.nodes.length, links: derived.links.length };
    return derived;
  }, [graphIndex, currentRoutePath]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: isEmpty is a stable boolean; only route changes should re-center
  useEffect(() => {
    const timer = setTimeout(() => {
      const fg = forceRef.current;
      if (fg?.centerAt && !isEmpty) {
        fg.centerAt(0, 0, 300);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [currentRoutePath, isEmpty]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reheat when the visible graph changes; forceRef is stable
  useEffect(() => {
    // Tweak forces for Obsidian-like physics when data changes
    const timer = setTimeout(() => {
      const fg = forceRef.current;
      if (fg?.d3Force) {
        const charge = fg.d3Force("charge");
        if (charge && typeof charge.strength === "function") {
          charge.strength(-150);
        }
        const link = fg.d3Force("link");
        if (link && typeof link.distance === "function") {
          link.distance(45);
        }
        fg.d3ReheatSimulation?.();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [fgNodes, fgLinks]);

  const nodePointerAreaPaint = useCallback(
    (
      node: ForceGraphNode & { x?: number; y?: number },
      paintColor: string,
      ctx: CanvasRenderingContext2D,
    ) => {
      // The shadow canvas hit-tests by reading the painted pixel color, so
      // paint the same radius as the visible node. Without this, the default
      // hit radius (`sqrt(nodeVal) * nodeRelSize + pad`) collapses to ~1px
      // at `nodeRelSize={1}`, leaving hover/click nearly impossible.
      const radius = isLargeGraph ? 4 : NODE_HIT_RADIUS;
      ctx.beginPath();
      ctx.arc(node.x || 0, node.y || 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = paintColor;
      ctx.fill();
    },
    [isLargeGraph],
  );

  const handleNodeClick = useCallback(
    (node: { routePath?: string }) => {
      if (node.routePath && onNodeClick) {
        onNodeClick(node.routePath);
      }
    },
    [onNodeClick],
  );

  const linkEndpoints = useMemo(() => {
    const map = new WeakMap<object, [string, string]>();
    for (const link of fgLinks) {
      map.set(link, [link.source, link.target]);
    }
    return map;
  }, [fgLinks]);

  const getLinkEndpoints = useCallback(
    (link: object): [string, string] | null => {
      const endpoints = linkEndpoints.get(link);
      return endpoints ?? null;
    },
    [linkEndpoints],
  );

  const handleLinkHover = useCallback(
    (link: { source?: unknown; target?: unknown } | null) => {
      if (!link) {
        hoveredLinkRef.current = null;
        return;
      }
      const endpoints = getLinkEndpoints(link);
      if (!endpoints) {
        return;
      }
      hoveredLinkRef.current = { source: endpoints[0], target: endpoints[1] };
    },
    [getLinkEndpoints],
  );

  const handleNodeHover = useCallback(
    (node: (ForceGraphNode & { x?: number; y?: number }) | null) => {
      if (node?.id) {
        hoveredNodeRef.current = node.id;
        const adj = graphIndex.adjacentIdsByNode.get(node.id);
        const set = new Set(adj || []);
        set.add(node.id);
        connectedSetRef.current = set;
        onNodeHoverChange?.(node.label ?? null, node.x ?? 0, node.y ?? 0);
      } else {
        hoveredNodeRef.current = null;
        connectedSetRef.current.clear();
        onNodeHoverChange?.(null, 0, 0);
      }
    },
    [graphIndex, onNodeHoverChange],
  );

  const nodeColor = useCallback(
    (node: { isCurrent?: boolean }) => {
      return node.isCurrent ? colors.currentNode : colors.node;
    },
    [colors.currentNode, colors.node],
  );

  const drawBackground = useCallback((_ctx: CanvasRenderingContext2D, _globalScale: number) => {
    // Obsidian-style clean background — no grid, no adornments
  }, []);

  const nodeCanvasObject = useCallback(
    (
      node: ForceGraphNode & { x?: number; y?: number },
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const label = node.label || "";
      const fontSize = Math.max(10, 12) / globalScale;
      // Obsidian vault: uniform node size regardless of degree
      const radius = isLargeGraph ? 4 : NODE_HIT_RADIUS;
      const nx = node.x || 0;
      const ny = node.y || 0;

      const isHovered = hoveredNodeRef.current === node.id;

      // Flat node dot — Obsidian uses a plain fill, no rings or glow
      ctx.beginPath();
      ctx.arc(nx, ny, radius, 0, Math.PI * 2);
      if (node.isCurrent) {
        ctx.fillStyle = colors.currentNode;
      } else if (isHovered) {
        ctx.fillStyle = colors.nodeHover;
      } else {
        ctx.fillStyle = colors.node;
      }
      ctx.fill();

      // Obsidian's graph shows a clean dot-field — labels only on hover or zoom
      const shouldDrawLabel = node.isCurrent || isHovered || globalScale >= 1.4;
      if (shouldDrawLabel && label) {
        const fontW = node.isCurrent || isHovered ? 600 : 400;
        ctx.font = `${fontW} ${fontSize}px ${FONT_STACK}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Outline for readability like Obsidian
        ctx.lineJoin = "round";
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = colors.labelShadow;
        const labelY = ny + radius + fontSize + 2 / globalScale;
        ctx.strokeText(label, nx, labelY);

        if (node.isCurrent) {
          ctx.fillStyle = colors.currentLabel;
        } else if (isHovered) {
          ctx.fillStyle = colors.labelHover;
        } else {
          ctx.fillStyle = colors.label;
        }
        ctx.fillText(label, nx, labelY);
      }
    },
    [isLargeGraph, colors],
  );

  const linkColor = useCallback(
    (link: { source?: unknown; target?: unknown }) => {
      const endpoints = getLinkEndpoints(link);
      if (endpoints) {
        const [src, tgt] = endpoints;
        if (hoveredLinkRef.current) {
          const hovered = hoveredLinkRef.current;
          if (
            (src === hovered.source && tgt === hovered.target) ||
            (src === hovered.target && tgt === hovered.source)
          ) {
            return colors.linkHighlight;
          }
          return colors.fallbackLinkDim;
        }
        if (hoveredNodeRef.current) {
          const isConnected = src === hoveredNodeRef.current || tgt === hoveredNodeRef.current;
          return isConnected ? colors.linkHighlight : colors.fallbackLinkDim;
        }
      }
      return colors.link;
    },
    [colors.link, colors.linkHighlight, colors.fallbackLinkDim, getLinkEndpoints],
  );

  const linkWidth = useCallback(
    (link: { source?: unknown; target?: unknown }) => {
      if (isLargeGraph && !hoveredNodeRef.current && !hoveredLinkRef.current) {
        return 0.6;
      }
      const endpoints = getLinkEndpoints(link);
      if (endpoints) {
        const [src, tgt] = endpoints;
        if (hoveredLinkRef.current) {
          const hovered = hoveredLinkRef.current;
          if (
            (src === hovered.source && tgt === hovered.target) ||
            (src === hovered.target && tgt === hovered.source)
          ) {
            return 1.5;
          }
          return isLargeGraph ? 0.4 : 0.5;
        }
        if (hoveredNodeRef.current) {
          const isConnected = src === hoveredNodeRef.current || tgt === hoveredNodeRef.current;
          return isConnected ? 1.3 : isLargeGraph ? 0.4 : 0.5;
        }
      }
      return isLargeGraph ? 0.6 : 0.8;
    },
    [isLargeGraph, getLinkEndpoints],
  );

  if (forceGraphError) {
    return <GraphFallback width={width} height={height} color={colors.label} />;
  }

  if (!ForceGraph) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: `2px solid ${colors.loaderBorder}`,
            borderTopColor: colors.loaderTop,
            animation: "gv-spinner 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 6,
          color: colors.label,
          fontFamily: FONT_STACK,
          fontSize: 13,
        }}
      >
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="5" x2="12" y2="9" />
          <line x1="12" y1="15" x2="12" y2="19" />
          <line x1="5" y1="12" x2="9" y2="12" />
          <line x1="15" y1="12" x2="19" y2="12" />
        </svg>
        <span>No linked pages</span>
      </div>
    );
  }

  return (
    <GraphErrorBoundary
      fallback={<GraphFallback width={width} height={height} color={colors.label} />}
    >
      <ForceGraph
        ref={forceRef}
        graphData={{ nodes: fgNodes, links: fgLinks }}
        width={width}
        height={height}
        nodeRelSize={1}
        nodeColor={nodeColor}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => "replace" as const}
        nodePointerAreaPaint={
          nodePointerAreaPaint as (
            node: unknown,
            paintColor: string,
            ctx: CanvasRenderingContext2D,
            globalScale: number,
          ) => void
        }
        onNodeHover={handleNodeHover as (node: unknown, prevNode: unknown) => void}
        onLinkHover={handleLinkHover as (link: unknown, prevLink: unknown) => void}
        linkColor={linkColor as (link: object) => string}
        linkWidth={linkWidth as (link: object) => number}
        onNodeClick={handleNodeClick as (node: unknown, event: MouseEvent) => void}
        onRenderFramePre={drawBackground}
        backgroundColor="transparent"
        showPointerCursor
        d3AlphaDecay={isLargeGraph ? 0.08 : 0.04}
        d3VelocityDecay={isLargeGraph ? 0.6 : 0.4}
      />
    </GraphErrorBoundary>
  );
});
