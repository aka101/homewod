# HomeWOD — AI Workout Generator

AI-generated CrossFit-style home gym workouts powered by Claude.

## Project Structure

```
homewod/
├── index.html          # App UI
├── css/style.css       # All styles
├── js/app.js           # Frontend logic
├── api/generate.js     # Vercel serverless function (Anthropic API call)
├── .env.example        # Environment variable template
├── .gitignore
├── vercel.json         # Vercel configuration
└── README.md
```

## How It Works

The frontend collects workout parameters (equipment, time, level, focus, format) and POSTs them to `/api/generate`. The serverless function builds the prompt, calls the Anthropic API using the server-side API key, and returns the generated WOD as JSON. No API key is ever exposed to the browser.

## Local Development

Vercel CLI is the easiest way to run this locally with the serverless function:

```bash
npm install -g vercel
cd homewod
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
vercel dev
```

Then open `http://localhost:3000`.

## Deploy to Vercel

### Option 1 — Vercel CLI

```bash
vercel
```

Set your environment variables when prompted, or add them in the Vercel dashboard under **Project → Settings → Environment Variables**.

### Option 2 — GitHub Integration

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. Add `ANTHROPIC_API_KEY` under **Environment Variables**
4. Deploy

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (for future payments) |
| `STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key (for future payments) |
| `STRIPE_PRICE_ID` | No | Stripe price ID (for future payments) |

## Requirements

- Node.js 18+ (for native `fetch` support in the serverless function)
- Anthropic API key
