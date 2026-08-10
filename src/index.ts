import * as path from "node:path";

const pluginDir = import.meta.dirname;

import type { RouteMeta, RspressPlugin, UserConfig } from "@rspress/core";
import {
  buildGraphModule,
  type CollectedRoute,
  createGraphBuildCache,
  loadDiskCache,
  saveDiskCache,
} from "./build";
import type { GraphViewColors } from "./runtime/GraphView";
import { normalizeRoutePath } from "./utils";

export interface RspressPluginGraphViewOptions {
  defaultOpen?: boolean;
  profileBuild?: boolean;
  colors?: GraphViewColors;
  /** Directory for the persisted parse cache. Defaults to `<projectRoot>/node_modules/.cache/rspress-graph-view`. */
  cacheDir?: string;
}

export function pluginGraphview(options: RspressPluginGraphViewOptions = {}): RspressPlugin {
  let collectedRoutes: CollectedRoute[] = [];
  const graphBuildCache = createGraphBuildCache();
  let cacheDir: string | undefined = options.cacheDir;
  const shouldProfileBuild = options.profileBuild ?? process.env.RSPRESS_GRAPH_VIEW_PROFILE === "1";

  function ensureDiskCache(config: UserConfig): void {
    if (cacheDir) {
      return;
    }
    const docsRoot = path.resolve(config.root ?? "docs");
    const projectRoot = path.resolve(docsRoot, "..");
    cacheDir =
      options.cacheDir ?? path.join(projectRoot, "node_modules", ".cache", "rspress-graph-view");
    loadDiskCache(graphBuildCache, cacheDir);
  }

  return {
    name: "rspress-plugin-graph-view",

    routeGenerated(routes: RouteMeta[]) {
      collectedRoutes = routes.map((route) => ({
        routePath: normalizeRoutePath(route.routePath),
        absolutePath: route.absolutePath,
        relativePath: route.relativePath,
        pageName: route.pageName,
      }));
    },

    async addRuntimeModules(config: UserConfig) {
      ensureDiskCache(config);

      const { moduleSource } = await buildGraphModule(collectedRoutes, graphBuildCache, {
        profile: shouldProfileBuild,
      });

      if (cacheDir) {
        void saveDiskCache(graphBuildCache, cacheDir);
      }

      return {
        "virtual-graph-data": moduleSource,
      };
    },

    globalUIComponents: [
      [
        path.join(pluginDir, "runtime", "GraphPanel.tsx"),
        {
          defaultOpen: options.defaultOpen ?? false,
          colors: options.colors,
        },
      ],
    ],
  };
}

export default pluginGraphview;
