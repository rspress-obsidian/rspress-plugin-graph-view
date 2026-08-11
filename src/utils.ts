export function normalizeRoutePath(routePath: string): string {
  // Trim trailing slashes in linear time — the regex form (/\/+$/) is
  // polynomial-ReDoS on long all-slash inputs.
  let end = routePath.length;
  while (end > 0 && routePath.charCodeAt(end - 1) === 47 /* "/" */) {
    end -= 1;
  }
  return end > 0 ? routePath.slice(0, end) : "/";
}
