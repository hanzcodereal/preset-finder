# hanzPresetFinder

Deploy ke Vercel: `vercel --prod` (atau import repo). Tanpa build step, tanpa dependency.

- `public/index.html` frontend
- `api/find.js` scraper (GET /api/find?url=<link tiktok>)

## Anti-bot (invisible)

- `middleware.js` di root: blok UA scraper (403) + cookie JS invisible, tanpa widget.
- Env Vercel (Settings → Environment Variables):
  - `GUARD_SECRET` = string acak panjang (WAJIB diganti)
  - `BOT_KEY` = (opsional) kirim header `x-am-key: <nilai>` kalau bot kamu mau akses `/api/find`
