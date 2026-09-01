/** OIDC scopes the identity widget requests when it creates its own runtime. */
export const identityAuthScopes = [
  "openid",
  "profile",
  "offline_access",
] as const;
