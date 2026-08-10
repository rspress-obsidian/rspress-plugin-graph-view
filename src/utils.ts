export function normalizeRoutePath(routePath: string): string {
  const trimmed = routePath.replace(/\/+$/, "");
  return trimmed || "/";
}
