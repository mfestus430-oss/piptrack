/* PipTrack — main application */

/* ============================ constants ============================ */
const INSTRUMENTS = {
  "EUR/USD": 0.0001, "GBP/USD": 0.0001, "USD/JPY": 0.01, "USD/CHF": 0.0001,
  "AUD/USD": 0.0001, "NZD/USD": 0.0001, "USD/CAD": 0.0001,
  "EUR/GBP": 0.0001, "EUR/JPY": 0.01, "GBP/JPY": 0.01, "AUD/JPY": 0.01,
  "EUR/CHF": 0.0001, "EUR/AUD": 0.0001, "EUR/NZD": 0.0001, "GBP/AUD": 0.0001,
  "GBP/CAD": 0.0001, "CAD/JPY": 0.01, "CHF/JPY": 0.01, "AUD/CAD": 0.0001,
  "NZD/JPY": 0.01, "GBP/NZD": 0.0001, "CAD/CHF": 0.0001, "AUD/NZD": 0.0001,
  "XAU/USD": 0.1, "XAG/USD": 0.01,
};

const FX_RE = /^([A-Z]{3})\/([A-Z]{3})$/;

const CUR_SYM = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", NGN: "₦", GHS: "₵", ZAR: "R", AUD: "A$" };

const STRATEGIES = ["Breakout", "Trend Pullback", "Support / Resistance", "News Reversal", "Order Block", "ICT / SMC", "Scalping", "Swing"];

const VIEW_TITLES = {
  dashboard: ["Dashboard", "Your trading performance at a glance"],
  trades: ["Trades", "Every trade, logged and searchable"],
  analytics: ["Analytics", "Find your edge: by pair, strategy, session and time"],
  goals: ["Goals", "Set targets and track your progress"],
  journal: ["Journal", "Notes, lessons and trade psychology"],
  coach: ["Strategy Coach", "Enter your strategy once — then drop screenshots for instant verdicts"],
  brain: ["Strategy Brain", "Teach your strategy, backtest it, prove it works"],
  live: ["Live Monitor", "Real-time prices, AI verdicts and enter/exit alerts"],
  settings: ["Settings", "Account, data and preferences"],
};

/* ============================ helpers ============================ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtMoney(v, o) {
  o = o || {};
  if (v == null || isNaN(v)) return "—";
  const sym = CUR_SYM[state.settings.currency] || "$";
  const dec = state.settings.currency === "JPY" ? 0 : (o.dec != null ? o.dec : 2);
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const sign = o.sign === false ? "" : (v > 0 ? "+" : v < 0 ? "-" : "");
  return sign + sym + abs;
}
function fmtMoneyAbs(v) { return fmtMoney(v, { sign: false }); }
function fmtCompact(v) {
  if (v == null || isNaN(v)) return "—";
  const sym = CUR_SYM[state.settings.currency] || "$";
  const a = Math.abs(v);
  if (a >= 1e6) return sym + (a / 1e6).toFixed(1) + "m";
  if (a >= 1e4) return sym + (a / 1e3).toFixed(1) + "k";
  if (a >= 1e3) return sym + (a / 1e3).toFixed(2) + "k";
  return sym + a.toFixed(0);
}
function fmtNum(v, d) { return v == null || isNaN(v) ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d == null ? 2 : d }); }
function fmtPct(v, d) { return v == null || isNaN(v) ? "—" : (v * 100).toFixed(d == null ? 1 : d) + "%"; }
function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDateShort(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function monthKey(ts) { return String(ts).slice(0, 7); }
function monthLabel(key) {
  const d = new Date(key + "-15T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function sessionForHour(h) {
  if (h >= 21 || h < 4) return "Sydney";
  if (h < 9) return "Tokyo";
  if (h < 17) return "London";
  return "New York";
}
function pnlClass(v) { return v > 0 ? "pnl-pos" : v < 0 ? "pnl-neg" : "pnl-flat"; }
function resultBadge(pnl) {
  if (pnl > 0) return '<span class="badge win">WIN</span>';
  if (pnl < 0) return '<span class="badge loss">LOSS</span>';
  return '<span class="badge be">BE</span>';
}
function ratingStars(r) {
  r = r || 0;
  let s = "";
  for (let i = 1; i <= 5; i++) s += i <= r ? "★" : '<span class="off">★</span>';
  return s;
}
function pipSizeFor(pair, custom) {
  if (custom != null && custom > 0) return custom;
  return INSTRUMENTS[pair] || null;
}
function parsePair(pair) {
  const m = String(pair).match(FX_RE);
  return m ? { base: m[1], quote: m[2] } : null;
}
/* contract size in units per standard lot (FX = 100k, gold = 100 oz, silver = 5,000 oz) */
function unitsPerLot(pair) {
  if (pair === "XAU/USD") return 100;
  if (pair === "XAG/USD") return 5000;
  return 100000;
}
/* auto P&L: returns {usd:number|null, quote:number, auto:boolean} */
function autoPnl(pair, direction, lot, entry, exit, customPip) {
  if (!pair || !lot || !entry || !exit) return { usd: null, quote: null, auto: false };
  const dir = direction === "short" ? -1 : 1;
  const pip = pipSizeFor(pair, customPip);
  if (!pip) return { usd: null, quote: null, auto: false };
  const parts = parsePair(pair);
  const quote = (exit - entry) * dir * unitsPerLot(pair) * lot;
  if (!parts) return { usd: null, quote: quote, auto: false };
  if (parts.quote === "USD") return { usd: quote, quote: quote, auto: true };
  if (parts.base === "USD") return { usd: quote / entry, quote: quote, auto: true };
  return { usd: null, quote: quote, auto: false };
}

/* ============================ state & api ============================ */
const state = {
  trades: [],
  goals: {},
  settings: {},
  notes: [],
  coach: { profile: {}, signals: [] },
  brain: null,
  live: { data: null, lastAlertId: 0, lastAlertTs: 0 },
  lastAnalysis: null,
  view: "dashboard",
  filters: { q: "", pair: "", dir: "", result: "", strategy: "", session: "", from: "", to: "" },
  editId: null,
  sortAsc: false,
};

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
const getJSON = (u) => api(u);
const postJSON = (u, body) => api(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const putJSON = (u, body) => api(u, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const delJSON = (u) => api(u, { method: "DELETE" });

async function loadAll() {
  const [t, s, c, b] = await Promise.all([
    getJSON("/api/trades"), getJSON("/api/state"), getJSON("/api/coach"), getJSON("/api/strategy/brain"),
  ]);
  state.trades = t.trades || [];
  state.goals = s.goals || {};
  state.settings = s.settings || {};
  state.notes = s.notes || [];
  state.coach = { profile: c.profile || {}, signals: c.signals || [], prefs: c.prefs || {} };
  state.brain = (b && b.brain) || null;
  normalizeSettings();
  normalizeCoach();
  renderAll();
}
function normalizeCoach() {
  state.coach.profile = Object.assign({}, COACH_DEFAULTS, state.coach.profile || {});
  state.coach.prefs = Object.assign({ lastPair: "", lastDir: "auto", lastSession: "" }, state.coach.prefs || {});
  if (!Array.isArray(state.coach.profile.sessions)) state.coach.profile.sessions = [];
  if (!Array.isArray(state.coach.signals)) state.coach.signals = [];
  state.coach.signals.forEach((s) => { if (!s.tsMs && s.ts) s.tsMs = Date.parse(s.ts); });
}
function normalizeSettings() {
  state.settings.currency = state.settings.currency || "USD";
  state.settings.balance = state.settings.balance || 0;
  state.settings.defaultLot = state.settings.defaultLot || 0.1;
  state.settings.defaultStrategy = state.settings.defaultStrategy || "";
}
function saveSettingsPatch(patch) {
  Object.assign(state.settings, patch);
  return putJSON("/api/state", { settings: state.settings });
}

/* ============================ stats ============================ */
function computeStats(trades) {
  /* open positions (no exit yet) are excluded from performance stats */
  const openCount = trades.filter((t) => t.pnl == null).length;
  trades = trades.filter((t) => t.pnl != null);
  const sorted = trades.slice().sort((a, b) => (a.ts === b.ts ? (a.id || 0) - (b.id || 0) : a.ts < b.ts ? -1 : 1));
  const st = {
    n: trades.length, wins: 0, losses: 0, be: 0, net: 0, grossWin: 0, grossLoss: 0,
    pips: 0, sumR: 0, nR: 0, ratingSum: 0, ratingN: 0,
    best: null, worst: null, equity: [], maxDD: 0,
    byPair: {}, byStrategy: {}, bySession: {}, byDay: {}, byHour: Array(24).fill(0).map(() => ({ n: 0, net: 0, wins: 0 })),
    byMonth: {}, curMonth: { net: 0, n: 0 },
    holding: [],
  };
  const balance0 = Number(state.settings.balance) || 0;
  let cum = balance0, peak = balance0, dd = 0;
  let lastWin = null, curStreak = 0, longestW = 0, longestL = 0, curW = 0, curL = 0;

  const monthNow = todayKey();

  sorted.forEach((t) => {
    const pnl = t.pnl || 0;
    const win = pnl > 0, loss = pnl < 0;
    st.net += pnl;
    st.pips += t.pips || 0;
    if (win) { st.wins++; st.grossWin += pnl; }
    else if (loss) { st.losses++; st.grossLoss += -pnl; }
    else st.be++;
    if (win && pnl > (st.best == null ? -Infinity : st.best)) st.best = pnl;
    if (loss && pnl < (st.worst == null ? Infinity : st.worst)) st.worst = pnl;
    if (t.r != null && isFinite(t.r)) { st.sumR += t.r; st.nR++; }
    if (t.rating) { st.ratingSum += t.rating; st.ratingN++; }

    cum += pnl;
    peak = Math.max(peak, cum);
    dd = Math.max(dd, peak - cum);
    st.equity.push({ x: new Date(t.ts), y: Math.round(cum * 100) / 100 });

    /* streaks */
    const isWin = win;
    if (isWin) { curStreak = curStreak >= 0 ? curStreak + 1 : 1; curW++; curL = 0; longestW = Math.max(longestW, curW); }
    else if (loss) { curStreak = curStreak <= 0 ? curStreak - 1 : -1; curL++; curW = 0; longestL = Math.max(longestL, curL); }
    else { curStreak = 0; curW = 0; curL = 0; }

    /* groupings */
    const agg = (map, key) => {
      if (!map[key]) map[key] = { n: 0, net: 0, wins: 0, pips: 0 };
      const g = map[key];
      g.n++; g.net += pnl; g.pips += t.pips || 0; if (win) g.wins++;
      return g;
    };
    agg(st.byPair, t.pair || "?");
    agg(st.byStrategy, t.strategy || "—");
    agg(st.bySession, t.session || "—");
    const dow = new Date(t.ts).getDay();
    agg(st.byDay, dow);
    const hr = new Date(t.ts).getHours();
    st.byHour[hr].n++; st.byHour[hr].net += pnl; if (win) st.byHour[hr].wins++;
    const mk = monthKey(t.ts);
    const mg = agg(st.byMonth, mk);
    if (mk === monthNow) { st.curMonth.net += pnl; st.curMonth.n++; }
  });

  st.maxDD = dd;
  st.curStreak = curStreak;
  st.longestW = longestW;
  st.longestL = longestL;
  st.winRate = st.n ? st.wins / st.n : 0;
  st.avgWin = st.wins ? st.grossWin / st.wins : 0;
  st.avgLoss = st.losses ? -st.grossLoss / st.losses : 0;
  st.profitFactor = st.grossLoss > 0 ? st.grossWin / st.grossLoss : (st.grossWin > 0 ? Infinity : 0);
  st.expectancy = st.n ? st.net / st.n : 0;
  st.avgR = st.nR ? st.sumR / st.nR : 0;
  st.discipline = st.ratingN ? st.ratingSum / st.ratingN : 0;
  st.balance = balance0 + st.net;
  st.returnPct = balance0 > 0 ? st.net / balance0 : 0;
  st.openCount = openCount;
  return st;
}

function filteredTrades() {
  const f = state.filters;
  return state.trades.filter((t) => {
    if (f.q) {
      const hay = [t.pair, t.strategy, t.setup, t.notes, t.session].join(" ").toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    if (f.pair && t.pair !== f.pair) return false;
    if (f.dir && t.direction !== f.dir) return false;
    if (f.result === "win" && !(t.pnl > 0)) return false;
    if (f.result === "loss" && !(t.pnl < 0)) return false;
    if (f.result === "be" && t.pnl !== 0 && !(t.pnl == null)) return false;
    if (f.result === "be" && t.pnl == null) return false;
    if (f.strategy && t.strategy !== f.strategy) return false;
    if (f.session && t.session !== f.session) return false;
    if (f.from && t.ts && t.ts.slice(0, 10) < f.from) return false;
    if (f.to && t.ts && t.ts.slice(0, 10) > f.to) return false;
    return true;
  });
}

/* ============================ toasts & dialogs ============================ */
function toast(msg, type) {
  const root = $("#toastRoot");
  const el = document.createElement("div");
  el.className = "toast " + (type || "ok");
  el.innerHTML = '<span class="t-dot"></span>' + esc(msg);
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function confirmDialog(title, msg, okLabel, danger) {
  return new Promise((resolve) => {
    const box = $("#modalBox");
    box.innerHTML = `
      <div class="modal-head"><h2>${esc(title)}</h2><button class="close-x" data-c="no">✕</button></div>
      <div class="modal-body"><p style="color:var(--muted);font-size:13.5px">${msg}</p></div>
      <div class="modal-foot">
        <button class="btn ghost" data-c="no">Cancel</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-c="yes">${esc(okLabel || "Confirm")}</button>
      </div>`;
    showModal();
    const done = (v) => { hideModal(); resolve(v); };
    box.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => done(b.dataset.c === "yes")));
  });
}

function showModal() { $("#modalOverlay").classList.remove("hidden"); document.body.style.overflow = "hidden"; }
function hideModal() { $("#modalOverlay").classList.add("hidden"); document.body.style.overflow = ""; }

/* ============================ navigation ============================ */
function switchView(view) {
  state.view = view;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + view));
  $("#pageTitle").textContent = VIEW_TITLES[view][0];
  $("#pageSub").textContent = VIEW_TITLES[view][1];
  if (view === "analytics") requestAnimationFrame(drawAnalyticsCharts);
  if (view === "live") refreshLive(); /* always fresh when entering */
  renderView(view);
  window.scrollTo({ top: 0 });
}

function renderAll() {
  renderSidebarFoot();
  renderView(state.view);
}

function renderView(view) {
  if (view === "dashboard") renderDashboard();
  else if (view === "trades") renderTrades();
  else if (view === "analytics") renderAnalytics();
  else if (view === "goals") renderGoals();
  else if (view === "journal") renderJournal();
  else if (view === "coach") renderCoach();
  else if (view === "brain") renderBrain();
  else if (view === "live") renderLive();
  else if (view === "settings") renderSettings();
}

/* ============================ dashboard ============================ */
function renderDashboard() {
  const st = computeStats(state.trades);
  const empty = !state.trades.length;
  $("#dashEmpty").innerHTML = empty ? emptyStateHTML() : "";
  $("#dashBody").classList.toggle("hidden", empty);

  if (empty) return;

  /* KPI cards */
  const balance0 = Number(state.settings.balance) || 0;
  const kpis = [
    { l: "Account balance", v: fmtMoney(st.balance), cls: st.net >= 0 ? "up" : "down", s: balance0 ? `${fmtPct(st.returnPct, 2)} return` : "starting " + fmtMoneyAbs(balance0) },
    { l: "Net P&L", v: fmtMoney(st.net), cls: st.net >= 0 ? "up" : "down", s: "across " + st.n + " trades" },
    { l: "Win rate", v: fmtPct(st.winRate), cls: st.winRate >= 0.5 ? "up" : "down", s: `${st.wins}W / ${st.losses}L / ${st.be}BE` },
    { l: "Profit factor", v: st.profitFactor === Infinity ? "∞" : fmtNum(st.profitFactor), cls: st.profitFactor >= 1 ? "up" : "down", s: "gross win / gross loss" },
    { l: "Expectancy", v: fmtMoney(st.expectancy), cls: st.expectancy >= 0 ? "up" : "down", s: "avg $ per trade" },
    { l: "Max drawdown", v: "-" + fmtMoneyAbs(st.maxDD), cls: st.maxDD > 0 ? "down" : "flat", s: "peak to trough" },
    { l: "Avg win", v: fmtMoney(st.avgWin), cls: "up", s: "avg loss " + fmtMoney(st.avgLoss) },
    { l: "Total pips", v: fmtNum(st.pips, 1), cls: st.pips >= 0 ? "up" : "down", s: st.nR ? `avg R ${fmtNum(st.avgR)}` : "no risk set" },
    { l: "Current streak", v: st.curStreak > 0 ? st.curStreak + "W" : st.curStreak < 0 ? -st.curStreak + "L" : "—", cls: st.curStreak > 0 ? "up" : st.curStreak < 0 ? "down" : "flat", s: `best ${st.longestW}W · worst ${st.longestL}L` },
    { l: "Best trade", v: fmtMoney(st.best), cls: "up", s: "worst " + fmtMoney(st.worst) },
    { l: "Discipline", v: st.discipline ? fmtNum(st.discipline, 1) + " / 5" : "—", cls: st.discipline >= 4 ? "up" : st.discipline >= 3 ? "flat" : "down", s: "avg self-rating" },
    { l: "This month", v: fmtMoney(st.curMonth.net), cls: st.curMonth.net >= 0 ? "up" : "down", s: st.curMonth.n + " trades" },
  ];
  $("#kpiGrid").innerHTML = kpis.map((k) => `
    <div class="kpi">
      <div class="k-label">${k.l}</div>
      <div class="k-value ${k.cls}">${k.v}</div>
      <div class="k-sub">${esc(k.s)}</div>
    </div>`).join("");

  /* equity chip */
  const eqChip = $("#eqChip");
  eqChip.textContent = st.net >= 0 ? `+${fmtMoneyAbs(st.net)} all-time` : `-${fmtMoneyAbs(st.net)} all-time`;
  eqChip.className = "chip " + (st.net >= 0 ? "green" : "red");

  /* charts */
  requestAnimationFrame(() => {
    drawLineChart($("#equityChart"), st.equity, {
      yFmt: fmtCompact,
      xFmt: (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      color: st.net >= 0 ? "#22c55e" : "#38bdf8",
      fill: true,
    });
    const parts = [
      { value: st.wins, color: "#22c55e", label: "Wins" },
      { value: st.losses, color: "#ef4444", label: "Losses" },
    ];
    if (st.be > 0) parts.push({ value: st.be, color: "#475569", label: "BE" });
    drawDonut($("#donutChart"), parts, { centerV: fmtPct(st.winRate, 0), centerL: "win rate" });
    $("#donutLegend").innerHTML = parts.map((p) => `
      <div class="dl-row"><span class="dl-dot" style="background:${p.color}"></span>
      <span class="dl-name">${p.label}</span><span class="dl-val">${p.value}</span>
      <span class="dl-pct">${fmtPct(p.value / Math.max(1, st.n), 0)}</span></div>`).join("");
    const months = Object.keys(st.byMonth).sort();
    drawBarChart($("#monthlyChart"), months.map((m) => ({ label: monthLabel(m), value: Math.round((st.byMonth[m].net || 0) * 100) / 100 })), {
      yFmt: fmtCompact,
      valFmt: fmtMoney,
    });
  });

  /* recent trades */
  const recent = state.trades.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 8);
  $("#recentTable").innerHTML = tradesTableHTML(recent, false);
  $$("#recentTable [data-act]").forEach((b) => b.addEventListener("click", onRowAction));
}

function emptyStateHTML() {
  return `
  <div class="card">
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/><circle cx="19" cy="6" r="1.4"/>
      </svg>
      <h3>Welcome to PipTrack</h3>
      <p>Log your first trade to start tracking your win rate, equity curve, drawdown and everything else — or load demo data to explore the app.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button class="btn primary" id="emptyAdd">+ Log your first trade</button>
        <button class="btn ghost" id="emptyDemo">Load demo data</button>
      </div>
    </div>
  </div>`;
}

/* ============================ trades table ============================ */
function tradesTableHTML(trades, withActions) {
  if (!trades.length) {
    return '<div class="empty" style="padding:26px"><p>No trades match.</p></div>';
  }
  const rows = trades.map((t) => {
    const pnl = t.pnl;
    const r = t.r != null && isFinite(t.r) ? fmtNum(t.r) : "—";
    const isOpen = t.exit_p == null || t.pnl == null;
    return `
    <tr class="${isOpen ? "row-open" : ""}">
      <td class="mono">${esc(fmtDate(t.ts))}</td>
      <td><span class="pair-tag">${esc(t.pair)}</span> ${isOpen ? '<span class="badge be">OPEN</span>' : ""}</td>
      <td><span class="badge ${t.direction === "long" ? "long" : "short"}">${t.direction.toUpperCase()}</span></td>
      <td class="num">${fmtNum(t.lot)}</td>
      <td class="num">${t.entry != null ? fmtNum(t.entry, 5) : "—"}</td>
      <td class="num">${t.exit_p != null ? fmtNum(t.exit_p, 5) : '<span class="open-tag">— open —</span>'}</td>
      <td class="num ${pnlClass(t.pips)}">${t.pips != null ? fmtNum(t.pips, 1) : "—"}</td>
      <td class="num ${pnlClass(pnl)}">${pnl != null ? fmtMoney(pnl) : "—"} ${resultBadge(pnl)}</td>
      <td class="num">${r}</td>
      <td>${esc(t.strategy || "—")}</td>
      <td>${esc(t.session || "—")}</td>
      <td><span class="rating-stars">${ratingStars(t.rating)}</span></td>
      ${withActions ? `
      <td>
        <div class="row-actions">
          ${t.notes ? '<span title="Has notes" style="color:var(--accent);font-size:12px">📝</span>' : ""}
          <button class="icon-btn" data-act="edit" data-id="${t.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="icon-btn del" data-act="del" data-id="${t.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>` : ""}
    </tr>`;
  }).join("");
  return `
  <table class="tbl">
    <thead><tr>
      <th>Date</th><th>Pair</th><th>Dir</th><th class="th-num">Lots</th><th class="th-num">Entry</th>
      <th class="th-num">Exit</th><th class="th-num">Pips</th><th class="th-num">P&L</th><th class="th-num">R</th>
      <th>Strategy</th><th>Session</th><th>★</th>
      ${withActions ? "<th></th>" : ""}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function onRowAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.act === "edit") openTradeModal(id);
  if (btn.dataset.act === "del") {
    const t = state.trades.find((x) => x.id === id);
    const ok = await confirmDialog("Delete trade", `Delete ${esc(t ? t.pair : "")} on ${esc(t ? fmtDate(t.ts) : "")}? This cannot be undone.`, "Delete", true);
    if (!ok) return;
    await delJSON("/api/trades/" + id);
    state.trades = state.trades.filter((x) => x.id !== id);
    await unlinkSignalFromTrade(id);
    toast("Trade deleted");
    renderAll();
  }
}

/* ============================ trades view ============================ */
function renderTrades() {
  const list = filteredTrades().slice().sort((a, b) => (a.ts === b.ts ? (b.id || 0) - (a.id || 0) : a.ts < b.ts ? 1 : -1));
  $("#tradesCount").textContent = list.length;
  const st = computeStats(list);
  $("#filterSummary").innerHTML = list.length
    ? `Net <b class="${pnlClass(st.net)}">${fmtMoney(st.net)}</b> · win rate <b>${fmtPct(st.winRate)}</b> · PF <b>${st.profitFactor === Infinity ? "∞" : fmtNum(st.profitFactor)}</b>`
    : "";
  $("#tradesTable").innerHTML = tradesTableHTML(list, true);
  $$("#tradesTable [data-act]").forEach((b) => b.addEventListener("click", onRowAction));

  /* populate filter dropdowns from data */
  const pairs = [...new Set(state.trades.map((t) => t.pair))].sort();
  const strategies = [...new Set(state.trades.map((t) => t.strategy).filter(Boolean))].sort();
  fillSelect($("#fPair"), pairs, state.filters.pair, "All pairs");
  fillSelect($("#fStrategy"), strategies, state.filters.strategy, "All strategies");
  const fmap = { fDirection: "dir", fResult: "result", fSession: "session" };
  Object.keys(fmap).forEach((id) => { $(`#${id}`).value = state.filters[fmap[id]] || ""; });
  $("#fSearch").value = state.filters.q;
  $("#fFrom").value = state.filters.from;
  $("#fTo").value = state.filters.to;
}

function fillSelect(sel, options, current, placeholder) {
  const cur = sel.value;
  sel.innerHTML = '<option value="">' + esc(placeholder || "") + "</option>" +
    options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
  sel.value = current || cur || "";
}

/* ============================ trade modal ============================ */
function openTradeModal(id, prefill) {
  state.editId = id;
  prefill = prefill || null;
  const t = id ? state.trades.find((x) => x.id === id) : null;
  const settings = state.settings;
  const dataPairs = [...new Set(state.trades.map((x) => x.pair))];
  const allPairs = [...new Set([...Object.keys(INSTRUMENTS), ...dataPairs])].sort();
  /* order: preferred pair first, then the standard instrument list, then others */
  const preferred = (t && t.pair) || (prefill && prefill.pair) || (state.trades.length ? state.trades[0].pair : "EUR/USD");
  const orderedPairs = [preferred, ...allPairs.filter((p) => p !== preferred)];
  const pairOpts = orderedPairs.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  const customPair = t && !INSTRUMENTS[t.pair] && !allPairs.includes(t.pair);

  const box = $("#modalBox");
  box.innerHTML = `
  <div class="modal-head">
    <h2>${id ? "Edit trade" : "New trade"}</h2>
    <button class="close-x" id="mClose">✕</button>
  </div>
  <div class="modal-body">
    <div class="form-grid">
      <label class="field">
        <span>Date &amp; time</span>
        <input type="datetime-local" class="input" id="mTs" value="${esc(t ? t.ts.slice(0, 16) : nowLocalInput())}">
      </label>
      <label class="field">
        <span>Pair / instrument</span>
        <select class="input" id="mPair">${pairOpts}</select>
      </label>
      <label class="field">
        <span>Direction</span>
        <select class="input" id="mDir">
          <option value="long" ${t && t.direction === "short" ? "" : "selected"}>Long (buy)</option>
          <option value="short" ${t && t.direction === "short" ? "selected" : ""}>Short (sell)</option>
        </select>
      </label>
      <label class="field">
        <span>Lot size</span>
        <input type="number" class="input" id="mLot" step="0.01" min="0" value="${t && t.lot != null ? t.lot : settings.defaultLot || 0.1}">
      </label>
      <label class="field">
        <span>Entry price</span>
        <input type="number" class="input" id="mEntry" step="any" value="${t && t.entry != null ? t.entry : ""}" placeholder="1.08750">
      </label>
      <label class="field">
        <span>Exit price</span>
        <input type="number" class="input" id="mExit" step="any" value="${t && t.exit_p != null ? t.exit_p : ""}" placeholder="1.09250">
      </label>
      <label class="field" style="justify-content:flex-end">
        <span>&nbsp;</span>
        <label class="check-line"><input type="checkbox" id="mOpen" ${t && t.exit_p == null ? "checked" : ""}> <b>Position still open</b> — monitor live for exit alerts</label>
      </label>
      <label class="field">
        <span>Stop loss</span>
        <input type="number" class="input" id="mSl" step="any" value="${t && t.sl != null ? t.sl : ""}" placeholder="optional">
      </label>
      <label class="field">
        <span>Take profit</span>
        <input type="number" class="input" id="mTp" step="any" value="${t && t.tp != null ? t.tp : ""}" placeholder="optional">
      </label>
      <label class="field">
        <span>Commission / spread fee ($)</span>
        <input type="number" class="input" id="mFee" step="any" min="0" value="${t && t.fee != null ? t.fee : ""}" placeholder="0.00">
      </label>
      <label class="field">
        <span>P&L in ${state.settings.currency} (net)</span>
        <input type="number" class="input" id="mPnl" step="any" value="${t && t.pnl != null ? t.pnl : ""}" placeholder="auto-calculated">
      </label>
      <div class="field full">
        <div class="calc-preview" id="calcPreview"></div>
        <div class="auto-hint" id="calcHint"></div>
      </div>
      <label class="field">
        <span>Risk ($) — optional, for R-multiple</span>
        <input type="number" class="input" id="mRisk" step="any" min="0" value="${t && t.risk != null ? t.risk : ""}" placeholder="100.00">
      </label>
      <label class="field">
        <span>Session</span>
        <select class="input" id="mSession">
          <option value="Sydney">Sydney</option><option value="Tokyo">Tokyo</option>
          <option value="London">London</option><option value="New York">New York</option>
        </select>
      </label>
      <label class="field">
        <span>Strategy</span>
        <input type="text" class="input" id="mStrategy" list="strategyList" value="${esc(t ? t.strategy || "" : settings.defaultStrategy || "")}" placeholder="e.g. Breakout">
      </label>
      <label class="field">
        <span>Setup / pattern</span>
        <input type="text" class="input" id="mSetup" value="${esc(t ? t.setup || "" : "")}" placeholder="e.g. double top, 4H trendline">
      </label>
      <label class="field">
        <span>Trade quality (self-rating)</span>
        <div class="stars-input" id="mStars">
          ${[1, 2, 3, 4, 5].map((i) => `<span data-s="${i}">★</span>`).join("")}
        </div>
      </label>
      <label class="field full">
        <span>Notes</span>
        <textarea class="input" id="mNotes" rows="3" placeholder="What was your plan? What did you learn?">${esc(t ? t.notes || "" : "")}</textarea>
      </label>
    </div>
  </div>
  <div class="modal-foot">
    <button class="btn ghost" id="mCancel">Cancel</button>
    <button class="btn primary" id="mSave">${id ? "Save changes" : "Add trade"}</button>
  </div>`;

  /* star rating */
  let rating = t ? t.rating || 0 : 0;
  const stars = $$("#mStars span");
  const paintStars = (n) => stars.forEach((s) => s.classList.toggle("on", Number(s.dataset.s) <= n));
  paintStars(rating);
  stars.forEach((s) => {
    s.addEventListener("mouseenter", () => stars.forEach((x) => x.classList.toggle("hover", Number(x.dataset.s) <= Number(s.dataset.s))));
    s.addEventListener("mouseleave", () => stars.forEach((x) => x.classList.remove("hover")));
    s.addEventListener("click", () => { rating = Number(s.dataset.s) === rating ? 0 : Number(s.dataset.s); paintStars(rating); });
  });

  /* session auto-detect */
  $("#mTs").addEventListener("change", () => {
    const h = new Date($("#mTs").value).getHours();
    if (!isNaN(h)) $("#mSession").value = sessionForHour(h);
  });
  if (t && t.session) $("#mSession").value = t.session;

  /* apply signal prefill (Log as trade from the coach) */
  if (prefill) {
    if (prefill.pair) {
      let found = false;
      $$("#mPair option").forEach((o) => { if (o.value === prefill.pair) found = true; });
      if (!found) $("#mPair").insertAdjacentHTML("afterbegin", `<option value="${esc(prefill.pair)}">${esc(prefill.pair)}</option>`);
      $("#mPair").value = prefill.pair;
    }
    if (prefill.direction) $("#mDir").value = prefill.direction;
    if (prefill.session) $("#mSession").value = prefill.session;
    if (prefill.risk) $("#mRisk").value = prefill.risk;
    if (prefill.strategy) $("#mStrategy").value = prefill.strategy;
  }

  updateCalcPreview();
  ["mPair", "mDir", "mLot", "mEntry", "mExit", "mFee", "mRisk"].forEach((id) => $(`#${id}`).addEventListener("input", updateCalcPreview));

  /* position-still-open toggle */
  const mOpen = $("#mOpen");
  const mExit = $("#mExit");
  const mPnl = $("#mPnl");
  const syncOpenState = () => {
    const open = mOpen.checked;
    mExit.disabled = open;
    mPnl.disabled = open;
    mExit.classList.toggle("dim-input", open);
    mPnl.classList.toggle("dim-input", open);
    if (open) {
      mExit.value = "";
      mPnl.value = "";
      $("#calcHint").textContent = "Open position — entry/SL/TP logged; exit & P&L added when the trade closes. The Live monitor will alert you to exit.";
    } else {
      $("#calcHint").textContent = "";
      updateCalcPreview();
    }
  };
  mOpen.addEventListener("change", syncOpenState);
  syncOpenState();

  showModal();
  $("#mClose").addEventListener("click", hideModal);
  $("#mCancel").addEventListener("click", hideModal);
  $("#modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") hideModal(); }, { once: true });
  $("#mSave").addEventListener("click", async () => {
    const data = collectTradeForm(rating);
    if (!data) return;
    try {
      if (id) {
        const r = await putJSON("/api/trades/" + id, data);
        const idx = state.trades.findIndex((x) => x.id === id);
        if (idx >= 0) state.trades[idx] = r.trade;
        /* keep linked signals in sync with the edited trade */
        let ch = false;
        state.coach.signals.forEach((s) => {
          if (s.tradeId === id) {
            s.tradePnl = r.trade.pnl;
            s.outcome = r.trade.pnl > 0 ? "won" : r.trade.pnl < 0 ? "lost" : "skipped";
            ch = true;
          }
        });
        if (ch) await putJSON("/api/coach", { signals: state.coach.signals });
        toast("Trade updated");
      } else {
        const r = await postJSON("/api/trades", data);
        state.trades.unshift(r.trade);
        if (prefill && prefill.signalId) await syncSignalFromTrade(prefill.signalId, r.trade);
        toast("Trade added" + (prefill && prefill.signalId ? " — signal outcome auto-updated" : ""));
      }
      hideModal();
      renderAll();
    } catch (err) {
      toast("Save failed: " + err.message, "err");
    }
  });
}

function updateCalcPreview() {
  const pair = $("#mPair").value;
  const dir = $("#mDir").value;
  const lot = parseFloat($("#mLot").value);
  const entry = parseFloat($("#mEntry").value);
  const exit = parseFloat($("#mExit").value);
  const fee = parseFloat($("#mFee").value) || 0;
  const risk = parseFloat($("#mRisk").value) || 0;

  let html = "";
  const pip = pipSizeFor(pair, null);
  if (pair && pip) {
    html += `<span class="calc-chip">pip: <b>${pip}</b></span>`;
  }
  if (entry && exit && lot) {
    const dirSign = dir === "short" ? -1 : 1;
    const pips = ((exit - entry) / pip) * dirSign;
    const a = autoPnl(pair, dir, lot, entry, exit, null);
    html += `<span class="calc-chip">pips: <b class="${pnlClass(pips)}">${fmtNum(pips, 1)}</b></span>`;
    if (a.usd != null) {
      const net = a.usd - fee;
      html += `<span class="calc-chip">est. P&L: <b class="${pnlClass(net)}">${fmtMoney(net)}</b></span>`;
      if (risk > 0) html += `<span class="calc-chip">R: <b>${fmtNum(net / risk)}</b></span>`;
      $("#mPnl").placeholder = "e.g. " + Math.round(net * 100) / 100;
    } else {
      const netQ = a.quote - fee;
      html += `<span class="calc-chip">P&L in quote ccy: <b class="${pnlClass(netQ)}">${fmtNum(netQ)}</b></span>`;
      $("#mPnl").placeholder = "enter manually";
    }
  } else {
    $("#mPnl").placeholder = "auto-calculated";
  }
  $("#calcPreview").innerHTML = html;
  const a2 = autoPnl(pair, dir, lot, entry, exit, null);
  if (a2 && a2.auto) {
    $("#calcHint").innerHTML = "P&L auto-calculated from prices and lots (net of fee). You can still type your own number.";
  } else if (a2 && a2.usd == null && entry && exit && lot) {
    $("#calcHint").innerHTML = "Non-USD quote pair — enter the P&L in your account currency manually (shown in quote currency below).";
  } else {
    $("#calcHint").innerHTML = "";
  }
}

function collectTradeForm(rating) {
  const pair = $("#mPair").value.trim().toUpperCase();
  const dir = $("#mDir").value;
  const lot = parseFloat($("#mLot").value);
  const entry = parseFloat($("#mEntry").value);
  const exit = parseFloat($("#mExit").value);
  const fee = parseFloat($("#mFee").value) || 0;
  const risk = parseFloat($("#mRisk").value) || null;
  const isOpen = $("#mOpen").checked;

  if (!pair) { toast("Please enter a pair", "err"); return null; }
  if (!lot || lot <= 0) { toast("Lot size must be greater than 0", "err"); return null; }
  if (!entry || entry <= 0) { toast("Entry price is required", "err"); return null; }

  if (isOpen) {
    return {
      ts: $("#mTs").value || nowLocalInput(),
      pair, direction: dir, lot,
      entry: entry, exit_p: null,
      sl: parseFloat($("#mSl").value) || null,
      tp: parseFloat($("#mTp").value) || null,
      pips: null, pnl: null, fee,
      strategy: $("#mStrategy").value.trim(),
      setup: $("#mSetup").value.trim(),
      session: $("#mSession").value,
      rating: rating || null,
      risk: risk || null,
      r: null,
      notes: $("#mNotes").value.trim(),
    };
  }

  if (!exit || exit <= 0) { toast("Enter the exit price (or tick 'Position still open')", "err"); return null; }

  const pip = pipSizeFor(pair, null);
  const pips = pip ? ((exit - entry) / pip) * (dir === "short" ? -1 : 1) : null;
  const a = autoPnl(pair, dir, lot, entry, exit, null);
  let pnl = parseFloat($("#mPnl").value);
  if (pnl == null || isNaN(pnl)) {
    pnl = a.usd != null ? a.usd - fee : null;
  }
  if (pnl == null) { toast("Enter the P&L in " + state.settings.currency + " manually for this instrument", "err"); return null; }
  pnl = Math.round(pnl * 100) / 100;

  return {
    ts: $("#mTs").value || nowLocalInput(),
    pair, direction: dir, lot,
    entry: entry, exit_p: exit,
    sl: parseFloat($("#mSl").value) || null,
    tp: parseFloat($("#mTp").value) || null,
    pips: pips != null ? Math.round(pips * 10) / 10 : null,
    pnl, fee,
    strategy: $("#mStrategy").value.trim(),
    setup: $("#mSetup").value.trim(),
    session: $("#mSession").value,
    rating: rating || null,
    risk: risk || null,
    r: risk ? Math.round((pnl / risk) * 100) / 100 : null,
    notes: $("#mNotes").value.trim(),
  };
}

/* ============================ analytics ============================ */
function anaListHTML(map, titleKey, sortKey) {
  const keys = Object.keys(map).sort((x, y) => map[y][sortKey] - map[x][sortKey]);
  if (!keys.length) return '<p class="hint">No data yet.</p>';
  const maxAbs = Math.max(1, ...keys.map((k) => Math.abs(map[k].net)));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return keys.map((k) => {
    const g = map[k];
    const name = titleKey === "day" ? dayNames[Number(k)] : k;
    const winRate = g.n ? g.wins / g.n : 0;
    const w = Math.max(3, (Math.abs(g.net) / maxAbs) * 100);
    return `
    <div class="ana-row">
      <div class="ar-top">
        <span class="ar-name">${esc(name)} <span class="ar-meta">· ${g.n} trades · ${fmtPct(winRate, 0)} win rate</span></span>
        <span class="ar-pnl ${pnlClass(g.net)}">${fmtMoney(g.net)}</span>
      </div>
      <div class="ar-bar ${g.net >= 0 ? "pos" : "neg"}"><div style="width:${w}%"></div></div>
    </div>`;
  }).join("");
}

function renderAnalytics() {
  const st = computeStats(state.trades);
  if (!state.trades.length) {
    $$("#view-analytics .grid2, #view-analytics > .card").forEach((el) => el.classList.add("hidden"));
    let emptyEl = $("#anaEmpty");
    if (!emptyEl) {
      emptyEl = document.createElement("div");
      emptyEl.className = "card";
      emptyEl.id = "anaEmpty";
      $("#view-analytics").prepend(emptyEl);
    }
    emptyEl.innerHTML = '<div class="empty"><h3>No analytics yet</h3><p>Add trades or load demo data to see your performance breakdowns.</p></div>';
    return;
  }
  const stale = $("#anaEmpty");
  if (stale) stale.remove();
  $$("#view-analytics .grid2, #view-analytics > .card").forEach((el) => el.classList.remove("hidden"));

  $("#anaByPair").innerHTML = anaListHTML(st.byPair, "pair", "net");
  $("#anaByStrategy").innerHTML = anaListHTML(st.byStrategy, "strategy", "net");
  $("#anaBySession").innerHTML = anaListHTML(st.bySession, "session", "net");
  $("#anaByDay").innerHTML = anaListHTML(st.byDay, "day", "net");

  /* monthly table */
  const months = Object.keys(st.byMonth).sort();
  let cum = Number(state.settings.balance) || 0;
  const mrows = months.map((m) => {
    const g = st.byMonth[m];
    cum += g.net;
    const wr = g.n ? g.wins / g.n : 0;
    return `<tr>
      <td><b>${esc(monthLabel(m))}</b></td>
      <td class="num">${g.n}</td>
      <td class="num">${fmtPct(wr, 0)}</td>
      <td class="num ${pnlClass(g.net)}">${fmtMoney(g.net)}</td>
      <td class="num ${pnlClass(cum)}">${fmtMoney(cum)}</td>
    </tr>`;
  }).join("");
  $("#monthlyTable").innerHTML = months.length ? `
    <table class="tbl">
      <thead><tr><th>Month</th><th class="th-num">Trades</th><th class="th-num">Win rate</th><th class="th-num">Net P&L</th><th class="th-num">Balance</th></tr></thead>
      <tbody>${mrows}</tbody>
    </table>` : '<div class="empty"><p>No trades yet.</p></div>';

  requestAnimationFrame(drawAnalyticsCharts);
}

function drawAnalyticsCharts() {
  const st = computeStats(state.trades);
  if (!state.trades.length) return;
  /* by hour */
  const hours = st.byHour.map((g, h) => ({ label: h % 4 === 0 ? h + "h" : "", value: Math.round(g.net * 100) / 100 }));
  drawBarChart($("#hourChart"), hours, {
    yFmt: fmtCompact, valFmt: fmtMoney, padL: 46,
  });
  /* histogram */
  const vals = state.trades.map((t) => t.pnl).filter((v) => v != null && isFinite(v));
  const hist = makeHistogram(vals);
  drawBarChart($("#histChart"), hist.items, { yFmt: (v) => v.toFixed(0), valFmt: (v) => v + " trades", padL: 34 });
  /* winrate by month */
  const months = Object.keys(st.byMonth).sort();
  drawBarChart($("#winrateChart"), months.map((m) => ({ label: monthLabel(m), value: Math.round((st.byMonth[m].n ? (st.byMonth[m].wins / st.byMonth[m].n) * 100 : 0) * 10) / 10 })), {
    yMin: 0, yMax: 100, yFmt: (v) => v + "%", valFmt: (v) => v + "%", padL: 34,
    color: "#38bdf8",
  });
}

function makeHistogram(vals) {
  if (!vals.length) return { items: [] };
  const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (lo === hi) return { items: [{ label: fmtCompact(lo), value: vals.length }] };
  const bins = 10;
  const w = (hi - lo) / bins;
  const counts = Array(bins).fill(0);
  vals.forEach((v) => {
    let i = Math.floor((v - lo) / w);
    if (i >= bins) i = bins - 1;
    if (i < 0) i = 0;
    counts[i]++;
  });
  const items = counts.map((c, i) => ({
    label: fmtCompact(lo + i * w),
    value: c,
  }));
  return { items };
}

/* ============================ goals ============================ */
function renderGoals() {
  const st = computeStats(state.trades);
  const g = state.goals;
  const mk = todayKey();
  const monthNet = st.curMonth.net;
  const monthCount = st.curMonth.n;

  const cards = [];
  const pnlTarget = Number(g.monthlyPnl) || 0;
  if (pnlTarget) {
    const p = Math.min(1, Math.max(0, monthNet / pnlTarget));
    cards.push(goalCard("blue", "profit", "Monthly P&L target", fmtMoney(monthNet) + " / " + fmtMoneyAbs(pnlTarget),
      p >= 1 ? "Target reached 🎉" : `${fmtPct(p, 0)} of target this month`, p, p >= 1 ? "done" : "blue"));
  }
  const tradesTarget = Number(g.monthlyTrades) || 0;
  if (tradesTarget) {
    const p = Math.min(1, Math.max(0, monthCount / tradesTarget));
    cards.push(goalCard("green", "swap", "Trades this month", monthCount + " / " + tradesTarget,
      p >= 1 ? "Target reached 🎉" : `${monthCount} logged of ${tradesTarget}`, p, p >= 1 ? "done" : "green"));
  }
  const wrTarget = Number(g.winRate) || 0;
  if (wrTarget) {
    const p = Math.min(1, Math.max(0, st.winRate / (wrTarget / 100)));
    cards.push(goalCard("amber", "percent", "Win rate target", fmtPct(st.winRate, 1) + " / " + wrTarget + "%",
      p >= 1 ? "Target reached 🎉" : `${fmtPct(st.winRate, 1)} vs ${wrTarget}% goal`, p, p >= 1 ? "done" : "amber"));
  }
  const disTarget = Number(g.discipline) || 0;
  if (disTarget) {
    const p = Math.min(1, Math.max(0, (st.discipline || 0) / disTarget));
    cards.push(goalCard("red", "star", "Discipline target", (st.discipline ? fmtNum(st.discipline, 1) : "—") + " / " + disTarget,
      p >= 1 ? "Target reached 🎉" : `avg self-rating vs ${disTarget} goal`, p, p >= 1 ? "done" : "red"));
  }

  $("#goalsGrid").innerHTML = cards.join("") || "";
  $("#goalsEmpty").classList.toggle("hidden", cards.length > 0);
  $("#goalsEmptyInner").innerHTML = cards.length ? "" : `
    <div class="empty">
      <h3>No goals set yet</h3>
      <p>Set monthly P&L, trade count, win rate and discipline targets to track your progress.</p>
      <button class="btn primary" id="btnEditGoals">Set goals</button>
    </div>`;
  const editBtn = $("#btnEditGoals");
  if (editBtn) editBtn.addEventListener("click", openGoalsModal);

  /* month summary strip */
  if (state.trades.length) {
    const strip = document.createElement("div");
    strip.className = "card";
    strip.style.marginTop = "-4px";
    strip.innerHTML = `
      <div class="card-head"><h3>${esc(new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }))} summary</h3></div>
      <div class="kpi-grid" style="margin-bottom:0">
        ${[
          { l: "Net P&L", v: fmtMoney(monthNet), c: pnlClass(monthNet) },
          { l: "Trades", v: monthCount, c: "flat" },
          { l: "Win rate", v: st.curMonth.n ? fmtPct(st.curMonth.n ? (st.byMonth[mk] ? st.byMonth[mk].wins / st.curMonth.n : 0) : 0) : "—", c: "flat" },
        ].map((k) => `<div class="kpi"><div class="k-label">${k.l}</div><div class="k-value ${k.c}">${k.v}</div></div>`).join("")}
      </div>`;
    const old = $("#monthStrip");
    if (old) old.remove();
    strip.id = "monthStrip";
    $("#view-goals").appendChild(strip);
  } else {
    const old = $("#monthStrip");
    if (old) old.remove();
  }
}

function goalCard(color, icon, title, value, sub, pct, state2) {
  return `
  <div class="goal-card">
    <div class="g-head">
      <span class="g-title">${esc(title)}</span>
      <span class="g-icon ${color}">${iconSVG(icon)}</span>
    </div>
    <div class="g-value">${esc(value)}</div>
    <div class="g-sub">${esc(sub)}</div>
    ${state2 === "done"
      ? '<div class="goal-done">✓ Done</div>'
      : `<div class="progress ${color}"><div style="width:${Math.round(pct * 100)}%"></div></div>`}
  </div>`;
}
function iconSVG(k) {
  return {
    profit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  }[k];
}

function openGoalsModal() {
  const g = state.goals;
  const box = $("#modalBox");
  box.innerHTML = `
  <div class="modal-head"><h2>Set goals</h2><button class="close-x" id="mClose">✕</button></div>
  <div class="modal-body">
    <div class="form-grid">
      <label class="field"><span>Monthly P&L target (${state.settings.currency})</span>
        <input type="number" class="input" id="gPnl" step="any" value="${g.monthlyPnl || ""}" placeholder="e.g. 1000"></label>
      <label class="field"><span>Monthly trades target</span>
        <input type="number" class="input" id="gTrades" step="1" min="0" value="${g.monthlyTrades || ""}" placeholder="e.g. 20"></label>
      <label class="field"><span>Win rate target (%)</span>
        <input type="number" class="input" id="gWr" step="1" min="1" max="100" value="${g.winRate || ""}" placeholder="e.g. 55"></label>
      <label class="field"><span>Discipline target (1–5)</span>
        <input type="number" class="input" id="gDis" step="0.5" min="1" max="5" value="${g.discipline || ""}" placeholder="e.g. 4"></label>
    </div>
    <p class="hint">Leave a field empty to disable that goal. Progress is measured against the current calendar month.</p>
  </div>
  <div class="modal-foot">
    <button class="btn ghost" id="mCancel">Cancel</button>
    <button class="btn primary" id="mSave">Save goals</button>
  </div>`;
  showModal();
  $("#mClose").addEventListener("click", hideModal);
  $("#mCancel").addEventListener("click", hideModal);
  $("#mSave").addEventListener("click", async () => {
    const parse = (v) => (v === "" || v == null ? "" : Number(v));
    state.goals = {
      monthlyPnl: parse($("#gPnl").value),
      monthlyTrades: parse($("#gTrades").value),
      winRate: parse($("#gWr").value),
      discipline: parse($("#gDis").value),
    };
    await putJSON("/api/state", { goals: state.goals });
    hideModal();
    toast("Goals saved");
    renderGoals();
  });
}

/* ============================ journal ============================ */
function renderJournal() {
  const notes = state.notes.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  $("#notesList").innerHTML = notes.length ? notes.map((n, i) => `
    <div class="note-card">
      <div class="n-head">
        <span class="n-date">${esc(fmtDateShort(n.date))}</span>
        <div class="n-actions">
          <button class="icon-btn" data-nact="edit" data-ni="${i}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="icon-btn del" data-nact="del" data-ni="${i}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="n-text">${esc(n.text)}</div>
    </div>`).join("")
    : '<div class="empty" style="padding:30px"><h3>No journal notes yet</h3><p>Write down your trade plan, emotions and lessons learned. Reviewing these is how traders improve.</p></div>';
  $$("#notesList [data-nact]").forEach((b) => b.addEventListener("click", onNoteAction));
}

async function onNoteAction(e) {
  const btn = e.target.closest("[data-nact]");
  if (!btn) return;
  const i = Number(btn.dataset.ni);
  const note = state.notes[i];
  if (btn.dataset.nact === "edit") { openNoteModal(i); return; }
  const ok = await confirmDialog("Delete note", "Delete the note from " + esc(fmtDateShort(note.date)) + "?", "Delete", true);
  if (!ok) return;
  state.notes.splice(i, 1);
  await putJSON("/api/state", { notes: state.notes });
  toast("Note deleted");
  renderJournal();
}

function openNoteModal(idx) {
  const n = idx != null ? state.notes[idx] : null;
  const box = $("#modalBox");
  box.innerHTML = `
  <div class="modal-head"><h2>${n ? "Edit note" : "New note"}</h2><button class="close-x" id="mClose">✕</button></div>
  <div class="modal-body">
    <div class="form-grid">
      <label class="field full"><span>Date</span>
        <input type="date" class="input" id="nDate" value="${esc(n ? n.date : new Date().toISOString().slice(0, 10))}"></label>
      <label class="field full"><span>Note</span>
        <textarea class="input" id="nText" rows="6" placeholder="Trading plan, psychology, lessons, mistakes…">${esc(n ? n.text : "")}</textarea></label>
    </div>
  </div>
  <div class="modal-foot">
    <button class="btn ghost" id="mCancel">Cancel</button>
    <button class="btn primary" id="mSave">${n ? "Save" : "Add note"}</button>
  </div>`;
  showModal();
  $("#mClose").addEventListener("click", hideModal);
  $("#mCancel").addEventListener("click", hideModal);
  $("#mSave").addEventListener("click", async () => {
    const date = $("#nDate").value;
    const text = $("#nText").value.trim();
    if (!date || !text) { toast("Date and text are required", "err"); return; }
    if (n) { state.notes[idx] = { date, text }; }
    else { state.notes.push({ date, text }); }
    await putJSON("/api/state", { notes: state.notes });
    hideModal();
    toast("Note saved");
    renderJournal();
  });
}

/* ============================ settings ============================ */
function renderSettings() {
  $("#setCurrency").value = state.settings.currency || "USD";
  $("#setBalance").value = state.settings.balance || "";
  $("#setLot").value = state.settings.defaultLot || 0.1;
  $("#setStrategy").value = state.settings.defaultStrategy || "";
  renderTelegramStatus();
  renderDiscordStatus();
}

/* ============================ sidebar foot ============================ */
function renderSidebarFoot() {
  const st = computeStats(state.trades);
  $("#sidebarFoot").innerHTML = `
    <div class="sf-row"><span>Net P&L</span><b class="${pnlClass(st.net)}">${fmtMoney(st.net)}</b></div>
    <div class="sf-row"><span>Win rate</span><b>${fmtPct(st.winRate)}</b></div>
    <div class="sf-row"><span>Trades</span><b>${st.n}</b></div>`;
}

/* ============================ demo data ============================ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateDemoData() {
  const rnd = mulberry32(20260818);
  const demoPairs = [
    { p: "EUR/USD", px: 1.0850, pip: 0.0001 },
    { p: "GBP/USD", px: 1.2710, pip: 0.0001 },
    { p: "USD/JPY", px: 151.40, pip: 0.01 },
    { p: "XAU/USD", px: 2385, pip: 0.1 },
    { p: "AUD/USD", px: 0.6650, pip: 0.0001 },
    { p: "USD/CAD", px: 1.3660, pip: 0.0001 },
    { p: "EUR/GBP", px: 0.8540, pip: 0.0001 },
  ];
  const strategies = ["Breakout", "Trend Pullback", "Support / Resistance", "News Reversal", "Order Block"];
  const sessions = ["Sydney", "Tokyo", "London", "London", "New York", "New York"];
  const dirs = ["long", "long", "short", "long", "short", "short"];
  const lots = [0.1, 0.1, 0.2, 0.2, 0.5, 1.0];
  const trades = [];
  const start = new Date(2026, 1, 2); /* Feb 2 2026 */
  const end = new Date(2026, 7, 18); /* Aug 18 2026 */

  let winBias = 0.52;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    if (rnd() < 0.38) continue; /* not every weekday has trades */
    const dayTrades = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < dayTrades; k++) {
      const dp = demoPairs[Math.floor(rnd() * demoPairs.length)];
      const strategy = strategies[Math.floor(rnd() * strategies.length)];
      const session = sessions[Math.floor(rnd() * sessions.length)];
      const direction = dirs[Math.floor(rnd() * dirs.length)];
      const lot = lots[Math.floor(rnd() * lots.length)];
      const hourMap = { Sydney: [22, 23, 0, 1, 2], Tokyo: [2, 3, 4, 5, 6, 7], London: [8, 9, 10, 11, 12, 13, 14], "New York": [13, 14, 15, 16, 17, 18, 19] };
      const h = hourMap[session][Math.floor(rnd() * hourMap[session].length)];
      const ts = new Date(d);
      ts.setHours(h, Math.floor(rnd() * 60), 0, 0);
      const tsStr = ts.getFullYear() + "-" + String(ts.getMonth() + 1).padStart(2, "0") + "-" + String(ts.getDate()).padStart(2, "0") + "T" + String(h).padStart(2, "0") + ":" + String(ts.getMinutes()).padStart(2, "0");

      const win = rnd() < winBias;
      winBias = Math.max(0.47, Math.min(0.63, winBias + (rnd() - 0.5) * 0.08));
      const winPips = 15 + rnd() * 55;
      const lossPips = 8 + rnd() * 26;
      const pips = (win ? 1 : -1) * (win ? winPips : lossPips);
      const entry = dp.px * (1 + (rnd() - 0.5) * 0.006);
      const exit = entry + (direction === "long" ? 1 : -1) * pips * dp.pip;
      const units = dp.p === "XAU/USD" ? 100 : dp.p === "XAG/USD" ? 5000 : 100000;
      const quotePnl = (exit - entry) * (direction === "long" ? 1 : -1) * units * lot;
      let pnl;
      if (dp.p.includes("/USD")) pnl = quotePnl;
      else if (dp.p === "USD/JPY") pnl = quotePnl / entry;
      else pnl = quotePnl * 1.27; /* EUR/GBP → USD rough */
      const fee = Math.round((3 + rnd() * 8) * lot * 10) / 10;
      const net = Math.round((pnl - fee) * 100) / 100;
      const risk = Math.round((60 + rnd() * 120) * 10) / 10;
      const rating = 3 + Math.floor(rnd() * 3);
      const dec = dp.pip >= 0.01 ? 2 : 5;
      trades.push({
        ts: tsStr, pair: dp.p, direction, lot: lot,
        entry: +entry.toFixed(dec),
        exit_p: +exit.toFixed(dec),
        sl: null, tp: null,
        pips: Math.round(pips * 10) / 10,
        pnl: net, fee: fee,
        strategy, setup: ["double top", "trendline bounce", "break of structure", "order block retest", "engulfing candle"][Math.floor(rnd() * 5)],
        session, rating, risk,
        r: Math.round((net / risk) * 100) / 100,
        notes: rnd() < 0.3 ? ["Followed the plan, waited for confirmation.", "Entered a bit early — next time wait for the pullback.", "Great risk management today.", "Revenge trade — must avoid trading after a loss."][Math.floor(rnd() * 4)] : "",
      });
    }
  }
  return trades;
}

/* ============================ strategy coach ============================ */

const COACH_DEFAULTS = {
  name: "", pairs: "", sessions: [], bias: "both", minWinRate: 45,
  strictness: "balanced", theme: "auto", riskPct: 1.5, configured: false,
};

function coachConfigured() {
  const p = state.coach.profile;
  return !!(p.configured || p.name || p.pairs || (p.sessions && p.sessions.length) || p.minWinRate || p.riskPct);
}

function coachRiskDefault() {
  const p = state.coach.profile;
  const bal = Number(state.settings.balance) || 0;
  return bal ? Math.round(bal * (Number(p.riskPct) || 0) / 100 * 100) / 100 : 0;
}

function coachDefaultPair() {
  const p = state.coach.prefs && state.coach.prefs.lastPair;
  if (p) return p;
  const counts = {};
  state.trades.forEach((t) => { counts[t.pair] = (counts[t.pair] || 0) + 1; });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "EUR/USD";
}

function renderCoach() {
  const p = state.coach.profile;
  const configured = coachConfigured();

  /* --- setup form --- */
  $("#cpName").value = p.name || "";
  $("#cpBias").value = p.bias || "both";
  $("#cpPairs").value = p.pairs || "";
  $("#cpMinWR").value = p.minWinRate || "";
  $("#cpStrict").value = p.strictness || "balanced";
  $("#cpTheme").value = p.theme || "auto";
  $("#cpRiskPct").value = p.riskPct || "";
  $$("#cpSessions input").forEach((cb) => { cb.checked = (p.sessions || []).includes(cb.value); });

  /* --- setup card vs ready banner --- */
  $("#coachSetupCard").classList.toggle("hidden", configured);
  $("#coachReadyBanner").classList.toggle("hidden", !configured);
  if (configured) {
    const parts = [];
    if (p.name) parts.push("<b>" + esc(p.name) + "</b>");
    if (p.pairs) parts.push(esc(p.pairs));
    if (p.sessions && p.sessions.length) parts.push(esc(p.sessions.join(", ")));
    if (p.bias !== "both") parts.push((p.bias === "long" ? "Long" : "Short") + " only");
    parts.push(p.riskPct + "% risk");
    $("#readyText").innerHTML = "Strategy locked in: " + parts.join(" · ") +
      "<br><span style='color:var(--dim);font-size:11.5px'>Now just drop screenshots — every analysis is tracked automatically.</span>";
  }

  /* --- analyze defaults: pair / direction / session / risk --- */
  const faves = ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "AUD/NZD"];
  const known = [...new Set([...Object.keys(INSTRUMENTS), ...state.trades.map((t) => t.pair)])];
  const ordered = [...new Set([...faves, ...known])];
  const pairSel = $("#sigPair");
  pairSel.innerHTML = ordered.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  pairSel.value = coachDefaultPair();

  $("#sigDir").value = (state.coach.prefs && state.coach.prefs.lastDir) || "auto";
  const sess = (state.coach.prefs && state.coach.prefs.lastSession) || sessionForHour(new Date().getHours());
  $("#sigSession").value = sess;

  const riskDefault = coachRiskDefault();
  const riskInput = $("#sigRisk");
  riskInput.placeholder = riskDefault ? "auto: " + fmtMoney(riskDefault) + " (" + (p.riskPct || 0) + "% of balance)" : "enter risk $";
  if (!riskInput.dataset.touched || !riskInput.value) riskInput.value = riskDefault || "";
  $("#sigRiskLabel").textContent = "Risk this trade (" + (CUR_SYM[state.settings.currency] || "$") + ") — auto from strategy";

  renderSignalHistory();
  renderPendingSignals();
}

/* ---------- signal history & accuracy ---------- */
function renderSignalHistory() {
  const sigs = state.coach.signals.slice().sort((a, b) => (b.tsMs || 0) - (a.tsMs || 0));
  const done = sigs.filter((s) => s.outcome === "won" || s.outcome === "lost");
  const won = done.filter((s) => s.outcome === "won");
  const acc = done.length ? won.length / done.length : null;
  const pending = sigs.filter((s) => s.outcome === "pending").length;
  const avgWon = won.length ? won.reduce((a, s) => a + s.score, 0) / won.length : null;
  const lostSigs = done.filter((s) => s.outcome === "lost");
  const avgLost = lostSigs.length ? lostSigs.reduce((a, s) => a + s.score, 0) / lostSigs.length : null;
  const now = new Date();
  const mk = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const thisMonth = sigs.filter((s) => String(s.ts || "").slice(0, 7) === mk).length;

  $("#sigStats").innerHTML = `
    <span class="sig-stat">All signals: <b>${sigs.length}</b></span>
    <span class="sig-stat">This month: <b>${thisMonth}</b></span>
    <span class="sig-stat">Pending: <b>${pending}</b></span>
    <span class="sig-stat">Coach accuracy: <b>${acc == null ? "—" : fmtPct(acc, 0)}</b></span>
    ${avgWon != null ? `<span class="sig-stat">Wins scored <b>${avgWon.toFixed(0)}%</b> vs losses <b>${avgLost.toFixed(0)}%</b></span>` : ""}`;

  if (!sigs.length) {
    $("#sigTable").innerHTML = '<div class="empty" style="padding:22px"><p>Nothing tracked yet — every screenshot you analyze is logged here automatically. Mark outcomes (or log the trade) and the coach accuracy updates itself.</p></div>';
    return;
  }
  const rows = sigs.map((s) => {
    const linked = s.tradeId ? state.trades.find((t) => t.id === s.tradeId) : null;
    return `
    <tr>
      <td class="mono">${esc(fmtDate(s.ts))}</td>
      <td><span class="pair-tag">${esc(s.pair)}</span></td>
      <td><span class="badge ${s.direction === "long" ? "long" : "short"}">${s.direction.toUpperCase()}</span></td>
      <td class="num"><b>${s.score != null ? s.score.toFixed(0) + "%" : "—"}</b></td>
      <td><span class="badge ${s.verdict === "TAKE" ? "win" : s.verdict === "WAIT" ? "be" : "loss"}">${esc(s.verdict || "—")}</span></td>
      <td>
        <select class="outcome-select ${s.outcome}" data-sid="${s.id}">
          <option value="pending" ${s.outcome === "pending" ? "selected" : ""}>Pending…</option>
          <option value="won" ${s.outcome === "won" ? "selected" : ""}>✓ Won</option>
          <option value="lost" ${s.outcome === "lost" ? "selected" : ""}>✗ Lost</option>
          <option value="skipped" ${s.outcome === "skipped" ? "selected" : ""}>Skipped</option>
        </select>
      </td>
      <td style="color:var(--dim);font-size:12px">
        ${linked ? `<span class="badge ${linked.pnl > 0 ? "win" : linked.pnl < 0 ? "loss" : "be"}">${esc(fmtMoney(linked.pnl))}</span>` : esc(s.note || "")}
      </td>
    </tr>`;
  }).join("");
  $("#sigTable").innerHTML = `
    <table class="tbl">
      <thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th class="th-num">Score</th><th>Verdict</th><th>Outcome</th><th>Failed rules / linked P&L</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  $$("#sigTable .outcome-select").forEach((sel) => sel.addEventListener("change", onSignalOutcome));
}

async function onSignalOutcome(e) {
  const sel = e.target;
  const sig = state.coach.signals.find((s) => String(s.id) === sel.dataset.sid);
  if (!sig) return;
  sig.outcome = sel.value;
  sel.className = "outcome-select " + sel.value;
  await putJSON("/api/coach", { signals: state.coach.signals });
  renderSignalHistory();
  renderPendingSignals();
  if (sig.outcome === "won" || sig.outcome === "lost") toast("Outcome saved — coach accuracy updated");
}

/* ---------- pending decisions (auto-tracked progress) ---------- */
function renderPendingSignals() {
  const pending = state.coach.signals
    .filter((s) => s.outcome === "pending")
    .sort((a, b) => (b.tsMs || 0) - (a.tsMs || 0));
  const wrap = $("#pendingList");
  const card = $("#coachPendingCard");
  if (!pending.length) {
    card.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  card.classList.remove("hidden");
  $("#pendingCount").textContent = pending.length + " awaiting outcome";
  wrap.innerHTML = pending.map((s) => {
    const linked = s.tradeId ? state.trades.find((t) => t.id === s.tradeId) : null;
    const vColor = s.verdict === "TAKE" ? "var(--green)" : s.verdict === "WAIT" ? "var(--amber)" : "#f87171";
    const actions = linked
      ? `<span class="badge ${linked.pnl > 0 ? "win" : linked.pnl < 0 ? "loss" : "be"}">${esc(fmtMoney(linked.pnl))}</span>
         <span class="hint" style="margin:0">linked to your trade — outcome auto</span>`
      : `<button class="btn sm ghost b-win" data-psact="won" data-psid="${s.id}">✓ Won</button>
         <button class="btn sm ghost b-loss" data-psact="lost" data-psid="${s.id}">✗ Lost</button>
         <button class="btn sm ghost" data-psact="skipped" data-psid="${s.id}">Skip</button>
         <button class="btn sm primary" data-psact="trade" data-psid="${s.id}">Log as trade</button>`;
    return `
    <div class="pending-row">
      <div class="pr-info">
        <span class="pair-tag">${esc(s.pair)}</span>
        <span class="badge ${s.direction === "long" ? "long" : "short"}">${s.direction.toUpperCase()}</span>
        <span class="pr-score" style="color:${vColor}">${s.score != null ? s.score.toFixed(0) + "%" : "—"}</span>
        <span class="badge ${s.verdict === "TAKE" ? "win" : s.verdict === "WAIT" ? "be" : "loss"}">${esc(s.verdict)}</span>
        <span class="pr-when">${timeAgo(s.tsMs || Date.parse(s.ts))}</span>
      </div>
      <div class="pr-actions">${actions}</div>
    </div>`;
  }).join("");
  $$("#pendingList [data-psact]").forEach((b) => b.addEventListener("click", onPendingAction));
}

function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

async function onPendingAction(e) {
  const btn = e.target.closest("[data-psact]");
  if (!btn) return;
  const sig = state.coach.signals.find((s) => String(s.id) === btn.dataset.psid);
  if (!sig) return;
  const act = btn.dataset.psact;
  if (act === "trade") { openTradeModal(null, signalPrefill(sig)); return; }
  sig.outcome = act;
  await putJSON("/api/coach", { signals: state.coach.signals });
  toast(act === "won" ? "Nice — marked as a win 🎉" : act === "lost" ? "Marked as a loss — check the failed rules" : "Signal skipped");
  renderSignalHistory();
  renderPendingSignals();
}

function signalPrefill(sig) {
  return {
    signalId: sig.id, pair: sig.pair, direction: sig.direction,
    session: sig.session || "London", strategy: state.coach.profile.name || "",
    risk: sig.risk || coachRiskDefault() || null,
  };
}

/* ---------- chart image analysis (pure client-side pixels) ---------- */
function classifyColor(r, g, b, theme) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (theme === "light-dark") {
    if (lum > 185) return "up";
    if (lum < 70) return "down";
    return null;
  }
  /* too dark (chart background) or too bright (text/labels) → not a candle */
  if (lum < 45 || lum > 235) return null;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.16) return null; /* grayish — ignore */
  const d = max - min;
  let hue = 0;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = ((hue * 60) % 360 + 360) % 360;
  if (theme === "blue-red") {
    if (hue >= 160 && hue <= 265) return "up";
    if (hue <= 25 || hue >= 330) return "down";
    return null;
  }
  /* green-red default */
  if (hue >= 70 && hue <= 180) return "up";
  if (hue <= 25 || hue >= 330) return "down";
  return null;
}

function readChartImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try { resolve(analyzeImage(img)); }
      catch (err) { reject(err); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => reject(new Error("Could not read that image — try a PNG or JPG"));
    img.src = url;
  });
}

function analyzeImage(img) {
  const W = 520;
  const H = Math.max(160, Math.round(img.naturalHeight * (W / img.naturalWidth)));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  /* background = most common quantized colour */
  const cnt = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  let bgK = 0, bgN = -1;
  cnt.forEach((n, k) => { if (n > bgN) { bgN = n; bgK = k; } });
  const bg = { r: ((bgK >> 8) & 0xF) * 16 + 8, g: ((bgK >> 4) & 0xF) * 16 + 8, b: (bgK & 0xF) * 16 + 8 };

  /* auto-detect theme: blue/red vs green/red */
  let theme = state.coach.profile.theme || "auto";
  if (theme === "auto") {
    let cGR = 0, cBR = 0;
    for (let y = Math.round(H * 0.2); y < H * 0.8; y += 4) {
      for (let x = 0; x < W; x += 4) {
        const i = (y * W + x) * 4;
        if (classifyColor(data[i], data[i + 1], data[i + 2], "green-red")) cGR++;
        if (classifyColor(data[i], data[i + 1], data[i + 2], "blue-red")) cBR++;
      }
    }
    theme = cBR > cGR * 1.3 ? "blue-red" : "green-red";
  }

  /* classify pixels in the central band (skip titles/axes) */
  const y0 = Math.round(H * 0.16), y1 = Math.round(H * 0.84);
  const N = 48;
  const slices = Array.from({ length: N }, () => ({ up: 0, down: 0, n: 0, ySum: 0 }));
  let totalUp = 0, totalDown = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dr = r - bg.r, dg = g - bg.g, db = b - bg.b;
      if (dr * dr + dg * dg + db * db < 36 * 36) continue; /* background / grid lines */
      const cls = classifyColor(r, g, b, theme);
      if (!cls) continue;
      const s = slices[Math.min(N - 1, Math.floor((x / W) * N))];
      s.n++; s.ySum += (y - y0) / (y1 - y0); /* 0 = top (highs) */
      if (cls === "up") { s.up++; totalUp++; } else { s.down++; totalDown++; }
    }
  }

  /* candles = slices with enough pixels */
  const pts = slices.map((s, i) => ({ i, c: s.ySum / Math.max(1, s.n), n: s.up + s.down })).filter((p) => p.n >= 4);
  const candleCount = pts.length;

  /* linear regression on price position → trend (positive = rising) */
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  pts.forEach((p) => { sx += p.i; sy += p.c; sxy += p.i * p.c; sxx += p.i * p.i; });
  const m = pts.length;
  const slope = m > 1 ? (m * sxy - sx * sy) / (m * sxx - sx * sx) : 0;
  const trend = -slope * N; /* c=0 is top, so rising price = negative slope */

  /* momentum: up-ratio of last 30% vs first 30% of the chart */
  const third = Math.max(1, Math.floor(N * 0.3));
  const firstUp = slices.slice(0, third).reduce((a, s) => a + s.up, 0);
  const firstDn = slices.slice(0, third).reduce((a, s) => a + s.down, 0);
  const lastUp = slices.slice(N - third).reduce((a, s) => a + s.up, 0);
  const lastDn = slices.slice(N - third).reduce((a, s) => a + s.down, 0);
  const momFirst = firstUp + firstDn ? firstUp / (firstUp + firstDn) : 0.5;
  const momLast = lastUp + lastDn ? lastUp / (lastUp + lastDn) : 0.5;
  const momentum = momLast - momFirst;

  /* volatility + price position */
  const meanC = pts.length ? pts.reduce((a, p) => a + p.c, 0) / pts.length : 0.5;
  const varr = pts.length ? pts.reduce((a, p) => a + (p.c - meanC) ** 2, 0) / pts.length : 0;
  const volatility = Math.sqrt(varr);
  const lastN = Math.max(1, Math.floor(N * 0.12));
  const lastPts = slices.slice(N - lastN).map((s) => s.ySum / Math.max(1, s.n)).filter((v) => v > 0);
  const posTop = lastPts.length ? lastPts.reduce((a, b) => a + b, 0) / lastPts.length : 0.5;

  const readability = Math.min(1, candleCount / 26);
  const pixelMass = Math.min(1, (totalUp + totalDown) / 3000);
  const confidence = Math.round((0.6 * readability + 0.4 * pixelMass) * 100) / 100;

  let suggestedDir = null;
  const bRatio = totalUp + totalDown > 0 ? totalUp / (totalUp + totalDown) : 0.5;
  if (confidence >= 0.35) {
    if (trend > 0.03 || (bRatio > 0.58 && trend > -0.02)) suggestedDir = "long";
    else if (trend < -0.03 || (bRatio < 0.42 && trend < 0.02)) suggestedDir = "short";
  }

  return {
    trend, momentum, volatility, posTop, confidence, candleCount,
    bullishRatio: bRatio,
    totalUp, totalDown, themeUsed: theme, suggestedDir,
  };
}

/* ---------- rule engine ---------- */
function evaluateSignal(analysis) {
  const p = state.coach.profile;
  const pair = $("#sigPair").value;
  const dir = $("#sigDir").value === "auto" ? (analysis.suggestedDir || "long") : $("#sigDir").value;
  const session = $("#sigSession").value;
  const risk = parseFloat($("#sigRisk").value) || 0;
  const balance = Number(state.settings.balance) || 0;

  /* personal edge straight from the journal */
  const pairTrades = state.trades.filter((t) => t.pair === pair);
  const pairWins = pairTrades.filter((t) => t.pnl > 0).length;
  const pairWR = pairTrades.length ? pairWins / pairTrades.length : null;
  const pairR = pairTrades.length ? pairTrades.reduce((a, t) => a + (t.r || 0), 0) / pairTrades.length : null;
  const sessTrades = state.trades.filter((t) => t.session === session);
  const sessWins = sessTrades.filter((t) => t.pnl > 0).length;
  const sessWR = sessTrades.length ? sessWins / sessTrades.length : null;

  const rules = [];
  const add = (id, label, weight, passed, reason) => rules.push({ id, label, weight, passed, reason });
  const readable = analysis.confidence >= 0.3;
  const trend = analysis.trend;

  /* 1 — trend */
  if (!readable) add("trend", "Trend direction", 3, null, "Chart not readable enough to judge the trend — double-check the screenshot.");
  else if (Math.abs(trend) <= 0.02) add("trend", "Trend direction", 3, null, "Trend is flat / range-bound — wait for a breakout or a cleaner slope.");
  else if ((dir === "long" && trend > 0.02) || (dir === "short" && trend < -0.02))
    add("trend", "Trend direction", 3, true, `Chart trend reads ${trend > 0 ? "UP" : "DOWN"} — aligned with your ${dir.toUpperCase()} idea.`);
  else add("trend", "Trend direction", 3, false, `Chart trend reads ${trend > 0 ? "UP" : "DOWN"} — against your ${dir.toUpperCase()} idea.`);

  /* 2 — candle momentum */
  if (!readable) add("mom", "Candle momentum", 2, null, "Cannot measure recent candle pressure.");
  else if ((dir === "long" && analysis.momentum > 0.05) || (dir === "short" && analysis.momentum < -0.05))
    add("mom", "Candle momentum", 2, true, `Recent candles lean ${dir === "long" ? "bullish" : "bearish"} (Δ ${analysis.momentum > 0 ? "+" : ""}${Math.round(analysis.momentum * 100)}%).`);
  else if (Math.abs(analysis.momentum) <= 0.05) add("mom", "Candle momentum", 2, null, "Momentum is neutral — no clear push either way.");
  else add("mom", "Candle momentum", 2, false, `Recent candles move against your ${dir.toUpperCase()} idea (Δ ${Math.round(analysis.momentum * 100)}%).`);

  /* 3 — price position in visible range */
  if (dir === "long") {
    if (analysis.posTop < 0.18) add("pos", "Price position", 1, false, "Price sits near the highs of the visible range — risk of chasing.");
    else if (analysis.posTop < 0.62) add("pos", "Price position", 1, true, "Price is below the highs — not chasing the top.");
    else add("pos", "Price position", 1, null, "Price is in the lower part of the range — check for support before buying.");
  } else {
    if (analysis.posTop > 0.82) add("pos", "Price position", 1, false, "Price sits near the lows of the visible range — risk of selling a bottom.");
    else if (analysis.posTop > 0.38) add("pos", "Price position", 1, true, "Price is above the lows — not selling the bottom.");
    else add("pos", "Price position", 1, null, "Price is in the upper part of the range — check for resistance before selling.");
  }

  /* 4 — readability */
  add("vol", "Chart readability", 1, readable, readable
    ? `Read ${analysis.candleCount} candle columns (${analysis.themeUsed === "blue-red" ? "blue/red" : analysis.themeUsed === "light-dark" ? "white/black" : "green/red"} theme, ${Math.round(analysis.confidence * 100)}% confidence).`
    : "Few or no candles detected — upload a closer screenshot of the candles.");

  /* 5 — session */
  const sessOk = !p.sessions.length || p.sessions.includes(session);
  add("sess", "Session", 2, sessOk, sessOk
    ? `${session} ${p.sessions.length ? "— in your allowed sessions" : "— no session restriction set"}${sessWR != null ? ` (you win ${Math.round(sessWR * 100)}% of ${sessTrades.length} ${session} trades)` : ""}.`
    : `${session} is NOT in your allowed sessions (${p.sessions.join(", ")}).`);

  /* 6 — pair */
  const allowed = (p.pairs || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const pairOk = !allowed.length || allowed.includes(pair);
  add("pair", "Pair", 2, pairOk, pairOk
    ? (allowed.length ? `${pair} is in your allowed pairs.` : "No pair restriction set.")
    : `${pair} is NOT in your allowed pairs (${allowed.join(", ")}).`);

  /* 7 — direction bias */
  const biasOk = p.bias === "both" || p.bias === dir;
  add("bias", "Direction bias", 1, biasOk, biasOk
    ? (p.bias === "both" ? "No direction bias set." : `Matches your ${p.bias.toUpperCase()}-only bias.`)
    : `Your profile is ${p.bias.toUpperCase()}-only — this is a ${dir.toUpperCase()} setup.`);

  /* 8 — personal edge */
  const minWR = (Number(p.minWinRate) || 0) / 100;
  if (pairTrades.length >= 5) {
    add("edge", "Personal edge", 3, pairWR >= minWR,
      `Your journal: ${pairWins}/${pairTrades.length} (${Math.round(pairWR * 100)}%) wins on ${pair}${pairR != null ? `, avg ${fmtNum(pairR)}R` : ""} — ${pairWR >= minWR ? "above" : "below"} your ${p.minWinRate}% threshold.`);
  } else if (pairTrades.length > 0) {
    add("edge", "Personal edge", 3, null,
      `Only ${pairTrades.length} ${pair} trade${pairTrades.length > 1 ? "s" : ""} in your journal (${Math.round(pairWR * 100)}% wins) — not enough history to confirm an edge yet.`);
  } else {
    add("edge", "Personal edge", 3, null, `No ${pair} trades in your journal yet — untested pair, consider smaller size.`);
  }

  /* 9 — risk budget */
  const maxRisk = balance * (Number(p.riskPct) || 0) / 100;
  /* 10-11 — learned Strategy Brain */
  const brain = state.brain;
  if (brain && brain.rules) {
    const br = brain.rules;
    const bdir = br.direction || "both";
    const dirOk = bdir === "both" || bdir === dir;
    add("brain-dir", "Your strategy: direction", 3, dirOk,
      `Your learned strategy "${esc(brain.name || "—")}" trades ${bdir.toUpperCase()} — ${dirOk ? "aligned" : "conflicts"} with this ${dir.toUpperCase()} setup.`);
    const expectsBreakout = (br.entry_conditions || []).some((c) => String(c.metric || "").includes("breakout"));
    if (expectsBreakout) {
      const nearTop = analysis.posTop < 0.25, nearBottom = analysis.posTop > 0.75;
      const inZone = dir === "long" ? nearTop : dir === "short" ? nearBottom : false;
      add("brain-setup", "Your strategy: setup", 2, inZone ? true : null,
        inZone
          ? `Your strategy wants a ${dir === "long" ? "breakout above range highs" : "break below range lows"} — price sits at ${Math.round(analysis.posTop * 100)}% of the visible range (${dir === "long" ? "breakout zone ✓" : "breakdown zone ✓"}).`
          : `Your strategy looks for breakouts; price sits at ${Math.round(analysis.posTop * 100)}% of the visible range — ${analysis.posTop < 0.4 || analysis.posTop > 0.6 ? "closer to a breakout zone" : "mid-range, no trigger yet"}.`);
    } else {
      add("brain-setup", "Your strategy: setup", 2, null,
        `Strategy reference: ${esc((brain.summary || "").slice(0, 150))}`);
    }
  }
  /* 12 — risk budget (continues below) */
  if (risk > 0) {
    add("risk", "Risk budget", 2, risk <= maxRisk,
      `${fmtMoney(risk)} vs ${fmtMoney(maxRisk)} allowed (${p.riskPct}% of ${fmtMoneyAbs(balance)}) — ${risk <= maxRisk ? "within" : "OVER"} budget.`);
  } else {
    add("risk", "Risk budget", 2, null, "Enter a risk amount to check it against your budget.");
  }

  /* score: pass=1, neutral=0.5, fail=0 */
  let wSum = 0, wScore = 0;
  rules.forEach((r) => { if (r.passed !== null) { wSum += r.weight; wScore += r.weight * (r.passed ? 1 : 0.5); } });
  const score = wSum ? Math.round((wScore / wSum) * 100) : 0;

  const th = p.strictness === "strict" ? { hi: 78, lo: 58 } : p.strictness === "relaxed" ? { hi: 60, lo: 42 } : { hi: 70, lo: 50 };
  const verdict = score >= th.hi ? "TAKE" : score >= th.lo ? "WAIT" : "NO";

  return {
    score, verdict, rules, dir, pair, session, risk,
    suggestedDir: analysis.suggestedDir,
    analysis,
    personal: { pairWR, pairR, pairN: pairTrades.length, sessWR },
  };
}

function showVerdict(res) {
  const v = res.verdict;
  const title = $("#verdictTitle");
  title.textContent = v === "TAKE" ? "✅ TAKE THE TRADE" : v === "WAIT" ? "⚠️ WAIT / HOLD OFF" : "🚫 NO TRADE — PASS";
  title.className = "verdict-title " + (v === "TAKE" ? "take" : v === "WAIT" ? "wait" : "no");

  const msgs = {
    TAKE: `Strong setup — your rules and the chart agree on ${res.dir.toUpperCase()} ${res.pair}. Stick to the plan and the risk you set.`,
    WAIT: `Mixed signals on ${res.pair} ${res.dir.toUpperCase()} — the chart read doesn't fully agree with your plan. Wait for confirmation before committing.`,
    NO: `Weak setup — the chart and/or your own rules say pass on ${res.pair} ${res.dir.toUpperCase()}. No trade is a trade.`,
  };
  $("#verdictMsg").textContent = msgs[v];

  const chips = [];
  if (state.brain && state.brain.name) {
    chips.push(`<span class="sig-stat">🧠 <b>${esc(state.brain.name)}</b></span>`);
  }
  if (res.personal.pairN >= 1) {
    chips.push(`<span class="sig-stat"><b>${res.pair}</b> journal: ${res.personal.pairN} trades · ${Math.round(res.personal.pairWR * 100)}% wins${res.personal.pairR != null ? ` · avg ${fmtNum(res.personal.pairR)}R` : ""}</span>`);
  }
  const stAll = computeStats(state.trades);
  if (stAll.n) chips.push(`<span class="sig-stat">Overall win rate <b>${fmtPct(stAll.winRate)}</b></span>`);
  if (res.suggestedDir) chips.push(`<span class="sig-stat">Chart suggests <b>${res.suggestedDir.toUpperCase()}</b></span>`);
  chips.push(`<span class="sig-stat">Read <b>${res.analysis.candleCount}</b> candles · ${Math.round(res.analysis.confidence * 100)}% confidence</span>`);
  $("#edgeChips").innerHTML = chips.join("");

  $("#ruleList").innerHTML = res.rules.map((r) => `
    <div class="rule-row ${r.passed === true ? "pass" : r.passed === false ? "fail" : "neutral"}">
      <span class="r-ico">${r.passed === true ? "✓" : r.passed === false ? "✗" : "~"}</span>
      <span class="r-name">${esc(r.label)}</span>
      <span class="r-reason">${esc(r.reason)}</span>
      <span class="r-w">weight ${r.weight}</span>
    </div>`).join("");

  const color = v === "TAKE" ? "#22c55e" : v === "WAIT" ? "#f59e0b" : "#ef4444";
  requestAnimationFrame(() => drawGauge($("#gaugeChart"), res.score / 100, color, res.score + "%", res.dir.toUpperCase() + " · " + res.pair));
  $("#coachResult").classList.remove("hidden");
  $("#coachResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- coach events ---------- */
function handleSignalFile(file) {
  const url = URL.createObjectURL(file);
  const img = $("#sigPreview");
  img.src = url;
  $("#sigPreviewWrap").classList.remove("hidden");
  state.lastAnalysis = null;
  runSignalAnalysis(false); /* verdict appears instantly on drop */
}

async function runSignalAnalysis(silent) {
  const fi = $("#sigFile");
  if (!fi.files || !fi.files.length) { toast("Upload a chart screenshot first", "err"); return; }
  const btn = $("#btnAnalyze");
  btn.disabled = true;
  if (!silent) btn.innerHTML = "<span>Reading chart…</span>";
  try {
    const analysis = await readChartImage(fi.files[0]);
    state.lastAnalysis = analysis;
    const res = evaluateSignal(analysis);
    const sigId = await upsertSignal(res);
    res.signalId = sigId;
    state.lastVerdict = res;
    showVerdict(res);
    renderPendingSignals();
    renderSignalHistory();
    saveCoachPrefs({ lastPair: res.pair, lastDir: res.dir, lastSession: res.session });
    if (!silent) toast("Verdict computed — tracked in your pending list");
  } catch (err) {
    toast("Could not analyze image: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Read chart &amp; decide</span>';
  }
}

/* auto-log each analysis (deduped within 15 min per pair+direction) */
async function upsertSignal(res) {
  const now = Date.now();
  const sigs = state.coach.signals;
  const dup = sigs.find((s) =>
    s.outcome === "pending" && s.pair === res.pair && s.direction === res.dir &&
    now - (s.tsMs || 0) < 15 * 60 * 1000);
  let id;
  if (dup) {
    id = dup.id;
    dup.score = res.score; dup.verdict = res.verdict;
    dup.ts = new Date().toISOString(); dup.tsMs = now;
    dup.session = res.session; dup.risk = res.risk;
    dup.note = res.rules.filter((r) => r.passed === false).map((r) => r.label).join(", ");
  } else {
    id = now;
    sigs.push({
      id, ts: new Date().toISOString(), tsMs: now,
      pair: res.pair, direction: res.dir, session: res.session, risk: res.risk,
      score: res.score, verdict: res.verdict, outcome: "pending",
      note: res.rules.filter((r) => r.passed === false).map((r) => r.label).join(", "),
    });
  }
  await putJSON("/api/coach", { signals: state.coach.signals });
  return id;
}

async function saveCoachPrefs(partial) {
  state.coach.prefs = Object.assign({}, state.coach.prefs || {}, partial);
  await putJSON("/api/coach", { prefs: state.coach.prefs });
}

/* link a signal to a real journal trade → outcome derives from actual P&L */
async function syncSignalFromTrade(signalId, trade) {
  const sig = state.coach.signals.find((s) => String(s.id) === String(signalId));
  if (!sig) return;
  sig.tradeId = trade.id;
  sig.tradePnl = trade.pnl;
  sig.outcome = trade.pnl > 0 ? "won" : trade.pnl < 0 ? "lost" : "skipped";
  await putJSON("/api/coach", { signals: state.coach.signals });
  toast(sig.outcome === "won" ? "Signal linked — marked WON from your trade 🎉" :
        sig.outcome === "lost" ? "Signal linked — marked LOST from your trade" :
        "Signal linked to your trade");
}

async function unlinkSignalFromTrade(tradeId) {
  let changed = false;
  state.coach.signals.forEach((s) => {
    if (s.tradeId === tradeId) { s.tradeId = null; s.tradePnl = null; s.outcome = "pending"; changed = true; }
  });
  if (changed) await putJSON("/api/coach", { signals: state.coach.signals });
}

function bindCoachEvents() {
  $("#btnSaveProfile").addEventListener("click", async () => {
    state.coach.profile = Object.assign({}, state.coach.profile, {
      name: $("#cpName").value.trim(),
      pairs: $("#cpPairs").value.trim(),
      sessions: $$("#cpSessions input:checked").map((cb) => cb.value),
      bias: $("#cpBias").value,
      minWinRate: Math.min(100, Math.max(0, parseFloat($("#cpMinWR").value) || 45)),
      strictness: $("#cpStrict").value,
      theme: $("#cpTheme").value,
      riskPct: Math.max(0, parseFloat($("#cpRiskPct").value) || 1.5),
      configured: true,
    });
    await putJSON("/api/coach", { profile: state.coach.profile });
    renderCoach();
    toast("Strategy saved once — you're all set. Just drop screenshots now.");
  });

  $("#btnEditProfile").addEventListener("click", () => {
    $("#coachSetupCard").classList.remove("hidden");
    $("#coachSetupCard").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const dz = $("#dropzone"), fi = $("#sigFile");
  dz.addEventListener("click", () => fi.click());
  fi.addEventListener("change", () => { if (fi.files[0]) handleSignalFile(fi.files[0]); });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) handleSignalFile(f);
  });
  $("#sigClear").addEventListener("click", () => {
    $("#sigPreviewWrap").classList.add("hidden");
    $("#sigPreview").removeAttribute("src");
    $("#sigFile").value = "";
    state.lastAnalysis = null;
    $("#btnAnalyze").disabled = true;
  });
  $("#btnAnalyze").addEventListener("click", () => runSignalAnalysis(false));
  $("#btnReanalyze").addEventListener("click", () => runSignalAnalysis(true));
  $("#btnLogTrade").addEventListener("click", () => openTradeModal(null, verdictPrefill()));

  const reanalyzeIfImage = () => { if (state.lastAnalysis) runSignalAnalysis(true); };
  $("#sigDir").addEventListener("change", () => { saveCoachPrefs({ lastDir: $("#sigDir").value }); reanalyzeIfImage(); });
  $("#sigPair").addEventListener("change", () => { saveCoachPrefs({ lastPair: $("#sigPair").value }); reanalyzeIfImage(); });
  $("#sigSession").addEventListener("change", (e) => { saveCoachPrefs({ lastSession: e.target.value }); reanalyzeIfImage(); });
  $("#sigRisk").addEventListener("input", () => { reanalyzeIfImage(); });
}

function verdictPrefill() {
  const res = state.lastVerdict;
  if (!res) return null;
  return {
    signalId: res.signalId, pair: res.pair, direction: res.dir,
    session: res.session, strategy: state.coach.profile.name || "",
    risk: res.risk || coachRiskDefault() || null,
  };
}
/* ============================ strategy brain ============================ */

function renderBrain() {
  const b = state.brain;
  const chip = $("#brainStatusChip");
  chip.textContent = b ? "✅ learned · " + (b.name || "") : "not learned";
  chip.className = "chip " + (b ? "green" : "neutral");

  /* teach card: merge mode labels when a strategy already exists */
  const tTitle = $("#teachTitle"), tHint = $("#teachHint");
  const btnPreset = $("#btnPreset");
  if (btnPreset) btnPreset.classList.toggle("hidden", !!b);
  if (b) {
    if (tTitle) tTitle.textContent = "🧠 Add to what I already know";
    if (tHint) tHint.innerHTML = "Your strategy <b>" + esc(b.name || "") + "</b> is loaded. Add a video, text or screenshots — the new material <b>merges into</b> the existing strategy instead of replacing it.";
    const tbtn = $("#btnTeach");
    if (tbtn) tbtn.innerHTML = "<span>Teach & update my strategy</span>";
  } else {
    if (tTitle) tTitle.textContent = "🧠 Teach your strategy";
    if (tHint) tHint.innerHTML = "Explain your strategy in your own words — or paste a YouTube video of it. The AI extracts your actual rules (entries, filters, exits) and stores them as your <b>Strategy Brain</b>, used by the Coach, Live monitor and backtest.";
  }

  /* backtest pair select */
  const faves = ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "AUD/NZD"];
  const known = [...new Set([...Object.keys(INSTRUMENTS), ...state.trades.map((t) => t.pair)])];
  $("#btPair").innerHTML = [...new Set([...faves, ...known])].map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");

  const btn = $("#btnBacktest");
  btn.disabled = !b;
  btn.title = b ? "" : "Teach your strategy first";
  $("#btnReport").disabled = !b;

  if (!b) {
    $("#bLearned").innerHTML = '<div class="empty" style="padding:22px"><p>Nothing learned yet — teach your strategy on the left.</p></div>';
    $("#btResult").innerHTML = "";
    return;
  }
  const r = b.rules || {};
  const ex = r.exit || {};
  const conds = (r.entry_conditions || []).map((c) => {
    const v = c.value != null ? " " + c.value : "";
    return `<span class="cond-chip"><b>${esc(c.metric + " " + (c.op || "") + v)}</b>${c.note ? " — " + esc(c.note) : ""}</span>`;
  });
  const filters = (r.filters || []).map((c) => {
    const v = c.value != null ? " " + c.value : "";
    return `<span class="cond-chip"><b>${esc(c.metric + " " + (c.op || "") + v)}</b>${c.note ? " — " + esc(c.note) : ""}</span>`;
  });
  const exitChips = [];
  if (ex.sl_pct != null) exitChips.push(`SL ${ex.sl_pct}%`);
  if (ex.tp_pct != null) exitChips.push(`TP ${ex.tp_pct}%`);
  if (ex.atr_sl_mult != null) exitChips.push(`SL ${ex.atr_sl_mult}×ATR`);
  if (ex.atr_tp_mult != null) exitChips.push(`TP ${ex.atr_tp_mult}×ATR`);
  if (ex.max_hold_bars) exitChips.push(`max hold ${ex.max_hold_bars} bars`);
  if (ex.trail_pct) exitChips.push(`trail ${ex.trail_pct}%`);
  if (!exitChips.length) exitChips.push("not specified");

  $("#bLearned").innerHTML = `
    <div class="lb-name">${esc(b.name || "My strategy")}</div>
    ${b.summary ? `<div class="lb-summary">${esc(b.summary)}</div>` : ""}
    <div class="lb-section" style="display:flex;justify-content:space-between;align-items:center">
      <span>Direction / timeframe</span>
      <button class="btn primary sm" id="btnEditBrain">✏️ Edit entry &amp; exit rules</button>
    </div>
    <div class="cond-chips">
      <span class="cond-chip"><b>${esc((r.direction || "both").toUpperCase())}</b></span>
      <span class="cond-chip"><b>${esc(r.timeframe || "1h")}</b></span>
      ${r.heiken_ashi ? `<span class="cond-chip"><b>Heiken Ashi</b></span>` : ""}
    </div>
    <div class="lb-section">Entry conditions</div>
    <div class="cond-chips">${conds.length ? conds.join("") : '<span class="cond-chip">none specified</span>'}</div>
    ${filters.length ? `<div class="lb-section">Filters</div><div class="cond-chips">${filters.join("")}</div>` : ""}
    <div class="lb-section">Exit plan</div>
    <div class="cond-chips">${exitChips.map((c) => `<span class="cond-chip"><b>${esc(c)}</b></span>`).join("")}</div>
    ${(r.notes || []).length ? `<div class="lb-note">${r.notes.map((n) => "• " + esc(n)).join("<br>")}</div>` : ""}
    <div class="lb-section" style="margin-top:8px">Taught from</div>
    <div class="cond-chips">
      ${((b.source && b.source.log) || [{type:"preset", label:"loaded" }]).map((s) =>
        `<span class="cond-chip">${esc(s.type)} — ${esc(s.label)}</span>`).join("")}
    </div>
    <div class="lb-note" style="margin-top:6px">Add more videos, text or screenshots above — it merges into this strategy.</div>`;
  const editBtn = $("#btnEditBrain");
  if (editBtn) editBtn.addEventListener("click", openBrainEditor);
}

let teachImgs = []; /* [{mime_type, data}] after client-side resize */
let teachVideo = null; /* {mime_type, data, name, sizeMB} */

function fileToResizedDataURL(file, maxDim) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
        cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const dataUrl = cv.toDataURL("image/jpeg", 0.85);
        resolve(dataUrl);
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = url;
  });
}

function renderImgPreviews() {
  const wrap = $("#bImgPreviews");
  wrap.innerHTML = teachImgs.map((im, i) => `
    <div class="ip-thumb"><img src="data:${im.mime_type};base64,${im.data}">
      <button class="ip-x" data-ix="${i}">✕</button></div>`).join("");
  $$("#bImgPreviews .ip-x").forEach((b) => b.addEventListener("click", () => {
    teachImgs.splice(Number(b.dataset.ix), 1);
    renderImgPreviews();
  }));
}

function renderVideoInfo() {
  const wrap = $("#bVideoInfo");
  if (!teachVideo) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = `
    <div class="ip-thumb" style="width:auto;padding:6px 12px;height:auto;display:flex;align-items:center;gap:8px">
      🎬 <b>${esc(teachVideo.name)}</b> (${teachVideo.sizeMB} MB)
      <button class="ip-x" style="position:static" id="bvClear">✕</button>
    </div>`;
  const clr = $("#bvClear");
  if (clr) clr.addEventListener("click", () => { teachVideo = null; renderVideoInfo(); });
}

async function teachStrategy() {
  const text = $("#bText").value.trim();
  const yt = $("#bYt").value.trim();
  if (!text && !yt && !teachImgs.length && !teachVideo) { toast("Explain your strategy, paste a link, upload screenshots, or add a video", "err"); return; }
  const btn = $("#btnTeach");
  btn.disabled = true;
  btn.innerHTML = "<span>" + (teachVideo ? "Sending video to Gemini… (can take a minute)" : "Reading & learning… (can take ~30s)") + "</span>";
  try {
    const res = await postJSON("/api/strategy/brain", { text, youtube_url: yt, images: teachImgs, video: teachVideo });
    if (!res.ok) throw new Error(res.error || "Teach failed");
    state.brain = res.brain;
    renderBrain();
    toast("Strategy learned — it's now your Strategy Brain 🧠");
  } catch (err) {
    toast("Teach failed: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "<span>Teach my strategy</span>";
  }
}

async function runBacktest() {
  const pair = $("#btPair").value;
  const tf = $("#btTf").value;
  const months = $("#btMonths").value;
  const btn = $("#btnBacktest");
  btn.disabled = true;
  btn.innerHTML = "<span>Backtesting…</span>";
  try {
    const res = await postJSON("/api/strategy/backtest", { pair, timeframe: tf, months: Number(months) });
    if (!res.ok) throw new Error(res.error || "Backtest failed");
    renderBacktestResult(res);
    state.lastBtParams = { pair, timeframe: tf, months: Number(months) };
    $("#btnReport").disabled = false;
    $("#btReport").innerHTML = "";
    toast(`Backtest: ${res.stats.trades} trades · ${res.stats.winRate}% win rate`);
  } catch (err) {
    toast("Backtest failed: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><span>Run backtest</span>';
  }
}

function renderBacktestResult(res) {
  const s = res.stats;
  const cls = s.trades >= 15 && s.profitFactor >= 1.2 && s.winRate >= 40 ? "good" : s.trades >= 8 ? "mid" : "bad";
  const kpis = [
    { l: "Trades", v: String(s.trades) },
    { l: "Win rate", v: s.winRate + "%" },
    { l: "Profit factor", v: s.profitFactor === 99 ? "∞" : String(s.profitFactor) },
    { l: "Expectancy / trade", v: s.expectancy + "%" },
    { l: "Total return", v: (s.totalReturn >= 0 ? "+" : "") + s.totalReturn + "%" },
    { l: "Max drawdown", v: "-" + s.maxDrawdown + "%" },
    { l: "Avg win", v: "+" + s.avgWin + "%" },
    { l: "Avg loss", v: s.avgLoss + "%" },
    { l: "Avg hold", v: s.avgBars + " bars" },
  ];
  const trades = (res.trades || []).slice(0, 60);
  const rows = trades.map((t) => `
    <tr>
      <td class="mono">${esc(t.date)}</td>
      <td><span class="badge ${t.dir === "long" ? "long" : "short"}">${(t.dir || "").toUpperCase()}</span></td>
      <td class="num">${t.entry}</td>
      <td class="num">${t.exit === "open" ? "open" : t.exit}</td>
      <td class="num ${t.pnl_pct > 0 ? "pnl-pos" : t.pnl_pct < 0 ? "pnl-neg" : "pnl-flat"}">${t.pnl_pct > 0 ? "+" : ""}${t.pnl_pct}%</td>
      <td><span class="badge ${t.pnl_pct > 0 ? "win" : t.pnl_pct < 0 ? "loss" : "be"}">${esc(t.reason || "")}</span></td>
    </tr>`).join("");

  const untestable = res.untestable || [];
  $("#btResult").innerHTML = `
    <div class="bt-verdict ${cls}">${esc(s.verdict)} — ${esc(res.pair)} · ${res.timeframe} · ${res.months}mo · ${res.bars} bars tested${res.heikenAshi ? " · Heiken Ashi" : ""}</div>
    ${untestable.length ? `<div class="hint" style="background:var(--red-soft);border:1px solid rgba(239,68,68,.35);border-radius:9px;padding:8px 12px;margin-bottom:8px">⚠️ Rules the engine can't test (drawn-by-eye lines etc.): <b>${esc(untestable.join(", "))}</b> — they don't block the backtest but won't generate signals. Use the Edit button to turn them into testable rules.</div>` : ""}
    <div class="bt-kpis">
      ${kpis.map((k) => `<div class="kpi"><div class="k-label">${k.l}</div><div class="k-value ${k.v.startsWith("-") && k.l.includes("draw") ? "down" : k.v.startsWith("+") || k.l === "Win rate" || k.l === "Profit factor" ? "up" : "flat"}">${k.v}</div></div>`).join("")}
    </div>
    <div class="chart-wrap" style="height:220px"><canvas id="btEquityChart"></canvas></div>
    <div class="lb-section" style="margin-top:14px">Sample trades (last ${trades.length})</div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Dir</th><th class="th-num">Entry</th><th class="th-num">Exit</th><th class="th-num">P&L</th><th>Exit</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  const eq = res.equity || [];
  requestAnimationFrame(() => {
    drawLineChart($("#btEquityChart"), eq, {
      yFmt: (v) => v.toLocaleString(),
      xFmt: (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      color: (eq[eq.length - 1] || {}).y >= (eq[0] || {}).y ? "#22c55e" : "#ef4444",
      fill: true,
    });
  });
}

async function runStrategyReport() {
  if (!state.lastBtParams) { toast("Run a backtest first", "err"); return; }
  const btn = $("#btnReport");
  btn.disabled = true;
  btn.innerHTML = "<span>AI is reviewing your backtest… (~30s)</span>";
  try {
    const res = await postJSON("/api/strategy/report", state.lastBtParams);
    if (!res.ok) throw new Error(res.error || "Report failed");
    renderReport(res.report);
    toast("Strategy report ready");
  } catch (err) {
    toast("Report failed: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg><span>Get AI strategy report</span>';
  }
}

function renderReport(rp) {
  const v = rp.verdict || "unproven";
  const cls = v === "strong" || v === "promising" ? "strong" : v === "weak" ? "weak" : "unproven";
  $("#btReport").innerHTML = `
    <div class="rp-verdict ${cls}">${v === "strong" ? "💪 Strong strategy" : v === "promising" ? "📈 Promising — keep testing" : v === "weak" ? "⚠️ Weak — needs work" : "❓ Unproven"}</div>
    <div class="rp-summary">${esc(rp.summary || "")}</div>
    <div class="rp-col">
      <div>
        <div class="lb-section">Strengths</div>
        <ul class="rp-list">${(rp.strengths || []).map((s) => `<li class="good">${esc(s)}</li>`).join("") || '<li>—</li>'}</ul>
      </div>
      <div>
        <div class="lb-section">Weaknesses</div>
        <ul class="rp-list">${(rp.weaknesses || []).map((w) => `<li class="bad">${esc(w)}</li>`).join("") || '<li>—</li>'}</ul>
      </div>
    </div>
    <div class="lb-section" style="margin:12px 0 6px">Suggested improvements</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${(rp.suggestions || []).map((s) => `<div class="rp-sugg"><b>${esc(s.change || "")}</b><span class="why">why: ${esc(s.why || "")}</span></div>`).join("") || '<div class="rp-sugg">—</div>'}
    </div>`;
}

const BRAIN_METRICS = [
  ["close", "Close price"], ["open", "Open price"], ["high", "High price"], ["low", "Low price"],
  ["rsi", "RSI (14)"], ["sma", "SMA 20"], ["ema", "EMA 20"], ["atr", "ATR (14)"],
  ["momentum_pct", "Momentum % (8 bars)"], ["body_pct", "Candle body %"], ["trend", "Trend (up/down/flat)"],
  ["candle", "Candle color (up/down)"], ["breakout_high", "Break above n-bar high"],
  ["breakout_low", "Break below n-bar low"], ["swing_high_break", "Close above last swing high"],
  ["swing_low_break", "Close below last swing low"], ["pullback_pct", "Pullback % from swing high"],
  ["pullback_low_pct", "Pullback % up from swing low"],
  ["htf_trend", "Higher-TF trend (top-down)"],
  ["trendline_break_up", "Break ABOVE downtrend line"], ["trendline_break_down", "Break BELOW uptrend line"],
  ["price_vs_trendline", "Price vs trendline (%)"], ["trendline_touches", "Trendline touches"],
  ["above_swing_high", "Price above swing high (1/0)"], ["below_swing_low", "Price below swing low (1/0)"],
  ["position_in_range", "Position in range (0-1)"],
];
const BRAIN_OPS = ["<", "<=", ">", ">=", "=="];
const BRAIN_METRIC_HINTS = {
  trend: "op = up | down | flat", candle: "op = up | down",
  swing_high_break: "op > , value = fractal window (3)",
  swing_low_break: "op > , value = fractal window (3)",
  breakout_high: "op > , value = lookback bars (24)", breakout_low: "op > , value = lookback bars (24)",
  pullback_pct: "op > , value = min % pullback", pullback_low_pct: "op > , value = min % pullback",
  htf_trend: "op = up | down | flat", trendline_break_up: "op > , value = min touches (2)",
  trendline_break_down: "op > , value = min touches (2)", price_vs_trendline: "op >/< , value = %",
  trendline_touches: "op >= , value = min touches",
  above_swing_high: "op == , value 1", below_swing_low: "op == , value 1",
};

function brainCondRowHTML(c, prefix) {
  const metrics = BRAIN_METRICS.map(([m, label]) =>
    `<option value="${m}" ${c && c.metric === m ? "selected" : ""}>${label}</option>`).join("");
  const ops = BRAIN_OPS.map((o) => `<option value="${o}" ${c && c.op === o ? "selected" : ""}>${o}</option>`).join("");
  return `
    <div class="brain-cond-row" data-prefix="${prefix}">
      <select class="input bc-metric" style="flex:1.4">${metrics}</select>
      <select class="input bc-op" style="width:70px">${ops}</select>
      <input type="number" step="any" class="input bc-val" style="width:90px" value="${c && c.value != null ? c.value : ""}" placeholder="value">
      <input type="text" class="input bc-note" style="flex:1.2" placeholder="note (optional)" value="${esc(c && c.note || "")}">
      <button class="icon-btn del bc-del" title="Remove">✕</button>
    </div>`;
}

function openBrainEditor() {
  const b = state.brain;
  if (!b) { toast("Teach a strategy first", "err"); return; }
  const r = b.rules || {};
  const ex = r.exit || {};
  const box = $("#modalBox");
  box.innerHTML = `
  <div class="modal-head"><h2>✏️ Edit strategy — entry &amp; exit criteria</h2><button class="close-x" id="mClose">✕</button></div>
  <div class="modal-body">
    <div class="form-grid">
      <label class="field"><span>Strategy name</span><input class="input" id="beName" value="${esc(b.name || "")}"></label>
      <label class="field"><span>Direction</span>
        <select class="input" id="beDir">
          <option value="both" ${(r.direction || "both") === "both" ? "selected" : ""}>Both</option>
          <option value="long" ${r.direction === "long" ? "selected" : ""}>Long only</option>
          <option value="short" ${r.direction === "short" ? "selected" : ""}>Short only</option>
        </select>
      </label>
      <label class="field"><span>Timeframe</span>
        <select class="input" id="beTf">
          <option value="1h" ${(r.timeframe || "4h") === "1h" ? "selected" : ""}>1 hour</option>
          <option value="4h" ${(r.timeframe || "4h") === "4h" ? "selected" : ""}>4 hours</option>
          <option value="1d" ${(r.timeframe || "4h") === "1d" ? "selected" : ""}>1 day</option>
        </select>
      </label>
      <label class="field" style="justify-content:flex-end"><span>&nbsp;</span>
        <label class="check-line"><input type="checkbox" id="beHa" ${r.heiken_ashi ? "checked" : ""}> <b>Use Heiken Ashi candles</b></label>
      </label>
      <label class="field full"><span>Summary</span>
        <textarea class="input" id="beSummary" rows="2">${esc(b.summary || "")}</textarea>
      </label>
    </div>
    <div class="lb-section" style="margin-top:14px">Entry conditions (all must hold)</div>
    <div class="brain-conds" id="beEntry"></div>
    <button class="btn ghost sm" id="beAddEntry">+ Add entry condition</button>
    <div class="lb-section" style="margin-top:12px">Filters (all must hold)</div>
    <div class="brain-conds" id="beFilters"></div>
    <button class="btn ghost sm" id="beAddFilter">+ Add filter</button>
    <div class="lb-section" style="margin-top:14px">Exit plan</div>
    <div class="form-grid">
      <label class="field"><span>Stop loss % (of entry)</span><input type="number" step="any" class="input" id="beSlPct" value="${ex.sl_pct != null ? ex.sl_pct : ""}"></label>
      <label class="field"><span>Take profit % (empty = let trend run)</span><input type="number" step="any" class="input" id="beTpPct" value="${ex.tp_pct != null ? ex.tp_pct : ""}"></label>
      <label class="field"><span>SL × ATR</span><input type="number" step="any" class="input" id="beAtrSl" value="${ex.atr_sl_mult != null ? ex.atr_sl_mult : ""}"></label>
      <label class="field"><span>TP × ATR</span><input type="number" step="any" class="input" id="beAtrTp" value="${ex.atr_tp_mult != null ? ex.atr_tp_mult : ""}"></label>
      <label class="field"><span>Trailing stop % (trend-following)</span><input type="number" step="any" class="input" id="beTrail" value="${ex.trail_pct != null ? ex.trail_pct : ""}"></label>
      <label class="field"><span>Max hold (bars)</span><input type="number" step="1" class="input" id="beHold" value="${ex.max_hold_bars != null ? ex.max_hold_bars : ""}"></label>
    </div>
    <div class="lb-section" style="margin-top:12px">Notes / untestable rules</div>
    <textarea class="input" id="beNotes" rows="2" style="width:100%">${esc((r.notes || []).join("\n"))}</textarea>
  </div>
  <div class="modal-foot">
    <button class="btn ghost" id="mCancel">Cancel</button>
    <button class="btn primary" id="beSave">Save strategy</button>
  </div>`;

  const entryWrap = $("#beEntry"), filterWrap = $("#beFilters");
  (r.entry_conditions || []).forEach((c) => entryWrap.insertAdjacentHTML("beforeend", brainCondRowHTML(c, "entry")));
  (r.filters || []).forEach((c) => filterWrap.insertAdjacentHTML("beforeend", brainCondRowHTML(c, "filter")));
  if (!(r.entry_conditions || []).length) entryWrap.insertAdjacentHTML("beforeend", brainCondRowHTML(null, "entry"));
  bindBrainRowEvents(entryWrap); bindBrainRowEvents(filterWrap);

  $("#beAddEntry").addEventListener("click", () => {
    entryWrap.insertAdjacentHTML("beforeend", brainCondRowHTML(null, "entry"));
    bindBrainRowEvents(entryWrap);
  });
  $("#beAddFilter").addEventListener("click", () => {
    filterWrap.insertAdjacentHTML("beforeend", brainCondRowHTML(null, "filter"));
    bindBrainRowEvents(filterWrap);
  });

  showModal();
  $("#mClose").addEventListener("click", hideModal);
  $("#mCancel").addEventListener("click", hideModal);
  $("#beSave").addEventListener("click", async () => {
    const collect = (wrap) => Array.from(wrap.querySelectorAll(".brain-cond-row")).map((row) => {
      const metric = row.querySelector(".bc-metric").value;
      const op = row.querySelector(".bc-op").value;
      const vRaw = row.querySelector(".bc-val").value;
      const note = row.querySelector(".bc-note").value.trim();
      const c = { metric, op };
      if (vRaw !== "") c.value = Number(vRaw);
      if (note) c.note = note;
      return c;
    }).filter((c) => c.metric);
    const num = (id) => { const v = $(id).value; return v === "" || v == null ? null : Number(v); };
    const rules = {
      name: $("#beName").value.trim() || "My strategy",
      summary: $("#beSummary").value.trim(),
      direction: $("#beDir").value,
      timeframe: $("#beTf").value,
      heiken_ashi: $("#beHa").checked,
      entry_conditions: collect(entryWrap),
      filters: collect(filterWrap),
      exit: {
        sl_pct: num("#beSlPct"), tp_pct: num("#beTpPct"),
        atr_sl_mult: num("#beAtrSl"), atr_tp_mult: num("#beAtrTp"),
        trail_pct: num("#beTrail"), max_hold_bars: num("#beHold"),
      },
      notes: $("#beNotes").value.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    try {
      const res = await postJSON("/api/strategy/brain/manual", { name: rules.name, summary: rules.summary, rules });
      if (!res.ok) throw new Error(res.error || "Save failed");
      state.brain = res.brain;
      hideModal();
      renderBrain();
      toast("Strategy updated — run a backtest to check it");
    } catch (err) {
      toast("Save failed: " + err.message, "err");
    }
  });
}

function bindBrainRowEvents(wrap) {
  wrap.querySelectorAll(".bc-metric").forEach((sel) => {
    sel.addEventListener("change", () => {
      const hint = BRAIN_METRIC_HINTS[sel.value];
      const noteInput = sel.closest(".brain-cond-row").querySelector(".bc-note");
      if (hint && !noteInput.dataset.touched) noteInput.placeholder = hint;
    });
  });
  wrap.querySelectorAll(".bc-del").forEach((b) => b.addEventListener("click", () => {
    b.closest(".brain-cond-row").remove();
  }));
}

function bindBrainEvents() {
  $("#btnTeach").addEventListener("click", teachStrategy);
  $("#btnBacktest").addEventListener("click", runBacktest);
  const bp = $("#btnPreset");
  if (bp) bp.addEventListener("click", async () => {
    try {
      const res = await postJSON("/api/strategy/brain/preset", {});
      if (!res.ok) throw new Error(res.error || "Failed");
      state.brain = res.brain;
      renderBrain();
      toast("Your strategy is loaded — it already knows it ⚡");
    } catch (err) { toast("Failed: " + err.message, "err"); }
  });
  $("#bVideo").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast("Please choose a video file", "err"); return; }
    if (f.size > 200 * 1024 * 1024) { toast("Video too large — max 200 MB before compression", "err"); return; }
    toast("Compressing video… (a few seconds)");
    try {
      const compressed = await compressVideo(f);
      if (!compressed) throw new Error("compression failed");
      teachVideo = { mime_type: "video/mp4", data: compressed.data, name: f.name, sizeMB: compressed.sizeMB };
      renderVideoInfo();
      toast("Video ready (" + compressed.sizeMB + " MB) — Gemini will watch it");
    } catch (err) {
      toast("Could not process that video: " + err.message, "err");
    }
  });

/* compress video in the browser to keep it under the upload limit (~15 MB) */
async function compressVideo(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const cv = document.createElement("canvas");
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true;
      const url = URL.createObjectURL(file);
      v.src = url;
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; setTimeout(() => rej(new Error("timeout")), 15000); });
      const dur = v.duration || 60;
      const maxDur = 120;
      const step = dur > maxDur ? dur / maxDur : 1;
      const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight || 1));
      const w = Math.max(1, Math.round((v.videoWidth || 640) * scale));
      const h = Math.max(1, Math.round((v.videoHeight || 360) * scale));
      const mime = "video/mp4";
      const chunks = [];
      const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 600000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        URL.revokeObjectURL(url);
        const blob = new Blob(chunks, { type: mime });
        const reader = new FileReader();
        reader.onload = () => resolve({ data: String(reader.result).split(",")[1], sizeMB: (blob.size / 1048576).toFixed(1) });
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(blob);
      };
      const ctx = cv.getContext("2d");
      cv.width = w; cv.height = h;
      let t = 0;
      rec.start(500);
      v.currentTime = t;
      v.ontimeupdate = () => {
        if (v.currentTime >= t + step - 0.05) {
          ctx.drawImage(v, 0, 0, w, h);
          t += step;
          if (t >= Math.min(dur, maxDur)) { v.pause(); rec.stop(); }
          else v.currentTime = Math.min(t, dur);
        }
      };
      v.play().catch(() => {});
      setTimeout(() => { if (rec.state !== "inactive") { try { rec.stop(); } catch (e) {} } }, (maxDur + 15) * 1000);
    } catch (e) {
      reject(e);
    }
  });
}
  $("#bImgs").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 6 - teachImgs.length);
    e.target.value = "";
    for (const f of files) {
      try {
        const dataUrl = await fileToResizedDataURL(f, 900);
        teachImgs.push({ mime_type: "image/jpeg", data: dataUrl.split(",")[1] });
      } catch (err) { toast("Could not read " + f.name, "err"); }
    }
    renderImgPreviews();
    if (teachImgs.length) toast(teachImgs.length + " screenshot(s) ready to teach with");
  });
  $("#btnReport").addEventListener("click", runStrategyReport);
}

/* ============================ live monitor ============================ */

function renderLive() {
  const d = state.live.data;
  if (!d) {
    $("#lvPrices").innerHTML = '<div class="empty" style="padding:20px"><p>Monitor not started yet — turn it on above.</p></div>';
    return;
  }
  /* status */
  const chip = $("#liveStatusChip");
  chip.textContent = d.enabled ? "LIVE" : "off";
  chip.className = "chip " + (d.enabled ? "green" : "neutral");
  $("#btnLiveToggle").textContent = d.enabled ? "Turn off" : "Turn on";
  $("#btnLiveToggle").classList.toggle("primary", !d.enabled);
  $("#lvPairs").value = (d.pairs || []).join(", ");
  $("#lvPriceInt").value = d.priceInterval;
  $("#lvAiInt").value = d.aiInterval;
  $("#lvAiOn").checked = !!d.aiEnabled;

  /* gemini status */
  const g = d.gemini || {};
  let gHtml = `<span class="sig-stat ${g.configured ? "" : ""}">${g.configured ? "✅ Key configured" : "⚠️ No API key — add it in Settings"}</span>`;
  if (g.configured) gHtml += `<span class="sig-stat">model <b>${esc(g.model || "")}</b></span>`;
  if (g.lastAiAt) gHtml += `<span class="sig-stat">last AI call <b>${timeAgo(g.lastAiAt * 1000)}</b></span>`;
  if (g.lastError) gHtml += `<span class="sig-stat" style="border-color:rgba(239,68,68,.5);color:#f87171">⚠️ ${esc(g.lastError)}</span>`;
  $("#lvGeminiStatus").innerHTML = gHtml;

  /* freshness */
  const updated = Math.max(...d.prices.map((p) => p.updatedAt || 0), 0);
  $("#lvFreshness").textContent = updated ? "prices updated " + timeAgo(updated * 1000) : "waiting for prices…";

  /* prices table */
  if (!d.prices.length) {
    $("#lvPrices").innerHTML = '<div class="empty" style="padding:20px"><p>No pairs configured.</p></div>';
  } else {
    const rows = d.prices.map((p) => {
      const chgCls = (p.changePct || 0) >= 0 ? "pnl-pos" : "pnl-neg";
      const ai = p.ai;
      let aiCell = '<span style="color:var(--dim)">—</span>';
      if (ai) {
        const dirColor = ai.direction === "long" ? "var(--green)" : ai.direction === "short" ? "#f87171" : "var(--dim)";
        const actCls = ai.action === "enter" ? '<span class="badge win">ENTER</span>' : ai.action === "exit" ? '<span class="badge loss">EXIT</span>' : '<span class="badge be">wait</span>';
        aiCell = `<span style="color:${dirColor};font-weight:800">${(ai.direction || "none").toUpperCase()}</span> <b>${ai.strength != null ? ai.strength + "%" : "—"}</b> ${actCls}<div style="color:var(--dim);font-size:11px;max-width:260px">${esc(ai.reason || "")}</div>`;
      }
      const trendArrow = p.trend === "up" ? "▲" : p.trend === "down" ? "▼" : "◆";
      const trendColor = p.trend === "up" ? "var(--green)" : p.trend === "down" ? "#f87171" : "var(--dim)";
      return `<tr>
        <td><b>${esc(p.pair)}</b></td>
        <td class="num mono" style="font-size:13px">${p.price != null ? p.price.toFixed(p.pair.includes("JPY") ? 3 : 5) : "—"}</td>
        <td class="num ${chgCls}">${p.changePct != null ? (p.changePct >= 0 ? "+" : "") + p.changePct + "%" : "—"}</td>
        <td class="num">${p.rsi != null ? p.rsi : "—"}</td>
        <td class="num" style="color:${trendColor}">${trendArrow} ${esc(p.trend || "—")}</td>
        <td class="num">${p.pos != null ? (p.pos * 100).toFixed(0) + "%" : "—"}</td>
        <td>${aiCell}</td>
        <td class="num" style="color:var(--dim);font-size:11px">${p.updatedAt ? timeAgo(p.updatedAt * 1000) : "—"}</td>
      </tr>`;
    }).join("");
    $("#lvPrices").innerHTML = `<table class="tbl">
      <thead><tr><th>Pair</th><th class="th-num">Price</th><th class="th-num">Δ 2d</th><th class="th-num">RSI</th><th class="th-num">Trend</th><th class="th-num">Day pos</th><th>AI verdict</th><th class="th-num">Updated</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  /* open positions */
  const pos = d.openPositions || [];
  $("#lvPosCount").textContent = pos.length + (pos.length === 1 ? " position" : " positions");
  if (!pos.length) {
    $("#lvPositions").innerHTML = '<div class="empty" style="padding:20px"><p>No open positions. Log a trade with "Position still open" checked and you\'ll get exit alerts here.</p></div>';
  } else {
    const rows = pos.map((t) => {
      const adv = t.advice || { level: "monitor", text: "" };
      const lvlCls = adv.level === "danger" ? "loss" : adv.level === "ok" ? "win" : "be";
      return `<tr class="row-open">
        <td><b>${esc(t.pair)}</b></td>
        <td><span class="badge ${t.direction === "long" ? "long" : "short"}">${(t.direction || "").toUpperCase()}</span></td>
        <td class="num">${fmtNum(t.lot)}</td>
        <td class="num">${t.entry != null ? fmtNum(t.entry, 5) : "—"}</td>
        <td class="num">${t.sl != null ? fmtNum(t.sl, 5) : "—"}</td>
        <td class="num">${t.tp != null ? fmtNum(t.tp, 5) : "—"}</td>
        <td class="num mono" style="font-size:13px">${t.livePrice != null ? t.livePrice.toFixed(t.pair.includes("JPY") ? 3 : 5) : "—"}</td>
        <td><span class="badge ${lvlCls}">${esc(adv.text)}</span></td>
      </tr>`;
    }).join("");
    $("#lvPositions").innerHTML = `<table class="tbl">
      <thead><tr><th>Pair</th><th>Dir</th><th class="th-num">Lots</th><th class="th-num">Entry</th><th class="th-num">SL</th><th class="th-num">TP</th><th class="th-num">Live</th><th>Guidance</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  /* paper trading */
  const pp = d.paper || { open: [], closed: [], stats: {} };
  $("#ppChip").textContent = d.paperEnabled ? "ON" : "off";
  $("#ppChip").className = "chip " + (d.paperEnabled ? "green" : "neutral");
  $("#ppOn").checked = !!d.paperEnabled;
  const ps = pp.stats || {};
  $("#ppStats").innerHTML = `
    <span class="sig-stat">Closed: <b>${ps.trades || 0}</b></span>
    <span class="sig-stat">Win rate: <b>${ps.trades ? ((ps.wins / ps.trades) * 100).toFixed(0) + "%" : "—"}</b></span>
    <span class="sig-stat">Net: <b class="${(ps.netPct || 0) >= 0 ? "pnl-pos" : "pnl-neg"}">${(ps.netPct || 0) >= 0 ? "+" : ""}${ps.netPct || 0}%</b></span>
    <span class="sig-stat">Paper balance: <b>$${(ps.balance || 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></span>
    <span class="sig-stat">Open: <b>${pp.open.length}</b></span>`;
  if (!pp.open.length) {
    $("#ppOpen").innerHTML = '<p class="hint">No open paper trades. Turn the switch on and the next ENTER alert will open one automatically.</p>';
  } else {
    $("#ppOpen").innerHTML = `<table class="tbl">
      <thead><tr><th>Pair</th><th>Dir</th><th class="th-num">Entry</th><th class="th-num">SL</th><th class="th-num">TP</th><th class="th-num">Live</th><th class="th-num">Live P&L</th><th></th></tr></thead>
      <tbody>${pp.open.map((t) => {
        const live = (d.prices.find((x) => x.pair === t.pair) || {}).price;
        const lp = live ? ((live / t.entry - 1) * 100 * (t.direction === "long" ? 1 : -1)) : null;
        return `<tr class="row-open">
          <td><b>${esc(t.pair)}</b></td>
          <td><span class="badge ${t.direction === "long" ? "long" : "short"}">${(t.direction || "").toUpperCase()}</span></td>
          <td class="num">${fmtNum(t.entry, 5)}</td>
          <td class="num">${fmtNum(t.sl, 5)}</td>
          <td class="num">${fmtNum(t.tp, 5)}</td>
          <td class="num mono" style="font-size:13px">${live != null ? live.toFixed(5) : "—"}</td>
          <td class="num ${lp != null ? (lp >= 0 ? "pnl-pos" : "pnl-neg") : ""}">${lp != null ? (lp >= 0 ? "+" : "") + lp.toFixed(2) + "%" : "—"}</td>
          <td><button class="btn sm ghost" data-ppclose="${t.id}">Close</button></td>
        </tr>`;
      }).join("")}</tbody></table>`;
  }
  $$("#ppOpen [data-ppclose]").forEach((b) => b.addEventListener("click", async () => {
    await postJSON("/api/paper/close", { id: Number(b.dataset.ppclose) });
    toast("Paper trade closed");
    refreshLive();
  }));
  if (!pp.closed.length) {
    $("#ppClosed").innerHTML = '<p class="hint">No closed paper trades yet.</p>';
  } else {
    $("#ppClosed").innerHTML = `<table class="tbl">
      <thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th class="th-num">Entry</th><th class="th-num">Exit</th><th class="th-num">P&L</th><th>Exit</th></tr></thead>
      <tbody>${pp.closed.map((t) => `
        <tr>
          <td class="mono">${esc((t.closeTs || t.ts || "").slice(0, 10))}</td>
          <td><b>${esc(t.pair)}</b></td>
          <td><span class="badge ${t.direction === "long" ? "long" : "short"}">${(t.direction || "").toUpperCase()}</span></td>
          <td class="num">${fmtNum(t.entry, 5)}</td>
          <td class="num">${t.exit != null ? fmtNum(t.exit, 5) : "—"}</td>
          <td class="num ${(t.pnl_pct || 0) >= 0 ? "pnl-pos" : "pnl-neg"}">${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct}%</td>
          <td><span class="badge ${t.pnl_pct > 0 ? "win" : t.pnl_pct < 0 ? "loss" : "be"}">${esc(t.reason || "")}</span></td>
        </tr>`).join("")}</tbody></table>`;
  }

  /* alerts feed */
  const alerts = d.alerts || [];
  if (!alerts.length) {
    $("#lvAlerts").innerHTML = '<div class="empty" style="padding:20px"><p>No alerts yet. Enter alerts fire when the AI finds a setup; exit alerts fire for your open positions.</p></div>';
  } else {
    $("#lvAlerts").innerHTML = alerts.slice(0, 30).map((a) => `
      <div class="alert-item ${a.read ? "read" : ""}">
        <span class="badge ${a.type === "enter" ? "win" : a.type === "exit" ? "loss" : "be"}">${a.type === "enter" ? "ENTER" : a.type === "exit" ? "EXIT" : "INFO"}</span>
        <div class="al-body">
          <div class="al-title">${esc(a.title)} <span class="al-pair">${esc(a.pair || "")}</span></div>
          <div class="al-text">${esc(a.body)}</div>
        </div>
        <span class="al-time">${esc(a.ts ? a.ts.slice(11, 16) : "")}</span>
      </div>`).join("");
  }
  $("#bellBadge").textContent = d.unread || 0;
  $("#bellBadge").classList.toggle("hidden", !(d.unread > 0));
}

async function refreshLive() {
  try {
    const d = await getJSON("/api/live/state");
    const prevUnread = state.live.data ? state.live.data.unread : 0;
    state.live.data = d;
    /* notify on new alerts */
    (d.alerts || []).forEach((a) => {
      if (a.id > state.live.lastAlertId) {
        state.live.lastAlertId = a.id;
        notifyUser(a);
      }
    });
    if (d.unread > prevUnread && !document.hidden && state.view === "live") {
      renderLive();
    }
    if (state.view === "live") renderLive();
  } catch (e) { /* server briefly unreachable — ignore */ }
}

function notifyUser(a) {
  toast(a.title + " — " + a.body, a.type === "exit" ? "err" : "ok");
  playAlertSound();
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification("PipTrack " + (a.type === "enter" ? "📈 ENTER" : a.type === "exit" ? "🛑 EXIT" : "🔔"), { body: a.title + " — " + a.body });
      setTimeout(() => n.close(), 15000);
    }
  } catch (e) { /* notifications unavailable (e.g. embedded preview) */ }
}

let _audioCtx = null;
function playAlertSound() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const beep = (freq, start, dur) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
    };
    beep(880, 0, 0.18);
    beep(1174, 0.22, 0.25);
  } catch (e) { /* audio unavailable */ }
}

async function toggleLiveMonitor() {
  const wantOn = !(state.live.data && state.live.data.enabled);
  await postJSON("/api/live/config", { enabled: wantOn });
  if (wantOn && "Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (e) { /* blocked in preview */ }
  }
  toast(wantOn ? "Live monitor ON — watching prices & AI" : "Live monitor off");
  refreshLive();
}

async function saveLiveConfig() {
  const pairs = $("#lvPairs").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const priceInterval = Math.max(15, Math.min(3600, parseInt($("#lvPriceInt").value, 10) || 60));
  const aiInterval = Math.max(30, Math.min(3600, parseInt($("#lvAiInt").value, 10) || 180));
  await postJSON("/api/live/config", { pairs, priceInterval, aiInterval, aiEnabled: $("#lvAiOn").checked });
  toast("Monitor settings saved");
  refreshLive();
}

function bindLiveEvents() {
  $("#btnLiveToggle").addEventListener("click", toggleLiveMonitor);
  $("#ppOn").addEventListener("change", async () => {
    await postJSON("/api/live/config", { paperEnabled: $("#ppOn").checked });
    toast($("#ppOn").checked ? "Paper trading ON — ENTER alerts will open simulated trades" : "Paper trading off");
    refreshLive();
  });
  $("#lvPairs").addEventListener("change", saveLiveConfig);
  $("#lvPriceInt").addEventListener("change", saveLiveConfig);
  $("#lvAiInt").addEventListener("change", saveLiveConfig);
  $("#lvAiOn").addEventListener("change", saveLiveConfig);
  $("#btnTestAlert").addEventListener("click", async () => {
    await postJSON("/api/alerts/test", { title: "🔔 Test notification", body: "Notifications are working — you'll see enter/exit alerts here." });
    toast("Test alert sent");
    refreshLive();
  });
  $("#btnMarkRead").addEventListener("click", async () => {
    await postJSON("/api/alerts/read", { all: true });
    if (state.live.data) state.live.data.unread = 0;
    $("#bellBadge").classList.add("hidden");
    renderLive();
  });
  $("#btnBell").addEventListener("click", () => switchView("live"));
}

function bindSettingsEvents() {
  $("#btnSaveGemini").addEventListener("click", async () => {
    const key = $("#setGeminiKey").value.trim();
    const model = $("#setGeminiModel").value.trim();
    if (!key && !model) { toast("Nothing to save", "err"); return; }
    await postJSON("/api/config/gemini", { key, model });
    $("#setGeminiKey").value = "";
    toast("Gemini API key saved" + (key ? "" : " (unchanged)"));
    refreshLive();
  });
  $("#btnSaveTg").addEventListener("click", async () => {
    const token = $("#setTgToken").value.trim();
    const chat = $("#setTgChat").value.trim();
    const enabled = $("#setTgOn").checked;
    await postJSON("/api/config/telegram", { token, chat_id: chat, enabled });
    $("#setTgToken").value = "";
    toast("Telegram settings saved");
    refreshLive();
    renderTelegramStatus();
  });
  $("#btnTgTest").addEventListener("click", async () => {
    try {
      const r = await postJSON("/api/telegram/test", {});
      if (r.ok) toast(r.message || "Test sent");
      else toast("Telegram test failed: " + (r.error || "not configured"), "err");
    } catch (e) {
      toast("Telegram test failed: " + e.message, "err");
    }
  });
  $("#btnSaveDiscord").addEventListener("click", async () => {
    const webhook = $("#setDiscordWebhook").value.trim();
    await postJSON("/api/config/discord", { webhook });
    $("#setDiscordWebhook").value = "";
    toast("Discord settings saved");
    refreshLive();
    renderDiscordStatus();
  });
  $("#btnDiscordTest").addEventListener("click", async () => {
    try {
      const r = await postJSON("/api/discord/test", {});
      if (r.ok) toast(r.message || "Test sent");
      else toast("Discord test failed: " + (r.error || "not configured"), "err");
    } catch (e) {
      toast("Discord test failed: " + e.message, "err");
    }
  });
}

function renderDiscordStatus() {
  const t = state.live.data ? state.live.data.discord : null;
  const el = $("#discordStatus");
  if (!el) return;
  if (!t) { el.textContent = "Not configured."; return; }
  el.innerHTML = t.configured
    ? "✅ Alerts will be sent to your Discord channel"
    : "Not configured yet — create a webhook in Discord channel settings → Integrations.";
}

function renderTelegramStatus() {
  const t = state.live.data ? state.live.data.telegram : null;
  const el = $("#tgStatus");
  if (!el) return;
  if (!t) { el.textContent = "Not configured."; return; }
  el.innerHTML = t.configured
    ? (t.enabled ? `✅ Sending alerts to chat <b>${esc(t.chatId)}</b>` : `🔕 Configured (chat ${esc(t.chatId)}) but disabled`)
    : "Not configured yet — create a bot with @BotFather.";
  $("#setTgOn").checked = !!(t && t.enabled);
}

/* ============================ events & init ============================ */
function bindEvents() {
  /* nav */
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  /* add trade */
  $("#btnAddTrade").addEventListener("click", () => openTradeModal(null));
  $("#fabAdd").addEventListener("click", () => openTradeModal(null));
  /* dashboard empty state */
  document.addEventListener("click", (e) => {
    if (e.target.closest("#emptyAdd")) openTradeModal(null);
    if (e.target.closest("#emptyDemo")) loadDemo();
    if (e.target.closest("#btnViewAll")) switchView("trades");
  });
  /* export */
  $("#btnExport").addEventListener("click", exportJSON);
  /* filters */
  $("#fSearch").addEventListener("input", (e) => { state.filters.q = e.target.value; renderTrades(); });
  $("#fPair").addEventListener("change", (e) => { state.filters.pair = e.target.value; renderTrades(); });
  $("#fDirection").addEventListener("change", (e) => { state.filters.dir = e.target.value; renderTrades(); });
  $("#fResult").addEventListener("change", (e) => { state.filters.result = e.target.value; renderTrades(); });
  $("#fStrategy").addEventListener("change", (e) => { state.filters.strategy = e.target.value; renderTrades(); });
  $("#fSession").addEventListener("change", (e) => { state.filters.session = e.target.value; renderTrades(); });
  $("#fFrom").addEventListener("change", (e) => { state.filters.from = e.target.value; renderTrades(); });
  $("#fTo").addEventListener("change", (e) => { state.filters.to = e.target.value; renderTrades(); });
  $("#fReset").addEventListener("click", () => {
    state.filters = { q: "", pair: "", dir: "", result: "", strategy: "", session: "", from: "", to: "" };
    renderTrades();
  });
  /* journal */
  $("#btnAddNote").addEventListener("click", () => openNoteModal(null));
  /* coach */
  bindCoachEvents();
  /* strategy brain */
  bindBrainEvents();
  /* live monitor */
  bindLiveEvents();
  bindSettingsEvents();
  /* settings */
  $("#btnSaveSettings").addEventListener("click", async () => {
    const patch = {
      currency: $("#setCurrency").value,
      balance: parseFloat($("#setBalance").value) || 0,
      defaultLot: parseFloat($("#setLot").value) || 0.1,
      defaultStrategy: $("#setStrategy").value.trim(),
    };
    await saveSettingsPatch(patch);
    toast("Settings saved");
    renderAll();
  });
  $("#btnExportJson").addEventListener("click", exportJSON);
  $("#btnExportCsv").addEventListener("click", exportCSV);
  $("#btnImportJson").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", importJSON);
  $("#btnDemo").addEventListener("click", loadDemo);
  $("#btnClear").addEventListener("click", async () => {
    const ok = await confirmDialog("Erase all data", "This permanently deletes every trade, note, goal, signal and setting. Export a backup first if you need one.", "Erase everything", true);
    if (!ok) return;
    await postJSON("/api/import", { trades: [], notes: [], goals: {}, settings: {}, coach: { profile: {}, signals: [] } });
    state.trades = []; state.notes = []; state.goals = {}; state.settings = { currency: "USD", balance: 0, defaultLot: 0.1, defaultStrategy: "" };
    state.coach = { profile: {}, signals: [] };
    toast("All data erased");
    renderAll();
  });
  /* modal overlay click-to-close */
  $("#modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay" && !$("#modalBox").querySelector("[data-c]")) hideModal();
  });
  window.addEventListener("resize", debounce(() => {
    if (state.view === "dashboard") renderDashboard();
    if (state.view === "analytics") drawAnalyticsCharts();
  }, 200));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modalOverlay").classList.contains("hidden")) hideModal();
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function exportJSON() {
  try {
    const res = await fetch("/api/export");
    const blob = await res.blob();
    triggerDownload(blob, "piptrack-backup.json");
    toast("Backup downloaded");
  } catch (e) { toast("Export failed", "err"); }
}

function exportCSV() {
  const list = filteredTrades();
  if (!list.length) { toast("No trades to export", "err"); return; }
  const cols = ["date", "pair", "direction", "lot", "entry", "exit", "sl", "tp", "pips", "pnl", "fee", "strategy", "setup", "session", "rating", "risk", "r", "notes"];
  const rows = list.map((t) => cols.map((c) => {
    const v = t[c === "exit" ? "exit_p" : c];
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(","));
  const csv = cols.join(",") + "\n" + rows.join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv" }), "piptrack-trades.csv");
  toast("CSV downloaded");
}

function triggerDownload(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function importJSON(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const trades = Array.isArray(data) ? data : data.trades;
    if (!trades) { toast("Invalid backup file", "err"); return; }
    const res = await postJSON("/api/import", {
      trades,
      goals: data.goals || state.goals,
      settings: data.settings || state.settings,
      notes: data.notes || state.notes,
    });
    await loadAll();
    toast(`Imported ${res.imported} trades`);
  } catch (err) {
    toast("Import failed: " + err.message, "err");
  }
}

async function loadDemo() {
  const ok = await confirmDialog("Load demo data",
    "This adds ~120 realistic sample trades (Feb–Aug 2026), sample goals and journal notes so you can explore the app. It will be merged with any existing data. Continue?",
    "Load demo data");
  if (!ok) return;
  const trades = generateDemoData();
  /* one open position so the live monitor has something to watch */
  trades.push({
    ts: nowLocalInput(), pair: "EUR/USD", direction: "long", lot: 0.5,
    entry: 1.1530, exit_p: null, sl: 1.1480, tp: 1.1660,
    pips: null, pnl: null, fee: 3.5,
    strategy: "London Breakout", setup: "order block", session: "London",
    rating: 4, risk: 150, r: null,
    notes: "Open position — live monitor watches SL/TP and AI trend for exit alerts.",
  });
  const notes = [
    { date: "2026-08-14", text: "Solid week. The GBP/USD pullback entries are working well. Watched the news calendar before every trade — that cut my losses noticeably." },
    { date: "2026-08-07", text: "Took two revenge trades after a stop-out on XAU/USD. Broke my own rules and gave back a week of profits. Rule going forward: max 2 losses per day, then stop." },
    { date: "2026-07-30", text: "July review: 22 trades, 55% win rate. The Support/Resistance strategy is my best edge. The London session alone produced 70% of my profits." },
    { date: "2026-07-18", text: "Journaled my fear of entering after two consecutive wins. Consistency is about process, not the last result. Keep the risk at 1% and take the trade." },
    { date: "2026-07-02", text: "Started tracking my R multiple properly. Realized my winners average only 1.4R because I exit too early. Working on letting winners run to the TP level." },
  ];
  const coachSignals = [
    { id: 1, ts: "2026-08-10T09:15:00", tsMs: Date.parse("2026-08-10T09:15:00"), pair: "EUR/USD", direction: "long", session: "London", score: 82, verdict: "TAKE", outcome: "won", note: "" },
    { id: 2, ts: "2026-08-12T10:40:00", tsMs: Date.parse("2026-08-12T10:40:00"), pair: "XAU/USD", direction: "long", session: "London", score: 56, verdict: "WAIT", outcome: "skipped", note: "Trend direction" },
    { id: 3, ts: "2026-08-14T14:05:00", tsMs: Date.parse("2026-08-14T14:05:00"), pair: "GBP/USD", direction: "short", session: "New York", score: 74, verdict: "TAKE", outcome: "lost", note: "" },
    { id: 4, ts: "2026-08-17T08:30:00", tsMs: Date.parse("2026-08-17T08:30:00"), pair: "EUR/USD", direction: "long", session: "London", score: 44, verdict: "NO", outcome: "skipped", note: "Trend direction, Candle momentum" },
  ];
  await postJSON("/api/import", {
    trades,
    goals: { monthlyPnl: 800, monthlyTrades: 20, winRate: 55, discipline: 4 },
    settings: { currency: state.settings.currency, balance: 10000, defaultLot: state.settings.defaultLot, defaultStrategy: state.settings.defaultStrategy },
    notes,
    coach: {
      profile: { name: "London Breakout", pairs: "EUR/USD, GBP/USD, XAU/USD", sessions: ["London", "New York"], bias: "both", minWinRate: 50, strictness: "balanced", theme: "auto", riskPct: 1.5, configured: true },
      prefs: { lastPair: "EUR/USD", lastDir: "auto", lastSession: "London" },
      signals: coachSignals,
    },
  });
  await loadAll();
  toast(`Loaded ${trades.length} demo trades`);
  switchView("dashboard");
}

/* ============================ boot ============================ */
bindEvents();
/* poll live state every 15s so alerts arrive while the page is open */
setInterval(refreshLive, 15000);
refreshLive();

loadAll().catch((e) => {
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#f87171"><h2>Failed to load PipTrack</h2><p>${esc(e.message)}</p><p>Make sure the server is running (python3 server.py).</p></div>`;
});
