import type { VocabularyOption } from "../vocabulary/index.js";

/** "field_agent" → "Field Agent", for values the vocabulary doesn't cover. */
export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Label for `value` from `options`, falling back to Title Case. */
export function optionLabel(
  options: ReadonlyArray<VocabularyOption>,
  value: string | undefined,
): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? titleCase(value);
}
