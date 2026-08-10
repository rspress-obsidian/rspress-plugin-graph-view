import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { normalizeRoutePath } from "./utils";

describe("normalizeRoutePath", () => {
  test("strips trailing slash from a path", () => {
    expect(normalizeRoutePath("/guide/")).toBe("/guide");
  });

  test("returns root slash for an empty string", () => {
    expect(normalizeRoutePath("")).toBe("/");
  });

  test("returns root slash when input is only a slash", () => {
    expect(normalizeRoutePath("/")).toBe("/");
  });

  test("leaves a path without a trailing slash unchanged", () => {
    expect(normalizeRoutePath("/guide")).toBe("/guide");
  });

  test("leaves a nested path unchanged", () => {
    expect(normalizeRoutePath("/docs/api/reference")).toBe("/docs/api/reference");
  });

  test("strips only the single trailing slash", () => {
    expect(normalizeRoutePath("/guide/api/")).toBe("/guide/api");
  });

  test("collapses multiple trailing slashes", () => {
    expect(normalizeRoutePath("/guide//")).toBe("/guide");
  });

  test("collapses a root path of only slashes", () => {
    expect(normalizeRoutePath("//")).toBe("/");
  });

  test("property: result never ends with a trailing slash (except root)", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const result = normalizeRoutePath(path);
        return result === "/" || !result.endsWith("/");
      }),
    );
  });

  test("property: result is always non-empty", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const result = normalizeRoutePath(path);
        return result.length > 0;
      }),
    );
  });

  test("property: idempotent — normalizing twice yields same result", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const once = normalizeRoutePath(path);
        const twice = normalizeRoutePath(once);
        return once === twice;
      }),
    );
  });
});
