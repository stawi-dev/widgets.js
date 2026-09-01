/**
 * All styling for the identity widget.
 *
 * The `--aiw-*` custom properties are the same names `@stawi/profile` uses,
 * so one host token object themes both widgets. Unlike profile, the identity
 * admin surface defaults to a light palette (it is a dense data UI that
 * usually sits inside an admin page), with the dark values applied under
 * `[data-theme="dark"]` and under `prefers-color-scheme: dark` when the host
 * left the theme on "auto".
 *
 * No fonts are inlined or fetched: the defaults are the platform system
 * stacks. Hosts override them via the `fontHeading` / `fontBody` tokens.
 *
 * Two builds are produced from one source: {@link widgetStyles} scopes the
 * token block to `:host` for the shadow-DOM island, and
 * {@link widgetStylesFor} scopes it to a plain selector for React hosts that
 * render into the light DOM.
 */

/** Default (light) token values. */
const TOKENS_LIGHT = `
  --aiw-bg: #ffffff;
  --aiw-surface: #f7f7f6;
  --aiw-text: #1f1f1f;
  --aiw-text-secondary: #6b6b6b;
  --aiw-border: #e2e2df;
  --aiw-primary: #2563eb;
  --aiw-primary-hover: #1d4ed8;
  --aiw-danger: #c44040;
  --aiw-danger-hover: #a83232;
  --aiw-muted: rgba(0,0,0,0.05);
  --aiw-muted-strong: rgba(0,0,0,0.09);
  --aiw-table-stripe: rgba(0,0,0,0.025);
  --aiw-tab-active: var(--aiw-primary);
  --aiw-radius: 12px;
  --aiw-radius-sm: 8px;
  --aiw-shadow: 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
  --aiw-font-heading: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --aiw-font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --aiw-font-size-base: 14px;
  --aiw-font-weight-heading: 600;
  --aiw-font-weight-body: 400;
  --aiw-z-dialog: 10001;
  --aiw-focus-ring: 2px solid var(--aiw-primary);
`;

/** Values that replace the light ones under a dark theme. */
const TOKENS_DARK = `
  --aiw-bg: #1c1b1a;
  --aiw-surface: #262523;
  --aiw-text: #e8e6e1;
  --aiw-text-secondary: #a09d97;
  --aiw-border: #3a3836;
  --aiw-muted: rgba(255,255,255,0.07);
  --aiw-muted-strong: rgba(255,255,255,0.13);
  --aiw-table-stripe: rgba(255,255,255,0.035);
  --aiw-primary: #6d9dfb;
  --aiw-primary-hover: #8db3fc;
  --aiw-danger: #e06a6a;
  --aiw-danger-hover: #ef8585;
  --aiw-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.30);
`;

/** Typography and box model applied to whichever element owns the tokens. */
const ROOT_LAYOUT = `
  color-scheme: light dark;
  font-family: var(--aiw-font-body);
  font-size: var(--aiw-font-size-base);
  font-weight: var(--aiw-font-weight-body);
  line-height: 1.5;
  color: var(--aiw-text);
  background: var(--aiw-bg);
  display: block;
  position: relative;
`;

/** Everything that is already class-scoped and identical in both builds. */
const BASE_RULES = `
/* --- Shell --- */

.aiw-views {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.aiw-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.aiw-header-org {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.aiw-header-title {
  font-family: var(--aiw-font-heading);
  font-weight: var(--aiw-font-weight-heading);
  font-size: 1.15em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aiw-header-code {
  color: var(--aiw-text-secondary);
  font-size: 0.85em;
}

/* --- Tabs --- */

.aiw-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--aiw-border);
  overflow-x: auto;
}

.aiw-tab {
  appearance: none;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--aiw-text-secondary);
  cursor: pointer;
  font: inherit;
  font-family: var(--aiw-font-heading);
  padding: 8px 14px;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.aiw-tab:hover {
  color: var(--aiw-text);
  background: var(--aiw-muted);
}

.aiw-tab[aria-selected="true"] {
  color: var(--aiw-text);
  border-bottom-color: var(--aiw-tab-active);
  font-weight: var(--aiw-font-weight-heading);
}

.aiw-tabpanel {
  min-height: 120px;
}

/* --- Buttons --- */

.aiw-button,
.aiw-button-primary,
.aiw-button-danger {
  appearance: none;
  border-radius: var(--aiw-radius-sm);
  cursor: pointer;
  font: inherit;
  font-family: var(--aiw-font-heading);
  line-height: 1.2;
  padding: 7px 12px;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.aiw-button {
  background: var(--aiw-surface);
  border: 1px solid var(--aiw-border);
  color: var(--aiw-text);
}

.aiw-button:hover:not(:disabled) {
  background: var(--aiw-muted-strong);
}

.aiw-button-primary {
  background: var(--aiw-primary);
  border: 1px solid var(--aiw-primary);
  color: #ffffff;
}

.aiw-button-primary:hover:not(:disabled) {
  background: var(--aiw-primary-hover);
  border-color: var(--aiw-primary-hover);
}

.aiw-button-danger {
  background: transparent;
  border: 1px solid var(--aiw-danger);
  color: var(--aiw-danger);
}

.aiw-button-danger:hover:not(:disabled) {
  background: var(--aiw-danger);
  color: #ffffff;
}

.aiw-button:disabled,
.aiw-button-primary:disabled,
.aiw-button-danger:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.aiw-link-button {
  appearance: none;
  background: none;
  border: none;
  color: var(--aiw-primary);
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: start;
  text-decoration: underline;
}

/* --- Form controls --- */

.aiw-input,
.aiw-select {
  background: var(--aiw-bg);
  border: 1px solid var(--aiw-border);
  border-radius: var(--aiw-radius-sm);
  color: var(--aiw-text);
  font: inherit;
  padding: 7px 10px;
  width: 100%;
}

.aiw-input:focus,
.aiw-select:focus {
  border-color: var(--aiw-primary);
}

.aiw-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aiw-field-label {
  color: var(--aiw-text-secondary);
  font-size: 0.9em;
}

.aiw-field-required {
  color: var(--aiw-danger);
}

.aiw-field-error {
  color: var(--aiw-danger);
  font-size: 0.85em;
}

.aiw-field-static {
  color: var(--aiw-text-secondary);
}

.aiw-fieldset {
  border: 1px solid var(--aiw-border);
  border-radius: var(--aiw-radius-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.aiw-fieldset-legend {
  color: var(--aiw-text-secondary);
  font-size: 0.9em;
  padding: 0 4px;
}

.aiw-radio,
.aiw-checkbox {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.aiw-checkbox-input {
  accent-color: var(--aiw-primary);
}

.aiw-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.aiw-org-form,
.aiw-member-form,
.aiw-team-form,
.aiw-membership-form,
.aiw-role-form,
.aiw-unit-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aiw-member-identify,
.aiw-member-profile {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* --- Tables --- */

.aiw-table {
  border-collapse: collapse;
  font-size: 0.95em;
  width: 100%;
}

.aiw-table th,
.aiw-table td {
  border-bottom: 1px solid var(--aiw-border);
  padding: 8px 10px;
  text-align: start;
  vertical-align: middle;
}

.aiw-table th {
  color: var(--aiw-text-secondary);
  font-family: var(--aiw-font-heading);
  font-size: 0.85em;
  font-weight: var(--aiw-font-weight-heading);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
}

.aiw-table tbody tr:nth-child(even) {
  background: var(--aiw-table-stripe);
}

.aiw-table tbody tr.aiw-is-selected {
  background: var(--aiw-muted-strong);
}

.aiw-members-name,
.aiw-units-name {
  font-weight: 500;
}

.aiw-members-contact {
  color: var(--aiw-text-secondary);
}

.aiw-members-bundle {
  align-items: center;
  display: inline-flex;
  gap: 6px;
  margin-inline-end: 6px;
}

.aiw-chip {
  background: var(--aiw-muted-strong);
  border-radius: 999px;
  color: var(--aiw-text-secondary);
  font-size: 11px;
  padding: 1px 8px;
}

.aiw-grant-issues ul {
  margin: 6px 0;
  padding-inline-start: 18px;
}

.aiw-members-actions,
.aiw-roles-actions,
.aiw-team-members-actions,
.aiw-units-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.aiw-role-matrix-cell.aiw-is-set {
  color: var(--aiw-primary);
  font-weight: 600;
}

/* --- Toolbars and layouts --- */

.aiw-members-toolbar,
.aiw-permissions-toolbar,
.aiw-teams-toolbar,
.aiw-roles-toolbar,
.aiw-units-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.aiw-members-toolbar .aiw-input,
.aiw-permissions-toolbar .aiw-input,
.aiw-teams-toolbar .aiw-input {
  flex: 1 1 220px;
  width: auto;
}

.aiw-members,
.aiw-permissions,
.aiw-teams,
.aiw-roles,
.aiw-units {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aiw-teams-layout,
.aiw-roles-layout {
  align-items: start;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}

.aiw-teams-detail {
  background: var(--aiw-surface);
  border: 1px solid var(--aiw-border);
  border-radius: var(--aiw-radius);
  padding: 12px;
}

.aiw-team-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.aiw-team-detail-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aiw-team-detail-title {
  font-family: var(--aiw-font-heading);
  font-weight: var(--aiw-font-weight-heading);
}

.aiw-team-detail-meta,
.aiw-team-detail-objective {
  color: var(--aiw-text-secondary);
  font-size: 0.9em;
}

.aiw-team-detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.aiw-members-error,
.aiw-permissions-error,
.aiw-teams-error,
.aiw-roles-error,
.aiw-units-error,
.aiw-team-detail-error,
.aiw-org-gate {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

/* --- Permissions --- */

.aiw-perm-layout {
  align-items: start;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
}

.aiw-perm-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.aiw-perm-member {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--aiw-radius-sm);
  color: inherit;
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 8px;
  justify-content: space-between;
  padding: 6px 8px;
  text-align: start;
  width: 100%;
}

.aiw-perm-member:hover {
  background: var(--aiw-muted);
}

.aiw-perm-member[aria-current="true"] {
  background: var(--aiw-muted-strong);
  border-color: var(--aiw-border);
}

.aiw-perm-member-state {
  color: var(--aiw-text-secondary);
  font-size: 0.85em;
}

.aiw-perm-panels {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aiw-perm-namespace {
  background: var(--aiw-surface);
  border: 1px solid var(--aiw-border);
  border-radius: var(--aiw-radius);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.aiw-perm-namespace-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.aiw-perm-namespace-title {
  font-family: var(--aiw-font-heading);
  font-weight: var(--aiw-font-weight-heading);
}

.aiw-perm-namespace-scope,
.aiw-perm-bundle {
  color: var(--aiw-text-secondary);
  font-size: 0.9em;
}

.aiw-perm-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aiw-perm-group-title {
  color: var(--aiw-text-secondary);
  font-size: 0.85em;
  letter-spacing: 0.04em;
  margin: 6px 0 2px;
  text-transform: uppercase;
}

.aiw-perm-row {
  align-items: center;
  display: flex;
  gap: 8px;
  padding: 3px 0;
}

.aiw-perm-label {
  flex: 1 1 auto;
  min-width: 0;
}

.aiw-perm-tag {
  border-radius: 999px;
  font-size: 11px;
  padding: 1px 8px;
  white-space: nowrap;
}

.aiw-perm-tag-bundle,
.aiw-perm-tag-none,
.aiw-perm-tag-role {
  background: var(--aiw-muted);
  color: var(--aiw-text-secondary);
}

.aiw-perm-tag-granted {
  background: var(--aiw-muted-strong);
  color: var(--aiw-primary);
}

.aiw-perm-tag-revoked,
.aiw-perm-tag-warn {
  background: var(--aiw-muted-strong);
  color: var(--aiw-danger);
}

/* --- Organization gate --- */

.aiw-org-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aiw-org-picker-title,
.aiw-org-form-title {
  font-family: var(--aiw-font-heading);
  font-weight: var(--aiw-font-weight-heading);
  font-size: 1.1em;
}

.aiw-org-picker-hint {
  color: var(--aiw-text-secondary);
}

.aiw-org-picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
}

.aiw-org-picker-item {
  align-items: baseline;
  appearance: none;
  background: var(--aiw-surface);
  border: 1px solid var(--aiw-border);
  border-radius: var(--aiw-radius-sm);
  color: inherit;
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 12px;
  width: 100%;
}

.aiw-org-picker-item:hover {
  border-color: var(--aiw-primary);
}

.aiw-org-picker-name {
  font-weight: 500;
}

.aiw-org-picker-code {
  color: var(--aiw-text-secondary);
  font-size: 0.85em;
}

/* --- Sign-in --- */

.aiw-signin-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  padding: 16px;
}

.aiw-signin-trigger {
  appearance: none;
  background: var(--aiw-primary);
  border: 1px solid var(--aiw-primary);
  border-radius: var(--aiw-radius-sm);
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-family: var(--aiw-font-heading);
  padding: 9px 16px;
}

.aiw-signin-trigger:hover:not(:disabled) {
  background: var(--aiw-primary-hover);
}

.aiw-signin-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* --- Dialogs --- */

.aiw-dialog-backdrop {
  align-items: center;
  background: rgba(0,0,0,0.45);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 16px;
  position: fixed;
  z-index: var(--aiw-z-dialog);
}

.aiw-dialog {
  background: var(--aiw-bg);
  border: 1px solid var(--aiw-border);
  border-radius: var(--aiw-radius);
  box-shadow: var(--aiw-shadow);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  max-width: 480px;
  width: 100%;
}

.aiw-dialog-header {
  align-items: center;
  border-bottom: 1px solid var(--aiw-border);
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 12px 16px;
}

.aiw-dialog-title {
  font-family: var(--aiw-font-heading);
  font-weight: var(--aiw-font-weight-heading);
}

.aiw-dialog-close {
  appearance: none;
  background: none;
  border: none;
  color: var(--aiw-text-secondary);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 2px 6px;
}

.aiw-dialog-close:hover {
  color: var(--aiw-text);
}

.aiw-dialog-body {
  overflow-y: auto;
  padding: 16px;
}

/* --- Empty, loading and error states --- */

.aiw-empty-state {
  align-items: center;
  border: 1px dashed var(--aiw-border);
  border-radius: var(--aiw-radius);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
}

.aiw-empty-state-title {
  font-family: var(--aiw-font-heading);
  font-weight: var(--aiw-font-weight-heading);
}

.aiw-empty-state-description {
  color: var(--aiw-text-secondary);
}

.aiw-empty-state-action {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 4px;
}

.aiw-loading-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aiw-loading-row {
  background: var(--aiw-muted);
  border-radius: var(--aiw-radius-sm);
  height: 36px;
  animation: aiw-pulse 1.4s ease-in-out infinite;
}

@keyframes aiw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .aiw-loading-row { animation: none; }
  .aiw-tab, .aiw-button, .aiw-button-primary, .aiw-button-danger {
    transition: none;
  }
}

.aiw-error,
.aiw-signin-error {
  background: var(--aiw-muted);
  border-inline-start: 3px solid var(--aiw-danger);
  border-radius: var(--aiw-radius-sm);
  color: var(--aiw-danger);
  padding: 8px 10px;
}

.aiw-notice {
  background: var(--aiw-muted);
  border-inline-start: 3px solid var(--aiw-text-secondary);
  border-radius: var(--aiw-radius-sm);
  color: var(--aiw-text-secondary);
  font-size: 0.9em;
  padding: 8px 10px;
}

/* The notice is a full-width banner inside the two-column roles grid. */
.aiw-roles-layout > .aiw-notice {
  grid-column: 1 / -1;
}

.aiw-visually-hidden {
  border: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

/* --- Narrow viewports: stack the list/detail split --- */

@media (max-width: 768px) {
  .aiw-teams-layout,
  .aiw-roles-layout,
  .aiw-perm-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .aiw-table,
  .aiw-table thead,
  .aiw-table tbody,
  .aiw-table tr {
    display: block;
  }

  .aiw-table thead {
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    position: absolute;
    width: 1px;
  }

  .aiw-table tbody tr {
    border: 1px solid var(--aiw-border);
    border-radius: var(--aiw-radius-sm);
    margin-bottom: 8px;
    padding: 4px 0;
  }

  .aiw-table td {
    border-bottom: none;
    display: block;
    padding: 4px 10px;
  }
}
`;

/**
 * Builds the stylesheet with the token blocks bound to `root`. The reset and
 * focus rules are scoped to `root` too, so the light-DOM build can never
 * restyle the rest of the host page.
 */
function buildStyles(root: string, dark: string, auto: string): string {
  return `
${root} {${TOKENS_LIGHT}${ROOT_LAYOUT}}

${dark} {${TOKENS_DARK}}

@media (prefers-color-scheme: dark) {
  ${auto} {${TOKENS_DARK}}
}

${root} *, ${root} *::before, ${root} *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

${root} *:focus-visible {
  outline: var(--aiw-focus-ring);
  outline-offset: 2px;
}
${BASE_RULES}`;
}

/** Stylesheet for the shadow-DOM island, with tokens on `:host`. */
export const widgetStyles = buildStyles(
  ":host",
  ':host([data-theme="dark"])',
  ':host([data-theme="auto"])',
);

/**
 * Stylesheet for React hosts rendering `<IdentityWidgetRoot />` into the
 * light DOM. `rootSelector` must match the widget's root element, which
 * carries the `aiw-root` class and a `data-theme` attribute.
 */
export function widgetStylesFor(rootSelector = ".aiw-root"): string {
  return buildStyles(
    rootSelector,
    `${rootSelector}[data-theme="dark"]`,
    `${rootSelector}[data-theme="auto"]`,
  );
}
