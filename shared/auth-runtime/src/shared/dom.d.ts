// Ambient type declarations for the FedCM Web API
// https://fedidcg.github.io/FedCM/

interface IdentityProviderConfig {
  configURL: string;
  clientId: string;
  nonce?: string;
}

interface IdentityCredentialRequestOptions {
  identity: {
    providers: IdentityProviderConfig[];
    context?: "signin" | "signup" | "use" | "continue";
  };
}

interface IdentityCredential extends Credential {
  token: string;
  isAutoSelected?: boolean;
}

interface CredentialRequestOptions {
  identity?: IdentityCredentialRequestOptions["identity"];
  mediation?: CredentialMediationRequirement;
}
