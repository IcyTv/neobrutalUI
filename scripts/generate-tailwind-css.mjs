import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const defaultEntry = resolve(import.meta.dirname, "../packages/core/src/index.css");
const sourceLayers = new Set(["nb.theme", "nb.base", "nb.components", "nb.utilities"]);

function fail(node, message) {
  throw node.error(`Tailwind generator: ${message}`);
}

// Only unconditional local imports are supported. Canonical paths make aliases
// and repeated imports share one source-order position; cycles remain errors.
async function loadSources(entry, seen = new Set(), active = new Set()) {
  const file = await realpath(entry);
  if (active.has(file)) throw new Error(`Tailwind generator: circular import: ${file}`);
  if (seen.has(file)) return [];
  seen.add(file);
  active.add(file);
  const root = postcss.parse(await readFile(file, "utf8"), { from: file });
  const nodes = [];
  for (const node of root.nodes) {
    if (node.type !== "atrule" || node.name !== "import") {
      nodes.push(node);
      continue;
    }
    const match = node.params.match(/^(?:["']([^"']+)["']|url\(\s*["']([^"']+)["']\s*\))$/);
    const path = match?.[1] ?? match?.[2];
    if (!path || !path.startsWith(".")) fail(node, "expected an unconditional relative @import");
    nodes.push(...await loadSources(resolve(dirname(file), path), seen, active));
  }
  active.delete(file);
  return nodes;
}

function positiveClasses(selector) {
  const classes = [];
  selector.walkClasses((node) => {
    if (!node.value.startsWith("nb-")) return;
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === "pseudo" && parent.value.toLowerCase() === ":not") return;
    }
    if (!/^nb-[a-zA-Z0-9_-]+$/.test(node.value)) {
      throw new Error(`Tailwind generator: unsupported utility name ${node.value}`);
    }
    classes.push(node);
  });
  return classes;
}

function wrap(node, conditions) {
  let result = node;
  for (const condition of conditions.toReversed()) {
    const wrapper = condition.clone({ nodes: [] });
    wrapper.append(result);
    result = wrapper;
  }
  return result;
}

/** Generate CSS-first registrations from the ordered standalone source graph. */
export async function generateTailwindCss(entry = defaultEntry) {
  const output = postcss.root();
  const utilities = new Map();
  const layerNodes = new Map();

  function appendLayer(layer, node, conditions) {
    if (!layerNodes.has(layer)) {
      const target = postcss.atRule({ name: "layer", params: layer });
      layerNodes.set(layer, target);
      output.append(target);
    }
    layerNodes.get(layer).append(wrap(node.clone(), conditions));
  }

  function visit(nodes, layer, conditions = []) {
    for (const node of nodes) {
      if (node.type === "comment") continue;
      if (node.type === "atrule") {
        if (node.name === "layer") {
          if (!node.nodes) {
            if (!node.params.split(",").every((name) => sourceLayers.has(name.trim()))) {
              fail(node, `unsupported layer order ${node.params}`);
            }
            continue;
          }
          if (layer || !sourceLayers.has(node.params)) fail(node, `unsupported layer ${node.params}`);
          visit(node.nodes, node.params, conditions);
        } else if (["media", "supports"].includes(node.name) && node.nodes) {
          visit(node.nodes, layer, [...conditions, node]);
        } else if (node.name === "keyframes" && node.nodes && layer) {
          appendLayer("utilities", node, conditions);
        } else {
          fail(node, `unsupported @${node.name}`);
        }
        continue;
      }
      if (node.type !== "rule" || !layer) fail(node, "expected a rule inside a source layer");
      if (node.nodes.some((child) => !["decl", "comment"].includes(child.type))) {
        fail(node, "nested rules and at-rules inside selectors are unsupported");
      }
      if (["nb.theme", "nb.base"].includes(layer)) {
        appendLayer(layer === "nb.theme" ? "theme" : "base", node, conditions);
        continue;
      }
      const selectors = selectorParser().astSync(node.selector);
      for (const selector of selectors.nodes) {
        const owners = positiveClasses(selector);
        if (!owners.length) fail(node, `selector has no positive public nb-* owner: ${selector}`);
        for (const owner of owners) {
          if (!utilities.has(owner.value)) {
            utilities.set(owner.value, postcss.atRule({ name: "utility", params: owner.value }));
          }
          // Replace exactly one occurrence. Repeated and companion classes keep
          // their original constraints, including inside relational selectors.
          const copy = selector.clone();
          const index = owners.indexOf(owner);
          positiveClasses(copy)[index].replaceWith(selectorParser.nesting({ value: "&" }));
          const rule = node.clone({ selector: copy.toString() });
          utilities.get(owner.value).append(wrap(rule, conditions));
        }
      }
    }
  }

  visit(await loadSources(entry));
  for (const utility of utilities.values()) output.append(utility);
  return `${output.toString()}\n`;
}
