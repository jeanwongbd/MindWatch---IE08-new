/** Palette references for places Tailwind classes can't reach: inline styles,
 *  SVG fill/stroke (as CSS properties, not attributes) and gradient strings.
 *  Values resolve from the custom properties in index.css. */
export const C = {
  page: "var(--c-page)",
  background: "var(--c-background)",
  surface: "var(--c-surface)",
  surfaceRaised: "var(--c-surface-raised)",
  border: "var(--c-border)",
  ink: "var(--c-ink)",
  muted: "var(--c-muted)",
  dim: "var(--c-dim)",
  inverse: "var(--c-inverse)",
  onInverse: "var(--c-on-inverse)",
  stress: "var(--c-accent-stress)",
  load: "var(--c-accent-load)",
  calm: "var(--c-accent-calm)",
  pulse: "var(--c-accent-pulse)",
} as const;
