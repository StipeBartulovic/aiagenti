# AI Validator

AI Validator is a local-first idea validation app. It simulates buyer reactions,
creates a business report, supports AI advisor chats, and lets users export their
projects as local files.

For setup instructions, read:

```txt
SETUP.md
```

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```txt
http://localhost:3000
```

The app needs API keys before AI features work. See `SETUP.md` for where to get
DeepSeek, Tavily, Upstash, and desktop bridge values.

## Useful Scripts

```bash
npm run dev
npm run build
npm run desktop:dev
npm run desktop:build
```

## Health Check

After deploying, open:

```txt
/api/health
```

It returns whether required environment variables are configured, without
printing secret values.
