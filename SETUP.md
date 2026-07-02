# AI Validator Setup Guide

This guide explains how to run AI Validator locally, deploy it to Vercel, and
understand what each external service does.

You do not need to install DeepSeek, Tavily, or Upstash on your PC. They are
online services. You create accounts, copy API keys, and paste those keys into
environment variables.

## What The App Uses

| Service | What it does | Required? |
| --- | --- | --- |
| DeepSeek | Runs the AI analysis, advisors, summaries, and reports. | Yes |
| Tavily | Gives the app web research/search for market research tools. | Optional, but research features need it |
| GitHub API | Lets the CTO advisor search open-source repositories for build-vs-buy checks. | Optional |
| Upstash Redis | Stores desktop token balances for the hosted desktop bridge. | Needed for production desktop billing simulation |
| Vercel | Hosts the web app and API routes. | Needed for public web deployment |
| Tauri | Packages the web app into a Windows/Mac desktop app. | Needed only for desktop builds |

## 1. Install Project Dependencies

Install Node.js 20 or newer, then run:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

On Windows PowerShell, if `cp` does not work:

```powershell
Copy-Item .env.example .env.local
```

## 2. Get The DeepSeek API Key

DeepSeek is the AI provider. Without it, the app can open, but AI generation will
not work.

1. Open `https://platform.deepseek.com`.
2. Create an account or sign in.
3. Find the API keys section.
4. Create/copy an API key.
5. Put it in `.env.local`:

```txt
DEEPSEEK_API_KEY=your_deepseek_key_here
```

Do not put quotes around the value in Vercel.

## 3. Get The Tavily API Key

Tavily is not something you install on the PC. It is a web search API for AI
apps. AI Validator uses it when a tool needs market research from the web.

1. Open `https://app.tavily.com`.
2. Create an account or sign in.
3. Copy your API key.
4. Put it in `.env.local`:

```txt
TAVILY_API_KEY=your_tavily_key_here
```

If Tavily is missing, normal validation can still work, but research/search
features will show a configuration error.

## 4. Optional: Add A GitHub Token

The CTO advisor can search public GitHub repositories even without a token. A
token only helps avoid GitHub rate limits when you test a lot.

1. Open `https://github.com/settings/tokens`.
2. Create a fine-grained or classic token with public repository read access.
3. Put it in `.env.local`:

```txt
GITHUB_TOKEN=your_github_token_here
```

This powers questions like:

```txt
Can I build this from an existing open-source project?
Find GitHub repos for appointment booking SaaS.
```

## 5. Get Upstash Redis Values

Upstash stores the desktop token wallet ledger when the desktop app talks to the
hosted backend. For the web-only version, this is less important. For desktop
token simulation in production, set it up.

1. Open `https://console.upstash.com`.
2. Create a Redis database.
3. Open the database details.
4. Copy the REST URL and REST token.
5. Put them in `.env.local`:

```txt
UPSTASH_REDIS_REST_URL=https://your-upstash-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token_here
```

In Vercel, paste values without quotes.

## 6. Create The Desktop Shared Secret

This is a private password between the desktop app and your hosted API. It does
not come from another service.

Generate any long random string. Example:

```txt
DESKTOP_AI_SHARED_SECRET=make_this_a_long_random_secret
AI_VALIDATOR_DESKTOP_API_KEY=make_this_a_long_random_secret
```

Use the same value for both:

- `DESKTOP_AI_SHARED_SECRET` on the hosted/Vercel backend
- `AI_VALIDATOR_DESKTOP_API_KEY` in the desktop build environment

## 7. Run Locally

Start the web app:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

Check configuration:

```txt
http://localhost:3000/api/health
```

Good result:

```json
{
  "ok": true,
  "checks": {
    "deepseek": true,
    "tavily": true,
    "githubToken": false,
    "upstashUrl": true,
    "upstashToken": true,
    "desktopSharedSecret": true
  }
}
```

`ok` mainly means DeepSeek is configured, because that is the core AI engine.
`githubToken` can be false; GitHub search still works with lower public limits.

## 8. Deploy To Vercel

1. Push the project to GitHub.
2. Import the GitHub repo in Vercel.
3. In Vercel, open Project Settings -> Environment Variables.
4. Add these values:

```txt
DEEPSEEK_API_KEY
TAVILY_API_KEY
GITHUB_TOKEN
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
DESKTOP_AI_SHARED_SECRET
```

Important: in the Vercel UI, do not wrap values in quotes.

After adding or changing environment variables, redeploy the project.

Then open:

```txt
https://your-vercel-domain.vercel.app/api/health
```

## 9. How Agent Tools Work

Advisor tools are the app's function-calling layer.

The flow is:

1. User asks a question in the advisor panel.
2. The advisor decides whether live data is needed.
3. The app asks the AI for a small JSON tool plan.
4. The app executes the selected tool.
5. Tool results go back to the AI.
6. The final answer cites sources and explains what was found.

Current tools:

```txt
web_search          -> Tavily live web research
github_repo_search  -> GitHub repository search for the CTO
```

Examples:

```txt
Ivana, provjeri ima li rizika oko imena NaturaFresh.
Lana, istrazi konkurenciju i SEO potraznju za ovu ideju.
Marko, nadi open-source projekt koji mogu forkati umjesto da gradim od nule.
```

Future tools can be added for trademark APIs, SEO volume APIs, Product Hunt,
Crunchbase, domain checks, or finance calculations. The current setup keeps the
same architecture but starts with affordable, practical integrations.

## 10. How Local-First Storage Works

The app is designed so project data stays on the user's device.

In the web version:

- projects are saved in the browser's local database
- one project can be exported as `.ai-project`
- the whole workspace can be exported as `.ai-workspace`
- if the user clears browser storage, local projects can be lost unless they made a backup

In the Tauri desktop version:

- projects are saved to a local workspace file on disk
- the default workspace path is documented in `TAURI_MIGRATION.md`
- users can keep their business plans on their own SSD

## 11. Desktop Build

Desktop builds require Rust and Tauri.

Useful commands:

```bash
npm run desktop:dev
npm run desktop:build
```

For more details, read:

```txt
TAURI_MIGRATION.md
```

## 12. Common Problems

### "AI engine is not configured"

`DEEPSEEK_API_KEY` is missing or not loaded. Add it to `.env.local` locally, or
to Vercel Environment Variables in production. Restart/redeploy after changing it.

### "Research search is not configured"

`TAVILY_API_KEY` is missing. Add it only if you want web research features.

### "GitHub repository search is rate limited"

Public GitHub search is being rate limited. Add `GITHUB_TOKEN` or try again
later.

### "AI provider rejected the API key"

The key is probably wrong, expired, copied with extra spaces, or pasted with
quotes in Vercel.

### "Not enough tokens"

This app currently uses simulated pay-as-you-go tokens. Click `Add 10€` in the
wallet to instantly add test tokens. No real payment process is connected yet.

### Vercel changed env values but app still fails

Redeploy after changing environment variables.

## 13. Secret Safety

Never commit `.env.local`.

These values are secrets:

```txt
DEEPSEEK_API_KEY
TAVILY_API_KEY
GITHUB_TOKEN
UPSTASH_REDIS_REST_TOKEN
DESKTOP_AI_SHARED_SECRET
AI_VALIDATOR_DESKTOP_API_KEY
```

The repository includes `.env.example` only as a template.
