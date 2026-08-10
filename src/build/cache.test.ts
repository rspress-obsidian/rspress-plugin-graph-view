import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGraphBuildCache,
  createGraphSignature,
  loadDiskCache,
  pruneStaleDocuments,
  saveDiskCache,
} from "./cache";
import type { CollectedRoute } from "./types";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true })),
  );
});

function makeRoute(routePath: string): CollectedRoute {
  return {
    routePath,
    absolutePath: `/docs${routePath}.md`,
    relativePath: `${routePath}.md`,
    pageName: routePath.slice(1) || "index",
  };
}

function makeScannedDocument(routePath: string, mtimeMs = 1000, size = 100) {
  return {
    route: makeRoute(routePath),
    mtimeMs,
    size,
    contentHash: "abc123",
    inferredTitle: undefined,
    rawLinks: [],
  };
}

describe("pruneStaleDocuments", () => {
  test("removes cached entries for routes that no longer exist", () => {
    const cache = createGraphBuildCache();
    cache.documents.set("/docs/removed.md", {
      mtimeMs: 1000,
      size: 100,
      contentHash: "a",
      rawLinks: [],
    });
    cache.documents.set("/docs/kept.md", {
      mtimeMs: 1000,
      size: 100,
      contentHash: "b",
      rawLinks: [],
    });

    const activeRoutes: CollectedRoute[] = [
      {
        routePath: "/kept",
        absolutePath: "/docs/kept.md",
        relativePath: "kept.md",
        pageName: "kept",
      },
    ];

    pruneStaleDocuments(cache, activeRoutes);

    expect(cache.documents.has("/docs/kept.md")).toBe(true);
    expect(cache.documents.has("/docs/removed.md")).toBe(false);
  });

  test("leaves cache untouched when all routes are still active", () => {
    const cache = createGraphBuildCache();
    cache.documents.set("/docs/page.md", {
      mtimeMs: 1000,
      size: 100,
      contentHash: "c",
      rawLinks: [],
    });

    const routes: CollectedRoute[] = [
      {
        routePath: "/page",
        absolutePath: "/docs/page.md",
        relativePath: "page.md",
        pageName: "page",
      },
    ];

    pruneStaleDocuments(cache, routes);

    expect(cache.documents.size).toBe(1);
  });

  test("clears entire cache when route list is empty", () => {
    const cache = createGraphBuildCache();
    cache.documents.set("/docs/a.md", { mtimeMs: 1000, size: 100, contentHash: "d", rawLinks: [] });
    cache.documents.set("/docs/b.md", { mtimeMs: 1000, size: 100, contentHash: "e", rawLinks: [] });

    pruneStaleDocuments(cache, []);

    expect(cache.documents.size).toBe(0);
  });
});

describe("createGraphSignature", () => {
  test("produces the same signature regardless of document order", () => {
    const docs = [makeScannedDocument("/a"), makeScannedDocument("/b")];

    const sigAB = createGraphSignature(docs);
    // biome-ignore lint/style/noNonNullAssertion: test fixture with known length
    const sigBA = createGraphSignature([docs[1]!, docs[0]!]);

    expect(sigAB).toBe(sigBA);
  });

  test("produces a different signature when mtime changes", () => {
    const before = [makeScannedDocument("/a", 1000)];
    const after = [makeScannedDocument("/a", 2000)];

    expect(createGraphSignature(before)).not.toBe(createGraphSignature(after));
  });

  test("produces a different signature when a route is added", () => {
    const one = [makeScannedDocument("/a")];
    const two = [makeScannedDocument("/a"), makeScannedDocument("/b")];

    expect(createGraphSignature(one)).not.toBe(createGraphSignature(two));
  });

  test("produces a different signature when file size changes", () => {
    const before = [makeScannedDocument("/a", 1000, 100)];
    const after = [makeScannedDocument("/a", 1000, 200)];

    expect(createGraphSignature(before)).not.toBe(createGraphSignature(after));
  });

  test("returns a non-empty string", () => {
    const sig = createGraphSignature([makeScannedDocument("/a")]);
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);
  });

  test("produces a different signature when content hash changes", () => {
    const before = [makeScannedDocument("/a", 1000, 100)];
    const after = [
      {
        ...makeScannedDocument("/a", 1000, 100),
        contentHash: "different",
      },
    ];

    expect(createGraphSignature(before)).not.toBe(createGraphSignature(after));
  });
});

describe("disk cache round-trip", () => {
  test("persists documents and reloads them into a fresh cache", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "graph-view-disk-cache-"));
    tempDirectories.push(cacheDir);

    const source = createGraphBuildCache();
    source.documents.set("/docs/a.md", {
      mtimeMs: 1000,
      size: 100,
      contentHash: "hash-a",
      inferredTitle: "Page A",
      rawLinks: ["./b.md", "./c.md"],
    });

    await saveDiskCache(source, cacheDir);

    const reloaded = createGraphBuildCache(cacheDir);
    const doc = reloaded.documents.get("/docs/a.md");
    expect(doc).toBeDefined();
    expect(doc?.mtimeMs).toBe(1000);
    expect(doc?.contentHash).toBe("hash-a");
    expect(doc?.inferredTitle).toBe("Page A");
    expect(doc?.rawLinks).toEqual(["./b.md", "./c.md"]);
  });

  test("ignores a cache file with a mismatched schema version", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "graph-view-disk-cache-"));
    tempDirectories.push(cacheDir);

    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(cacheDir, "cache.json"),
      JSON.stringify({
        version: 999,
        documents: { "/docs/x.md": { mtimeMs: 1, size: 1, contentHash: "x", rawLinks: [] } },
      }),
    );

    const cache = createGraphBuildCache(cacheDir);
    expect(cache.documents.size).toBe(0);
  });

  test("loadDiskCache is a no-op when the file is missing", () => {
    const cache = createGraphBuildCache();
    loadDiskCache(cache, join(tmpdir(), "graph-view-missing-dir"));
    expect(cache.documents.size).toBe(0);
  });
});
