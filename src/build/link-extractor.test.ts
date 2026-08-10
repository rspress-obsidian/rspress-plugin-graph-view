import { describe, expect, test } from "bun:test";
import { extractDisplayTitle, extractMarkdownLinks } from "./link-extractor";

describe("extractMarkdownLinks", () => {
  test("extracts relative markdown links", () => {
    const source = "# Page\n\nSee [guide](./guide.md) and [api](../api.md).";
    expect(extractMarkdownLinks(source)).toEqual(["./guide.md", "../api.md"]);
  });

  test("extracts absolute path links", () => {
    const source = "Read [docs](/docs/intro).";
    expect(extractMarkdownLinks(source)).toEqual(["/docs/intro"]);
  });

  test("extracts full reference markdown links", () => {
    const source = "Read [the guide][guide-ref].\n\n[guide-ref]: ./guide.md";
    expect(extractMarkdownLinks(source)).toEqual(["./guide.md"]);
  });

  test("extracts collapsed and shortcut reference markdown links", () => {
    const source = [
      "Read [Guide][] and [API].",
      "",
      "[guide]: ./guide.md#intro",
      "[api]: ../api.mdx?from=docs",
    ].join("\n");

    expect(extractMarkdownLinks(source)).toEqual(["./guide.md", "../api.mdx"]);
  });

  test("ignores external reference markdown links", () => {
    const source = "Visit [site][site].\n\n[site]: https://example.com";
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("strips hash fragments from links", () => {
    const source = "See [section](./page.md#heading).";
    expect(extractMarkdownLinks(source)).toEqual(["./page.md"]);
  });

  test("strips query strings from links", () => {
    const source = "See [page](./page.md?foo=1).";
    expect(extractMarkdownLinks(source)).toEqual(["./page.md"]);
  });

  test("ignores external http links", () => {
    const source = "Visit [site](https://example.com) and [other](http://other.com).";
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("ignores mailto and tel links", () => {
    const source = "Email [us](mailto:hi@example.com) or call [us](tel:+1234).";
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("ignores non-http schemes", () => {
    const source = [
      "Download [file](ftp://files.example.com/guide.md)",
      "and [data](data:text/plain;base64,SGVsbG8=)",
      "and [doc](file:///etc/guide.md).",
    ].join("\n");
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("ignores protocol-relative URLs", () => {
    const source = "See [cdn](//cdn.example.com/guide.md).";
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("strips query string before hash fragment", () => {
    const source = "See [page](./page.md?foo=1#heading).";
    expect(extractMarkdownLinks(source)).toEqual(["./page.md"]);
  });

  test("ignores bare hash anchor links", () => {
    const source = "Jump to [section](#heading).";
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("ignores links inside fenced code blocks", () => {
    const source = "```\nSee [guide](./guide.md)\n```";
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("returns empty array when no links are present", () => {
    const source = "# Just a heading\n\nSome text without links.";
    expect(extractMarkdownLinks(source)).toEqual([]);
  });

  test("works with CRLF line endings", () => {
    const source = "# Page\r\n\r\nSee [guide](./guide.md).\r\n";
    expect(extractMarkdownLinks(source)).toEqual(["./guide.md"]);
  });
});

describe("extractDisplayTitle", () => {
  test("returns frontmatter title when present", () => {
    const source = "---\ntitle: My Title\n---\n\n# Heading\n";
    expect(extractDisplayTitle(source)).toBe("My Title");
  });

  test("strips surrounding quotes from frontmatter title", () => {
    const source = `---\ntitle: "Quoted Title"\n---\n`;
    expect(extractDisplayTitle(source)).toBe("Quoted Title");
  });

  test("strips single quotes from frontmatter title", () => {
    const source = `---\ntitle: 'Single Quoted'\n---\n`;
    expect(extractDisplayTitle(source)).toBe("Single Quoted");
  });

  test("falls back to first h1 heading when no frontmatter title", () => {
    const source = "# Guide\n\nSome content.";
    expect(extractDisplayTitle(source)).toBe("Guide");
  });

  test("prefers frontmatter title over h1 heading", () => {
    const source = "---\ntitle: Frontmatter Title\n---\n\n# Heading Title\n";
    expect(extractDisplayTitle(source)).toBe("Frontmatter Title");
  });

  test("returns undefined when no title or heading", () => {
    const source = "Some content without a heading.";
    expect(extractDisplayTitle(source)).toBeUndefined();
  });

  test("returns undefined for empty source", () => {
    expect(extractDisplayTitle("")).toBeUndefined();
  });

  test("works with CRLF frontmatter", () => {
    const source = "---\r\ntitle: CRLF Title\r\n---\r\n\r\n# Heading\r\n";
    expect(extractDisplayTitle(source)).toBe("CRLF Title");
  });

  test("works with CRLF heading", () => {
    const source = "# CRLF Heading\r\n\r\nContent.\r\n";
    expect(extractDisplayTitle(source)).toBe("CRLF Heading");
  });

  test("does not include carriage return in heading title", () => {
    const source = "# Title With No Trailing CR\r\n";
    const result = extractDisplayTitle(source);
    expect(result).toBe("Title With No Trailing CR");
    expect(result?.endsWith("\r")).toBe(false);
  });
});
