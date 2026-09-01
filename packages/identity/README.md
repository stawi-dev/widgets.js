# @stawi/identity

An embeddable admin widget for the Antinvestor platform identity service
(`https://api.stawi.org/identity`) — organisations, org units, workforce
members, internal teams and role assignments.

> Status: `0.0.1`. This release ships the framework-free data layer only;
> the React screens land in a follow-up.

## Install

```bash
pnpm add @stawi/identity @stawi/auth-runtime
```

## Usage

```ts
import { createIdentityClient } from "@stawi/identity";
import { createAuthRuntime } from "@stawi/auth-runtime";

const runtime = createAuthRuntime({
  /* … */ allowedApiOrigins: ["https://api.stawi.org"],
});

const identity = createIdentityClient({
  runtime,
  apiBaseUrl: "https://api.stawi.org/identity",
});

const teams = await identity.internalTeamSearch({
  organizationId: "org_123",
  cursor: { limit: 50 },
});
```

The client speaks the Connect protocol over `runtime.fetch`, so requests
carry the signed-in user's token. Unary RPCs unwrap `{ data }`; the
`*Search` RPCs are server-streaming and are decoded from the raw envelope
bytes by `decodeConnectStream` and flattened into a single array. A
Connect stream trailer carrying an error is thrown as an `IdentityError`
with its `code`.
