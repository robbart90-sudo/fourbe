# Fourbe

A daily puzzle game. Four clues. Five answers.

## Local Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## Editor

Navigate to `/editor?key=fourbe2026` to create and manage puzzles. Puzzles are stored in localStorage.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_ANTHROPIC_API_KEY` | No | Anthropic API key for the editor's "Generate with AI" accept list feature. The game works without it. |

Create a `.env` file in the project root:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Note: AI generation only works in local development (the Vite proxy is not available in production builds).

## Deploy

1. Push to GitHub
2. Connect the repository to [Vercel](https://vercel.com)
3. Vercel auto-detects Vite — no additional configuration needed
4. SPA routing is handled by `vercel.json`
