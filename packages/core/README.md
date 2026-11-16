# @neo-brutal-ui/core

Core CSS for Neo-Brutal UI. It provides the design tokens, base reset, component classes, and utilities used by the rest of the package family.

## Install

```sh
npm install @neo-brutal-ui/core tailwindcss
```

Neo-Brutal UI targets Tailwind CSS v4+ and modern CSS import pipelines.

## Usage

Import the complete CSS entry in your app stylesheet:

```css
@import "@neo-brutal-ui/core/css";
```

Use the component classes in your markup:

```html
<div data-theme="neo-brutal">
  <button class="nb-btn nb-btn-primary">Create project</button>
</div>
```

Without `data-theme` on the document root (`<html>`), Neo-Brutal UI defaults to `neo-brutal` light and follows `prefers-color-scheme: dark` with the `neo-brutal-dark` palette and shadows. No JavaScript is required.

Set `data-theme="neo-brutal"`, `neo-brutal-dark`, `emerald`, or `emerald-dark` to force a theme regardless of system preference. Theme roots can be nested; descendants inherit the nearest theme. An empty or unknown `data-theme` on `<html>` does not opt into the automatic default.

For example, force dark mode with a theme root:

```html
<div data-theme="neo-brutal-dark">
  <button class="nb-btn nb-btn-primary">Dark action</button>
</div>
```

## Tailwind CSS v4 integration

Use the CSS-first entry when Tailwind should discover and compose `nb-*` utilities:

```css
@import "tailwindcss";
@import "@neo-brutal-ui/core/tailwind";
```

No JavaScript plugin or Tailwind configuration is required. This entry registers every public positive `nb-*` class as a Tailwind utility, including component modifiers and subparts. Tailwind can suggest these classes and compile variants such as `hover:nb-btn-primary` and `md:nb-card`.

The bundled tokens use the same automatic document default and explicit, nestable theme roots described above. Tokens use Tailwind's `theme` layer; the reset uses its `base` layer. This entry does not create Tailwind theme namespaces or token-derived utilities.

Compose classes with `@apply`:

```css
.action {
  @apply nb-btn nb-btn-primary;
}
```

In a separately compiled stylesheet (for example, a CSS module), reference the entry without emitting another copy:

```css
@reference "tailwindcss";
@reference "@neo-brutal-ui/core/tailwind";

.action {
  @apply nb-btn hover:nb-btn-primary;
}
```

The application's main stylesheet must still import the entry to provide scoped tokens, reset, and keyframes. Do not import the standalone full or split entries alongside the Tailwind entry: that would duplicate styles and mix cascade models.

### Native ordering and companion selectors

Tailwind controls utility sorting and composition. Source order is preserved **within** each registered utility, but Tailwind orders separate utilities by its native rules, not the standalone component cascade. Conflicting modifiers such as `nb-btn-sm nb-btn-lg` have no standalone-parity guarantee; markup class order does not select the winner. Prefer one size, color, or other conflicting modifier per element.

Selectors keep their state, compound, sibling, descendant, and relational constraints. Each registration substitutes only one matching class occurrence; other classes remain literal dependencies. A utility or `@apply` alias does not rename companion classes, and adding a variant does not propagate that variant to companions. For example, a rule involving `.nb-btn-group .nb-btn` still needs the appropriate group ancestor. Repeated-class sibling rules still need their literal sibling class. Classes mentioned only inside `:not()` do not create registrations.

The five standalone CSS exports retain their existing behavior. Use those when the standalone source cascade is required instead of Tailwind composition.

## CSS Entry Points

```css
@import "@neo-brutal-ui/core/css";
@import "@neo-brutal-ui/core/tokens";
@import "@neo-brutal-ui/core/base";
@import "@neo-brutal-ui/core/components";
@import "@neo-brutal-ui/core/utilities";
```

Use `@neo-brutal-ui/core/css` for the normal full import. The split entry points are available for advanced builds that want finer CSS layering.

