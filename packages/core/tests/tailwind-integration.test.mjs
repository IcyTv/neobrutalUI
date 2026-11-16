import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { compile, __unstable__loadDesignSystem } from "tailwindcss";
import postcss from "postcss";
import { generateTailwindCss } from "../../../scripts/generate-tailwind-css.mjs";

const base = resolve(import.meta.dirname, "..");
const require = createRequire(new URL("../package.json", import.meta.url));
const options = {
  base,
  async loadStylesheet(id, from) {
    const path = id.startsWith(".") ? resolve(from, id) : require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id);
    return { path, base: dirname(path), content: await readFile(path, "utf8") };
  },
};
const input = '@import "tailwindcss"; @import "@neo-brutal-ui/core/tailwind";';

test("package export registers the full LSP class and candidate surface", async () => {
  assert.equal(require.resolve("@neo-brutal-ui/core/tailwind"), resolve(base, "dist/tailwind.css"));
  const css = await readFile(require.resolve("@neo-brutal-ui/core/tailwind"), "utf8");
  const inventory = postcss.parse(css).nodes.filter((n) => n.name === "utility").map((n) => n.params);
  const design = await __unstable__loadDesignSystem(input, options);
  const classes = new Set(design.getClassList().map(([name]) => name));
  for (const name of inventory) assert.ok(classes.has(name), name);
  const candidates = design.candidatesToCss(inventory);
  for (let i = 0; i < inventory.length; i++) assert.ok(candidates[i]?.trim(), inventory[i]);
  for (const candidate of ["hover:nb-btn", "focus:nb-input", "md:nb-card", "disabled:nb-btn-primary"]) {
    assert.ok(design.candidatesToCss([candidate])[0], candidate);
  }
});

test("real compilation supports bare utilities, variants, conditions, keyframes and apply", async () => {
  const compiler = await compile(`${input}\n.action { @apply nb-btn nb-btn-primary; }`, options);
  const css = compiler.build(["nb-btn", "nb-btn-primary", "hover:nb-btn", "md:nb-card", "nb-loading", "nb-toast-progress"]);
  assert.match(css, /\.nb-btn\s*\{/);
  assert.match(css, /\.hover\\:nb-btn/);
  assert.match(css, /\.md\\:nb-card/);
  assert.match(css, /@media/);
  assert.match(css, /@keyframes nb-/);
  assert.match(css, /\.action[\s\S]*--nb-/);
  assert.doesNotMatch(css, /@utility|@apply|@layer nb\./);
});

test("compiled selectors retain ownership, states and rule-specific conditions", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "nb-tailwind-semantics-"));
  const entry = resolve(dir, "index.css");
  await writeFile(entry, `@layer nb.components {
    .nb-a:has(.nb-child):not(.nb-excluded) { color: blue; }
    .nb-a + .nb-a { margin-left: 2px; }
    .nb-a:hover:not(:disabled) { opacity: 0.8; }
    @media (prefers-reduced-motion: reduce) { .nb-a { transition: none; } }
    @media (forced-colors: active) { .nb-a:disabled { border-color: GrayText; } }
    @media (width > 10px) { @supports (display: grid) { .nb-child { display: grid; } } }
  }`);
  const compiler = await compile(`@tailwind utilities;\n${await generateTailwindCss(entry)}`);
  const root = postcss.parse(compiler.build(["nb-a", "nb-child"]));
  const records = [];
  root.walkRules((rule) => {
    const conditions = [];
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === "atrule") conditions.unshift(`@${parent.name} ${parent.params}`);
    }
    records.push({
      selector: rule.selector,
      conditions,
      declarations: rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]),
    });
  });
  // Comparing the complete rule inventory also rejects leaked unconditional
  // copies and accidental attachment of a condition to a neighboring rule.
  assert.deepEqual(records, [
    { selector: ".nb-a:has(.nb-child):not(.nb-excluded)", conditions: [], declarations: [["color", "blue"]] },
    { selector: ".nb-a + .nb-a", conditions: [], declarations: [["margin-left", "2px"]] },
    { selector: ".nb-a:hover:not(:disabled)", conditions: [], declarations: [["opacity", "0.8"]] },
    { selector: ".nb-a", conditions: ["@media (prefers-reduced-motion: reduce)"], declarations: [["transition", "none"]] },
    { selector: ".nb-a:disabled", conditions: ["@media (forced-colors: active)"], declarations: [["border-color", "GrayText"]] },
    { selector: ".nb-a:has(.nb-child):not(.nb-excluded)", conditions: [], declarations: [["color", "blue"]] },
    { selector: ".nb-child", conditions: ["@media (width > 10px)", "@supports (display: grid)"], declarations: [["display", "grid"]] },
  ]);
});

test("reference enables apply without emitting scoped themes or unused utilities", async () => {
  const compiler = await compile('@reference "tailwindcss"; @reference "@neo-brutal-ui/core/tailwind"; .action { @apply nb-btn hover:nb-btn-primary; }', options);
  const css = compiler.build([]);
  assert.match(css, /\.action/);
  assert.match(css, /\.action:hover/);
  assert.doesNotMatch(css, /data-theme=|\.nb-card\s*\{|@apply/);
});

test("conflicting modifiers use native sorting, independent of candidate input order", async () => {
  const candidates = ["nb-btn", "nb-btn-sm", "nb-btn-lg", "nb-btn-primary", "nb-btn-secondary"];
  const first = await compile(input, options);
  const second = await compile(input, options);
  const css = first.build(candidates);
  assert.equal(css, second.build(candidates.toReversed()));
  for (const name of candidates) assert.ok(css.includes(`.${name}`), name);
  // Native Tailwind sorts by property count/order and candidate name, rather
  // than promising the standalone stylesheet's component modifier cascade.
  const design = await __unstable__loadDesignSystem(input, options);
  const native = design.candidatesToCss(["nb-btn-sm", "nb-btn-lg"]);
  assert.ok(native.every(Boolean));
});
