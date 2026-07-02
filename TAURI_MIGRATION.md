# Tauri Migration Contract

This app is being prepared for a Tauri desktop build. The React UI must not call
Next API routes directly. All AI/backend work goes through `lib/ai-client.ts`.

## Desktop Scaffold Status

Tauri v2 scaffold now lives in:

```txt
src-tauri/
```

Useful scripts:

```txt
npm run desktop:dev
npm run desktop:build
npm run build:desktop
```

Verified desktop build outputs:

```txt
src-tauri/target/release/bundle/msi/AI Validator_0.1.0_x64_en-US.msi
src-tauri/target/release/bundle/nsis/AI Validator_0.1.0_x64-setup.exe
```

Rust is required for desktop builds. On this machine it was installed through
Rustup/winget. If a shell cannot find `cargo`, open a new terminal or prepend:

```txt
%USERPROFILE%\.cargo\bin
```

## Current Web Transport

`lib/ai-client.ts` currently falls back to:

```txt
POST /api/:endpoint
```

This keeps the existing Next development flow working.

## Future Tauri Transport

When the app runs inside Tauri, `lib/ai-client.ts` detects:

```ts
window.__TAURI__.core.invoke
```

and calls a Tauri command with:

```ts
invoke(commandName, { payload })
```

## Required Tauri Commands

The Rust side must implement these AI command names and return the same JSON shapes
as the current Next routes:

```txt
ai_angles
ai_audiences
ai_chat
ai_conversion
ai_conjoint
ai_idea_brief
ai_intake
ai_interview
ai_kb_update
ai_obsidian_build
ai_pricing
ai_research
ai_strategy
ai_tasks
ai_translate
ai_triage
ai_validate
```

The shared TypeScript handler registry is in:

```txt
lib/server/actions.ts
```

It maps every `ai_*` command name above to the corresponding extracted
`lib/server/*` function. A Tauri bridge can mirror this table on the Rust side,
or call into the same JavaScript runtime if the desktop architecture keeps a
Node/sidecar layer.

## Required Project Storage Commands

`lib/projects.ts` uses IndexedDB in the web build. In Tauri it detects
`window.__TAURI__.core.invoke` and calls these commands instead:

```txt
project_create
project_update
project_get
project_list
project_update_knowledge
project_update_panel
project_update_tasks
project_delete
project_import
project_restore_workspace
project_erase_all
```

These project commands are implemented in `src-tauri/src/lib.rs` and write a
local JSON workspace here:

```txt
Documents/AI Validator/workspace.ai-workspace
```

Recommended desktop storage target:

```txt
Documents/AI Validator/workspace.sqlite
```

or, for a simpler first pass:

```txt
Documents/AI Validator/workspace.ai-workspace
```

The command payloads mirror the TypeScript functions in `lib/projects.ts`.
For example:

```ts
project_create({ ownerUid, input })
project_update_knowledge({ projectId, knowledge })
project_restore_workspace({ text })
```

## Next Step

The shared business logic has been moved from `app/api/*/route.ts` into plain
modules under `lib/server/*`. Both transports can now target the same logical
action surface:

```txt
Next route -> lib/server function
Tauri command -> same lib/server function or Rust equivalent
```

Started extractions:

```txt
app/api/validate/route.ts   -> lib/server/validate.ts
app/api/audiences/route.ts  -> lib/server/audiences.ts
app/api/kb-update/route.ts  -> lib/server/knowledge-update.ts
app/api/chat/route.ts       -> lib/server/chat.ts
app/api/tasks/route.ts      -> lib/server/tasks.ts
app/api/triage/route.ts     -> lib/server/triage.ts
app/api/angles/route.ts     -> lib/server/angles.ts
app/api/obsidian-build/route.ts -> lib/server/obsidian-build.ts
app/api/research/route.ts   -> lib/server/research.ts
app/api/interview/route.ts  -> lib/server/interview.ts
app/api/translate/route.ts  -> lib/server/translate.ts
app/api/strategy/route.ts   -> lib/server/strategy.ts
app/api/conversion/route.ts -> lib/server/conversion.ts
app/api/intake/route.ts     -> lib/server/intake.ts
app/api/idea-brief/route.ts -> lib/server/idea-brief.ts
app/api/pricing/route.ts    -> lib/server/pricing.ts
app/api/conjoint/route.ts   -> lib/server/conjoint.ts
```

For a pure Tauri static export, the `app/api/*` routes cannot be the runtime
backend. They are only useful for web/dev until commands replace them.

Current AI execution path: `ai_*` commands exist in the Rust Tauri bridge and
POST to the hosted desktop endpoint:

```txt
POST /api/desktop/ai
{ "command": "ai_validate", "payload": { ... } }
```

The endpoint executes `lib/server/actions.ts` and returns the same JSON shapes
as the old per-route API calls. Desktop project data still stays local on disk.
Before executing an AI action, the endpoint checks a server-side simulated token
ledger keyed by the desktop install/account id. It charges tokens only after the
AI action succeeds. `lib/server/desktop-billing.ts` now supports two ledger
modes:

```txt
Production: Upstash Redis REST, if these env vars exist:
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN

Local fallback: in-memory simulation, useful only for local testing.
```

The ledger stores one account row per desktop install id and keeps recent token
transactions per account (`starter_grant`, `top_up`, `charge`). Real payment
integration can later call the same top-up logic after Stripe confirms payment.

Desktop wallet endpoint:

```txt
POST /api/desktop/wallet
{ "action": "balance" }
{ "action": "top_up", "euros": 10 }
```

The desktop app sends:

```txt
x-ai-validator-account-id: <desktop install id>
Authorization: Bearer <AI_VALIDATOR_DESKTOP_API_KEY>   # only if configured
```

On the hosted server, set this to require desktop authorization:

```txt
DESKTOP_AI_SHARED_SECRET=<same secret>
```

## What The Owner Must Configure

1. Create an Upstash Redis database.
2. Copy its REST URL/token into hosted env vars:

```txt
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

3. Generate a strong shared secret and set it on the hosted backend:

```txt
DESKTOP_AI_SHARED_SECRET=...
```

4. Build/run desktop with matching values:

```txt
AI_VALIDATOR_DESKTOP_API_URL=https://your-domain.com/api/desktop/ai
AI_VALIDATOR_DESKTOP_WALLET_URL=https://your-domain.com/api/desktop/wallet
AI_VALIDATOR_DESKTOP_API_KEY=<same secret>
```

In development, the Rust bridge defaults to:

```txt
http://localhost:3000/api/desktop/ai
```

For production desktop builds, set this runtime environment variable to your
hosted domain endpoint:

```txt
AI_VALIDATOR_DESKTOP_API_URL=https://your-domain.com/api/desktop/ai
AI_VALIDATOR_DESKTOP_WALLET_URL=https://your-domain.com/api/desktop/wallet
AI_VALIDATOR_DESKTOP_API_KEY=<shared secret, if DESKTOP_AI_SHARED_SECRET is set>
```
