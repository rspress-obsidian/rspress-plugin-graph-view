import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildGraphModule,
  type CollectedRoute,
  createGraphBuildCache,
  type GraphBuildDiagnostics,
} from "../src/build";

type GraphShape = "sequential" | "ring" | "hub" | "clustered";

interface BenchmarkOptions {
  pages: number;
  linksPerPage: number;
  iterations: number;
  shape: GraphShape;
  jsonOutputPath?: string;
  csvOutputPath?: string;
}

interface SyntheticDocsFixture {
  rootDir: string;
  routes: CollectedRoute[];
}

interface BenchmarkSummary {
  scenario: string;
  shape: GraphShape;
  avgTotalMs: number;
  avgStatMs: number;
  avgParseMs: number;
  avgResolveMs: number;
  avgSerializeMs: number;
  avgCacheHits: number;
  avgCacheMisses: number;
  reuseRate: number;
  nodes: number;
  links: number;
}

interface BenchmarkReport {
  generatedAt: string;
  options: Pick<BenchmarkOptions, "pages" | "linksPerPage" | "iterations" | "shape">;
  summaries: BenchmarkSummary[];
  improvements: {
    warmCacheVsCold: number;
    singleFileChangeVsCold: number;
  };
}

const benchmarkBuildOptions = {
  profile: true,
  logger: () => {},
} as const;

await main();

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  const fixture = await createSyntheticDocs(options);

  try {
    const coldRuns = await runColdBuilds(fixture.routes, options.iterations);
    const warmRuns = await runWarmBuilds(fixture.routes, options.iterations);
    const incrementalRuns = await runIncrementalBuilds(
      fixture.routes,
      options.iterations,
      options.linksPerPage,
      options.shape,
    );

    const coldSummary = summarizeDiagnostics("cold", options.shape, coldRuns);
    const warmSummary = summarizeDiagnostics("warm-cache", options.shape, warmRuns);
    const incrementalSummary = summarizeDiagnostics(
      "single-file-change",
      options.shape,
      incrementalRuns,
    );
    const summaries = [coldSummary, warmSummary, incrementalSummary];
    const report = createReport(options, summaries);

    console.log("Synthetic graph build benchmark");
    console.log(
      `pages=${options.pages} | linksPerPage=${options.linksPerPage} | iterations=${options.iterations} | shape=${options.shape}`,
    );
    console.table([
      toTableRow(coldSummary),
      toTableRow(warmSummary),
      toTableRow(incrementalSummary),
    ]);
    console.log(
      `warm-cache improvement vs cold: ${formatPercent(report.improvements.warmCacheVsCold)}`,
    );
    console.log(
      `single-file-change improvement vs cold: ${formatPercent(report.improvements.singleFileChangeVsCold)}`,
    );

    await writeOptionalOutputs(options, report);
  } finally {
    await rm(fixture.rootDir, { recursive: true, force: true });
  }
}

function parseArgs(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    pages: 750,
    linksPerPage: 6,
    iterations: 5,
    shape: "sequential",
  };

  for (const arg of argv) {
    const [rawKey, rawValue] = arg.split("=");

    if (rawKey === "--shape" && rawValue && isGraphShape(rawValue)) {
      options.shape = rawValue;
      continue;
    }

    if (rawKey === "--json" && rawValue) {
      options.jsonOutputPath = rawValue;
      continue;
    }

    if (rawKey === "--csv" && rawValue) {
      options.csvOutputPath = rawValue;
      continue;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      continue;
    }

    if (rawKey === "--pages") {
      options.pages = clampInteger(value, 2);
    }

    if (rawKey === "--links") {
      options.linksPerPage = clampInteger(value, 1);
    }

    if (rawKey === "--iterations") {
      options.iterations = clampInteger(value, 1);
    }
  }

  options.linksPerPage = Math.min(options.linksPerPage, options.pages - 1);
  return options;
}

function isGraphShape(value: string): value is GraphShape {
  return value === "sequential" || value === "ring" || value === "hub" || value === "clustered";
}

function clampInteger(value: number, minimum: number): number {
  return Math.max(minimum, Math.floor(value));
}

async function createSyntheticDocs(options: BenchmarkOptions): Promise<SyntheticDocsFixture> {
  const rootDir = await mkdtemp(join(tmpdir(), "graph-view-bench-"));
  const routes: CollectedRoute[] = [];

  for (let pageIndex = 0; pageIndex < options.pages; pageIndex += 1) {
    const route = createRoute(rootDir, pageIndex);
    const content = createSyntheticMarkdown(
      pageIndex,
      options.pages,
      options.linksPerPage,
      options.shape,
      0,
    );

    await Bun.write(route.absolutePath, content);
    routes.push(route);
  }

  return { rootDir, routes };
}

function createRoute(rootDir: string, pageIndex: number): CollectedRoute {
  const fileName = pageIndex === 0 ? "index.md" : `page-${pageIndex}.md`;
  const routePath = pageIndex === 0 ? "/" : `/page-${pageIndex}`;

  return {
    routePath,
    absolutePath: join(rootDir, fileName),
    relativePath: fileName,
    pageName: pageIndex === 0 ? "index" : `page-${pageIndex}`,
  };
}

function createSyntheticMarkdown(
  pageIndex: number,
  pageCount: number,
  linksPerPage: number,
  shape: GraphShape,
  revision: number,
): string {
  const links = buildSyntheticLinkTargets(pageIndex, pageCount, linksPerPage, shape).map(
    (targetIndex) => {
      const targetFile = targetIndex === 0 ? "./index.md" : `./page-${targetIndex}.md`;
      return `- [Page ${targetIndex}](${targetFile})`;
    },
  );

  return [
    `# Page ${pageIndex}`,
    "",
    `Synthetic benchmark revision ${revision} (${shape})`,
    "",
    ...links,
    "",
  ].join("\n");
}

function buildSyntheticLinkTargets(
  pageIndex: number,
  pageCount: number,
  linksPerPage: number,
  shape: GraphShape,
): number[] {
  switch (shape) {
    case "sequential":
      return buildSequentialTargets(pageIndex, pageCount, linksPerPage);
    case "hub":
      return buildHubTargets(pageIndex, pageCount, linksPerPage);
    case "clustered":
      return buildClusteredTargets(pageIndex, pageCount, linksPerPage);
    default:
      return buildRingTargets(pageIndex, pageCount, linksPerPage);
  }
}

function buildSequentialTargets(
  pageIndex: number,
  pageCount: number,
  linksPerPage: number,
): number[] {
  return Array.from({ length: linksPerPage }, (_, offset) => (pageIndex + offset + 1) % pageCount);
}

function buildRingTargets(pageIndex: number, pageCount: number, linksPerPage: number): number[] {
  const targets = new Set<number>();
  let distance = 1;

  while (targets.size < linksPerPage && distance < pageCount) {
    targets.add((pageIndex + distance) % pageCount);

    if (targets.size < linksPerPage) {
      targets.add((pageIndex - distance + pageCount) % pageCount);
    }

    targets.delete(pageIndex);
    distance += 1;
  }

  if (targets.size < linksPerPage) {
    for (const target of buildSequentialTargets(pageIndex, pageCount, linksPerPage)) {
      targets.add(target);
      if (targets.size >= linksPerPage) {
        break;
      }
    }
  }

  return [...targets].slice(0, linksPerPage);
}

function buildHubTargets(pageIndex: number, pageCount: number, linksPerPage: number): number[] {
  const targets = new Set<number>();
  const hubIndex = 0;

  if (pageIndex !== hubIndex) {
    targets.add(hubIndex);
  }

  let offset = 1;
  while (targets.size < linksPerPage) {
    const candidate = (pageIndex + offset) % pageCount;
    if (candidate !== pageIndex) {
      targets.add(candidate);
    }
    offset += 1;
  }

  return [...targets];
}

function buildClusteredTargets(
  pageIndex: number,
  pageCount: number,
  linksPerPage: number,
): number[] {
  const targets = new Set<number>();
  const clusterCount = Math.min(6, Math.max(2, Math.ceil(pageCount / 150)));
  const clusterSize = Math.max(1, Math.ceil(pageCount / clusterCount));
  const clusterIndex = Math.floor(pageIndex / clusterSize);
  const clusterStart = clusterIndex * clusterSize;
  const clusterEnd = Math.min(pageCount, clusterStart + clusterSize);

  let offset = 1;
  while (targets.size < Math.max(1, linksPerPage - 1)) {
    const candidate =
      clusterStart + ((pageIndex - clusterStart + offset) % (clusterEnd - clusterStart));
    if (candidate !== pageIndex) {
      targets.add(candidate);
    }
    offset += 1;
  }

  const nextClusterStart = (clusterStart + clusterSize) % pageCount;
  if (targets.size < linksPerPage && nextClusterStart !== pageIndex) {
    targets.add(nextClusterStart);
  }

  let spillOffset = 1;
  while (targets.size < linksPerPage) {
    const candidate = (pageIndex + clusterSize + spillOffset) % pageCount;
    if (candidate !== pageIndex) {
      targets.add(candidate);
    }
    spillOffset += 1;
  }

  return [...targets];
}

async function runColdBuilds(
  routes: CollectedRoute[],
  iterations: number,
): Promise<GraphBuildDiagnostics[]> {
  const diagnostics: GraphBuildDiagnostics[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const cache = createGraphBuildCache();
    const result = await buildGraphModule(routes, cache, benchmarkBuildOptions);
    diagnostics.push(result.diagnostics);
  }

  return diagnostics;
}

async function runWarmBuilds(
  routes: CollectedRoute[],
  iterations: number,
): Promise<GraphBuildDiagnostics[]> {
  const cache = createGraphBuildCache();
  await buildGraphModule(routes, cache, benchmarkBuildOptions);

  const diagnostics: GraphBuildDiagnostics[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const result = await buildGraphModule(routes, cache, benchmarkBuildOptions);
    diagnostics.push(result.diagnostics);
  }

  return diagnostics;
}

async function runIncrementalBuilds(
  routes: CollectedRoute[],
  iterations: number,
  linksPerPage: number,
  shape: GraphShape,
): Promise<GraphBuildDiagnostics[]> {
  const cache = createGraphBuildCache();
  await buildGraphModule(routes, cache, benchmarkBuildOptions);

  const targetRoute = routes[Math.min(1, routes.length - 1)];
  if (!targetRoute) {
    throw new Error("No routes available for incremental build benchmark");
  }
  const targetPageIndex =
    targetRoute.routePath === "/" ? 0 : Number(targetRoute.routePath.slice(6));

  const diagnostics: GraphBuildDiagnostics[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await sleep(20);
    await Bun.write(
      targetRoute.absolutePath,
      createSyntheticMarkdown(targetPageIndex, routes.length, linksPerPage, shape, iteration + 1),
    );
    const result = await buildGraphModule(routes, cache, benchmarkBuildOptions);
    diagnostics.push(result.diagnostics);
  }

  return diagnostics;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeDiagnostics(
  scenario: string,
  shape: GraphShape,
  diagnostics: GraphBuildDiagnostics[],
): BenchmarkSummary {
  const latest = diagnostics[diagnostics.length - 1];

  return {
    scenario,
    shape,
    avgTotalMs: average(diagnostics.map((entry) => entry.totalMs)),
    avgStatMs: average(diagnostics.map((entry) => entry.statMs)),
    avgParseMs: average(diagnostics.map((entry) => entry.parseMs)),
    avgResolveMs: average(diagnostics.map((entry) => entry.resolveMs)),
    avgSerializeMs: average(diagnostics.map((entry) => entry.serializeMs)),
    avgCacheHits: average(diagnostics.map((entry) => entry.cacheHits)),
    avgCacheMisses: average(diagnostics.map((entry) => entry.cacheMisses)),
    reuseRate: average(diagnostics.map((entry) => (entry.reusedModule ? 1 : 0))) * 100,
    nodes: latest?.routeCount ?? 0,
    links: latest?.linkCount ?? 0,
  };
}

function createReport(options: BenchmarkOptions, summaries: BenchmarkSummary[]): BenchmarkReport {
  const coldSummary = summaries.find((summary) => summary.scenario === "cold");
  const warmSummary = summaries.find((summary) => summary.scenario === "warm-cache");
  const incrementalSummary = summaries.find((summary) => summary.scenario === "single-file-change");

  return {
    generatedAt: new Date().toISOString(),
    options: {
      pages: options.pages,
      linksPerPage: options.linksPerPage,
      iterations: options.iterations,
      shape: options.shape,
    },
    summaries,
    improvements: {
      warmCacheVsCold: improvementRatio(coldSummary?.avgTotalMs ?? 0, warmSummary?.avgTotalMs ?? 0),
      singleFileChangeVsCold: improvementRatio(
        coldSummary?.avgTotalMs ?? 0,
        incrementalSummary?.avgTotalMs ?? 0,
      ),
    },
  };
}

async function writeOptionalOutputs(
  options: BenchmarkOptions,
  report: BenchmarkReport,
): Promise<void> {
  if (options.jsonOutputPath) {
    await writeOutputFile(options.jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`JSON report written to ${options.jsonOutputPath}`);
  }

  if (options.csvOutputPath) {
    await writeOutputFile(options.csvOutputPath, toCsv(report.summaries));
    console.log(`CSV report written to ${options.csvOutputPath}`);
  }
}

async function writeOutputFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await Bun.write(filePath, content);
}

function toCsv(summaries: BenchmarkSummary[]): string {
  const header = [
    "scenario",
    "nodes",
    "links",
    "shape",
    "avgTotalMs",
    "avgStatCpuMs",
    "avgParseCpuMs",
    "avgResolveMs",
    "avgSerializeMs",
    "avgCacheHits",
    "avgCacheMisses",
    "reuseRate",
  ];

  const rows = summaries.map((summary) => [
    summary.scenario,
    summary.nodes,
    summary.links,
    summary.shape,
    summary.avgTotalMs.toFixed(3),
    summary.avgStatMs.toFixed(3),
    summary.avgParseMs.toFixed(3),
    summary.avgResolveMs.toFixed(3),
    summary.avgSerializeMs.toFixed(3),
    summary.avgCacheHits.toFixed(3),
    summary.avgCacheMisses.toFixed(3),
    summary.reuseRate.toFixed(3),
  ]);

  return `${[header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value: string | number): string {
  const cell = String(value);
  if (!cell.includes(",") && !cell.includes('"') && !cell.includes("\n")) {
    return cell;
  }

  return `"${cell.split('"').join('""')}"`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toTableRow(summary: BenchmarkSummary): Record<string, string | number> {
  return {
    scenario: summary.scenario,
    shape: summary.shape,
    nodes: summary.nodes,
    links: summary.links,
    totalMs: formatMs(summary.avgTotalMs),
    statCpuMs: formatMs(summary.avgStatMs),
    parseCpuMs: formatMs(summary.avgParseMs),
    resolveMs: formatMs(summary.avgResolveMs),
    serializeMs: formatMs(summary.avgSerializeMs),
    cacheHits: summary.avgCacheHits.toFixed(1),
    cacheMisses: summary.avgCacheMisses.toFixed(1),
    reuseRate: `${summary.reuseRate.toFixed(0)}%`,
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function improvementRatio(baselineMs: number, candidateMs: number): number {
  if (baselineMs <= 0) {
    return 0;
  }

  return (baselineMs - candidateMs) / baselineMs;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
