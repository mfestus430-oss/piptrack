"""
Live Monitor — real-time price engine + Gemini AI analysis + enter/exit alerts.

Runs as a background thread inside the Flask app:
  - fetches live hourly candles from Yahoo Finance (free, no key)
  - computes indicators (SMA, RSI, trend, day range)
  - calls the Gemini API (user's key) for an AI verdict on each pair
  - fires ENTER / EXIT alerts (persisted, surfaced by the browser)
"""

import json
import os
import threading
import time
import urllib.request
import urllib.parse

from flask import Blueprint, jsonify, request

from ai import gemini_key, gemini_model, gemini_call, telegram_config, discord_config, load_config, save_config
from storage import kv_get, kv_set, query_db

bp = Blueprint("live", __name__)


def live_config():
    cfg = kv_get("liveConfig", {}) or {}
    defaults = {
        "enabled": False,
        "pairs": [],
        "aiEnabled": True,
        "paperEnabled": False,
        "priceInterval": 60,   # seconds between price fetches per pair
        "aiInterval": 600,     # seconds between batched Gemini calls
    }
    cfg = {**defaults, **cfg}
    if not cfg.get("pairs"):
        # default pairs: from the trader's strategy, else majors
        coach = kv_get("coach", {}) or {}
        prof = coach.get("profile", {}) or {}
        strat = [p.strip().upper() for p in str(prof.get("pairs", "")).split(",") if p.strip()]
        cfg["pairs"] = strat or ["EUR/USD", "GBP/USD", "XAU/USD"]
    return cfg


def pair_to_symbol(pair):
    p = pair.strip().upper()
    if p == "XAU/USD":
        return "GC=F"
    if p == "XAG/USD":
        return "SI=F"
    if "/" in p:
        b, q = p.split("/", 1)
        return b + q + "=X"
    return p


def fetch_chart(pair):
    """Return dict with hourly candles + indicators, or raise."""
    sym = pair_to_symbol(pair)
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           + urllib.parse.quote(sym) + "?interval=1h&range=2d&includePrePost=false")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"})
    with urllib.request.urlopen(req, timeout=6) as r:
        data = json.loads(r.read().decode())
    res = data["chart"]["result"][0]
    meta = res.get("meta", {})
    ts = res.get("timestamp", [])
    q = res["indicators"]["quote"][0]
    o, h, l, c = q.get("open", []), q.get("high", []), q.get("low", []), q.get("close", [])

    rows = []
    for i in range(len(ts)):
        if c[i] is None or o[i] is None or h[i] is None or l[i] is None:
            continue
        rows.append({"t": ts[i], "o": o[i], "h": h[i], "l": l[i], "c": c[i]})
    if len(rows) < 5:
        raise ValueError("not enough candles from feed")

    closes = [r["c"] for r in rows]
    last = closes[-1]
    prev = meta.get("chartPreviousClose") or closes[-2]
    change = (last - prev) / prev if prev else 0

    sma = lambda n: (sum(closes[-n:]) / n) if len(closes) >= n else None
    sma5, sma20 = sma(5), sma(20)
    trend = "up" if (sma5 and sma20 and sma5 > sma20) else ("down" if (sma5 and sma20 and sma5 < sma20) else "flat")

    # RSI (Wilder)
    rsi = None
    if len(closes) >= 15:
        gains, losses = 0.0, 0.0
        for i in range(1, 15):
            d = closes[i] - closes[i - 1]
            if d >= 0:
                gains += d
            else:
                losses -= d
        ag, al = gains / 14, losses / 14
        for i in range(15, len(closes)):
            d = closes[i] - closes[i - 1]
            ag = (ag * 13 + max(d, 0)) / 14
            al = (al * 13 + max(-d, 0)) / 14
        rsi = 100 - 100 / (1 + (ag / al if al > 0 else float("inf"))) if al > 0 or ag > 0 else 50

    high_day = max(r["h"] for r in rows[-24:])
    low_day = min(r["l"] for r in rows[-24:])
    pos = (last - low_day) / (high_day - low_day) if high_day > low_day else 0.5
    momentum = (closes[-1] - closes[-8]) / closes[-8] if len(closes) >= 8 else 0
    candle_dir = "up" if rows[-1]["c"] >= rows[-1]["o"] else "down"

    return {
        "pair": pair,
        "price": last,
        "prevClose": prev,
        "changePct": round(change * 100, 3),
        "highDay": high_day,
        "lowDay": low_day,
        "pos": round(pos, 3),
        "rsi": round(rsi, 1) if rsi is not None else None,
        "sma5": round(sma5, 5) if sma5 else None,
        "sma20": round(sma20, 5) if sma20 else None,
        "trend": trend,
        "momentum": round(momentum * 100, 3),
        "candleDir": candle_dir,
        "candles": [[round(r["o"], 5), round(r["h"], 5), round(r["l"], 5), round(r["c"], 5)] for r in rows[-24:]],
        "updatedAt": int(time.time()),
    }


# ---------------------------------------------------------------- gemini

def batched_gemini_analyze(pairs, profile, brain):
    """One Gemini call analyzing all monitored pairs at once. Returns list of verdicts."""
    rows = []
    for pair, ch in pairs:
        pos_txt = "No open position."
        pos = None
        try:
            pos = _open_position(pair)
        except Exception:
            pass
        if pos:
            pos_txt = ("Open position: %s %s, entry=%s, SL=%s, TP=%s." % (
                pos["direction"].upper(), pair, pos["entry"],
                pos.get("sl") or "none", pos.get("tp") or "none"))
        rows.append(
            f"- Pair: {pair} | price={ch['price']} | change%={ch['changePct']} | RSI14={ch['rsi']} | "
            f"SMA5={ch['sma5']} | SMA20={ch['sma20']} | trend={ch['trend']} | "
            f"dayHigh={ch['highDay']} | dayLow={ch['lowDay']} | posInDayRange={ch['pos']} | "
            f"momentum8h%={ch['momentum']} | lastCandle={ch['candleDir']} | {pos_txt}")

    brain_txt = ""
    if brain and brain.get("summary"):
        brain_txt = f"\nThe trader's learned strategy: {brain.get('summary')}"

    prompt = f"""You are a disciplined forex trading copilot. The trader's strategy profile: {json.dumps(profile or {})}
{brain_txt}

Current live market state (hourly candles, one line per pair):
{"\n".join(rows)}

For EACH pair, decide: enter (only if price action clearly aligns with the strategy AND technicals), wait, or exit (if an open position's TP/SL is close or trend flipped against it). Be conservative — no trade is better than a bad trade.

Return STRICT JSON only, an array with exactly one object per pair, in the same order:
[{{"pair":"EUR/USD","direction":"long|short|none","strength":0-100,"action":"enter|wait|exit","entryNote":"optional short tip","exitNote":"optional tip for open positions","reason":"under 30 words"}}]"""

    out = gemini_call(prompt)
    if not isinstance(out, list):
        raise ValueError("Gemini did not return an array of verdicts")
    return out


def _open_position(pair):
    rows = query_db("SELECT * FROM trades WHERE exit_p IS NULL AND pair=?", (pair,))
    if not rows:
        return None
    r = dict(rows[0])
    return {"direction": r.get("direction"), "entry": r.get("entry"), "sl": r.get("sl"), "tp": r.get("tp")}


# ---------------------------------------------------------------- alerts

def add_alert(atype, pair, title, body):
    alerts = kv_get("alerts", []) or []
    alerts.insert(0, {
        "id": int(time.time() * 1000),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "type": atype,  # enter | exit | info
        "pair": pair,
        "title": title,
        "body": body,
        "read": False,
    })
    kv_set("alerts", alerts[:200])
    try:
        from brain import maybe_push_alert
        maybe_push_alert(atype, pair, title, body)
    except Exception:
        pass


# ---------------------------------------------------------------- monitor

class LiveMonitor(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.state = {}          # pair -> chart data
        self.ai = {}             # pair -> last AI verdict
        self.last_fetch = {}     # pair -> ts
        self.last_ai = {}        # pair -> ts
        self.last_enter_alert = {}  # pair -> ts
        self.exit_alerted = {}   # trade_id -> True
        self.ai_error = None
        self.running = True

    def cycle(self):
        cfg = live_config()
        if not cfg.get("enabled"):
            return
        now = time.time()
        pairs = cfg.get("pairs", [])
        if not pairs:
            return

        # 1) fetch fresh prices for all pairs
        any_fresh = False
        for pair in pairs:
            try:
                if now - self.last_fetch.get(pair, 0) < float(cfg.get("priceInterval", 60)):
                    continue
                chart = fetch_chart(pair)
                self.state[pair] = chart
                self.last_fetch[pair] = now
                any_fresh = True
            except Exception as e:
                self.ai_error = f"{pair}: {e}"

        # 2) one batched Gemini call covering every pair (quota-friendly)
        if cfg.get("aiEnabled", True) and now - self._last_ai_batch >= float(cfg.get("aiInterval", 600)):
            fresh = [(p, self.state.get(p)) for p in pairs if self.state.get(p)]
            if fresh:
                try:
                    coach = kv_get("coach", {}) or {}
                    profile = coach.get("profile", {}) or {}
                    brain = kv_get("strategyBrain", None) or {}
                    verdicts = batched_gemini_analyze(fresh, profile, brain)
                    for v in verdicts:
                        p = v.get("pair")
                        if p in self.state:
                            self.ai[p] = {**v, "at": now}
                    self._last_ai_batch = now
                    self.ai_error = None
                except Exception as e:
                    self.ai_error = str(e)

        # 3) enter / exit checks
        for pair in pairs:
            chart = self.state.get(pair)
            if not chart:
                continue
            ai_verdict = self.ai.get(pair)
            self._check_enter(pair, chart, ai_verdict, now)
            self._check_exits(pair, chart, ai_verdict)
            self._manage_paper_trades(pair, chart, ai_verdict)

    _last_ai_batch = 0.0

    def _check_enter(self, pair, chart, ai_verdict, now):
        if not ai_verdict or ai_verdict.get("action") != "enter":
            return
        if ai_verdict.get("strength", 0) < 60:
            return
        # paper trade opens regardless of the alert cooldown (deduped per pair)
        if live_config().get("paperEnabled"):
            self._open_paper_trade(pair, chart, ai_verdict)
        if now - self.last_enter_alert.get(pair, 0) < 20 * 60:
            return
        self.last_enter_alert[pair] = now
        direction = (ai_verdict.get("direction") or "long").upper()
        note = ai_verdict.get("entryNote") or ""
        add_alert("enter", pair,
                  f"📈 ENTER {direction} {pair} NOW",
                  f"AI strength {ai_verdict['strength']}% · price {chart['price']} · {chart['trend']} trend. {note} {ai_verdict.get('reason','')}".strip())
        if live_config().get("paperEnabled"):
            self._open_paper_trade(pair, chart, ai_verdict)

    def _open_paper_trade(self, pair, chart, verdict):
        pts = kv_get("paperTrades", []) or []
        if any(p.get("status") == "open" and p.get("pair") == pair for p in pts):
            return
        brain = kv_get("strategyBrain", None) or {}
        ex = (brain.get("rules") or {}).get("exit") or {}
        sl_pct = float(ex.get("sl_pct") or 0) or 0.5
        tp_pct = float(ex.get("tp_pct") or 0) or 1.0
        d = verdict.get("direction") or "long"
        e = chart["price"]
        sl = e * (1 - sl_pct / 100) if d == "long" else e * (1 + sl_pct / 100)
        tp = e * (1 + tp_pct / 100) if d == "long" else e * (1 - tp_pct / 100)
        pts.append({
            "id": int(time.time() * 1000),
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "pair": pair, "direction": d,
            "entry": e, "sl": sl, "tp": tp,
            "entryStrength": verdict.get("strength"),
            "status": "open",
        })
        kv_set("paperTrades", pts)
        add_alert("info", pair, "🧪 Paper trade opened",
                  f"{d.upper()} {pair} @ {e:.5f} · SL {sl:.5f} · TP {tp:.5f} (from strategy exit plan)")

    def _manage_paper_trades(self, pair, chart, ai_verdict):
        pts = kv_get("paperTrades", []) or []
        changed = False
        for pt in pts:
            if pt.get("status") != "open" or pt.get("pair") != pair:
                continue
            d = pt.get("direction")
            last = chart.get("candles")[-1] if chart.get("candles") else None
            hi = last[1] if last else chart["price"]
            lo = last[2] if last else chart["price"]
            close = None
            if d == "long":
                if pt.get("sl") and lo <= pt["sl"]:
                    close = (pt["sl"], "SL")
                elif pt.get("tp") and hi >= pt["tp"]:
                    close = (pt["tp"], "TP")
            else:
                if pt.get("sl") and hi >= pt["sl"]:
                    close = (pt["sl"], "SL")
                elif pt.get("tp") and lo <= pt["tp"]:
                    close = (pt["tp"], "TP")
            if close is None and ai_verdict and ai_verdict.get("action") == "exit":
                close = (chart["price"], "AI EXIT")
            if close:
                exit_p, reason = close
                pnl = (exit_p / pt["entry"] - 1) * 100 * (1 if d == "long" else -1)
                pt.update(status="closed", exit=exit_p, pnl_pct=round(pnl, 2), reason=reason,
                          closeTs=time.strftime("%Y-%m-%dT%H:%M:%S"))
                changed = True
                add_alert("exit", pair, "🧪 Paper trade closed",
                          f"{d.upper()} {pair} closed at {exit_p:.5f} ({reason}) — {pnl:+.2f}%")
        if changed:
            kv_set("paperTrades", pts)

    def _check_exits(self, pair, chart, ai_verdict):
        rows = query_db("SELECT * FROM trades WHERE exit_p IS NULL AND pair=?", (pair,))
        for r in rows:
            r = dict(r)
            tid = r["id"]
            if self.exit_alerted.get(tid):
                continue
            price = chart["price"]
            direction = r.get("direction")
            sl, tp = r.get("sl"), r.get("tp")
            if direction == "long":
                if sl and price <= sl:
                    self.exit_alerted[tid] = True
                    add_alert("exit", pair, "🛑 STOP LOSS HIT — EXIT LONG", f"{pair} long: price {price} at/under SL {sl}. Take the loss, protect capital.")
                    continue
                if tp and price >= tp:
                    self.exit_alerted[tid] = True
                    add_alert("exit", pair, "🎯 TAKE PROFIT REACHED — EXIT LONG", f"{pair} long: price {price} hit TP {tp}. Bank the win.")
                    continue
            else:
                if sl and price >= sl:
                    self.exit_alerted[tid] = True
                    add_alert("exit", pair, "🛑 STOP LOSS HIT — EXIT SHORT", f"{pair} short: price {price} at/above SL {sl}. Take the loss, protect capital.")
                    continue
                if tp and price <= tp:
                    self.exit_alerted[tid] = True
                    add_alert("exit", pair, "🎯 TAKE PROFIT REACHED — EXIT SHORT", f"{pair} short: price {price} hit TP {tp}. Bank the win.")
                    continue
            if ai_verdict and ai_verdict.get("action") == "exit":
                self.exit_alerted[tid] = True
                d = ai_verdict.get("direction")
                if d and d != direction:
                    add_alert("exit", pair, "🔄 AI SAYS EXIT — TREND FLIPPED",
                              f"{pair} {direction}: AI now reads {d.upper()} (strength {ai_verdict['strength']}%). {ai_verdict.get('exitNote','Close the position.')}")

    def run(self):
        while self.running:
            try:
                self.cycle()
            except Exception:
                pass
            time.sleep(15)


monitor = LiveMonitor()


# ---------------------------------------------------------------- routes

@bp.route("/api/live/state", methods=["GET"])
def live_state():
    cfg = live_config()
    prices = []
    for pair in cfg.get("pairs", []):
        chart = monitor.state.get(pair)
        ai = monitor.ai.get(pair)
        prices.append({
            "pair": pair,
            "price": chart["price"] if chart else None,
            "changePct": chart["changePct"] if chart else None,
            "rsi": chart["rsi"] if chart else None,
            "trend": chart["trend"] if chart else None,
            "pos": chart["pos"] if chart else None,
            "momentum": chart["momentum"] if chart else None,
            "candleDir": chart["candleDir"] if chart else None,
            "updatedAt": chart["updatedAt"] if chart else None,
            "ai": ({"direction": ai.get("direction"), "strength": ai.get("strength"),
                    "action": ai.get("action"), "reason": ai.get("reason"),
                    "entryNote": ai.get("entryNote"), "exitNote": ai.get("exitNote")}
                   if ai else None),
        })

    # open positions with live advice
    open_positions = []
    rows = query_db("SELECT * FROM trades WHERE exit_p IS NULL ORDER BY ts DESC")
    for r in rows:
        r = dict(r)
        chart = monitor.state.get(r["pair"])
        advice = {"level": "monitor", "text": "Waiting for price data…"}
        if chart:
            price = chart["price"]
            direction = r.get("direction")
            sl, tp = r.get("sl"), r.get("tp")
            if direction == "long":
                if sl and price <= sl:
                    advice = {"level": "danger", "text": f"SL hit ({price}) — EXIT now"}
                elif tp and price >= tp:
                    advice = {"level": "ok", "text": f"TP reached ({price}) — EXIT now"}
                elif tp:
                    advice = {"level": "ok", "text": f"Monitoring · {(tp-price)/price*100:.2f}% to TP"}
                else:
                    advice = {"level": "monitor", "text": "Monitoring"}
            else:
                if sl and price >= sl:
                    advice = {"level": "danger", "text": f"SL hit ({price}) — EXIT now"}
                elif tp and price <= tp:
                    advice = {"level": "ok", "text": f"TP reached ({price}) — EXIT now"}
                elif tp:
                    advice = {"level": "ok", "text": f"Monitoring · {(price-tp)/price*100:.2f}% to TP"}
                else:
                    advice = {"level": "monitor", "text": "Monitoring"}
        open_positions.append({**r, "livePrice": chart["price"] if chart else None, "advice": advice})

    pts = kv_get("paperTrades", []) or []
    paper_open = [p for p in pts if p.get("status") == "open"]
    paper_closed = [p for p in pts if p.get("status") == "closed"]
    paper_stats = {
        "trades": len(paper_closed),
        "wins": sum(1 for p in paper_closed if p.get("pnl_pct", 0) > 0),
        "netPct": round(sum(p.get("pnl_pct", 0) for p in paper_closed), 2),
        "balance": round(10000 * (1 + sum(p.get("pnl_pct", 0) for p in paper_closed) / 100), 2),
    }

    alerts = (kv_get("alerts", []) or [])
    unread = sum(1 for a in alerts if not a.get("read"))

    return jsonify({
        "enabled": bool(cfg.get("enabled")),
        "pairs": cfg.get("pairs"),
        "aiEnabled": bool(cfg.get("aiEnabled", True)),
        "priceInterval": cfg.get("priceInterval"),
        "aiInterval": cfg.get("aiInterval"),
        "gemini": {
            "configured": bool(gemini_key()),
            "model": gemini_model(),
            "lastError": monitor.ai_error,
            "lastAiAt": max(monitor.last_ai.values()) if monitor.last_ai else None,
        },
        "telegram": {
            "configured": bool(telegram_config()["token"] and telegram_config()["chat_id"]),
            "enabled": bool(telegram_config()["enabled"]),
            "chatId": (telegram_config()["chat_id"][:4] + "…" + telegram_config()["chat_id"][-3:]) if len(telegram_config()["chat_id"]) > 7 else (telegram_config()["chat_id"] or ""),
        },
        "discord": {
            "configured": bool(discord_config()["webhook"]),
        },
        "prices": prices,
        "openPositions": open_positions,
        "paperEnabled": bool(cfg.get("paperEnabled")),
        "paper": {"open": paper_open, "closed": paper_closed[-12:][::-1], "stats": paper_stats},
        "alerts": alerts[:50],
        "unread": unread,
    })


@bp.route("/api/live/config", methods=["POST"])
def live_config_route():
    body = request.get_json(force=True) or {}
    cfg = live_config()
    for k in ("enabled", "aiEnabled", "paperEnabled"):
        if k in body:
            cfg[k] = bool(body[k])
    if ("aiInterval" in body or "aiEnabled" in body) and "reset" not in body:
        monitor._last_ai_batch = 0  # re-run AI immediately after config change
    if "pairs" in body:
        pairs = [p.strip().upper() for p in body["pairs"] if p.strip()]
        cfg["pairs"] = pairs[:10]
    for k in ("priceInterval", "aiInterval"):
        if k in body:
            try:
                cfg[k] = max(15, min(3600, int(body[k])))
            except Exception:
                pass
    kv_set("liveConfig", cfg)
    return jsonify({"ok": True, "config": cfg})


@bp.route("/api/config/gemini", methods=["POST"])
def config_gemini():
    body = request.get_json(force=True) or {}
    cfg = load_config()
    if "key" in body:
        key = str(body["key"]).strip()
        if not key:
            cfg.pop("gemini_key", None)
        else:
            cfg["gemini_key"] = key
    if "model" in body and str(body["model"]).strip():
        cfg["gemini_model"] = str(body["model"]).strip()
    save_config(cfg)
    return jsonify({"ok": True, "configured": bool(gemini_key())})


@bp.route("/api/paper/close", methods=["POST"])
def paper_close():
    body = request.get_json(force=True) or {}
    pid = body.get("id")
    pts = kv_get("paperTrades", []) or []
    for pt in pts:
        if pt.get("id") == pid and pt.get("status") == "open":
            chart = monitor.state.get(pt.get("pair"))
            price = chart["price"] if chart else pt["entry"]
            d = pt.get("direction")
            pnl = (price / pt["entry"] - 1) * 100 * (1 if d == "long" else -1)
            pt.update(status="closed", exit=price, pnl_pct=round(pnl, 2), reason="MANUAL",
                      closeTs=time.strftime("%Y-%m-%dT%H:%M:%S"))
            kv_set("paperTrades", pts)
            return jsonify({"ok": True, "pnl": round(pnl, 2)})
    return jsonify({"ok": False, "error": "Open paper trade not found"}), 404


@bp.route("/api/alerts/read", methods=["POST"])
def alerts_read():
    body = request.get_json(force=True) or {}
    alerts = kv_get("alerts", []) or []
    if body.get("all"):
        for a in alerts:
            a["read"] = True
    else:
        for a in alerts:
            if a["id"] <= int(body.get("id", 0)):
                a["read"] = True
    kv_set("alerts", alerts)
    return jsonify({"ok": True})


@bp.route("/api/alerts/test", methods=["POST"])
def alerts_test():
    body = request.get_json(force=True) or {}
    add_alert("info", body.get("pair") or "TEST",
              body.get("title") or "🔔 Test notification",
              body.get("body") or "Notifications are working — you'll see enter/exit alerts here.")
    return jsonify({"ok": True})


monitor.start()
