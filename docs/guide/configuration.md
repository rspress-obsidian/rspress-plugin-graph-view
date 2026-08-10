---
title: Configuration
---

# Configuration

Configure the graph view plugin in your `rspress.config.ts`:

```ts
import { defineConfig } from "@rspress/core";
import { pluginGraphview } from "rspress-plugin-graph-view";

export default defineConfig({
  root: "docs",
  plugins: [
    pluginGraphview({
      defaultOpen: false,
      profileBuild: false,
    }),
  ],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultOpen` | `boolean` | `false` | Open the graph panel by default when the site loads |
| `profileBuild` | `boolean` | `false` | Log graph build timings, cache hits, and module reuse during route scanning |

You can also enable build profiling ad hoc with the `RSPRESS_GRAPH_VIEW_PROFILE=1` environment variable — useful for debugging slow builds without changing config.

### `defaultOpen`

When `true`, the graph panel opens automatically on page load instead of requiring the user to click the FAB button. Useful for documentation sites where the graph is a primary navigation tool.

```ts
pluginGraphview({ defaultOpen: true })
```

### `profileBuild`

When enabled, the plugin logs detailed timing information for each graph build:

```
[rspress-plugin-graph-view] graph build | routes=42 | links=87 | cacheHits=40 | cacheMisses=2 | reusedModule=false | total=12.3ms | stat=1.2ms | parse=8.4ms | resolve=1.8ms | serialize=0.9ms
```

This helps identify bottlenecks:
- **High `stat` time** → many files being stat'd; consider reducing doc count
- **High `parse` time** → large files or cold cache; caching should help on rebuilds
- **High `reusedModule` rate** → content hasn't changed; build is fully cached

## Custom Colors

You can override the default color palette to match your brand or theme. Colors are passed through to the runtime graph renderer:

```ts
// In your custom theme or Layout wrapper
import { Layout } from "@rspress/core/theme-original";
import GraphPanel from "rspress-plugin-graph-view/runtime/GraphPanel";

export default function CustomLayout(props) {
  return (
    <Layout {...props}>
      <GraphPanel
        colors={{
          currentNode: "#0ea5e9",
          nodeHover: "#38bdf8",
          linkHighlight: "rgba(14, 165, 233, 0.6)",
        }}
      />
    </Layout>
  );
}
```

Available color keys: `currentNode`, `currentLabel`, `node`, `nodeHover`, `label`, `labelHover`, `labelShadow`, `link`, `linkHighlight`, `fallbackLinkDim`, `loaderBorder`, `loaderTop`.

Any unspecified key falls back to the default light or dark palette.

## Caching

The plugin uses a multi-level caching strategy:

1. **File cache** — Each document is cached by `mtimeMs` + `size`. Unchanged files skip reading and parsing entirely.
2. **Module cache** — If the graph structure hasn't changed (same files, same content), the serialized virtual module is reused without rebuilding.
3. **Disk cache** — Parse results (titles + links) are persisted to `<projectRoot>/node_modules/.cache/rspress-graph-view/cache.json`. Dev-server restarts skip the expensive markdown parsing entirely — only the fast graph resolution runs (~0.5ms for a small site).
4. **Stale pruning** — Deleted or moved routes are automatically removed from the cache on the next build.

The disk cache location can be overridden with the `cacheDir` plugin option:

```ts
pluginGraphview({
  cacheDir: "./.cache/graph-view", // custom cache location
})
```

This means:
- **Cold build** (first run or cache cleared): all files are read and parsed
- **Warm rebuild** (no changes): ~0ms, fully cached
- **Single-file change**: only the modified file is re-parsed; the rest hit cache
- **Dev-server restart**: parse results load from disk; no re-parsing

## Broken Link Diagnostics

During the build, the plugin resolves every internal markdown link to a page. Links that don't resolve to any route (typos, moved files, wrong paths) are reported to the console:

```
[rspress-plugin-graph-view] 2 page(s) reference 3 unresolved internal link(s):
  /guide/getting-started -> ./confguration.md
  /guide/configuration -> ../missing.md
  /api -> ./guide/typo.md
```

This is a build-time warning — the build still succeeds, and unresolved links are simply omitted from the graph. It's a useful way to catch dead links in your docs.

## Peer Dependencies

| Package | Version | Required |
|---------|---------|----------|
| `@rspress/core` | `^2.0.9` | Yes |
| `react` | `^19` | Yes |
| `react-dom` | `^19` | Yes |
| `react-force-graph-2d` | `^1.29.1` | Yes |
| `typescript` | `>=5.0` | Optional |

See also:
- [Getting Started](./getting-started.md)
- [Graph View](./graph-view.md)
- [API Reference](../api.md)
