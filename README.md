# rspress-plugin-graph-view

Interactive graph visualization for [Rspress](https://rspress.dev/) documentation sites. Automatically extracts internal markdown links and renders them as a navigable force-directed graph — like Obsidian's graph view for your docs.

![Version](https://img.shields.io/npm/v/rspress-plugin-graph-view)
![License](https://img.shields.io/npm/l/rspress-plugin-graph-view)

## Features

- **Automatic link detection** — uses MDAST parsing to extract all markdown link formats (inline, reference, autolinks) while ignoring links inside code blocks
- **Click to navigate** — click any node to jump to that page
- **Obsidian-style rendering** — a clean dot-field with neutral gray nodes, thin straight links, and no visual noise; labels appear on hover or zoom
- **Hover interactions** — hovering a node highlights its connections and changes its fill; the cursor turns to a pointer over clickable nodes
- **Stats bar** — the panel footer displays the current node and link count
- **Dark mode** — seamlessly adapts to light and dark themes
- **Build caching** — incremental rebuilds with mtime-based cache invalidation
- **Large graph optimization** — automatically disables expensive visual effects for graphs with 80+ nodes
- **Build profiling** — optional diagnostics to measure graph build performance

## Installation

```bash
bun add rspress-plugin-graph-view
# or
npm install rspress-plugin-graph-view
# or
pnpm add rspress-plugin-graph-view
```

## Usage

Add the plugin to your `rspress.config.ts`:

```ts
import { defineConfig } from "@rspress/core";
import { pluginGraphview } from "rspress-plugin-graph-view";

export default defineConfig({
  // ...your config
  plugins: [pluginGraphview()],
});
```

That's it. A floating action button will appear in the bottom-right corner of your docs site. Click it to open the graph view.

### Options

```ts
pluginGraphview({
  // Open the graph panel by default (default: false)
  defaultOpen: true,

  // Log build timing diagnostics (default: false)
  profileBuild: true,

  // Override any canvas color token (all keys optional)
  colors: {
    currentNode: "#f59e0b",
    node: "#94a3b8",
    link: "rgba(100, 116, 139, 0.35)",
  },
})
```

You can also enable profiling temporarily with the `RSPRESS_GRAPH_VIEW_PROFILE=1` environment variable.

### Optional sidebar component

The plugin automatically mounts the floating `GraphPanel`. If you are building a custom Rspress theme and want an embedded sidebar graph instead, import the documented runtime component directly:

```tsx
import GraphSidebar from "rspress-plugin-graph-view/runtime/GraphSidebar";

export function AsideAfter() {
  return <GraphSidebar />;
}
```

`GraphSidebar` uses the same generated graph data and accepts the same `colors` overrides as `GraphPanel`.

### Color customization

Every visual token used by the canvas renderer can be overridden via the `colors` option:

| Key | Description |
| --- | --- |
| `currentNode` | Fill color of the active page node |
| `currentLabel` | Label color of the active page node |
| `node` | Default node fill color |
| `nodeHover` | Node fill on hover |
| `label` | Default label text color |
| `labelHover` | Label text color on hover |
| `labelShadow` | Label shadow/backplate color used for contrast |
| `link` | Default link stroke color |
| `linkHighlight` | Link stroke color when a connected node is hovered |
| `fallbackLinkDim` | Dimmed link color when hovering unrelated nodes |
| `loaderBorder` | Loading spinner border color |
| `loaderTop` | Loading spinner active segment color |

### Peer Dependencies

This plugin requires the following peer dependencies, which should already be installed if you're using Rspress:

| Package | Version |
| --- | --- |
| `@rspress/core` | `^2.0.9` |
| `react` | `^19` |
| `react-dom` | `^19` |
| `react-force-graph-2d` | `^1.29.1` |
| `typescript` | `>=5.0` (optional) |

## How It Works

1. **Build time**: The plugin collects all route metadata, reads each markdown file, parses the content into an MDAST syntax tree, extracts internal link references, and builds a graph data structure.
2. **Runtime**: A virtual module (`virtual-graph-data`) injects the graph data into the client. `react-force-graph-2d` renders an interactive force-directed graph with custom canvas drawing.
3. **Caching**: File mtime + size signatures enable incremental rebuilds — unchanged files skip parsing entirely.

## Architecture

```
src/
  index.ts                          ← Plugin entry point (RspressPlugin)
  types.ts                          ← Core shared types (GraphNode, GraphLink, GraphData)
  build/
    index.ts                        ← Public API: buildGraphModule, createGraphBuildCache
    types.ts                        ← Build-time types (CollectedRoute, GraphBuildOptions)
    cache.ts                        ← Cache management, pruning, signatures, logging
    graph-builder.ts                ← Graph construction, route resolution, file aliases
    link-extractor.ts               ← MDAST parsing, link/title extraction
  runtime/
    GraphPanel.tsx                  ← Floating panel with FAB, zoom controls, keyboard a11y
    GraphView.tsx                   ← Canvas renderer via react-force-graph-2d, error boundary
    canvas/
      colors.ts                     ← Light/dark color palettes, theme merging
    deriveGraphViewData.ts          ← View data derivation (current page + neighbors)
    virtual-modules.d.ts            ← TypeScript declaration for virtual-graph-data
```

### Build Pipeline

```
routeGenerated hook → collect routes → buildGraphModule()
  ├── pruneStaleDocuments()     — remove deleted routes from cache
  ├── stat()                    — check mtime + size for each file
  ├── cache hit?                — reuse parsed data, skip expensive work
  ├── extractDisplayTitle()     — read frontmatter title or first heading
  ├── extractMarkdownLinks()    — MDAST parsing → internal link targets
  ├── createGraphSignature()    — content hash for module-level caching
  ├── buildGraphData()          — resolve links → build adjacency graph
  └── serialize → virtual-graph-data module
```

### Runtime Pipeline

```
GraphPanel mounts → lazy-loads react-force-graph-2d
  ├── useLocation() → current route path
  ├── deriveGraphViewData() → filter graph to current node neighborhood
  ├── useTheme() → MutationObserver detects dark mode changes
  ├── canvas rendering → custom nodeCanvasObject with gradients, shadows, hover effects
  ├── onNodeHoverChange → HTML tooltip overlay + stats bar update
  └── onNodeClick → navigate() to target route
```

## Development

```bash
# Install dependencies
bun install

# Typecheck
bun run build

# Run tests
bun test

# Start docs dev server
bun run docs:dev

# Benchmark graph build performance
bun run bench:graph --pages=1000 --links=6 --iterations=5
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`bun test`) and typecheck (`bun run build`)
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat:`, `fix:`, `docs:`)
6. Push and open a Pull Request

### Commit Convention

This project uses semantic-release for automated versioning. Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature (triggers minor version bump)
- `fix:` — bug fix (triggers patch version bump)
- `docs:` — documentation only
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `chore:` — maintenance tasks
- `ci:` — CI/CD configuration changes

## License

MIT
