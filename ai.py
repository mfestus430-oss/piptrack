"""Shared AI helpers: Gemini API calls, config.json access, Telegram notifications."""

import json
import os
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "data", "config.json")

DEFAULT_MODEL = "gemini-3.6-flash"


# ---------------------------------------------------------------- config

def load_config():
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)


def gemini_key():
    env = os.environ.get("GEMINI_API_KEY", "").strip()
    if env:
        return env
    return load_config().get("gemini_key", "").strip()


def gemini_model():
    return os.environ.get("GEMINI_MODEL") or load_config().get("gemini_model") or DEFAULT_MODEL


# ---------------------------------------------------------------- gemini

def gemini_call(prompt, max_tokens=3000, temperature=0.2, thinking_budget=1):
    """Call Gemini with the user's key and a text prompt. Returns parsed JSON dict."""
    return gemini_call_parts([{"text": prompt}], max_tokens, temperature, thinking_budget)


def gemini_call_parts(parts, max_tokens=3000, temperature=0.2, thinking_budget=1):
    """Call Gemini with mixed parts (text + inline_data images). Returns parsed JSON dict.

    If PIPTRACK_MOCK_AI=1 is set, returns canned responses (for offline testing).
    """
    if os.environ.get("PIPTRACK_MOCK_AI") == "1":
        text = " ".join(str(p.get("text", "")) for p in parts)[:200]
        return _mock_response(text)
    key = gemini_key()
    if not key:
        raise ValueError("No Gemini API key configured — add it in Settings → Gemini AI")
    model = gemini_model()

    body = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "thinkingConfig": {"thinkingBudget": thinking_budget},
        },
    }).encode()

    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           + urllib.parse.quote(model) + ":generateContent?key=" + urllib.parse.quote(key))
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read().decode()).get("error", {}).get("message", "")
        except Exception:
            pass
        raise ValueError(f"Gemini HTTP {e.code}: {detail[:180]}")

    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)
    except Exception:
        raise ValueError("Gemini returned unparsable output")


def _mock_response(prompt):
    if "trading strategist" in prompt:
        return {
            "name": "London Range Breakout",
            "summary": "Wait for the London open range (first hour) to form, then enter long on a breakout above the range high with a strong bullish candle, only when the daily trend is up. Stop below the range low, target 2x the range.",
            "direction": "long",
            "timeframe": "1h",
            "entry_conditions": [
                {"metric": "breakout_high", "op": ">", "value": 24, "note": "price breaks above recent range high"},
                {"metric": "candle", "op": "up", "value": None, "note": "strong bullish candle"},
            ],
            "filters": [
                {"metric": "trend", "op": "up", "value": None, "note": "only with the daily trend"},
            ],
            "exit": {"sl_pct": 0.4, "tp_pct": 0.8, "atr_sl_mult": None, "atr_tp_mult": None,
                     "max_hold_bars": 24, "trail_pct": None},
            "notes": ["Max 1 trade per day"],
        }
    if "trading copilot" in prompt:
        return [
            {"pair": "EUR/USD", "direction": "long", "strength": 62, "action": "wait",
             "entryNote": None, "exitNote": None, "reason": "Range-bound — waiting for a confirmed breakout above resistance."},
            {"pair": "GBP/USD", "direction": "none", "strength": 30, "action": "wait",
             "entryNote": None, "exitNote": None, "reason": "No clear setup aligned with the strategy."},
            {"pair": "XAU/USD", "direction": "short", "strength": 71, "action": "enter",
             "entryNote": "Wait for a pullback toward the range high", "exitNote": None,
             "reason": "Bearish momentum with trend confirmation — valid setup."},
        ]
    if "Backtest results" in prompt:
        return {
            "verdict": "weak",
            "summary": "The backtest shows the strategy is currently unprofitable on EUR/USD 1h. It needs a tighter edge filter and better risk/reward.",
            "strengths": ["Disciplined, mechanical rules are fully testable", "Clear exit plan reduces discretionary decisions"],
            "weaknesses": ["Win rate below 40% with a profit factor under 1.0", "No volatility filter — trades fire in quiet ranges", "Holding periods vary widely"],
            "suggestions": [
                {"change": "Add an ATR filter (e.g. only trade when ATR > 20-bar average)", "why": "Avoids low-volatility chop where the breakout stalls"},
                {"change": "Raise the take-profit to 2.5x the stop distance", "why": "Improves expectancy when win rate is below 50%"},
                {"change": "Require 2 consecutive closes beyond the range high", "why": "Filters false breakouts"},
            ],
        }
    return {"direction": "none", "strength": 20, "action": "wait", "reason": "mock"}


# ---------------------------------------------------------------- telegram

def discord_config():
    # Environment variable takes priority (Render setup), then in-app saved value.
    env = os.environ.get("DISCORD_WEBHOOK", "").strip()
    if env:
        return {"webhook": env, "source": "env"}
    cfg = load_config()
    return {"webhook": str(cfg.get("discord_webhook", "")).strip(), "source": "app"}


def send_discord(text):
    """Send a message to a Discord channel via webhook. Returns (ok, error)."""
    w = discord_config()
    if not w["webhook"]:
        return False, "Discord webhook not configured"
    body = json.dumps({"content": text[:1900]}).encode()
    # Discord/Cloudflare blocks bare "Python-urllib" signatures (error 1010) —
    # send a browser-like User-Agent so the message is accepted.
    req = urllib.request.Request(w["webhook"], data=body, headers={
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        return True, None
    except urllib.error.HTTPError as e:
        return False, f"Discord HTTP {e.code}"
    except Exception as e:
        return False, str(e)


def telegram_config():
    cfg = load_config()
    token = os.environ.get("TELEGRAM_TOKEN") or cfg.get("telegram_token", "")
    chat = os.environ.get("TELEGRAM_CHAT_ID") or cfg.get("telegram_chat_id", "")
    env_on = os.environ.get("TELEGRAM_ENABLED")
    enabled = (env_on == "1" or env_on == "true") if env_on is not None else bool(cfg.get("telegram_enabled", False))
    return {
        "token": str(token).strip(),
        "chat_id": str(chat).strip(),
        "enabled": enabled,
    }


def send_telegram(text):
    """Send a message via Telegram bot. Returns (ok: bool, error: str|None)."""
    t = telegram_config()
    if not t["token"] or not t["chat_id"]:
        return False, "Telegram not configured"
    if not t["enabled"]:
        return False, "Telegram alerts disabled"
    url = "https://api.telegram.org/bot" + t["token"] + "/sendMessage"
    data = urllib.parse.urlencode({"chat_id": t["chat_id"], "text": text[:4000]}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        return True, None
    except urllib.error.HTTPError as e:
        return False, f"Telegram HTTP {e.code}"
    except Exception as e:
        return False, str(e)
