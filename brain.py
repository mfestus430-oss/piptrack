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
{existing_block}

SUPPORTED METRICS (computed from OHLC candles on the chosen timeframe):
- close, open, high, low (price values)
- sma(n) e.g. sma 20 ; ema(n) e.g. ema 50
- rsi (14-period)
- atr (14-period)
- momentum_pct(n) — % price change over n bars
- body_pct — current candle body as % of price
- trend — "up" | "down" | "flat" (sma5 vs sma20)
- breakout_high(n) — close above the highest high of the previous n bars
- breakout_low(n) — close below the lowest low of the previous n bars
- swing_high_break — close above the last swing high (fractal high); op ">" value = fractal window (3)
- swing_low_break — close below the last swing low (fractal low); op ">" value = fractal window (3)
- pullback_pct — % pullback of the deepest low below the last swing high (for longs); value = minimum pullback % before a breakout counts
- pullback_low_pct — % pullback of the highest high above the last swing low (for shorts); value = minimum pullback % before a breakdown counts
- htf_trend — "up" | "down" | "flat" trend of the HIGHER timeframe (top-down analysis; daily when trading 1h/4h). Use op "up"/"down".
- trendline_break_up — close crossed ABOVE the trendline fitted through the last 3 swing highs (downtrend line break); value = min touches (2)
- trendline_break_down — close crossed BELOW the trendline fitted through the last 3 swing lows (uptrend line break); value = min touches (2)
- price_vs_trendline — % distance of close from the fitted trendline; op ">" = above the line
- trendline_touches — how many recent pivots the fitted trendline touches (strength of the line); value = min touches
- above_swing_high / below_swing_low — state checks, use op "==" value 1

DIRECTION-AWARE FILTERS: you may add "for": "long" or "for": "short" to any filter to apply
it only to that direction. For trend filters meant to align each side, emit TWO filters:
one trend filter with "op":"up" and "for":"long", and one trend filter with "op":"down"
and "for":"short". When direction is "both", the engine also auto-reverses a trend filter
for the short side so longs need an uptrend and shorts need a downtrend.
- position_in_range — 0..1 where price sits within the last 24 bars (0 = at the highs)

TRENDLINE / SUPPORT-RESISTANCE STRATEGIES: trendlines and horizontal S/R drawn by eye cannot
be computed from OHLC. Translate them as best you can with the metrics above:
- "break of the trendline / resistance" -> breakout_high or swing_high_break (with a pullback_pct condition so a retracement happened first)
- "bounce off support / trendline" -> breakout_low or swing_low_break
- "trail the stop along the trendline" -> set exit.trail_pct
- "no fixed take profit, let the trend run" -> leave tp_pct null, set exit.trail_pct and/or max_hold_bars
- Heiken Ashi candles -> set "heiken_ashi": true at the root of the rules JSON (the engine then computes all metrics on Heiken Ashi values)

OPS: < <= > >= ==  (for trend: "up"|"down"|"flat"; for breakout_high/breakout_low use op ">" or "<" with value = lookback n; for body direction use metric "candle" with op "up"|"down").

All entry_conditions AND filters are ANDed (all must hold). Only use metrics from the list above; if something can't be expressed, put it in notes[]. If the explanation is vague, be conservative: prefer requiring trend alignment + a confirmation condition rather than guessing an aggressive setup.

Return STRICT JSON (no markdown):
{{
  "name": "short strategy name",
  "summary": "2-3 sentences in plain English describing the strategy",
  "direction": "long|short|both",
  "timeframe": "1h|4h|1d",
  "heiken_ashi": false,
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


@bp.route("/api/strategy/brain/manual", methods=["POST"])
def brain_manual():
    body = request.get_json(force=True) or {}
    rules = body.get("rules")
    if not rules or not isinstance(rules, dict):
        return jsonify({"ok": False, "error": "rules object required"}), 400
    rules.setdefault("entry_conditions", [])
    rules.setdefault("filters", [])
    rules.setdefault("exit", {})
    rules.setdefault("direction", "both")
    rules.setdefault("timeframe", "4h")
    existing = get_brain() or {}
    log = list((existing.get("source") or {}).get("log", []))
    log.append({"type": "manual", "label": "manual edit", "date": time.strftime("%Y-%m-%d")})
    brain = {
        "name": str(body.get("name") or rules.get("name") or "My strategy")[:80],
        "summary": str(body.get("summary") or rules.get("summary") or "")[:600],
        "rules": rules,
        "source": {"manual": True, "log": log[-30:]},
    }
    save_brain(brain)
    return jsonify({"ok": True, "brain": brain})


PRESET_STRATEGY = {
    "name": "Top-Down Trendline S/R (4H Heiken Ashi)",
    "summary": "My strategy: top-down analysis first (daily trend sets the direction), then on 4H Heiken Ashi draw the trendline through swing points. Enter long when price breaks ABOVE the downtrend line after the line touched 2+ pivots and a pullback formed. Trail the stop along the trendline, no fixed TP. Mirrored for shorts.",
    "rules": {
        "name": "Top-Down Trendline S/R (4H Heiken Ashi)",
        "summary": "Top-down daily trend + 4H Heiken Ashi trendline break",
        "direction": "both", "timeframe": "4h", "heiken_ashi": True,
        "entry_conditions": [
            {"metric": "trendline_break_up", "op": ">", "value": 2, "for": "long", "note": "Close crossed ABOVE the downtrend line (2+ touches)"},
            {"metric": "pullback_pct", "op": ">", "value": 0.3, "for": "long", "note": "A pullback formed before the break"},
            {"metric": "trendline_break_down", "op": ">", "value": 2, "for": "short", "note": "Close crossed BELOW the uptrend line (2+ touches)"},
            {"metric": "pullback_low_pct", "op": ">", "value": 0.3, "for": "short", "note": "A pullback up formed before the break"}
        ],
        "filters": [
            {"metric": "htf_trend", "op": "up", "for": "long", "note": "Top-down: daily trend up for longs"},
            {"metric": "htf_trend", "op": "down", "for": "short", "note": "Top-down: daily trend down for shorts"}
        ],
        "exit": {"sl_pct": 1.5, "tp_pct": None, "atr_sl_mult": None, "atr_tp_mult": None,
                 "max_hold_bars": None, "trail_pct": 1.5},
        "notes": ["Trendlines fitted through last 3 swing pivots, validated by touch count",
                  "Top-down filter uses the daily trend (SMA5/SMA20)",
                  "Stop loss 1.5% below entry; trailing stop 1.5% lets the trend run (no fixed TP)"]
    },
    "source": {"preset": True,
               "log": [{"type": "preset", "label": "Loaded default: Top-Down Trendline S/R (4H Heiken Ashi)", "date": time.strftime("%Y-%m-%d")}]},
}


@bp.route("/api/strategy/brain/preset", methods=["POST"])
def brain_preset():
    save_brain(dict(PRESET_STRATEGY))
    return jsonify({"ok": True, "brain": PRESET_STRATEGY})


VALID_METRICS = {"close","open","high","low","rsi","sma","ema","atr","momentum_pct","body_pct",
                "trend","candle","breakout_high","breakout_low","swing_high_break","swing_low_break",
                "pullback_pct","pullback_low_pct","above_swing_high","below_swing_low","position_in_range",
                "htf_trend","trendline_break_up","trendline_break_down","price_vs_trendline","trendline_touches"}
STATE_METRICS = {"trend", "htf_trend", "candle"}
DEFAULTS = {"breakout_high": 24, "breakout_low": 24, "swing_high_break": 3, "swing_low_break": 3,
            "pullback_pct": 0.3, "pullback_low_pct": 0.3, "trendline_break_up": 2, "trendline_break_down": 2,
            "trendline_touches": 2, "above_swing_high": 1, "below_swing_low": 1}


def _infer_trend_op(note):
    n = (note or "").lower()
    if any(k in n for k in ("up", "bullish", "rise", "long", "above")):
        return "up"
    if any(k in n for k in ("down", "bearish", "fall", "short", "below")):
        return "down"
    return None


def repair_rules(rules):
    """Normalize a strategy's rules so malformed AI output can never zero-out a backtest."""
    changes = []
    for key in ("entry_conditions", "filters"):
        conds = rules.get(key) or []
        fixed = []
        for c in conds:
            if not isinstance(c, dict):
                changes.append(f"removed malformed rule ({key})")
                continue
            m = c.get("metric")
            if m not in VALID_METRICS:
                changes.append(f"removed unknown rule '{m}'")
                continue
            c = dict(c)
            op = c.get("op")
            if m in STATE_METRICS:
                if op not in ("up", "down", "flat"):
                    inf = _infer_trend_op(c.get("note"))
                    if inf:
                        changes.append(f"{m}: op '{op}' -> '{inf}' (from note)")
                        c["op"] = inf
                    else:
                        changes.append(f"{m}: invalid op '{op}' -> 'up'")
                        c["op"] = "up"
            elif op not in ("<", "<=", ">", ">=", "=="):
                changes.append(f"{m}: invalid op '{op}' -> '>'")
                c["op"] = ">"
            if m in DEFAULTS and c.get("value") in (None, ""):
                changes.append(f"{m}: missing value -> {DEFAULTS[m]}")
                c["value"] = DEFAULTS[m]
            fixed.append(c)
        rules[key] = fixed
    if rules.get("direction") not in ("long", "short", "both"):
        changes.append(f"direction '{rules.get('direction')}' -> 'both'")
        rules["direction"] = "both"
    if rules.get("timeframe") not in ("1h", "4h", "1d"):
        changes.append(f"timeframe '{rules.get('timeframe')}' -> '4h'")
        rules["timeframe"] = "4h"
    ex = rules.setdefault("exit", {})
    if not any(ex.get(k) for k in ("sl_pct", "atr_sl_mult", "tp_pct", "atr_tp_mult", "trail_pct", "max_hold_bars")):
        ex["sl_pct"] = 1.5
        ex["trail_pct"] = 1.5
        changes.append("empty exit plan -> SL 1.5% + trail 1.5%")
    return rules, changes


@bp.route("/api/strategy/brain/repair", methods=["POST"])
def brain_repair():
    existing = get_brain()
    if not existing or not existing.get("rules"):
        return jsonify({"ok": False, "error": "No strategy to repair — load or teach one first"}), 400
    rules = dict(existing["rules"])
    rules, changes = repair_rules(rules)
    existing["rules"] = rules
    if changes:
        notes = existing["rules"].setdefault("notes", [])
        notes.append("Auto-repaired: " + "; ".join(changes[:6]))
        save_brain(existing)
    return jsonify({"ok": True, "brain": existing, "changes": changes})


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
    video = body.get("video")  # {mime_type, data(base64)} — mp4 of the strategy
    has_video = bool(video and isinstance(video, dict) and video.get("data"))
    if has_video:
        v_mime = str(video.get("mime_type", "video/mp4"))
        if not v_mime.startswith("video/"):
            v_mime = "video/mp4"
        if len(str(video["data"])) > 30_000_000:  # ~22 MB binary
            return jsonify({"ok": False, "error": "Video is too large — keep it under ~20 MB (lower resolution or a shorter clip)."}), 400
    if not user_text and not yt_url and not images and not has_video:
        return jsonify({"ok": False, "error": "Explain your strategy, paste a YouTube link, upload screenshots, or upload a video"}), 400

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

    if has_video:
        video_block += ("\nThe trader also attached a video of their strategy (screen recording of "
                        "charts/trades). WATCH it carefully and extract the rules shown or explained in it, "
                        "combining with any text above. Note the timeframe, candle type, entry/exit and risk rules you see.")

    # --- merge mode: the trader may be ADDING to a strategy we already know ---
    existing = get_brain()
    existing_block = ""
    if existing and existing.get("rules"):
        keep = {k: existing["rules"].get(k) for k in
                ("name", "summary", "direction", "timeframe", "heiken_ashi",
                 "entry_conditions", "filters", "exit", "notes")}
        existing_block = ("The trader already has this strategy. Do NOT drop rules unless the new "
                          "material clearly contradicts them. UPDATE and ENRICH it with anything new "
                          "from the new material (new entries, filters, exits, risk rules, notes):\n"
                          + json.dumps(keep) + "\n")

    prompt = TEACH_PROMPT.format(user_text=user_text or ("(strategy taught from " + ("video" if has_video else "screenshots") + ")"),
                                 video_block=video_block, existing_block=existing_block)
    parts = [{"text": prompt}]
    for im in images:
        mime = str(im.get("mime_type", "image/png"))
        if not mime.startswith("image/"):
            mime = "image/png"
        parts.append({"inline_data": {"mime_type": mime, "data": str(im.get("data", ""))}})
    if has_video:
        parts.append({"inline_data": {"mime_type": v_mime, "data": str(video["data"])}})
    try:
        if len(parts) > 1:
            rules = gemini_call_parts(parts, max_tokens=4000, timeout=240 if has_video else 60)
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

    # safety net: never let a learned strategy end up with an empty exit plan
    ex = rules.setdefault("exit", {})
    if not any(ex.get(k) for k in ("sl_pct", "atr_sl_mult", "tp_pct", "atr_tp_mult", "trail_pct", "max_hold_bars")):
        ex["sl_pct"] = 1.5
        ex["trail_pct"] = 1.5
        notes = rules.setdefault("notes", [])
        if "Default exit applied: SL 1.5% + trailing stop 1.5% (no fixed TP)" not in notes:
            notes.append("Default exit applied: SL 1.5% + trailing stop 1.5% (no fixed TP)")

    log = list(((existing or {}).get("source") or {}).get("log", []))
    now = time.strftime("%Y-%m-%d")
    if user_text:
        log.append({"type": "text", "label": user_text[:100], "date": now})
    if yt_url:
        log.append({"type": "youtube", "label": yt_url[:100], "date": now})
    for _ in images:
        log.append({"type": "screenshot", "label": f"screenshot ({len(images)})", "date": now})
    if has_video:
        log.append({"type": "video", "label": str(video.get("name") or "uploaded")[:80], "date": now})
    log = log[-30:]

    brain = {
        "name": str(rules.get("name", "My strategy"))[:80],
        "summary": str(rules.get("summary", ""))[:600],
        "rules": rules,
        "source": {"text": user_text[:2000], "youtube": yt_url or None, "screenshots": len(images),
                   "video": (str(video.get("name") or "uploaded")[:80]) if has_video else None,
                   "log": log},
    }
    save_brain(brain)
    return jsonify({"ok": True, "brain": brain})


# ================================================================ backtest

def fetch_history(pair, interval="1h", months=3):
    """Fetch historical OHLC from Yahoo Finance. Returns list of bar dicts.
    4h bars are resampled from 1h data (Yahoo has no native 4h interval)."""
    from live import pair_to_symbol
    sym = pair_to_symbol(pair)
    if interval == "4h":
        months = min(months, 12)  # 4h needs lots of 1h data
        raw = fetch_history(pair, "1h", months)
        if len(raw) < 100:
            return raw
        bins = {}
        for b in raw:
            key = b["t"] - (b["t"] % 14400)  # 4h boundary
            if key not in bins:
                bins[key] = {"t": key, "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"], "n": 1}
            else:
                e = bins[key]
                e["h"] = max(e["h"], b["h"]); e["l"] = min(e["l"], b["l"])
                e["c"] = b["c"]; e["n"] += 1
        bars = []
        for key in sorted(bins):
            e = bins[key]
            if e["n"] < 3:
                continue
            bars.append({
                "t": e["t"], "o": e["o"], "h": e["h"], "l": e["l"], "c": e["c"],
                "date": time.strftime("%Y-%m-%d %H:%M", time.gmtime(e["t"])),
            })
        return bars
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


def heiken_ashi_transform(bars):
    """Convert OHLC bars to Heiken Ashi values (in place on copies)."""
    out = []
    prev = None
    for b in bars:
        ha_c = (b["o"] + b["h"] + b["l"] + b["c"]) / 4
        ha_o = (prev["o"] + prev["c"]) / 2 if prev else (b["o"] + b["c"]) / 2
        ha_h = max(b["h"], ha_o, ha_c)
        ha_l = min(b["l"], ha_o, ha_c)
        nb = dict(b)
        nb.update(o=ha_o, h=ha_h, l=ha_l, c=ha_c)
        out.append(nb)
        prev = nb
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


def _trend_match(op, t, cond, direction):
    """Robust trend comparison.

    - Normalizes invalid ops from the AI ("<" etc.) by inferring up/down from the note.
    - A filter tagged for: "long"/"short" gates only that direction.
    - An UNtagged trend filter is auto-directional: "up" gates longs only,
      "down" gates shorts only. This makes the AI's paired filters
      ("uptrend" + "downtrend") behave as complements instead of blocking all trades.
    """
    if op not in ("up", "down", "flat"):
        note = str(cond.get("note", "")).lower()
        if any(k in note for k in ("up", "bullish", "rise", "long")):
            op = "up"
        elif any(k in note for k in ("down", "bearish", "fall", "short")):
            op = "down"
        else:
            return None  # cannot infer — surface as untestable, don't block everything
    f = cond.get("for")
    # a filter that doesn't apply to this direction is SKIPPED (True), never blocks
    if f == "long":
        return True if direction != "long" else t == op
    if f == "short":
        return True if direction != "short" else t == op
    if direction == "long":
        if op == "up":
            return t == "up"
        if op == "down":
            return True  # a "down" filter doesn't gate longs
        return t == op
    if direction == "short":
        if op == "down":
            return t == "down"
        if op == "up":
            return True  # an "up" filter doesn't gate shorts
        return t == op
    return t == op


def cond_holds(cond, b, direction=None):
    """direction: 'long'|'short'|None — enables per-direction filter logic."""
    m = cond.get("metric", "close")
    op = cond.get("op", ">")
    v = cond.get("value")
    if direction is not None and cond.get("for") and cond.get("for") != direction:
        return True  # condition is for the other direction — skip it
    if m == "htf_trend":
        t = b.get("htf_trend", "flat")
        return _trend_match(op, t, cond, direction)
    if m == "trendline_break_up":
        # close crosses ABOVE the downtrend line (fitted through swing highs)
        line = b.get("_tl_high"); prev_line = b.get("_tl_high_prev")
        prev = b.get("_prev_close")
        touches = b.get("_tl_high_touches", 0)
        need = int(v) if v not in (None, "") else 2
        if line is None or prev_line is None or prev is None:
            return None
        crossed = b["c"] > line and prev <= prev_line
        return bool(crossed and touches >= need)
    if m == "trendline_break_down":
        line = b.get("_tl_low"); prev_line = b.get("_tl_low_prev")
        prev = b.get("_prev_close")
        touches = b.get("_tl_low_touches", 0)
        need = int(v) if v not in (None, "") else 2
        if line is None or prev_line is None or prev is None:
            return None
        crossed = b["c"] < line and prev >= prev_line
        return bool(crossed and touches >= need)
    if m == "price_vs_trendline":
        line = b.get("_tl_low") if (b.get("htf_trend") or b.get("sma5", 0) >= b.get("sma20", 1)) else b.get("_tl_high")
        if not line:
            return None
        pct = (b["c"] - line) / max(line, 1e-9) * 100
        vv = float(v) if v not in (None, "") else 0
        return pct > vv if op in (">", ">=") else pct < vv
    if m == "trendline_touches":
        line = b.get("_tl_low") if (b.get("htf_trend") or b.get("sma5", 0) >= b.get("sma20", 1)) else b.get("_tl_high")
        if line is None:
            return None
        touches = b.get("_tl_low_touches", 0) if line == b.get("_tl_low") else b.get("_tl_high_touches", 0)
        vv = int(v) if v not in (None, "") else 2
        return touches >= vv if op in (">", ">=") else touches < vv
    if m == "trend":
        t = "up" if (b.get("sma5") and b.get("sma20") and b["sma5"] > b["sma20"]) else ("down" if (b.get("sma5") and b.get("sma20") and b["sma5"] < b["sma20"]) else "flat")
        return _trend_match(op, t, cond, direction)
    if m == "candle":
        return ("up" if b["c"] >= b["o"] else "down") == op
    if m == "swing_high_break":
        sh = b.get("_sw_high")
        return bool(sh and b["c"] > sh)
    if m == "swing_low_break":
        sl = b.get("_sw_low")
        return bool(sl and b["c"] < sl)
    if m == "pullback_pct":
        sh = b.get("_sw_high")
        pull_low = b.get("_sw_high_low")
        if not sh or pull_low is None:
            return None
        # pullback = deepest low since the swing high (stays valid after breakout)
        val = (sh - pull_low) / sh * 100
        vv = float(v) if v not in (None, "") else 0
        return val > vv if op in (">", ">=") else val < vv
    if m == "pullback_low_pct":
        sl = b.get("_sw_low")
        pull_high = b.get("_sw_low_high")
        if not sl or pull_high is None:
            return None
        val = (pull_high - sl) / sl * 100
        vv = float(v) if v not in (None, "") else 0
        return val > vv if op in (">", ">=") else val < vv
    if m == "above_swing_high":
        sh = b.get("_sw_high")
        want = 1 if (v is None or float(v or 0) == 1) else 0
        return (1 if (sh and b["c"] > sh) else 0) == want
    if m == "below_swing_low":
        sl = b.get("_sw_low")
        want = 1 if (v is None or float(v or 0) == 1) else 0
        return (1 if (sl and b["c"] < sl) else 0) == want
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
        return None  # untestable rule — surfaced to the user, does not block other rules
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


def _fit_line(pts, i):
    """Least-squares line through pivot points [(i, price)...] evaluated at bar i."""
    if not pts:
        return None
    n = len(pts)
    if n == 1:
        return pts[0][1]
    sx = sum(p[0] for p in pts); sy = sum(p[1] for p in pts)
    sxy = sum(p[0] * p[1] for p in pts); sxx = sum(p[0] * p[0] for p in pts)
    denom = n * sxx - sx * sx
    if abs(denom) < 1e-9:
        return sy / n
    slope = (n * sxy - sx * sy) / denom
    inter = (sy - slope * sx) / n
    return inter + slope * i


def _line_touches(pts, line_val, price, tol=0.002):
    """How many of the last pivots lie within tol (0.2%) of the line value at their index."""
    if not line_val:
        return 0
    n = 0
    for (pi, pp) in pts:
        lv = _fit_line([(x[0], x[1]) for x in pts if x[0] <= pi], pi)
        if lv and abs(pp - lv) / max(pp, 1e-9) <= tol:
            n += 1
    return n


def run_backtest(bars, rules, spread_pct=0.02, htf_trends=None):
    rules = rules or {}
    entry = [c for c in (rules.get("entry_conditions") or []) if isinstance(c, dict)]
    filters = [c for c in (rules.get("filters") or []) if isinstance(c, dict)]
    ex = rules.get("exit") or {}
    direction = rules.get("direction", "both")

    highs = [b["h"] for b in bars]
    lows = [b["l"] for b in bars]
    untestable = set()
    last_sh = last_sl = None
    last_sh_low = None
    last_sl_high = None
    sh_pts = []   # [(i, price)] swing high pivots (for downtrend line)
    sl_pts = []   # [(i, price)] swing low pivots (for uptrend line)
    prev_close = None
    for i, b in enumerate(bars):
        b["_i"] = i
        b["_hi"] = highs
        b["_lo"] = lows
        # fractal swing highs/lows (window 1)
        if 1 <= i < len(bars) - 1:
            if b["h"] >= bars[i - 1]["h"] and b["h"] >= bars[i + 1]["h"]:
                last_sh = b["h"]
                last_sh_low = b["l"]
                sh_pts.append((i, b["h"]))
                sh_pts = sh_pts[-6:]
            if b["l"] <= bars[i - 1]["l"] and b["l"] <= bars[i + 1]["l"]:
                last_sl = b["l"]
                last_sl_high = b["h"]
                sl_pts.append((i, b["l"]))
                sl_pts = sl_pts[-6:]
        if last_sh is not None and last_sh_low is not None:
            last_sh_low = min(last_sh_low, b["l"])
        if last_sl is not None and last_sl_high is not None:
            last_sl_high = max(last_sl_high, b["h"])
        b["_sw_high"] = last_sh
        b["_sw_high_low"] = last_sh_low
        b["_sw_low"] = last_sl
        b["_sw_low_high"] = last_sl_high
        # fitted trendlines through the last 3 pivots
        b["_tl_high"] = _fit_line(sh_pts[-3:], i)   # downtrend resistance line
        b["_tl_low"] = _fit_line(sl_pts[-3:], i)    # uptrend support line
        b["_tl_high_prev"] = _fit_line(sh_pts[-3:], i - 1)
        b["_tl_low_prev"] = _fit_line(sl_pts[-3:], i - 1)
        b["_tl_high_touches"] = _line_touches(sh_pts[-3:], b["_tl_high"], b["c"])
        b["_tl_low_touches"] = _line_touches(sl_pts[-3:], b["_tl_low"], b["c"])
        b["_prev_close"] = prev_close
        # top-down: higher-timeframe trend state
        if htf_trends:
            b["htf_trend"] = htf_trends.get(i, "flat")
        prev_close = b["c"]

    def conds_ok(conds, b, direction=None):
        nonlocal untestable
        ok = True
        for c in conds:
            r = cond_holds(c, b, direction)
            if r is None:
                untestable.add(str(c.get("metric", "?")))
                continue
            ok = ok and r
        return ok

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
            if conds_ok(entry, b, d) and conds_ok(filters, b, d):
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
    return {"trades": trades, "stats": stats, "equity": curve, "untestable": sorted(untestable)}


@bp.route("/api/strategy/backtest", methods=["POST"])
def backtest_route():
    body = request.get_json(force=True) or {}
    brain = get_brain()
    if not brain or not brain.get("rules"):
        return jsonify({"ok": False, "error": "Teach your strategy first (Brain tab)"}), 400
    pair = str(body.get("pair", "EUR/USD")).strip().upper()
    tf = body.get("timeframe")
    tf = tf if tf in ("1h", "4h", "1d") else "1h"
    months = min(24, max(1, int(body.get("months", 3) or 3)))
    if tf == "4h":
        months = min(months, 12)
    try:
        bars = fetch_history(pair, tf, months)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not fetch {pair} history: {str(e)[:120]}"}), 502
    if len(bars) < 80:
        return jsonify({"ok": False, "error": f"Not enough historical data for {pair} ({len(bars)} bars)"}), 400

    # top-down analysis: higher-timeframe trend state for every lower bar
    htf_trends = None
    try:
        htf_tf = "1d" if tf in ("1h", "4h") else "1w"
        htf_bars = fetch_history(pair, htf_tf, min(months, 24))
        htf_bars = enrich(htf_bars)
        states = []
        for hb in htf_bars:
            t = "up" if (hb.get("sma5") and hb.get("sma20") and hb["sma5"] > hb["sma20"]) else (
                "down" if (hb.get("sma5") and hb.get("sma20") and hb["sma5"] < hb["sma20"]) else "flat")
            states.append((hb["t"], t))
        idx = 0
        htf_trends = {}
        for i, b in enumerate(bars):
            while idx < len(states) - 1 and states[idx + 1][0] <= b["t"]:
                idx += 1
            htf_trends[i] = states[idx][1] if states else "flat"
    except Exception:
        htf_trends = None

    rules, rep_changes = repair_rules(dict(brain.get("rules", {})))
    if brain["rules"].get("heiken_ashi"):
        bars = heiken_ashi_transform(bars)
    bars = enrich(bars)
    result = run_backtest(bars, rules, htf_trends=htf_trends)
    return jsonify({"ok": True, "pair": pair, "timeframe": tf, "months": months,
                    "bars": len(bars), "heikenAshi": bool(rules.get("heiken_ashi")),
                    "repaired": rep_changes, **result})


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
