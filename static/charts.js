/* PipTrack charts — lightweight canvas charts (no external deps) */

function _dprScale(canvas) {
  var dpr = window.devicePixelRatio || 1;
  var r = canvas.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  var ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: r.width, h: r.height };
}

function _tip(wrap) {
  var el = wrap.querySelector(".chart-tip");
  if (!el) {
    el = document.createElement("div");
    el.className = "chart-tip";
    wrap.appendChild(el);
  }
  return el;
}

function _showTip(el, wrap, x, y, html) {
  el.innerHTML = html;
  el.style.display = "block";
  var r = wrap.getBoundingClientRect();
  var tx = x + 14, ty = y - 10;
  if (tx + 160 > r.width) tx = x - 170;
  if (ty < 6) ty = y + 16;
  el.style.left = tx + "px";
  el.style.top = ty + "px";
}

function _hideTip(el) { if (el) el.style.display = "none"; }

function _niceTicks(min, max, count) {
  if (min === max) { min -= 1; max += 1; }
  var span = max - min;
  var step = Math.pow(10, Math.floor(Math.log10(span / count)));
  var err = span / count / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  var start = Math.ceil(min / step) * step;
  var ticks = [];
  for (var v = start; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function _bindHover(canvas, handler) {
  if (canvas._ptip) { canvas.removeEventListener("mousemove", canvas._ptip); }
  canvas.addEventListener("mousemove", handler);
  canvas._ptip = handler;
}
function _bindLeave(canvas, handler) {
  if (canvas._pleave) { canvas.removeEventListener("mouseleave", canvas._pleave); }
  canvas.addEventListener("mouseleave", handler);
  canvas._pleave = handler;
}

/* ---------- line / area chart ----------
   data: [{x: Date|number, y: number}]
   opts: { yFmt(v)->str, xFmt(d)->str, color, fill(bool), yMin, yMax } */
function drawLineChart(canvas, data, opts) {
  opts = opts || {};
  var wrap = canvas.parentElement;
  var tip = _tip(wrap);
  var s = _dprScale(canvas);
  if (!s) return;
  var ctx = s.ctx, w = s.w, h = s.h;
  ctx.clearRect(0, 0, w, h);

  if (!data || data.length < 2) {
    _noData(ctx, w, h, "Not enough data yet");
    _hideTip(tip);
    return;
  }

  var padL = 54, padR = 16, padT = 14, padB = 28;
  var pw = w - padL - padR, ph = h - padT - padB;
  var vals = data.map(function (d) { return d.y; });
  var mn = opts.yMin != null ? opts.yMin : Math.min.apply(null, vals);
  var mx = opts.yMax != null ? opts.yMax : Math.max.apply(null, vals);
  if (mn === mx) { mn -= 1; mx += 1; }
  var range = mx - mn;
  mn -= range * 0.08; mx += range * 0.08;

  var X = function (i) { return padL + (i / (data.length - 1)) * pw; };
  var Y = function (v) { return padT + (1 - (v - mn) / (mx - mn)) * ph; };

  /* grid + y labels */
  ctx.font = "10.5px -apple-system, Segoe UI, Roboto, sans-serif";
  var ticks = _niceTicks(mn, mx, 4);
  ctx.textBaseline = "middle";
  ticks.forEach(function (t) {
    var y = Y(t);
    ctx.strokeStyle = "rgba(148,163,184,0.10)";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = "#5d6a82";
    ctx.textAlign = "right";
    ctx.fillText(opts.yFmt ? opts.yFmt(t) : String(t), padL - 8, y);
  });

  /* x labels */
  var n = data.length;
  var stepX = Math.max(1, Math.ceil(n / 6));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (var i = 0; i < n; i += stepX) {
    ctx.fillStyle = "#5d6a82";
    ctx.fillText(opts.xFmt ? opts.xFmt(data[i].x) : String(data[i].x), X(i), padT + ph + 8);
  }

  /* area fill */
  if (opts.fill !== false) {
    var grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
    grad.addColorStop(0, (opts.color || "#38bdf8") + "3d");
    grad.addColorStop(1, (opts.color || "#38bdf8") + "00");
    ctx.beginPath();
    ctx.moveTo(X(0), Y(data[0].y));
    for (var j = 1; j < n; j++) ctx.lineTo(X(j), Y(data[j].y));
    ctx.lineTo(X(n - 1), padT + ph);
    ctx.lineTo(X(0), padT + ph);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  /* line */
  ctx.beginPath();
  for (var k = 0; k < n; k++) {
    if (k === 0) ctx.moveTo(X(k), Y(data[k].y));
    else ctx.lineTo(X(k), Y(data[k].y));
  }
  ctx.strokeStyle = opts.color || "#38bdf8";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  /* hover */
  _bindHover(canvas, function (ev) {
    var r = canvas.getBoundingClientRect();
    var px = ev.clientX - r.left;
    var idx = Math.round(((px - padL) / pw) * (n - 1));
    if (idx < 0 || idx > n - 1) { _hideTip(tip); return; }
    var d = data[idx];
    ctx.clearRect(0, 0, w, h);
    drawLineChart(canvas, data, opts);
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(idx), padT); ctx.lineTo(X(idx), padT + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = opts.color || "#38bdf8";
    ctx.beginPath(); ctx.arc(X(idx), Y(d.y), 4.5, 0, Math.PI * 2); ctx.fill();
    _showTip(tip, wrap, X(idx), Y(d.y),
      "<b>" + (opts.xFmt ? opts.xFmt(d.x) : String(d.x)) + "</b> &nbsp; " +
      (opts.yFmt ? opts.yFmt(d.y) : d.y));
  });
  _bindLeave(canvas, function () { _hideTip(tip); });
}

/* ---------- bar chart ----------
   items: [{label, value, color?}] */
function drawBarChart(canvas, items, opts) {
  opts = opts || {};
  var wrap = canvas.parentElement;
  var tip = _tip(wrap);
  var s = _dprScale(canvas);
  if (!s) return;
  var ctx = s.ctx, w = s.w, h = s.h;
  ctx.clearRect(0, 0, w, h);

  if (!items || !items.length) {
    _noData(ctx, w, h, "No data yet");
    _hideTip(tip);
    return;
  }

  var padL = opts.padL != null ? opts.padL : 46;
  var padR = 10, padT = 14, padB = 26;
  var pw = w - padL - padR, ph = h - padT - padB;

  var vals = items.map(function (it) { return it.value; });
  var mn = opts.yMin != null ? opts.yMin : Math.min(0, Math.min.apply(null, vals));
  var mx = opts.yMax != null ? opts.yMax : Math.max.apply(null, vals);
  if (mn === mx) { mx = mn + 1; mn = Math.min(0, mn - 0.5); }
  var range = mx - mn;

  var Y = function (v) { return padT + (1 - (v - mn) / range) * ph; };

  ctx.font = "10.5px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textBaseline = "middle";
  var ticks = _niceTicks(mn, mx, 4);
  ticks.forEach(function (t) {
    var y = Y(t);
    ctx.strokeStyle = "rgba(148,163,184,0.10)";
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = "#5d6a82";
    ctx.textAlign = "right";
    ctx.fillText(opts.yFmt ? opts.yFmt(t) : String(t), padL - 7, y);
  });

  /* zero line */
  if (mn < 0 && mx > 0) {
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
  }

  var n = items.length;
  var slot = pw / n;
  var bw = Math.min(slot * 0.62, 42);
  var zeroY = Y(Math.max(0, Math.min(0, mx)));
  if (mn <= 0 && mx >= 0) zeroY = Y(0); else if (mx < 0) zeroY = padT + ph;

  var labelStep = Math.max(1, Math.ceil(n / (w < 420 ? 10 : 14)));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  items.forEach(function (it, i) {
    var x = padL + i * slot + (slot - bw) / 2;
    var v = it.value;
    var color = it.color || (v >= 0 ? "#22c55e" : "#ef4444");
    if (v >= 0) {
      ctx.fillStyle = color;
      var top = Y(v);
      ctx.fillRect(x, Math.min(top, zeroY), bw, Math.max(2, Math.abs(zeroY - top)));
    } else {
      ctx.fillRect(x, zeroY, bw, Math.max(2, Math.abs(zeroY - Y(v))));
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    if (i % labelStep === 0 || n <= 12) {
      ctx.fillStyle = "#5d6a82";
      ctx.fillText(it.label, padL + i * slot + slot / 2, padT + ph + 7);
    }
    ctx.globalAlpha = 1;
  });

  /* hover */
  _bindHover(canvas, function (ev) {
    var r = canvas.getBoundingClientRect();
    var px = ev.clientX - r.left;
    var i = Math.floor((px - padL) / slot);
    if (i < 0 || i >= n) { _hideTip(tip); return; }
    var it = items[i];
    var x = padL + i * slot + slot / 2;
    var v = it.value;
    _showTip(tip, wrap, x, Y(v) < padT + 20 ? padT + 20 : Y(v),
      "<b>" + it.label + "</b><br>" + (opts.valFmt ? opts.valFmt(v) : String(v)));
  });
  _bindLeave(canvas, function () { _hideTip(tip); });
}

/* ---------- donut ----------
   parts: [{value, color, label}] */
function drawDonut(canvas, parts, opts) {
  opts = opts || {};
  var wrap = canvas.parentElement;
  var tip = _tip(wrap);
  var s = _dprScale(canvas);
  if (!s) return;
  var ctx = s.ctx, w = s.w, h = s.h;
  ctx.clearRect(0, 0, w, h);

  var total = parts.reduce(function (a, p) { return a + p.value; }, 0);
  if (total <= 0) { _noData(ctx, w, h, "No data yet"); _hideTip(tip); return; }

  var cx = w / 2, cy = h / 2;
  var R = Math.min(w, h) / 2 - 12;
  var rIn = R * 0.62;

  var start = -Math.PI / 2;
  parts.forEach(function (p) {
    var frac = p.value / total;
    var end = start + frac * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, end);
    ctx.arc(cx, cy, rIn, end, start, true);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    start = end;
  });

  /* center */
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8ebf2";
  ctx.font = "800 17px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(opts.centerV != null ? opts.centerV : "", cx, cy - 2);
  ctx.fillStyle = "#5d6a82";
  ctx.font = "600 9.5px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(opts.centerL || "", cx, cy + 14);

  _bindHover(canvas, function (ev) { _hideTip(tip); });
  _bindLeave(canvas, function () { _hideTip(tip); });
}

/* ---------- score gauge (semi-circle) ----------
   pct: 0..1, color: string, label: center big text, sub: small text */
function drawGauge(canvas, pct, color, label, sub) {
  var s = _dprScale(canvas);
  if (!s) return;
  var ctx = s.ctx, w = s.w, h = s.h;
  ctx.clearRect(0, 0, w, h);

  var cx = w / 2, cy = h * 0.92;
  var R = Math.min(w / 2 - 10, h * 0.72);
  var a0 = Math.PI * 1.0, a1 = Math.PI * 2.0; /* 180° sweep, left→right */
  var p = Math.max(0, Math.min(1, pct));

  /* track */
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(148,163,184,0.16)";
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();

  /* value */
  var grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color);
  ctx.strokeStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * p); ctx.stroke();

  /* end dot */
  var ea = a0 + (a1 - a0) * p;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(ea) * R, cy + Math.sin(ea) * R, 6, 0, Math.PI * 2);
  ctx.fill();

  /* center text */
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8ebf2";
  ctx.font = "800 34px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(label, cx, cy - R * 0.45);
  ctx.fillStyle = "#5d6a82";
  ctx.font = "600 12px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(sub, cx, cy - R * 0.45 + 24);
}

function _noData(ctx, w, h, text) {
  ctx.fillStyle = "#5d6a82";
  ctx.font = "12px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
}
