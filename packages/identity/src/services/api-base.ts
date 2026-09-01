/**
 * Sibling-service base URLs.
 *
 * Identity, profile and tenancy sit side by side behind one gateway, so a
 * host that configured `https://api.stawi.org/identity` should not have to
 * repeat itself for the other two: the last path segment is swapped.
 */

/** `https://api.stawi.org/identity` → `https://api.stawi.org/profile`. */
export function deriveProfileApiBaseUrl(apiBaseUrl: string): string {
  try {
    const url = new URL(apiBaseUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    segments.pop();
    segments.push("profile");
    url.pathname = `/${segments.join("/")}`;
    return url.toString().replace(/\/+$/, "");
  } catch {
    // A URL we cannot parse is returned unchanged rather than mangled.
    return apiBaseUrl;
  }
}

/**
 * `https://api.stawi.org/identity` → `https://api.stawi.org/tenancy`, and a
 * URL with no path gets one appended. Unlike the profile derivation this one
 * is string-based, so it also handles the relative bases hosts use when the
 * gateway is same-origin (`/identity` → `/tenancy`).
 */
export function deriveTenancyApiBaseUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.replace(/\/+$/, "");
  // Split off scheme + authority so the `//` in `https://` is never
  // mistaken for a path separator.
  const match = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)?(.*)$/i.exec(trimmed);
  const origin = match?.[1] ?? "";
  const path = (match?.[2] ?? "").replace(/\/[^/]*$/, "");
  return `${origin}${path}/tenancy`;
}
