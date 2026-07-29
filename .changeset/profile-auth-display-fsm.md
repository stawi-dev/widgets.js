---
"@stawi/profile": patch
---

Render profile chrome via an explicit auth display FSM so reload no longer flashes Sign-in → avatar.

- `initializing` → render nothing (session still unknown)
- `authenticated` / `refreshing` → profile popover (session present)
- `unauthenticated` / `error` → login button only

Removes the intermediate loading pulse that previously occupied the trigger slot during session restore.
