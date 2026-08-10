---
title: Graph View
---

# Graph View

The graph view shows how your documentation pages are connected through internal markdown links. Each page becomes a node, and each `[link](./path.md)` becomes an edge.

## Navigation

Click any node in the graph to navigate directly to that page. The graph uses Rspress's internal router, so navigation is instant — no full page reload.

## Current Page Highlighting

When you're on a page that exists in the graph, the panel:
- Highlights the current node with a brighter fill
- Shows only the current node and its direct neighbors (reduces visual noise)
- Centers the graph on the current node when you navigate

All nodes render at the same size and in neutral gray — like Obsidian's vault, a page's importance is shown by its connections, not its dot size or color.

If the current route isn't in the graph (e.g., a 404 page), or the page has no links to or from other pages, the panel shows an empty state instead of a full-graph fallback.

## Hover Interactions

Hovering over a node:
- Changes the node's fill color
- Highlights the links connected to it
- Reveals the node's label
- Turns the cursor into a pointer to indicate the node is clickable

Hovering over a link highlights that link and its two endpoints. The cursor also turns into a pointer over links. All nodes and links keep their full opacity — like Obsidian, nothing is dimmed by default.

## Link Rendering

Links are drawn as thin, straight lines — no arrows, no particles, no curves. This keeps the view clean and Obsidian-like, so you can scan the structure at a glance rather than follow edge decorations.

## Labels

Like Obsidian's graph view, the graph starts as a clean dot-field — labels are hidden. Hover over a node (or zoom past 1.4×) to reveal its title.

## Zoom Controls

The graph provides four zoom actions via the control panel in the bottom-right:

| Button | Action |
|--------|--------|
| `+` | Zoom in 30% |
| `−` | Zoom out 30% |
| `⤢` | Zoom to fit all visible nodes |
| `↺` | Reset to 1× zoom |

You can also pan by dragging and zoom with the scroll wheel.

## Large Graphs

For documentation sites with **80+ nodes** or **160+ links**, the graph automatically optimizes:
- Node dots are smaller (4px vs 5px)
- Link widths are thinned
- Physics simulation uses faster decay rates

These optimizations keep the graph interactive even with hundreds of nodes.

## Dark Mode

The graph automatically detects your theme and switches palettes:
- **Light mode**: slate-toned nodes with indigo accents
- **Dark mode**: brighter nodes with enhanced glow for visibility

Theme detection checks for:
- `<html class="dark">`
- `<html data-theme="dark">`
- Any parent element with `data-theme="dark"`

Changes are observed in real-time via `MutationObserver`, so switching themes while the graph is open updates colors instantly.

## Keyboard Accessibility

- **Escape** — closes the graph panel and returns focus to the FAB button
- **Tab** — navigates through zoom controls when the panel is open

## Performance

The graph build runs during Rspress's route scanning phase. Measured on the synthetic benchmark (750 pages, 6 links/page, cold cache):

- Cold build (all files read + parsed): **~280ms wall time**
- Warm rebuild (no changes): **~1ms** — the module is reused wholesale (100% cache hit)
- Single-file change: **~9ms** — only the modified file is re-parsed; the rest hit cache

The warm-cache build is **~99.7% faster** than cold, and a single-file change is **~97% faster**. The cold build is dominated by markdown parsing (mdast), which is inherently CPU-heavy but parallelized across routes.

Run the synthetic benchmark yourself:

```bash
bun run bench:graph --pages=1000 --links=6 --iterations=5
```

Or profile your own site's build with `RSPRESS_GRAPH_VIEW_PROFILE=1`. The benchmark also accepts `--shape` (`sequential` | `ring` | `hub` | `clustered`), `--json`, and `--csv` for machine-readable output. Note the `statCpuMs`/`parseCpuMs` columns are cumulative CPU time summed across routes (routes build in parallel, so CPU can exceed wall time); `totalMs` is the wall-clock build duration.

See also:
- [Getting Started](./getting-started.md)
- [Configuration](./configuration.md)
