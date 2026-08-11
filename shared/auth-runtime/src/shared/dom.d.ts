// Ambient types for FedCM 2026. Spec: https://fedidcg.github.io/FedCM/
interface IdentityProviderConfig {
  configURL: string;
  clientId: string;
  nonce?: string;
  fields?: string[];
  loginHint?: string;
  domainHint?: string;
  params?: Record<string, string>;
}

interface IdentityCredentialRequestOptions {
  identity: {
    providers: IdentityProviderConfig[];
    context?: "signin" | "signup" | "use" | "continue";
    mode?: "passive" | "active";
  };
}

interface IdentityCredential extends Credential {
  readonly token: string;
  readonly isAutoSelected?: boolean;
  readonly configURL?: string;
}

interface IdentityCredentialError extends Error {
  readonly code?: string;
  readonly url?: string;
}

interface IdentityCredentialErrorConstructor {
  new (
    message?: string,
    options?: { code?: string; url?: string },
  ): IdentityCredentialError;
  readonly prototype: IdentityCredentialError;
}
declare const IdentityCredentialError:
  IdentityCredentialErrorConstructor | undefined;

interface IdentityCredentialDisconnectOptions {
  configURL: string;
  clientId: string;
  accountHint?: string;
}
interface IdentityCredentialConstructor {
  disconnect?(options: IdentityCredentialDisconnectOptions): Promise<void>;
}

interface CredentialRequestOptions {
  identity?: IdentityCredentialRequestOptions["identity"];
  mediation?: CredentialMediationRequirement;
  signal?: AbortSignal;
}

interface CredentialsContainer {
  preventSilentAccess?(): Promise<void>;
}
