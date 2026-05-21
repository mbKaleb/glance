# g lance

Live camera narration via Claude. Point your phone, get continuous answers in a caption strip — no taps after setup.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` on your laptop, or `http://<your-laptop-ip>:3000` on your phone (same Wi-Fi). For phone camera access you need HTTPS — use `ngrok http 3000` or deploy.

## Architecture

- `app/page.tsx` — client. Camera capture loop, UI.
- `app/api/vision/route.ts` — edge route. Forwards `{ key, image }` to the Anthropic API. The API key never goes browser → Anthropic directly; it goes browser → your server → Anthropic.
- `app/globals.css` — all styling.

## Deploy

```bash
npx vercel
```

The `/api/vision` route runs on Vercel Edge by default (`runtime = 'edge'`). Cold starts ~50ms.

## Configuration

- Model: hardcoded `claude-haiku-4-5` in `app/api/vision/route.ts`. Swap for `claude-sonnet-4-5` / `claude-opus-4-7` for sharper answers at higher cost/latency.
- Capture resolution: `768px` wide JPEG at 0.78 quality in `page.tsx`. Lower for speed, higher for fine text reading.
- Loop pause: `700ms` between cycles in `loop()`. The natural throttle is the model's response time.
- Prompt: edit `PROMPT` in the route file to change behavior (translator, OCR reader, tutor, etc.).

## Hardening ideas (not done)

- Server-side rate limiting (e.g., upstash/ratelimit per IP).
- Replace user-supplied key with `process.env.ANTHROPIC_API_KEY` for a public-facing version.
- Request counter + hard cap in the HUD.
- Ping `/v1/messages` with a tiny payload on key submit to validate before starting the loop.
- Last-frame thumbnail in the HUD so you can see exactly what got sent.
