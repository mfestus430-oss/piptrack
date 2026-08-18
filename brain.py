"""
Strategy Brain — teach your strategy (text or YouTube video), backtest it on real
historical data, and share learned rules with the Coach + Live monitor.
Also hosts Telegram notification configuration.
"""

import json
import math
import re
import time
import urllib.parse
import urllib.request

from flask import Blueprint, jsonify, request

import ai
from ai import gemini_call, gemini_call_parts, save_config, telegram_config, send_telegram, discord_config, send_discord
from storage import kv_get, kv_set

bp = Blueprint("brain", __name__)

TEACH_PROMPT = """You are a professional trading strategist. The trader explains their strategy below. Convert it into a precise, backtestable rule set using ONLY the supported vocabulary. Be faithful to what they said — do not invent rules they didn't mention.

Strategy explanation:
{user_text}
{video_block}

SUPPORTED METRICS (computed from hourly/daily OHLC candles):
- close, open, high, low (price values)
- sma(n) e.g. sma 20 ; ema(n) e.g. ema 50
- rsi (14-period)
- atr (14-period)
- momentum_pct(n) — % price change over n bars
- body_pct — current candle body as % of price
- trend — "up" | "down" | "flat" (sma5 vs sma20)
- breakout_high(n) — close above the highest high of the previous n bars
- breakout_low(n) — close below the lowest low of the previous n bars
- position_in_range — 0..1 where price sits within the last 24 bars (0 = at the highs)

OPS: < <= > >= ==  (for trend: "up"|"down"|"flat"; for breakout_high/breakout_low use op ">" or "<" with value = lookback n; for body direction use metric "candle" with op "up"|"down").

All entry_conditions AND filters are ANDed (all must hold). Only use metrics from the list above; if something can't be expressed, put it in notes[]. If the explanation is vague, be conservative: prefer requiring trend alignment + a confirmation condition rather than guessing an aggressive setup.

Return STRICT JSON (no markdown):
{{
  "name": "short strategy name",
  "summary": "2-3 sentences in plain English describing the strategy",
  "direction": "long|short|both",
  "timeframe": "1h|1d",
  "entry_conditions": [{{"metric":"rsi","op":"<","value":30,"note":"oversold"}}],
  "filters": [{{"metric":"trend","op":"up","value":null,"note":"only with the trend"}}],
  "exit": {{"sl_pct": 0.5, "tp_pct": 1.0, "atr_sl_mult": null, "atr_tp_mult": null, "max_hold_bars": null, "trail_pct": null}},
  "notes": ["any rules that couldn't be expressed as conditions"]
}}
sl_pct / tp_pct are PERCENT of entry price (0.5 means 0.5%). Use null when the trader didn't specify. atr_sl_mult = stop loss as a multiple of ATR."""


def extract_video_id(url):
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None


def fetch_transcript(video_id):
    """Best-effort YouTube transcript fetch. Returns text or raises."""
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    tl = api.list(video_id)
    try:
        tr = tl.find_transcript(["en", "en-US", "en-GB"])
    except Exception:
        tr = tl.find_transcript([])
    data = tr.fetch()
    return " ".join(seg.text for seg in data)


def get_brain():
    return kv_get("strategyBrain", None)


def save_brain(brain):
    brain["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    kv_set("strategyBrain", brain)
    return brain


@bp.route("/api/strategy/brain", methods=["GET"])
def brain_get():
    b = get_brain()
    return jsonify({"learned": bool(b), "brain": b})


@bp.route("/api/strategy/brain", methods=["DELETE"])
def brain_delete():
    kv_set("strategyBrain", None)
    return jsonify({"ok": True})


@bp.route("/api/strategy/brain", methods=["POST"])
def brain_teach():
    body = request.get_json(force=True) or {}
    user_text = str(body.get("text", "")).strip()
    yt_url = str(body.get("youtube_url", "")).strip()
    images = body.get("images") or []  # [{mime_type, data(base64)}]
    if isinstance(images, list):
        images = [im for im in images if isinstance(im, dict) and im.get("data")][:6]
    if not user_text and not yt_url and not images:
        return jsonify({"ok": False, "error": "Explain your strategy, paste a YouTube link, or upload screenshots"}), 400

    video_block = ""
    if yt_url:
        vid = extract_video_id(yt_url)
        if not vid:
            return jsonify({"ok": False, "error": "Could not find a video ID in that YouTube link"}), 400
        try:
            transcript = fetch_transcript(vid)
            if len(transcript) > 12000:
                transcript = transcript[:12000] + " …"
            video_block = "\nVideo transcript (from the YouTube video they linked):\n" + transcript
        except Exception as e:
            video_block = "\n(Note: could not fetch the YouTube transcript — " + str(e)[:100] + ". Continue using only the written explanation.)"

    prompt = TEACH_PROMPT.format(user_text=user_text or "(strategy taught from screenshots)", video_block=video_block)
    parts = [{"text": prompt}]
    for im in images:
        mime = str(im.get("mime_type", "image/png"))
        if not mime.startswith("image/"):
            mime = "image/png"
        parts.append({"inline_data": {"mime_type": mime, "data": str(im.get("data", ""))}})
    try:
        if len(parts) > 1:
            rules = gemini_call_parts(parts, max_tokens=4000)
        else:
            rules = gemini_call(prompt, max_tokens=4000)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 502

    # validate / normalize structure
    rules = rules or {}
    if not isinstance(rules.get("entry_conditions"), list):
        rules["entry_conditions"] = []
    if not isinstance(rules.get("filters"), list):
        rules["filters"] = []
    if not isinstance(rules.get("notes"), list):
        rules["notes"] = []
    if not isinstance(rules.get("exit"), dict):
        rules["exit"] = {}
    rules.setdefault("direction", "both")
    rules.setdefault("timeframe", "1h")
    rules.setdefault("name", "My strategy")

    brain = {
        "name": str(rules.get("name", "My strategy"))[:80],
        "summary": str(rules.get("summary", ""))[:600],
        "rules": rules,
        "source": {"text": user_text[:2000], "youtube": yt_url or None, "screenshots": len(images)},
    }
    save_brain(brain)
    return jsonify({"ok": True, "brain": brain})


# ================================================================ backtest

def fetch_history(pair, interval="1h", months=3):
    """Fetch historical OHLC from Yahoo Finance. Returns list of bar dicts."""
    from live import pair_to_symbol
    sym = pair_to_symbol(pair)
    rng_map = {1: "1mo", 3: "3mo", 6: "6mo", 12: "1y", 24: "2y"}
    if interval == "1h" and months > 6:
        months = 6
    rng = rng_map.get(months, "6mo")
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           + urllib.parse.quote(sym) + f"?interval={interval}&range={rng}&includePrePost=false")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read().decode())
    res = data["chart"]["result"][0]
    ts = res.get("timestamp", [])
    q = res["indicators"]["quote"][0]
    bars = []
    for i in range(len(ts)):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None in (o, h, l, c):
            continue
        bars.append({
            "t": ts[i], "o": o, "h": h, "l": l, "c": c,
            "date": time.strftime("%Y-%m-%d %H:%M", time.gmtime(ts[i])),
        })
    return bars


def ema_series(values, n):
    k = 2 / (n + 1)
    out = [None] * len(values)
    if len(values) < n:
        return out
    seed = sum(values[:n]) / n
    out[n - 1] = seed
    for i in range(n, len(values)):
        out[i] = values[i] * k + out[i - 1] * (1 - k)
    return out


def enrich(bars):
    closes = [b["c"] for b in bars]
    highs = [b["h"] for b in bars]
    lows = [b["l"] for b in bars]
    sma = {}
    for n in (5, 20, 50):
        s = [None] * len(bars)
        for i in range(n - 1, len(bars)):
            s[i] = sum(closes[i - n + 1:i + 1]) / n
        sma[n] = s
    ema20 = ema_series(closes, 20)

    # RSI(14) Wilder
    rsi = [None] * len(bars)
    if len(bars) > 14:
        g = l = 0.0
        for i in range(1, 15):
            d = closes[i] - closes[i - 1]
            g += max(d, 0); l += max(-d, 0)
        ag, al = g / 14, l / 14
        rsi[14] = 100 - 100 / (1 + ag / al) if al > 0 else 100 if ag > 0 else 50
        for i in range(15, len(bars)):
            d = closes[i] - closes[i - 1]
            ag = (ag * 13 + max(d, 0)) / 14
            al = (al * 13 + max(-d, 0)) / 14
            rsi[i] = 100 - 100 / (1 + ag / al) if al > 0 else 100 if ag > 0 else 50

    # ATR(14) Wilder
    atr = [None] * len(bars)
    if len(bars) > 14:
        trs = []
        for i in range(1, len(bars)):
            trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))
        a = sum(trs[:14]) / 14
        atr[14] = a
        for i in range(15, len(bars)):
            a = (a * 13 + trs[i - 1]) / 14
            atr[i] = a

    for i, b in enumerate(bars):
        b["sma5"] = sma[5][i]
        b["sma20"] = sma[20][i]
        b["sma50"] = sma[50][i]
        b["ema20"] = ema20[i]
        b["rsi"] = rsi[i]
        b["atr"] = atr[i]
        if i >= 7:
            b["mom8"] = (closes[i] - closes[i - 8]) / closes[i - 8] * 100
        if i >= 23:
            w = highs[i - 23:i + 1]
            hi, lo = max(w), min(w)
            b["pos24"] = (closes[i] - lo) / (hi - lo) if hi > lo else 0.5
        if i >= 1:
            b["body_pct"] = abs(closes[i] - b["o"]) / b["o"] * 100
    return bars


def cond_holds(cond, b):
    m = cond.get("metric", "close")
    op = cond.get("op", ">")
    v = cond.get("value")
    if m == "trend":
        t = "up" if (b.get("sma5") and b.get("sma20") and b["sma5"] > b["sma20"]) else ("down" if (b.get("sma5") and b.get("sma20") and b["sma5"] < b["sma20"]) else "flat")
        return t == op
    if m == "candle":
        return ("up" if b["c"] >= b["o"] else "down") == op
    if m == "breakout_high":
        lb = int(v or 24)
        i = b["_i"]
        if i < lb:
            return False
        return b["c"] > max(b["_hi"][i - lb:i])
    if m == "breakout_low":
        lb = int(v or 24)
        i = b["_i"]
        if i < lb:
            return False
        return b["c"] < min(b["_lo"][i - lb:i])
    num = {"close": "c", "open": "o", "high": "h", "low": "l", "rsi": "rsi",
           "sma": "sma20", "ema": "ema20", "atr": "atr", "momentum_pct": "mom8",
           "body_pct": "body_pct", "position_in_range": "pos24"}.get(m)
    if num is None:
        return False
    val = b.get(num)
    if val is None:
        return False
    try:
        vv = float(v)
    except (TypeError, ValueError):
        return True
    if op == "<":
        return val < vv
    if op == "<=":
        return val <= vv
    if op == ">":
        return val > vv
    if op == ">=":
        return val >= vv
    if op == "==":
        return abs(val - vv) < 1e-9
    return False


def run_backtest(bars, rules, spread_pct=0.02):
    rules = rules or {}
    entry = [c for c in (rules.get("entry_conditions") or []) if isinstance(c, dict)]
    filters = [c for c in (rules.get("filters") or []) if isinstance(c, dict)]
    ex = rules.get("exit") or {}
    direction = rules.get("direction", "both")

    highs = [b["h"] for b in bars]
    lows = [b["l"] for b in bars]
    for i, b in enumerate(bars):
        b["_i"] = i
        b["_hi"] = highs
        b["_lo"] = lows

    warmup = 60
    start_equity = 10000.0
    equity = start_equity
    curve = [{"x": bars[warmup]["t"] * 1000, "y": round(equity, 2)}]
    trades = []
    peak = equity
    max_dd = 0.0
    pos = None

    def open_pos(i, b, d):
        e = b["c"]
        atr = b.get("atr") or 0
        sl = tp = None
        if ex.get("atr_sl_mult"):
            sl = e - atr * float(ex["atr_sl_mult"]) if d == "long" else e + atr * float(ex["atr_sl_mult"])
        elif ex.get("sl_pct") is not None:
            sl = e * (1 - float(ex["sl_pct"]) / 100) if d == "long" else e * (1 + float(ex["sl_pct"]) / 100)
        if ex.get("atr_tp_mult"):
            tp = e + atr * float(ex["atr_tp_mult"]) if d == "long" else e - atr * float(ex["atr_tp_mult"])
        elif ex.get("tp_pct") is not None:
            tp = e * (1 + float(ex["tp_pct"]) / 100) if d == "long" else e * (1 - float(ex["tp_pct"]) / 100)
        return {"dir": d, "entry": e, "sl": sl, "tp": tp, "i": i,
                "max_hold": ex.get("max_hold_bars"), "trail": float(ex["trail_pct"]) if ex.get("trail_pct") else None,
                "trail_hi": e, "trail_lo": e}

    for i in range(warmup, len(bars)):
        b = bars[i]
        if pos:
            d = pos["dir"]
            exit_p = None
            reason = None
            if d == "long":
                if pos["trail"]:
                    pos["trail_hi"] = max(pos["trail_hi"], b["h"])
                    nl = pos["trail_hi"] * (1 - pos["trail"] / 100)
                    pos["sl"] = max(pos["sl"] or 0, nl) if pos["sl"] else nl
                if pos["sl"] and b["l"] <= pos["sl"]:
                    exit_p, reason = pos["sl"], "SL"
                elif pos["tp"] and b["h"] >= pos["tp"]:
                    exit_p, reason = pos["tp"], "TP"
            else:
                if pos["trail"]:
                    pos["trail_lo"] = min(pos["trail_lo"], b["l"])
                    nl = pos["trail_lo"] * (1 + pos["trail"] / 100)
                    pos["sl"] = min(pos["sl"] or 1e12, nl) if pos["sl"] else nl
                if pos["sl"] and b["h"] >= pos["sl"]:
                    exit_p, reason = pos["sl"], "SL"
                elif pos["tp"] and b["l"] <= pos["tp"]:
                    exit_p, reason = pos["tp"], "TP"
            if exit_p is None and pos["max_hold"] and i - pos["i"] >= pos["max_hold"]:
                exit_p, reason = b["c"], "TIME"
            if exit_p is not None:
                pnl = (exit_p / pos["entry"] - 1) * (1 if d == "long" else -1) * 100 - spread_pct
                equity *= (1 + pnl / 100)
                trades.append({
                    "date": bars[pos["i"]]["date"], "dir": d,
                    "entry": round(pos["entry"], 5), "exit": round(exit_p, 5),
                    "pnl_pct": round(pnl, 2), "reason": reason,
                    "bars": i - pos["i"],
                })
                curve.append({"x": b["t"] * 1000, "y": round(equity, 2)})
                peak = max(peak, equity)
                max_dd = max(max_dd, (peak - equity) / peak * 100)
                pos = None
            continue

        dirs = ["long"] if direction == "long" else ["short"] if direction == "short" else ["long", "short"]
        for d in dirs:
            ok = all(cond_holds(c, b) for c in entry + filters)
            if ok:
                pos = open_pos(i, b, d)
                break

    if pos:
        pnl = 0.0
        trades.append({
            "date": bars[pos["i"]]["date"], "dir": pos["dir"],
            "entry": round(pos["entry"], 5), "exit": "open", "pnl_pct": 0.0,
            "reason": "OPEN", "bars": len(bars) - pos["i"],
        })

    wins = [t for t in trades if t.get("pnl_pct", 0) > 0]
    losses = [t for t in trades if t.get("pnl_pct", 0) < 0]
    gross_w = sum(t["pnl_pct"] for t in wins)
    gross_l = abs(sum(t["pnl_pct"] for t in losses))
    n = len(trades)
    stats = {
        "trades": n,
        "winRate": round(len(wins) / n * 100, 1) if n else 0,
        "profitFactor": round(gross_w / gross_l, 2) if gross_l > 0 else (gross_w > 0 and 99 or 0),
        "expectancy": round(sum(t["pnl_pct"] for t in trades) / n, 3) if n else 0,
        "totalReturn": round((equity / start_equity - 1) * 100, 2),
        "maxDrawdown": round(max_dd, 2),
        "avgBars": round(sum(t.get("bars", 0) for t in trades) / n, 1) if n else 0,
        "avgWin": round(sum(t["pnl_pct"] for t in wins) / len(wins), 2) if wins else 0,
        "avgLoss": round(sum(t["pnl_pct"] for t in losses) / len(losses), 2) if losses else 0,
    }
    verdict = "✅ Promising edge" if n >= 15 and stats["profitFactor"] >= 1.2 and stats["winRate"] >= 40 else (
        "⚠️ Needs work" if n >= 8 else "📊 Not enough trades")
    stats["verdict"] = verdict
    return {"trades": trades, "stats": stats, "equity": curve}


@bp.route("/api/strategy/backtest", methods=["POST"])
def backtest_route():
    body = request.get_json(force=True) or {}
    brain = get_brain()
    if not brain or not brain.get("rules"):
        return jsonify({"ok": False, "error": "Teach your strategy first (Brain tab)"}), 400
    pair = str(body.get("pair", "EUR/USD")).strip().upper()
    tf = "1d" if body.get("timeframe") == "1d" else "1h"
    months = min(24, max(1, int(body.get("months", 3) or 3)))
    try:
        bars = fetch_history(pair, tf, months)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not fetch {pair} history: {str(e)[:120]}"}), 502
    if len(bars) < 80:
        return jsonify({"ok": False, "error": f"Not enough historical data for {pair} ({len(bars)} bars)"}), 400
    bars = enrich(bars)
    result = run_backtest(bars, brain["rules"])
    return jsonify({"ok": True, "pair": pair, "timeframe": tf, "months": months,
                    "bars": len(bars), **result})


@bp.route("/api/strategy/report", methods=["POST"])
def strategy_report():
    body = request.get_json(force=True) or {}
    brain = get_brain()
    if not brain or not brain.get("rules"):
        return jsonify({"ok": False, "error": "Teach your strategy first (Brain tab)"}), 400
    pair = str(body.get("pair", "EUR/USD")).strip().upper()
    tf = "1d" if body.get("timeframe") == "1d" else "1h"
    months = min(24, max(1, int(body.get("months", 3) or 3)))
    try:
        bars = fetch_history(pair, tf, months)
        bars = enrich(bars)
        result = run_backtest(bars, brain["rules"])
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not run backtest: {str(e)[:120]}"}), 502
    stats = result["stats"]
    sample = result["trades"][:12]
    prompt = f"""You are a professional trading strategist reviewing a trader's backtest. Be honest and constructive.

Learned strategy: {json.dumps(brain.get('rules', {}))}
Backtest: {pair} · {tf} · {months} months · {len(bars)} bars
Stats: {json.dumps(stats)}
Sample trades: {json.dumps(sample)}

Return STRICT JSON (no markdown):
{{"verdict":"strong|promising|weak|unproven","summary":"2-4 sentences","strengths":["..."],"weaknesses":["..."],"suggestions":[{{"change":"one concrete change","why":"why it should help"}}]}}
Suggestions must be concrete and expressible as backtest rules (indicators, filters, exits)."""
    try:
        report = gemini_call(prompt, max_tokens=3000)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 502
    report = report or {}
    for k in ("strengths", "weaknesses", "suggestions"):
        if not isinstance(report.get(k), list):
            report[k] = []
    if report.get("verdict") not in ("strong", "promising", "weak", "unproven"):
        report["verdict"] = "unproven"
    return jsonify({"ok": True, "report": report, "stats": stats})


# ================================================================ telegram

@bp.route("/api/config/telegram", methods=["POST"])
def telegram_route():
    body = request.get_json(force=True) or {}
    cfg = ai.load_config()
    if "token" in body:
        cfg["telegram_token"] = str(body["token"]).strip()
    if "chat_id" in body:
        cfg["telegram_chat_id"] = str(body["chat_id"]).strip()
    if "enabled" in body:
        cfg["telegram_enabled"] = bool(body["enabled"])
    save_config(cfg)
    t = telegram_config()
    return jsonify({"ok": True, "configured": bool(t["token"] and t["chat_id"]), "enabled": t["enabled"]})


@bp.route("/api/telegram/test", methods=["POST"])
def telegram_test():
    ok, err = send_telegram("🔔 PipTrack test — Telegram notifications are working. You'll get enter/exit alerts here.")
    if ok:
        return jsonify({"ok": True, "message": "Test message sent to Telegram"})
    return jsonify({"ok": False, "error": err or "Telegram not configured", "message": err or "Telegram not configured"})


def maybe_push_alert(atype, pair, title, body):
    """Forward an alert to Telegram (if configured) and/or Discord (if webhook set)."""
    icon = {"enter": "📈", "exit": "🛑", "info": "🔔"}.get(atype, "🔔")
    text = f"{icon} {title}\n{body}\n({pair})"
    t = telegram_config()
    if t["token"] and t["chat_id"] and t["enabled"]:
        send_telegram(text)
    if discord_config()["webhook"]:
        send_discord(text)


@bp.route("/api/config/discord", methods=["POST"])
def discord_route():
    body = request.get_json(force=True) or {}
    cfg = ai.load_config()
    if "webhook" in body:
        cfg["discord_webhook"] = str(body["webhook"]).strip()
    save_config(cfg)
    return jsonify({"ok": True, "configured": bool(discord_config()["webhook"])})


@bp.route("/api/discord/test", methods=["POST"])
def discord_test():
    ok, err = send_discord("🔔 PipTrack test — Discord notifications are working. You'll get enter/exit alerts here.")
    if ok:
        return jsonify({"ok": True, "message": "Test message sent to Discord"})
    return jsonify({"ok": False, "error": err or "Discord not configured", "message": err or "Discord not configured"})
