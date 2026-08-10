# API Reference

## Plugin Exports

### `pluginGraphview` — Plugin Factory

```ts
import { pluginGraphview } from 'rspress-plugin-graph-view';
```

Creates an Rspress plugin instance. A default export alias is also available for backward compatibility:

```ts
import pluginGraphview from 'rspress-plugin-graph-view';
```

### `RspressPluginGraphViewOptions`

```ts
interface RspressPluginGraphViewOptions {
  defaultOpen?: boolean;
  profileBuild?: boolean;
  colors?: GraphViewColors;
  cacheDir?: string; // directory for the persisted parse cache
}
```

`profileBuild` can also be enabled temporarily with the `RSPRESS_GRAPH_VIEW_PROFILE=1` environment variable.

## Runtime Components

### `GraphPanel`

```tsx
import GraphPanel from 'rspress-plugin-graph-view/runtime/GraphPanel';
```

Floating graph panel used by the plugin's automatic `globalUIComponents` integration.

### `GraphSidebar`

```tsx
import GraphSidebar from 'rspress-plugin-graph-view/runtime/GraphSidebar';
```

Optional embedded graph component for custom themes or layout slots. It reads the same generated graph data as the floating panel and supports the same `colors` overrides.

## Related

- [Getting Started](./guide/getting-started.md)
- [Configuration](./guide/configuration.md)
- [Graph View](./guide/graph-view.md)
