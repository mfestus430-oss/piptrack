"""
PipTrack — Forex Trading Journal
A self-hosted trading progress tracker: trades, stats, analytics, goals, journal,
strategy coach and live market monitor (real-time prices + Gemini AI + alerts).

Run:  python3 server.py   (then open http://localhost:8000)
"""

import csv
import io
import json
import os
from datetime import datetime

from flask import Flask, Response, jsonify, request, send_from_directory

from storage import get_db, query_db, exec_db, kv_get, kv_set

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # allow strategy video uploads (mp4 ~20MB base64)


# ---------------------------------------------------------------- database

# ------------------------------------------------------------------ routes

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---- trades --------------------------------------------------------------

@app.route("/api/trades", methods=["GET"])
def list_trades():
    rows = query_db("SELECT * FROM trades ORDER BY ts DESC, id DESC")
    return jsonify({"trades": [row_to_dict(r) for r in rows]})


def row_to_dict(row):
    return dict(row)


def _clean_trade(payload):
    t = {
        "ts": str(payload.get("ts", "")).strip() or datetime.now().isoformat(timespec="minutes"),
        "pair": str(payload.get("pair", "")).strip().upper() or "EUR/USD",
        "direction": "long" if str(payload.get("direction", "")).lower() == "long" else "short",
        "lot": _f(payload.get("lot")),
        "entry": _f(payload.get("entry")),
        "exit_p": _f(payload.get("exit_p")),
        "sl": _f(payload.get("sl")),
        "tp": _f(payload.get("tp")),
        "pips": _f(payload.get("pips")),
        "pnl": _f(payload.get("pnl")),
        "fee": _f(payload.get("fee")),
        "strategy": str(payload.get("strategy", "")).strip(),
        "setup": str(payload.get("setup", "")).strip(),
        "session": str(payload.get("session", "")).strip(),
        "rating": _i(payload.get("rating")),
        "risk": _f(payload.get("risk")),
        "r": _f(payload.get("r")),
        "notes": str(payload.get("notes", "")).strip(),
    }
    return t


def _f(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _i(v):
    try:
        if v is None or v == "":
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


def _insert_trade(db, t):
    from storage import is_postgres
    suffix = " RETURNING id" if is_postgres() else ""
    cur = db.execute(
        """INSERT INTO trades
           (ts,pair,direction,lot,entry,exit_p,sl,tp,pips,pnl,fee,
            strategy,setup,session,rating,risk,r,notes,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""" + suffix,
        (
            t["ts"], t["pair"], t["direction"], t["lot"], t["entry"], t["exit_p"],
            t["sl"], t["tp"], t["pips"], t["pnl"], t["fee"], t["strategy"],
            t["setup"], t["session"], t["rating"], t["risk"], t["r"], t["notes"],
            datetime.now().isoformat(timespec="seconds"),
        ),
    )
    if is_postgres():
        row = cur.fetchone()
        return row["id"] if row else None
    return cur.lastrowid


@app.route("/api/trades", methods=["POST"])
def create_trade():
    t = _clean_trade(request.get_json(force=True) or {})
    conn = get_db()
    try:
        t["id"] = _insert_trade(conn, t)
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True, "trade": t}), 201


@app.route("/api/trades/<int:tid>", methods=["PUT"])
def update_trade(tid):
    t = _clean_trade(request.get_json(force=True) or {})
    cur = exec_db(
        """UPDATE trades SET
           ts=?,pair=?,direction=?,lot=?,entry=?,exit_p=?,sl=?,tp=?,pips=?,
           pnl=?,fee=?,strategy=?,setup=?,session=?,rating=?,risk=?,r=?,notes=?
           WHERE id=?""",
        (
            t["ts"], t["pair"], t["direction"], t["lot"], t["entry"], t["exit_p"],
            t["sl"], t["tp"], t["pips"], t["pnl"], t["fee"], t["strategy"],
            t["setup"], t["session"], t["rating"], t["risk"], t["r"], t["notes"], tid,
        ),
    )
    if cur.rowcount == 0:
        return jsonify({"ok": False, "error": "Trade not found"}), 404
    return jsonify({"ok": True, "trade": {**t, "id": tid}})


@app.route("/api/trades/<int:tid>", methods=["DELETE"])
def delete_trade(tid):
    cur = exec_db("DELETE FROM trades WHERE id=?", (tid,))
    if cur.rowcount == 0:
        return jsonify({"ok": False, "error": "Trade not found"}), 404
    return jsonify({"ok": True})


# ---- state (goals / settings / journal notes) ----------------------------

@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(
        {
            "goals": kv_get("goals", {}),
            "settings": kv_get("settings", {}),
            "notes": kv_get("notes", []),
        }
    )


@app.route("/api/state", methods=["PUT"])
def put_state():
    body = request.get_json(force=True) or {}
    if "goals" in body:
        kv_set("goals", body.get("goals") or {})
    if "settings" in body:
        kv_set("settings", body.get("settings") or {})
    if "notes" in body:
        kv_set("notes", body.get("notes") or [])
    return jsonify({"ok": True})


# ---- strategy coach (profile + signal history) ---------------------------

@app.route("/api/coach", methods=["GET"])
def get_coach():
    coach = kv_get("coach", {})
    return jsonify({
        "profile": coach.get("profile", {}),
        "signals": coach.get("signals", []),
        "prefs": coach.get("prefs", {}),
    })


@app.route("/api/coach", methods=["PUT"])
def put_coach():
    body = request.get_json(force=True) or {}
    coach = kv_get("coach", {}) or {}
    if "profile" in body:
        coach["profile"] = body.get("profile") or {}
    if "signals" in body:
        coach["signals"] = body.get("signals") or []
    if "prefs" in body:
        coach["prefs"] = body.get("prefs") or {}
    kv_set("coach", coach)
    return jsonify({"ok": True, "coach": coach})


# ---- export / import -----------------------------------------------------

@app.route("/api/export")
def export_json():
    rows = query_db("SELECT * FROM trades ORDER BY ts ASC, id ASC")
    payload = {
        "app": "piptrack",
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "trades": [row_to_dict(r) for r in rows],
        "goals": kv_get("goals", {}),
        "settings": kv_get("settings", {}),
        "notes": kv_get("notes", []),
        "coach": kv_get("coach", {}),
    }
    return Response(
        json.dumps(payload, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": 'attachment; filename="piptrack-backup.json"'},
    )


@app.route("/api/import", methods=["POST"])
def import_json():
    body = request.get_json(force=True) or {}
    trades = body.get("trades")
    if trades is None:
        return jsonify({"ok": False, "error": "No trades key in payload"}), 400
    conn = get_db()
    try:
        conn.execute("DELETE FROM trades")
        n = 0
        for raw in trades:
            t = _clean_trade(raw)
            if not t["ts"] or not t["pair"]:
                continue
            _insert_trade(conn, t)
            n += 1
        for key in ("goals", "settings", "notes", "coach"):
            if key in body:
                conn.execute(
                    "INSERT INTO kv(key,value) VALUES(?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (key, json.dumps(body.get(key) or ([] if key == "notes" else {}))),
                )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True, "imported": n})


@app.route("/api/csv")
def export_csv():
    rows = query_db("SELECT * FROM trades ORDER BY ts DESC, id DESC")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "date", "pair", "direction", "lot", "entry", "exit", "sl", "tp",
            "pips", "pnl", "fee", "strategy", "setup", "session", "rating",
            "risk", "r", "notes",
        ]
    )
    for r in rows:
        w.writerow(
            [
                r["ts"], r["pair"], r["direction"], r["lot"], r["entry"], r["exit_p"],
                r["sl"], r["tp"], r["pips"], r["pnl"], r["fee"], r["strategy"],
                r["setup"], r["session"], r["rating"], r["risk"], r["r"], r["notes"],
            ]
        )
    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": 'attachment; filename="piptrack-trades.csv"'},
    )


# -------------------------------------------------------------------------

# live monitor blueprint (real-time prices + Gemini AI + alerts)
import live  # noqa: E402
app.register_blueprint(live.bp)

# strategy brain blueprint (teach + backtest + telegram notifications)
import brain  # noqa: E402
app.register_blueprint(brain.bp)

if __name__ == "__main__":
    print("PipTrack running at http://0.0.0.0:8000")
    app.run(host="0.0.0.0", port=8000, debug=False)
