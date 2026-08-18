# PipTrack — Forex Trading Journal

A self-hosted trading progress tracker built for forex traders. Log your trades, watch your
equity curve grow, and find your edge with full analytics — all on your own machine.

## Features

- **Dashboard** — account balance & return, net P&L, win rate, profit factor, expectancy,
  max drawdown, avg win/loss, streaks, best/worst trade, discipline rating, monthly progress
- **Equity curve** — balance-based cumulative P&L chart with hover tooltips
- **Trade log** — log every trade (pair, direction, lots, entry/exit, SL/TP, pips, P&L,
  fees, R-multiple, strategy, setup, session, self-rating, notes) with search & filters
- **Smart P&L calculator** — pips and USD P&L auto-computed from prices and lot size for
  FX majors/minors, gold (XAU/USD) and silver (XAG/USD); manual entry for everything else
- **Analytics** — performance by pair, strategy, session, day of week and hour of day;
  P&L distribution histogram; win rate by month; monthly breakdown table
- **Goals** — monthly P&L, trade count, win rate and discipline targets with progress bars
- **Journal** — dated notes for trade plans, psychology and lessons
- **Strategy Coach** — enter your strategy **once** (pairs, sessions, direction bias, min
  win rate, risk budget, strictness). After that it's just: **drop a chart screenshot →
  instant TAKE / WAIT / NO TRADE verdict** — nothing else to fill in. It reads candles
  straight from the pixels (trend, momentum, price position — green/red, blue/red or
  white/black themes, auto-detected), weighs your own rules plus your **personal edge from
  the journal** (win rate & avg R per pair), and **tracks every analysis automatically**:
  pending signals appear in a decisions list, mark them Won/Lost/Skipped with one click or
  hit "Log as trade" to pre-fill your journal — the outcome then updates itself from the
  trade's actual P&L, and the coach's accuracy score keeps itself honest.
- **Strategy Brain** — teach your strategy in your own words **or with a YouTube video**
  (the transcript is read automatically). Gemini turns it into structured, backtestable
  rules: entry conditions, filters, exits, direction, timeframe. Then **backtest it** on up
  to 2 years of real historical candles (Yahoo Finance) with an honest verdict — trades,
  win rate, profit factor, expectancy, drawdown and an equity curve — so you know whether
  to keep trading it. The learned Brain is used by the Coach (screenshot verdicts get
  "Your strategy: direction / setup" checks) and the Live monitor.
- **Live Monitor (Gemini AI)** — real-time price action with **enter/exit notifications**:
  the app pulls live hourly candles (Yahoo Finance, free), computes RSI/SMA/trend, sends the
  picture to the **Gemini API** along with your strategy profile and learned Brain, and
  pushes you alerts: 📈 **ENTER** when a setup fires, 🛑 **STOP LOSS HIT / TP REACHED** and
  🔄 **AI says close** for positions you've marked as still open. Alerts arrive as in-app
  toasts + sound + a bell badge while the page is open — and can be forwarded to
  **Telegram** (Settings → 📲 Telegram alerts) so you get enter/exit pings on your phone
  even when the app is closed.
- **Data tools** — JSON backup / restore, CSV export for Excel, demo data, erase all

> ⚠️ The Coach and Live Monitor are educational tools, not financial advice. The chart
> reader is a pixel-level heuristic and the AI is a language model — always confirm setups
> on your platform. Chart screenshots are processed locally; only your monitored pairs'
> prices and strategy profile are sent to Google's Gemini API.

## Live Monitor setup (one time)

1. **Settings → 🤖 Gemini AI & notifications** → paste your Gemini API key (get one free at
   Google AI Studio) and save. The key lives in `data/config.json` only — never in backups.
   ⚠️ If you've shared a key publicly (e.g. in a chat), rotate it in Google AI Studio.
2. **Live tab** → the monitor starts with your strategy's pairs. Set the pairs you watch,
   price refresh rate and how often Gemini re-analyzes (60s / 180s defaults are fine).
3. Log a trade with **"Position still open"** checked — the Live tab then shows live
   guidance (distance to SL/TP) and alerts you to exit.
4. Keep the app open to receive alerts; the bell in the top bar shows unread ones.

## Run it

```bash
cd pip-track
pip install flask
pip install youtube-transcript-api   # optional: for teaching via YouTube videos
python3 server.py
```

Then open **http://localhost:8000**.

> Set `PIPTRACK_MOCK_AI=1` before starting to run without Gemini calls (simulated AI —
> useful for testing or when the API quota runs out).

Your data is stored in `data/piptrack.db` (SQLite) — nothing leaves your machine.

## Deploy online (GitHub + Render — free, 24/7)

The app is deploy-ready: **PostgreSQL on Render** (your data survives redeploys — SQLite
is only used when running locally), a `Procfile` (gunicorn), `render.yaml` (one-click
blueprint with a free Postgres database) and a clean git repo.

Follow the full step-by-step guide in **DEPLOY_GITHUB_RENDER.md** — in short:

1. Push this folder to a GitHub repo (GitHub Desktop makes this easy).
2. Render → **New +** → **Blueprint** → connect the repo → Apply.
3. Add your `GEMINI_API_KEY` (and Telegram vars) in the service's **Environment** tab.
4. Open https://your-app.onrender.com — live 24/7.
5. Future changes: `git push` → Render auto-deploys. Rollback anytime from the Events tab.

⚠️ Free-tier notes: the web service sleeps after 15 min idle (wakes on visit), and the
free PostgreSQL database expires after 30 days unless upgraded (~$7/mo keeps everything
always-on).

## Project layout

```
pip-track/
├── server.py            # Flask app + REST API + SQLite storage
├── static/
│   ├── index.html       # single-page UI
│   ├── style.css        # dark trading theme
│   ├── charts.js        # lightweight canvas charts (no dependencies)
│   └── app.js           # all app logic
└── data/piptrack.db     # created automatically on first run
```

## Tips

- Start with **Settings → Load demo data** to see how the app behaves, then
  **Settings → Erase all data** when you're ready to log your real trades.
- Set your **starting balance** and **account currency** in Settings — the equity curve
  and return % are based on it.
- Enter your **risk per trade** (in $) to track your R-multiple automatically.
- Use the **★ self-rating** to track trade quality — review low-rated trades in the Journal.
- Back up regularly with **Export backup (JSON)**.
- **Coach:** save your strategy profile **once** — after that, just drop screenshots. Pair,
  session and risk auto-fill from your strategy and your last choices (they survive
  restarts). Every analysis is auto-logged to your pending list; "Log as trade" pre-fills
  the journal and links the signal, so outcomes and coach accuracy update themselves from
  your real P&L. The more real trades you log, the better the personal-edge checks become.
