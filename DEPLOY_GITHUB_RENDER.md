# 🚀 Deploy PipTrack to GitHub + Render (free, 24/7)

This is the recommended setup: **GitHub stores your code** (versioned history, easy changes),
**Render hosts the app online 24/7** (free tier), and **PostgreSQL keeps your data safe**
across redeploys. After this, every change is just `git push` → Render auto-deploys.

---

## Part 1 — Push the code to GitHub (one time)

### 1. Create an account (if you don't have one)
- GitHub: https://github.com → Sign up → free.

### 2. Create an empty repository
- Click **+** (top right) → **New repository**
- Name: `piptrack`
- **Do NOT** tick "Add a README" or ".gitignore" (we already have them)
- Click **Create repository**

### 3. Upload the code (easiest: GitHub Desktop)
- Download GitHub Desktop: https://desktop.github.com
- File → **Add local repository** → choose the `pip-track` folder on your computer
- It will ask to "Publish repository" → click it → pick `piptrack` on GitHub → Publish
- ✅ Done — your code is on GitHub.

> Prefer the command line? In the `pip-track` folder:
> ```
> git remote add origin https://github.com/YOUR_USERNAME/piptrack.git
> git branch -M main
> git push -u origin main
> ```

---

## Part 2 — Deploy on Render (one time, ~10 minutes)

### 1. Create an account
- https://render.com → Sign up (free, no card needed).

### 2. Deploy from the blueprint
- Click **New +** → **Blueprint**
- **Connect a repository** → authorize GitHub → select `piptrack`
- Render reads `render.yaml` and offers: the web service + a free PostgreSQL database.
- Click **Apply** → watch the logs. First build takes ~3-5 minutes.
- When it's live you get a URL like: **https://piptrack.onrender.com** 🔥

### 3. Add your secrets (Gemini key + Telegram)
- In the Render dashboard open your **piptrack** web service → **Environment** tab
- Add these variables (leave values empty if you don't use them yet):
  - `GEMINI_API_KEY` → your Google AI Studio key
  - `TELEGRAM_TOKEN` → your bot token (optional)
  - `TELEGRAM_CHAT_ID` → your chat id (optional)
- **Save Changes** → the service redeploys automatically.
- `DATABASE_URL` is already set automatically by the blueprint (do not touch it).

### 4. Open your app 🎉
- Visit **https://piptrack.onrender.com** — the full app, online 24/7.
- The live monitor + Telegram alerts now run even when your phone and PC are off.

---

## Part 3 — Making changes in the future (the workflow)

This is the whole point of GitHub + Render — changes are easy and reversible.

### Option A — Edit on GitHub (no software, for small changes)
1. On github.com/yourname/piptrack → open any file → ✏️ pencil icon → edit → **Commit changes**
2. Render auto-deploys within ~1-2 minutes.

### Option B — Edit locally (for bigger changes, e.g. with my help)
1. Open the `pip-track` folder on your PC, edit files (or ask me to make the changes
   and download the updated files).
2. GitHub Desktop → you'll see the changes → write a short message → **Commit to main** → **Push origin**
3. Render auto-deploys. Done.

### Rollback if something breaks
- Render dashboard → your service → **Events** tab → find the last working deploy → **Rollback**.

---

## Pricing & limits (be honest with yourself)

| Thing | Free tier | Note |
|---|---|---|
| GitHub repo | Unlimited, free | — |
| Render web service | Free | ⚠️ **Sleeps after 15 min without visitors**; wakes on next visit (~30-60s delay). The live monitor pauses while asleep. |
| Render PostgreSQL | Free (256 MB) | ⚠️ **Free database expires after 30 days** unless upgraded. After expiry, data is read-only until you upgrade (~$7/mo) or migrate. |
| Always-on + persistent DB | ~$7/mo each | Upgrade any time in the dashboard — no code changes needed. |

**Cheapest always-on setup:** one `starter` web service ($7/mo) + keep free DB (but upgrade
it before day 30). Or run locally for free and use Render only when you want.

---

## ❓ Troubleshooting

| Problem | Fix |
|---|---|
| Build fails | Open the Render service **Logs** tab → the real error is there. Paste it to me and I'll fix it. |
| App opens but no data / "trades missing" | Check `DATABASE_URL` env is set (it's auto-set). If you see `piptrack.db` errors, the service wasn't linked to the DB — re-apply the blueprint. |
| Gemini 429 errors | Free-tier quota. Add billing in Google AI Studio, or wait for the daily reset. |
| Prices show "—" | Yahoo Finance occasionally rate-limits. The monitor retries automatically. |
| `?` vs `%s` SQL errors | Shouldn't happen (storage auto-translates), but if you see any, tell me — it's a bug I'll fix. |
| Old data on Render vs local | They're **separate databases**. Export/import via **Settings → Export backup (JSON)** to move data between them. |

---

## Local development still works
Running locally (`python server.py`) still uses **SQLite** — no Postgres needed. The app
picks PostgreSQL automatically only when `DATABASE_URL` is set (i.e. on Render).

*PipTrack — educational tool, not financial advice.*
