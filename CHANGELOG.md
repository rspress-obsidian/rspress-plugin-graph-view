# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Disk-persisted build cache — parse results (titles + links) are saved to `<projectRoot>/node_modules/.cache/rspress-graph-view/cache.json` and reloaded on dev-server restarts, skipping the expensive markdown parsing entirely; configurable via the `cacheDir` plugin option
- Component tests for `GraphPanel` (keyboard a11y: G opens, Escape closes + focus return, FAB toggle, input-guard) and `GraphView` (error boundary fallback) using `@testing-library/react` + happy-dom
- Broken-link diagnostics — the build now reports unresolved internal links to the console (page → target), making dead links in docs visible without failing the build
- Link hover highlighting — hovering a link highlights it and its two endpoints
- Pointer cursor over clickable nodes and links
- The graph re-centers on the current page node when you navigate between routes
- Empty state ("No linked pages") for pages with no neighbors or routes missing from the graph — the full-graph fallback is gone
- Link extraction now ignores non-http schemes and protocol-relative URLs
- Tests for multi-slash route normalization, non-http scheme filtering, broken-link diagnostics, and root/index route collision
- Sidebar navigation now syncs with the graph — sidebar links with `.html` suffixes and `/index` paths resolve to the correct graph nodes

### Changed

- `files` in `package.json` now lists every shipped source file explicitly — test files and `__tests__/` are excluded from the npm tarball (was ~40% of the package)
- `GraphErrorBoundary` and `GraphFallback` are now exported from `GraphView` (for reuse and testability)
- Rendering now matches Obsidian's vault graph view: a clean dot-field of uniform neutral-gray nodes with thin straight links, no glow/rings/arrows/particles/curvature/grid
- Labels are hidden by default and appear on hover or zoom (Obsidian's iconic clean dot-field), instead of always visible
- Replaced the indigo/purple accent palette with Obsidian's neutral grays in both light and dark modes; the FAB, panel accent bar, and title now use neutral chrome
- The active page uses a brighter neutral fill instead of a brand-colored dot
- Removed the `val` field from `GraphNode` — it was only used for degree-based node sizing, which Obsidian's uniform dots made obsolete; the virtual module payload is smaller
- Link color/width accessors now use a precomputed endpoint map instead of per-link type checks every animation frame
- Benchmark output now labels `statCpuMs`/`parseCpuMs` as cumulative CPU time across routes (routes build in parallel, so CPU can exceed wall time) — `totalMs` is the wall-clock build duration
- Performance docs updated with real measured numbers (cold ~280ms / warm ~1ms / single-file ~9ms at 750 pages) instead of stale estimates

### Fixed

- Graph node labels no longer drift from their nodes when zooming — the label offset now scales with the zoom level
- GraphPanel no longer flashes open before `localStorage` hydration settles on first load
- Non-HTTP link schemes (`ftp:`, `file:`, `data:`, …) and protocol-relative URLs are no longer treated as internal documentation links
- `normalizeRoutePath` collapses multiple trailing slashes, so index pages cannot collide with the root route
- Sidebar links (with `.html` suffixes) no longer show "No linked pages" — `normalizeClientRoutePath` maps them to graph node ids

### Added

- Dark mode support — graph colors automatically adapt to light and dark themes via `MutationObserver`
- Custom color palette via `colors` prop on `GraphPanel` — override any of 13 color keys
- Error boundary around ForceGraph renderer — graceful fallback if graph fails to load
- Keyboard accessibility — `Escape` closes panel and returns focus to FAB button
- Focus management — closing panel restores focus to the toggle button
- `prepublishOnly` script to ensure build and tests pass before publishing
- CI workflow for automated test and typecheck on push/PR

### Changed

- `react-force-graph-2d` moved from `dependencies` to `peerDependencies` — reduces install size for consumers
- Package `files` array corrected to `["src", "theme"]` (was referencing non-existent directories)
- `exports` field added for proper ESM resolution
- `main`, `module`, and `types` fields now point to `./src/index.ts`

### Fixed

- Graph build cache now correctly prunes stale routes when pages are deleted
- Module signature deduplication works regardless of route order
