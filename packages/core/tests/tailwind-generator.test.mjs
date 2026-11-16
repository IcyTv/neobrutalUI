import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { generateTailwindCss } from "../../../scripts/generate-tailwind-css.mjs";

async function fixture(files) {
  const dir = await mkdtemp(resolve(tmpdir(), "nb-tailwind-"));
  for (const [name, content] of Object.entries(files)) await writeFile(resolve(dir, name), content);
  return resolve(dir, "index.css");
}

test("every positive source class has a nonempty top-level registration", async () => {
  const css = await generateTailwindCss();
  const generated = postcss.parse(css);
  const registrations = new Map(generated.nodes.filter((n) => n.name === "utility").map((n) => [n.params, n]));
  const source = await readFile(new URL("../dist/index.css", import.meta.url), "utf8");
  const inventory = new Set();
  postcss.parse(source).walkRules((rule) => {
    selectorParser((selectors) => selectors.walkClasses((node) => {
      if (!node.value.startsWith("nb-")) return;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.type === "pseudo" && parent.value === ":not") return;
      }
      inventory.add(node.value);
    })).processSync(rule.selector);
  });
  assert.deepEqual(new Set(registrations.keys()), inventory);
  assert.ok(inventory.size > 500);
  for (const rule of registrations.values()) assert.ok(rule.nodes.length, rule.params);
  assert.doesNotMatch(css, /@layer nb\.|@theme/);
  assert.match(css, /@layer theme/);
  assert.match(css, /@layer base/);
  assert.match(css, /\[data-theme="neo-brutal-dark"\]/);
});

test("preserves compounds, repeated siblings, relational and negative constraints in source order", async () => {
  const entry = await fixture({ "index.css": `@layer nb.components {
    .nb-a.nb-b:hover, .nb-a + .nb-a { color: red; }
    .nb-a:has(.nb-child):not(.nb-excluded) { color: blue; }
    @media (width > 10px) { @supports (display: grid) { .nb-a { display: grid; } } }
    @keyframes nb-spin { to { transform: rotate(1turn); } }
  }` });
  const root = postcss.parse(await generateTailwindCss(entry));
  const utility = root.nodes.find((n) => n.params === "nb-a");
  const selectors = [];
  utility.walkRules((rule) => selectors.push(rule.selector.trim()));
  assert.deepEqual(selectors, ["&.nb-b:hover", "& + .nb-a", ".nb-a + &", "&:has(.nb-child):not(.nb-excluded)", "&"]);
  const childSelectors = [];
  root.nodes.find((n) => n.params === "nb-child").walkRules((rule) => childSelectors.push(rule.selector.trim()));
  assert.deepEqual(childSelectors, [".nb-a:has(&):not(.nb-excluded)"]);
  assert.ok(!root.nodes.some((n) => n.params === "nb-excluded"));
  assert.match(utility.toString(), /@media[\s\S]*@supports[\s\S]*display: grid/);
  assert.match(root.toString(), /@keyframes nb-spin/);
});

test("resolves and deduplicates local imports; rejects cycles and unsupported syntax", async () => {
  const entry = await fixture({
    "index.css": '@import "./shared.css"; @import url("./shared.css");',
    "shared.css": "@layer nb.components { .nb-a { color: red; } }",
  });
  assert.equal((await generateTailwindCss(entry)).match(/color: red/g).length, 1);
  const unsupported = [
    '@import "https://example.com/a.css";',
    '@import "./shared.css" screen;',
    "@container x { .nb-a { color: red; } }",
    "@layer nb.components { .nb-a { &:hover { color: red; } } }",
    "@layer nb.components { :not(.nb-a) { color: red; } }",
  ];
  for (const css of unsupported) {
    await writeFile(entry, css);
    await assert.rejects(generateTailwindCss(entry), /Tailwind generator:/);
  }
  await writeFile(entry, '@import "./index.css";');
  await assert.rejects(generateTailwindCss(entry), /circular import/);
});
