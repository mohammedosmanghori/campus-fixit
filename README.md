# CampusFix 🛠️

CampusFix is a mobile-first web app for college students to report broken or
non-working facilities on campus — in seconds.

## Features

- **Report in seconds** — snap a live photo (or record a video), the AI
  identifies the problem from the picture and fills in the title, description
  and category automatically.
- **Live location required** — every report is pinned with real GPS
  coordinates plus a human-readable spot (e.g. "Library, 3rd floor").
- **One Issue = One Ticket** — before submitting, the app checks whether the
  same problem (same category, nearby location) already exists. If so, you can
  **join/upvote** the existing report instead of creating a duplicate.
- **Photo & video evidence** — real-time camera capture with proper permission
  prompts, or pick from the gallery.
- **Admin dashboard** — staff see all reports, change status
  (Pending / In Progress / Fixed) and students get notified in-app when their
  issue is updated.
- **Leaderboard** — monthly Top Reporters ranking.
- **Open sign-up** — any valid email address works.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19, Vite 7, SSR)
- Tailwind CSS v4, shadcn/ui, framer-motion
- Supabase (Postgres + RLS, storage, realtime, auth)
- Lovable AI Gateway (Gemini Vision for photo analysis)
- Deploys to Cloudflare Workers (edge)

## Getting started

```bash
bun install
bun run dev
```

Environment variables (Vite frontend) are read from `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
