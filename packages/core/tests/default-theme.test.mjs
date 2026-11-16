import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postcss from "postcss";

const files = ["colors", "spacing", "shadows", "motion", "z-index", "component"];
const sheets = await Promise.all(files.map(async (name) => postcss.parse(
  await readFile(new URL(`../src/tokens/${name}.css`, import.meta.url), "utf8")
)));
const themes = ["neo-brutal", "neo-brutal-dark", "emerald", "emerald-dark"];

// Token selectors intentionally target roots, never descendants. Model their
// declarations and inheritance without requiring a browser for this unit test.
function tokens({ theme, dark = false, root = true, inherited = {} } = {}) {
  const result = { ...inherited };
  for (const sheet of sheets) {
    sheet.walkRules((rule) => {
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === "atrule" && parent.name === "media") {
          assert.equal(parent.params, "(prefers-color-scheme: dark)");
          if (!dark) return;
        }
      }
      const matches = rule.selectors.some((selector) => {
        if (selector === ":root:not([data-theme])") return root && theme === undefined;
        assert.match(selector, /^\[data-theme="(?:neo-brutal|neo-brutal-dark|emerald|emerald-dark)"\]$/);
        return selector === `[data-theme="${theme}"]`;
      });
      if (matches) rule.walkDecls((decl) => { result[decl.prop] = decl.value; });
    });
  }
  return result;
}

for (const dark of [false, true]) {
  test(`unthemed root matches explicit neo-brutal ${dark ? "dark" : "light"} tokens`, () => {
    assert.deepEqual(tokens({ dark }), tokens({ theme: dark ? "neo-brutal-dark" : "neo-brutal", dark }));
    assert.equal(tokens({ dark })["--nb-shadow-xl"], `${dark ? "8px 6px" : "8px 8px"} 0 var(--nb-border)`);
    assert.ok(tokens({ dark })["--nb-btn-shadow"]);
    assert.ok(tokens({ dark })["--nb-font-sans"]);
  });

  for (const theme of themes) {
    test(`${theme} overrides system and automatic ancestors (${dark ? "dark" : "light"})`, () => {
      const explicit = tokens({ theme });
      assert.deepEqual(tokens({ theme, dark }), explicit);
      assert.deepEqual(tokens({ theme, dark, root: false, inherited: tokens({ dark }) }), explicit);
      for (const parentTheme of themes) {
        assert.deepEqual(tokens({ theme, dark, root: false, inherited: tokens({ theme: parentTheme, dark }) }), explicit);
      }
      assert.deepEqual(tokens({ root: false, dark, inherited: explicit }), explicit);
    });
  }
}

test("automatic tokens apply only to a document root without data-theme", () => {
  assert.deepEqual(tokens({ root: false }), {});
  assert.deepEqual(tokens({ theme: "" }), {});
  assert.deepEqual(tokens({ theme: "custom", dark: true }), {});
});

test("automatic root receives the same base reset as explicit themes", async () => {
  const sheet = postcss.parse(await readFile(new URL("../src/base/reset.css", import.meta.url), "utf8"));
  sheet.walkRules((rule) => {
    for (const selector of rule.selectors.filter((value) => value.startsWith('[data-theme="neo-brutal"]'))) {
      assert.ok(rule.selectors.includes(selector.replace('[data-theme="neo-brutal"]', ":root:not([data-theme])")), selector);
    }
  });
});
