# Codex Context

Last reviewed from code: 2026-06-27

This file is a compact map of what the app does, how it is structured, and where the important flows live.

## What this app is

AI Validator is a Next.js app for validating business ideas with simulated AI buyers and follow-up advisor workflows.

Core promise:
- The founder describes an idea.
- The app simulates a market response with many AI personas.
- The app returns a validation report with score, intent split, objections, questions, and action steps.
- The user can save projects, revisit reports, open an advisor panel, and sync notes to Obsidian.
- The advisor panel can turn agreed conversation items into project tasks.
- Advanced idea input can include a drawn geographic area for local services, delivery, and marketplaces.

## Main user flows

1. Auth
- Email/password login
- Email/password sign up
- Google sign-in
- Logout
- Language toggle: `hr` and `en`

2. Idea validation
- User fills `IdeaForm`
- App can first ask `GET/POST /api/audiences` for suggested target audiences
- User can confirm suggested audiences or skip them
- App runs `POST /api/validate`
- Result is stored in `sessionStorage` and user is redirected to `/results`

3. Results review
- Shows the validation dashboard
- Can copy report JSON
- Can save/update project in Firestore
- Can translate the report between Croatian and English via `POST /api/translate`
- Can sync the validated report to Obsidian notes
- Can navigate to projects or advisors

4. Advisors flow
- User opens `/advisors`
- If there is no knowledge base yet, the app runs an onboarding chat via `POST /api/intake`
- Onboarding transcript seeds project knowledge via `POST /api/kb-update` with `mode: seed`
- Then the panel chat opens
- Advisor messages call `POST /api/chat`
- Triage suggestions call `POST /api/triage`
- Knowledge updates are extracted in the background via `POST /api/kb-update` with `mode: extract`
- Task requests like "stavi to u task manager" call `POST /api/tasks` and save a task on the project

5. Saved projects
- User can list saved projects on `/projects`
- User can reopen a report or advisor panel from a saved project
- User can delete a project

6. Geo-targeted validation
- In advanced idea fields, the user can draw a polygon on an OpenStreetMap/Leaflet map
- The selected area is stored as `idea.geo_area`
- Audience suggestions and validation prompts use that local market context

## Tech stack

- Next.js 16.2.9
- React 19
- TypeScript
- Tailwind CSS v4
- Firebase Auth
- Firestore
- Recharts
- Lucide React
- Leaflet + OpenStreetMap
- DeepSeek API for LLM-powered tasks
- Optional Obsidian sync via browser file system access

## Important routes

### App pages

- `/`
  - Main landing page and idea submission flow
  - Handles auth gate, audience suggestion, validation, and hero/pricing/social proof UI

- `/results`
  - Validation report dashboard
  - Save project, translate report, Obsidian sync, link to advisors

- `/advisors`
  - AI advisors panel and project knowledge workspace
  - Onboarding chat + multi-advisor chat

- `/projects`
  - Saved project list
  - Open report, open advisors, delete project

### API routes

- `POST /api/validate`
  - Validates an idea by running the engine
  - Can fetch website text from `website_url`
  - Supports `depth: standard | deep`

- `POST /api/audiences`
  - Suggests target audience segments before validation

- `POST /api/translate`
  - Translates narrative parts of a report while preserving structural data

- `POST /api/intake`
  - Drives the onboarding conversation for advisors

- `POST /api/kb-update`
  - Seeds or incrementally updates project knowledge
  - Builds a digest and section summaries

- `POST /api/chat`
  - Generates advisor responses

- `POST /api/triage`
  - Ranks which advisor should answer next

- `POST /api/pricing`
  - Runs on-demand pricing analysis

- `POST /api/interview`
  - Builds customer-discovery interview questions

- `POST /api/conversion`
  - Builds a conversion/reframe plan

- `POST /api/angles`
  - Builds marketing angles by cluster/segment

- `POST /api/conjoint`
  - Runs conjoint analysis for package trade-offs

- `POST /api/research`
  - Structured research with sources

- `POST /api/tasks`
  - Converts recent advisor conversation into one structured project task

- `POST /api/obsidian-build`
  - Converts a report into Obsidian notes

## Core product features

### Validation output

The report can include:
- Overall score
- Intent split: buy / maybe / reject
- Target audience summary
- Rejection reasons and quotes
- Top customer questions
- Action plan for product, marketing, and pricing
- Segment comparison when segment specs are provided
- Opportunity analysis
- Emergent clusters
- Pricing analysis
- Interview kit
- Conversion plan
- Marketing angles
- Conjoint analysis
- Personas and individual reactions

### Advisor workspace

The advisor system is organized around six specialist personas:
- Business
- Tech
- Marketing
- Legal
- Sales
- Distribution

Each advisor has:
- A role-specific persona prompt
- A focus area
- An owning knowledge section
- A place in the ordered panel

The panel UI supports:
- Natural chat
- Slash command to call a specific advisor
- Auto-opening with the business advisor
- Optional follow-up chips from triage suggestions
- Knowledge extraction after each useful exchange
- Right-side task manager with open/done tasks
- Conversation-to-task extraction when the user asks to put an item into the task manager

### Project knowledge base

The knowledge base is structured into:
- Product
- Technical
- Marketing
- Legal
- Business
- Sales
- Distribution

It stores:
- Section summaries
- Facts
- Gaps
- Digest
- Onboarding answers

This is the source of truth for advisor context, so future advisor answers stay focused and do not re-ask solved questions.

### Obsidian sync

The app can:
- Connect to a local Obsidian vault using browser file system access
- Build markdown notes from the current report
- Write multiple notes into the vault

If the browser does not support the File System Access API, the UI hides the sync action.

## Data storage

### Firebase Auth

Auth state is handled in `context/AuthContext.tsx`.

Stored client state:
- `user`
- `loading`
- `language`

Language is persisted in `localStorage` under:
- `aivalidator_lang`

### Firestore

Projects are stored in the `projects` collection.

Main project document shape:
- `owner_uid`
- `status`
- `idea`
- `report`
- `knowledge`
- `panel`
- `tasks`
- `chats`
- `summary`
- `created_at`
- `updated_at`

Project helpers live in:
- `lib/projects.ts`

## Important files

- [`app/page.tsx`](./app/page.tsx)
- [`app/results/page.tsx`](./app/results/page.tsx)
- [`app/advisors/page.tsx`](./app/advisors/page.tsx)
- [`app/projects/page.tsx`](./app/projects/page.tsx)
- [`context/AuthContext.tsx`](./context/AuthContext.tsx)
- [`components/IdeaForm.tsx`](./components/IdeaForm.tsx)
- [`components/AreaMapPicker.tsx`](./components/AreaMapPicker.tsx)
- [`components/AudiencePicker.tsx`](./components/AudiencePicker.tsx)
- [`components/Dashboard.tsx`](./components/Dashboard.tsx)
- [`components/OnboardingChat.tsx`](./components/OnboardingChat.tsx)
- [`components/PanelChat.tsx`](./components/PanelChat.tsx)
- [`components/ObsidianSync.tsx`](./components/ObsidianSync.tsx)
- [`lib/types.ts`](./lib/types.ts)
- [`lib/projects.ts`](./lib/projects.ts)
- [`lib/agents.ts`](./lib/agents.ts)
- [`lib/knowledge.ts`](./lib/knowledge.ts)
- [`lib/engine.ts`](./lib/engine.ts)

## Validation engine notes

- `app/api/validate/route.ts` calls `runEngine(...)`
- If `website_url` is provided, the route fetches and strips visible text from the page before validation
- The engine supports free/basic and deeper simulations via the `depth` field
- If `geo_area` is present, generated persona regions and prompts use the selected area as local context

## Advisor engine notes

- `lib/agents.ts` defines the six advisor personas and their prompts
- `lib/knowledge.ts` defines onboarding questions, section keys, and knowledge merging
- `app/api/kb-update/route.ts` extracts facts from founder input and conversation transcripts, then re-indexes the project digest
- `PanelChat.tsx` uses triage to decide which advisor should answer next
- `PanelChat.tsx` also displays project tasks and sends open tasks into advisor context
- `app/api/tasks/route.ts` turns recent chat into a structured task

## Practical reminders

- The app uses `sessionStorage` to hand off the current report/form between pages.
- A new validation run clears the saved project id in session storage.
- Results page translation preserves numerically sensitive sections by stripping them before translation and then reattaching them.
- Saved projects can be opened either as a report or directly into the advisor workspace.
- `AGENTS.md` and `CLAUDE.md` exist, but they are short and do not replace this file.

## Short summary

This app is a multilingual AI idea validator with:
- interactive validation
- segment suggestion
- saved projects
- advisor chat
- advisor task manager
- project knowledge extraction
- map-based geo targeting
- on-demand pricing/interview/conversion/marketing analysis
- Obsidian note export

If you need to understand the app quickly, start with `app/page.tsx`, `lib/types.ts`, `lib/projects.ts`, `app/results/page.tsx`, and `app/advisors/page.tsx`.
