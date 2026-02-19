export const widgetStyles = `
:host {
  --aiw-bg: #2c2a28;
  --aiw-surface: #363432;
  --aiw-text: #e8e6e1;
  --aiw-text-secondary: #9c9a94;
  --aiw-border: #4a4745;
  --aiw-primary: #d97757;
  --aiw-primary-hover: #c4633f;
  --aiw-danger: #c44040;
  --aiw-danger-hover: #a83232;
  --aiw-muted: rgba(255,255,255,0.08);
  --aiw-muted-strong: rgba(255,255,255,0.14);
  --aiw-radius: 16px;
  --aiw-radius-sm: 10px;
  --aiw-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15);
  --aiw-font-heading: 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --aiw-font-body: 'Lora', Georgia, "Times New Roman", serif;
  --aiw-popover-width: 360px;

  font-family: var(--aiw-font-body);
  font-size: 14px;
  line-height: 1.5;
  color: var(--aiw-text);
  display: inline-block;
  position: relative;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* --- Trigger button --- */

.aiw-trigger {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--aiw-border);
  background: var(--aiw-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  padding: 0;
}

.aiw-trigger:hover {
  border-color: var(--aiw-primary);
  box-shadow: 0 0 0 3px rgba(217,119,87,0.2);
}

.aiw-trigger img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aiw-trigger-initials {
  font-family: var(--aiw-font-heading);
  font-size: 14px;
  font-weight: 600;
  color: var(--aiw-primary);
  text-transform: uppercase;
}

/* --- Logged-out trigger --- */

.aiw-signin-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.aiw-signin-label {
  font-family: var(--aiw-font-heading);
  font-size: 14px;
  font-weight: 500;
  color: var(--aiw-text-secondary);
  transition: color 0.2s ease;
}

.aiw-signin-trigger:hover .aiw-signin-label {
  color: var(--aiw-text);
}

.aiw-signin-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--aiw-border);
  background: var(--aiw-surface);
  color: var(--aiw-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.aiw-signin-trigger:hover .aiw-signin-avatar {
  border-color: var(--aiw-primary);
  color: var(--aiw-primary);
}

/* --- Loading trigger --- */

.aiw-trigger--loading {
  cursor: default;
}

.aiw-trigger-pulse {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--aiw-primary);
  animation: aiw-pulse 1.5s ease-in-out infinite;
}

@keyframes aiw-pulse {
  0%, 100% { scale: 0.8; opacity: 0.3; }
  50% { scale: 1; opacity: 0.6; }
}

/* --- Popover panel --- */

.aiw-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: var(--aiw-popover-width);
  background: var(--aiw-bg);
  border-radius: var(--aiw-radius);
  box-shadow: var(--aiw-shadow);
  border: 1px solid var(--aiw-border);
  z-index: 10000;
  opacity: 0;
  transform: scale(0.95);
  transform-origin: top right;
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
  overflow: hidden;
}

.aiw-popover.aiw-popover--open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.aiw-section {
  padding: 20px 24px;
}

.aiw-section + .aiw-section {
  border-top: 1px solid var(--aiw-border);
}

/* --- Profile header (centered, Google-style) --- */

.aiw-profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 28px 24px 24px;
}

.aiw-avatar-large {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--aiw-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  border: 3px solid var(--aiw-border);
  transition: border-color 0.2s ease;
  position: relative;
}

.aiw-avatar-large:hover {
  border-color: var(--aiw-primary);
}

.aiw-avatar-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aiw-avatar-initials {
  font-family: var(--aiw-font-heading);
  font-size: 24px;
  font-weight: 600;
  color: var(--aiw-primary);
  text-transform: uppercase;
}

.aiw-avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s ease;
  color: white;
  font-size: 11px;
  font-weight: 500;
}

.aiw-avatar-large:hover .aiw-avatar-overlay {
  opacity: 1;
}

.aiw-profile-info {
  text-align: center;
  min-width: 0;
  width: 100%;
}

.aiw-profile-name {
  font-family: var(--aiw-font-heading);
  font-size: 18px;
  font-weight: 600;
  color: var(--aiw-text);
}

.aiw-profile-email {
  font-size: 13px;
  color: var(--aiw-text-secondary);
  margin-top: 2px;
}

/* --- Settings row (language, country) --- */

.aiw-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  margin: 0 -4px;
  padding-left: 4px;
  padding-right: 4px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.aiw-field:hover {
  background: var(--aiw-muted);
}

.aiw-field + .aiw-field {
  margin-top: 2px;
}

.aiw-field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--aiw-text-secondary);
  flex-shrink: 0;
}

.aiw-field-label svg {
  flex-shrink: 0;
  opacity: 0.7;
}

.aiw-select {
  flex: 1;
  min-width: 0;
  padding: 6px 24px 6px 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--aiw-text);
  font-size: 13px;
  font-family: var(--aiw-font-body);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%239c9a94' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0 center;
  padding-right: 20px;
  text-align: right;
}

.aiw-select:focus {
  outline: none;
  color: var(--aiw-primary);
}

/* --- Section title with optional action icon --- */

.aiw-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.aiw-section-title {
  font-family: var(--aiw-font-heading);
  font-size: 11px;
  font-weight: 600;
  color: var(--aiw-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 0;
}

.aiw-section-action {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--aiw-text-secondary);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, background 0.15s ease;
}

.aiw-section-action:hover {
  color: var(--aiw-text);
  background: var(--aiw-muted);
}

.aiw-section-action--active {
  color: var(--aiw-primary);
}

.aiw-section-action--active:hover {
  color: var(--aiw-primary-hover);
}

/* --- Contact items --- */

.aiw-contact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.aiw-contact-icon {
  flex-shrink: 0;
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--aiw-text-secondary);
  opacity: 0.7;
}

.aiw-contact-value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--aiw-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- Badges (muted, monochrome) --- */

.aiw-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
  background: var(--aiw-muted);
  color: var(--aiw-text-secondary);
}

.aiw-badge--verified {
  background: var(--aiw-muted);
  color: var(--aiw-text-secondary);
}

.aiw-badge--primary {
  background: var(--aiw-muted);
  color: var(--aiw-text-secondary);
}

.aiw-badge--unverified {
  background: rgba(217,119,87,0.12);
  color: var(--aiw-primary);
}

.aiw-badge--clickable {
  cursor: pointer;
  border: none;
  font-family: var(--aiw-font-body);
  transition: background 0.15s ease;
}

.aiw-badge--clickable:hover {
  background: rgba(217,119,87,0.2);
}

/* --- Inline verify row --- */

.aiw-verify-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0 2px 32px;
}

.aiw-verify-input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid var(--aiw-border);
  border-radius: 6px;
  background: var(--aiw-surface);
  color: var(--aiw-text);
  font-size: 12px;
  font-family: var(--aiw-font-body);
}

.aiw-verify-input:focus {
  outline: 1.5px solid var(--aiw-primary);
  outline-offset: -1px;
}

.aiw-verify-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  background: var(--aiw-primary);
  color: white;
  font-size: 11px;
  font-family: var(--aiw-font-heading);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.aiw-verify-btn:hover {
  background: var(--aiw-primary-hover);
}

.aiw-verify-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aiw-verify-cancel {
  padding: 4px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--aiw-text-secondary);
  font-size: 11px;
  font-family: var(--aiw-font-body);
  cursor: pointer;
  transition: color 0.15s ease;
}

.aiw-verify-cancel:hover {
  color: var(--aiw-text);
}

/* --- Contact actions --- */

.aiw-contact-delete {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--aiw-text-secondary);
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
  display: flex;
  transition: color 0.15s ease;
}

.aiw-contact-delete:hover {
  color: var(--aiw-danger);
}

.aiw-add-buttons {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.aiw-btn-add {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: var(--aiw-muted);
  color: var(--aiw-text-secondary);
  font-size: 12px;
  font-family: var(--aiw-font-body);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.aiw-btn-add:hover {
  background: var(--aiw-muted-strong);
  color: var(--aiw-text);
}

/* --- Action buttons --- */

.aiw-btn-logout {
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--aiw-text-secondary);
  font-size: 13px;
  font-family: var(--aiw-font-body);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.aiw-btn-logout:hover {
  background: rgba(196,64,64,0.1);
  color: var(--aiw-danger);
}

.aiw-btn-admin {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--aiw-text-secondary);
  font-size: 13px;
  font-family: var(--aiw-font-body);
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  box-sizing: border-box;
}

.aiw-btn-admin:hover {
  background: var(--aiw-muted);
  color: var(--aiw-text);
}

/* --- Dialog --- */

.aiw-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.aiw-dialog {
  background: var(--aiw-bg);
  border-radius: var(--aiw-radius);
  box-shadow: var(--aiw-shadow);
  border: 1px solid var(--aiw-border);
  padding: 24px;
  width: 320px;
  max-width: 90vw;
}

.aiw-dialog-title {
  font-family: var(--aiw-font-heading);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.aiw-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--aiw-border);
  border-radius: var(--aiw-radius-sm);
  background: var(--aiw-surface);
  color: var(--aiw-text);
  font-size: 14px;
  font-family: var(--aiw-font-body);
}

.aiw-input:focus {
  outline: 2px solid var(--aiw-primary);
  outline-offset: -1px;
}

.aiw-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.aiw-btn {
  padding: 8px 16px;
  border-radius: var(--aiw-radius-sm);
  font-size: 13px;
  font-family: var(--aiw-font-body);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--aiw-border);
  transition: background 0.15s ease;
}

.aiw-btn--secondary {
  background: transparent;
  color: var(--aiw-text);
}

.aiw-btn--secondary:hover {
  background: var(--aiw-muted);
}

.aiw-btn--primary {
  background: var(--aiw-primary);
  color: white;
  border-color: var(--aiw-primary);
}

.aiw-btn--primary:hover {
  background: var(--aiw-primary-hover);
}

.aiw-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Spinner --- */

.aiw-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.aiw-spinner-circle {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--aiw-border);
  border-top-color: var(--aiw-primary);
  border-radius: 50%;
  animation: aiw-spin 0.6s linear infinite;
}

@keyframes aiw-spin {
  to { transform: rotate(360deg); }
}

.aiw-loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.aiw-error {
  padding: 20px;
  color: var(--aiw-danger);
  font-size: 13px;
  text-align: center;
}

.aiw-hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
}
`;
