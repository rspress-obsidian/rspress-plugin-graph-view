# AGENTS.md — rspress-plugin-graph-view

## Commands

| Task | Command |
|------|---------|
| Install | `bun install` |
| Typecheck | `bun run build` |
| Test | `bun test` |
| Docs dev server | `bun run docs:dev` |
| Docs build | `bun run docs:build` |
| Benchmark | `bun run bench:graph --pages=1000 --links=6 --iterations=5` |
| CI (build + test) | `bun run build && bun test` |

`build` is typecheck-only (`noEmit: true`). The package ships source `.ts` files — no compile step for publish.

## Architecture

This is an **Rspress plugin** that builds an interactive force-directed graph of documentation links.

### Two-phase execution

**Build time** (`src/index.ts` → `src/build/`):
- Plugin hooks `routeGenerated` to collect routes, then `addRuntimeModules` to produce a virtual module (`virtual-graph-data`)
- Reads each `.md`/`.mdx` file, extracts `[link](./path.md)` patterns, resolves relative/absolute paths
- Multi-level cache: file-level (mtime+size), module-level (content signature), stale pruning

**Runtime** (`src/runtime/`):
- `GraphPanel.tsx` — floating panel with FAB button, zoom pill, stats bar, hover tooltip, keyboard a11y (`G` opens, `Escape` closes)
- `GraphView.tsx` — canvas-rendered force graph via `react-force-graph-2d` (lazy-loaded), error boundary, dark mode via MutationObserver
- `deriveGraphViewData.ts` — builds adjacency index, shows only current page + neighbors, flags large graphs (80+ nodes)

### Key directories

| Path | Purpose |
|------|---------|
| `src/index.ts` | Plugin entry, exported as default |
| `src/utils.ts` | Shared utilities (`normalizeRoutePath`) |
| `src/build/` | Build-time graph builder + cache |
| `src/runtime/` | Client-side React components |
| `theme/index.tsx` | Rspress theme re-export (passthrough) |
| `docs/` | Plugin documentation site |
| `scripts/bench-graph-build.ts` | Synthetic benchmark |

### Virtual module

`virtual-graph-data` is a runtime module generated at build time. Declared in `src/runtime/virtual-modules.d.ts`. Rspress injects it automatically.

## Conventions

- **Bun only** — see `CLAUDE.md` for Bun API preferences
- **Source-first package** — `exports`, `main`, `module`, `types` all point to `./src/index.ts`
- **Strict TypeScript** — `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`
- **`react-force-graph-2d` is a peer dep** — lazy-loaded at runtime, not bundled
- **Dark mode** — detects `<html class="dark">`, `<html data-theme="dark">`, or parent `[data-theme='dark']`
- **Color customization** — `GraphViewColors` interface (15 keys), passed through plugin options → GraphPanel → GraphView
- **Error boundary** — `GraphErrorBoundary` wraps ForceGraph; import failures show fallback UI
- **CI branches** — `main` and `dev`

## Publishing

- `prepublishOnly` runs `build && test`
- `files` lists every shipped source file explicitly — test files are excluded from the tarball
- `npm pack --dry-run` to verify contents before publish
- Scoped packages need `publishConfig.access: "public"` — this package is unscoped
