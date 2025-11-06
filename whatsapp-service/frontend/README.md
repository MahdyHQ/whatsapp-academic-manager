`## WhatsApp Academic Manager — Frontend (Next.js on Vercel)

This is the Next.js frontend for WhatsApp Academic Manager. It’s optimized for deployment on Vercel with sensible defaults and environment-based API targets.

### Requirements

- Node.js 22.x or 24.x locally (this repo ships an `.nvmrc` with `24`)
- Next.js 16, React 19
- Tailwind CSS v4

### Environment variables

Set these in Vercel → Project Settings → Environment Variables:

- `NEXT_PUBLIC_API_URL` — WhatsApp service base URL (e.g., your Railway service)
- `NEXT_PUBLIC_BACKEND_URL` — Python backend base URL (if used)
- Optional: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`

You can also set them locally in `.env.local` (already created). Do not commit secrets.

### Scripts

```bash
npm run dev    # local development
npm run build  # production build
npm start      # start production server (SSR)
```

### Vercel specifics

- Build output is handled by Next on Vercel; no need to change outputDirectory.
- Runtime pinned to Node.js 22.x for Functions via `vercel.json`.
- ESLint won’t fail the build on Vercel (configured in `next.config.ts`).

### API targets (frontend -> services)

All API calls read from env:

- WhatsApp service: `process.env.NEXT_PUBLIC_API_URL`
- Python backend: `process.env.NEXT_PUBLIC_BACKEND_URL`

See `src/lib/api/api.ts` for details.

If you prefer to avoid CORS and proxy through Next.js, you can enable the commented `rewrites()` in `next.config.ts` and switch the frontend to call relative `/api/...` paths.

### Local development

1. Configure `.env.local` with your remote services or local URLs
2. `npm install`
3. `npm run dev` and open http://localhost:3000

### Troubleshooting

- Build errors due to ESLint: build won’t fail, but you should still fix lint issues locally.
- API 4xx/5xx: verify the service URLs and that the upstream services are reachable from Vercel (use the “Health” endpoints in each service).
