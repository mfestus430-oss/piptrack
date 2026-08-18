# 📱 PipTrack — How to Access the App on Your Device
### Step-by-step guide (computer + phone)

PipTrack is a **self-hosted web app**. "Self-hosted" just means the app lives on a device
you control (your PC), and you open it in any browser. There are 3 ways to use it —
pick the one that fits your situation.

---

## OPTION 1 — Use it right now in this chat (zero setup)
The live preview you already have **is the full app**. Everything works: journal, coach,
brain (teach + backtest), live monitor.
- ⚠️ The preview runs on my server, so it may stop when this chat session ends.
- ✅ Perfect for **trying the app** and exporting a backup of your data.

**Do this now to try the new features:**
1. Open the **Brain** tab → click "Teach my strategy" → paste your strategy or a YouTube link, or upload screenshots → watch it learn.
2. Click **Run backtest** → then **Get AI strategy report**.
3. Open the **Live** tab → flip the 🧪 **Paper trading** switch ON → the next ENTER alert auto-opens a simulated trade.

---

## OPTION 2 — Run it on YOUR computer (recommended for daily use)

### Step 1 — Download the app
- In the chat, download **`pip-track.zip`** (the full app package) and save it to your Desktop.
- Right-click → **Extract All** → you'll get a folder named `pip-track`.

### Step 2 — Install Python (one time)
- **Windows:** go to https://www.python.org/downloads/ → download the latest Python → run the installer.
  ⚠️ **Tick the box "Add Python to PATH"** during installation — this is the #1 cause of problems.
- **Mac:** Python is usually preinstalled (check with `python3 --version` in Terminal).
- Check it worked: open **Command Prompt** (Windows) or **Terminal** (Mac), type `python --version` (Windows) or `python3 --version` (Mac) and press Enter. You should see something like `Python 3.12.x`.

### Step 3 — Start the app
Open Command Prompt / Terminal and type these one at a time (press Enter after each):

```
cd Desktop\pip-track        (Windows)   or   cd ~/Desktop/pip-track   (Mac)
pip install flask
pip install youtube-transcript-api
python server.py            (Windows)   or   python3 server.py        (Mac)
```

You should see: **"PipTrack running at http://0.0.0.0:8000"**

### Step 4 — Open the app
- Open your browser (Chrome/Edge/Safari) and go to: **http://localhost:8000**
- 🎉 That's it. The app is now running **on your machine** — all your data stays with you.

### Step 5 — First-time setup (5 minutes, once)
1. **Settings** → set your account currency and starting balance → paste your Gemini API key (Google AI Studio → free).
2. **Settings** → 📲 Telegram alerts: create a bot with @BotFather (send `/newbot`, copy the token), message your bot once, get your chat id from @userinfobot, paste both, flip the switch ON. *Now enter/exit alerts reach your phone even when the app is closed.*
3. **Brain** → teach your strategy (text / YouTube / screenshots) → Run backtest → Get AI strategy report.
4. **Live** → turn the monitor ON, flip Paper trading ON to let it prove itself without risking money.

---

## OPTION 3 — Use it from your PHONE (same Wi-Fi)

> Works great: your phone browser opens the same app that's running on your PC.
> Both devices must be on the **same Wi-Fi network**.

1. Do Option 2 steps 1–3 on your computer (server must be running).
2. Find your computer's IP address:
   - **Windows:** open Command Prompt → type `ipconfig` → look for **IPv4 Address** under your Wi-Fi adapter (e.g. `192.168.1.20`).
   - **Mac:** Terminal → type `ipconfig getifaddr en0`.
3. On your phone, open Chrome → type: **http://192.168.1.20:8000** (use YOUR number).
4. First time, Windows may ask **"Allow access?"** → tick **Private networks** → Allow.
5. Bookmark it. Done — the full app on your phone.

> 💡 **Cheap 24/7 alternative:** for under $5/month you can rent a tiny cloud server
> (VPS) and run the same steps there — then the app (and Telegram alerts) run 24/7
> without your PC being on. Ask me if you want a VPS setup guide.

---

## ❓ Troubleshooting

| Problem | Fix |
|---|---|
| `python` not recognized | You skipped "Add Python to PATH" — reinstall Python and tick that box. |
| Port 8000 already in use | In `server.py` change `port=8000` to `port=8001`, then open http://localhost:8001 |
| Phone can't reach the app | Same Wi-Fi? Firewall? Try `http://<IP>:8000` with the exact IP from ipconfig. Allow the Windows firewall prompt. |
| `pip install` fails | Try `python -m pip install flask` (Windows). |
| Gemini errors (429/quota) | Free tier is limited. Either wait for the daily reset, or add billing in Google AI Studio. Everything else still works. |
| Data lost? | It's stored in `pip-track/data/piptrack.db` — copy that file to back up everything. Settings → Export backup (JSON) is the easy way. |

---

## 🧪 Your demo data
The app currently has demo trades, a learned sample strategy and a backtest so you can
explore. When you're ready for your real trading:
**Settings → Data → Erase all data**, then teach your real strategy in the Brain tab.

*PipTrack — educational tool, not financial advice.*
