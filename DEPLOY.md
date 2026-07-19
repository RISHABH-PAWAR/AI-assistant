# Deployment Guide

Two pieces deploy separately:

- **Backend API** (`server/`) → **Render** (a long-running Node web service).
- **Frontend** (`web/`) → **Vercel** (a static Vite build on their CDN).

You connect each service to this GitHub repo once; both auto-redeploy on `git push`.
No credentials are shared with anyone — you set secrets directly in each dashboard.

> Do the backend first (you need its URL for the frontend), then the frontend,
> then update one backend variable with the frontend URL.

---

## 1. Backend → Render

1. Push this repo to GitHub (already done).
2. Go to **render.com → New → Blueprint** and pick this repository.
   Render reads [`render.yaml`](render.yaml) and proposes the `lakeside-dental-api` service.
3. Before the first deploy, set the secret env vars (Render will prompt for the
   `sync: false` ones):
   - `OPENAI_API_KEY` = your key (required)
   - `GROQ_API_KEY` = your Groq key (optional fallback)
   - `WEB_ORIGIN` = leave a placeholder for now (e.g. `http://localhost:5173`); you'll
     update it in step 3.
4. Click **Apply / Deploy**. Render runs `npm install && npm run build` then `npm start`.
   Health checks hit `/health`.
5. Copy the service URL, e.g. `https://lakeside-dental-api.onrender.com`.

> Free tier note: Render spins the service down when idle, so the first request after
> a pause takes ~30–60s to wake. Fine for a demo.

---

## 2. Frontend → Vercel

1. Go to **vercel.com → Add New → Project** and import this repository.
2. Set **Root Directory = `web`** (important — it's a monorepo). Vercel detects Vite and
   uses [`web/vercel.json`](web/vercel.json).
3. Add an environment variable (Production):
   - `VITE_API_BASE` = your Render URL from step 1.5
     (e.g. `https://lakeside-dental-api.onrender.com`)
4. **Deploy.** Copy the resulting URL, e.g. `https://your-app.vercel.app`.

> `VITE_API_BASE` is read at **build time**. If you change it later, trigger a redeploy.

---

## 3. Close the loop (CORS)

The backend only accepts requests from `WEB_ORIGIN`. Set it to the real frontend URL:

1. Render → your service → **Environment** → set
   `WEB_ORIGIN = https://your-app.vercel.app` (no trailing slash).
2. Save — Render redeploys automatically.

Now open the Vercel URL and chat. Done.

---

## Environment variables recap

| Where | Variable | Value |
|---|---|---|
| Render | `OPENAI_API_KEY` | your OpenAI key (secret) |
| Render | `GROQ_API_KEY` | your Groq key (optional) |
| Render | `WEB_ORIGIN` | the Vercel frontend URL |
| Render | `SEED_MODE` | `default` \| `open` \| `empty` |
| Vercel | `VITE_API_BASE` | the Render backend URL |

All other variables have safe defaults (see [.env.example](.env.example)). The backend
listens on the `PORT` Render injects; no change needed.

---

## Verifying a deploy

```bash
curl https://lakeside-dental-api.onrender.com/health   # {"ok":true,...}
curl https://lakeside-dental-api.onrender.com/ready    # {"ready":true}
```
Then load the Vercel URL and run a booking. Backend logs (Render dashboard → Logs) show
structured per-request lines with the provider used and tool trace.

---

## Alternative: let me deploy from here via CLI (Path B)

If you'd rather I run the deploys, generate scoped tokens and I'll use the CLIs:

- **Vercel:** vercel.com/account/tokens → create token → `vercel --token <TOKEN> deploy --prod`
- **Render:** dashboard → Account Settings → API Keys → create key → deploy via the Render API.

Security caveat: pasting tokens into chat exposes them (as with any secret). Prefer the
dashboard flow above, and rotate any token you share.
