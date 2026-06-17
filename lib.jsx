/* lib.jsx · formatting helpers, lightweight SVG charts, UI primitives.
   Exported to window for use across script files. */

/* ---------------- User store (browser-local, namespaced) ---------------- */
const PStore = {
  get(key, fallback) { try { const v = localStorage.getItem("performity.user." + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
  set(key, val) { try { localStorage.setItem("performity.user." + key, JSON.stringify(val)); return true; } catch (e) { return false; } },
};
window.PStore = PStore;

/* ---------------- Currency ---------------- */
// Source data is in INR. window.CURRENCY holds the active DISPLAY currency:
//   { code, symbol, style: "in"|"intl", rate }  (rate = target units per 1 INR)
const CURRENCIES = {
  INR: { symbol: "₹", style: "in", name: "Indian Rupee" },
  USD: { symbol: "$", style: "intl", name: "US Dollar" },
  AED: { symbol: "AED ", style: "intl", name: "UAE Dirham" },
  QAR: { symbol: "QAR ", style: "intl", name: "Qatari Riyal" },
  SAR: { symbol: "SAR ", style: "intl", name: "Saudi Riyal" },
  PHP: { symbol: "₱", style: "intl", name: "Philippine Peso" },
  JPY: { symbol: "¥", style: "intl", name: "Japanese Yen" },
  GBP: { symbol: "£", style: "intl", name: "British Pound" },
  EUR: { symbol: "€", style: "intl", name: "Euro" },
  AUD: { symbol: "A$", style: "intl", name: "Australian Dollar" },
  CAD: { symbol: "C$", style: "intl", name: "Canadian Dollar" },
};
function curState() { return window.CURRENCY || { code: "INR", symbol: "₹", style: "in", rate: 1 }; }
// severity -> css tone class
function sevCls(s) { return s === "critical" ? "bad" : s === "opportunity" ? "good" : s === "warn" ? "warn" : s === "info" ? "neutral" : "review"; }
// Set the active display currency from a fetched FX table (rates keyed per 1 INR).
function applyCurrency(code, fx) {
  const meta = CURRENCIES[code] || CURRENCIES.INR;
  const rate = code === "INR" ? 1 : ((fx && fx.rates && fx.rates[code]) || 1);
  window.CURRENCY = { code, symbol: meta.symbol, style: meta.style, rate };
  return window.CURRENCY;
}

/* ---------------- Formatting ---------------- */
// Compact currency in the active display currency (Cr/L/K for INR, B/M/K otherwise)
function inr(n, { sign = false } = {}) {
  if (n === null || n === undefined || isNaN(n)) return "–";
  const cur = curState();
  const v = n * (cur.rate || 1);
  const neg = v < 0; const a = Math.abs(v); const sym = cur.symbol;
  let s;
  if (cur.style === "in") {
    if (a >= 1e7) s = sym + (a / 1e7).toFixed(a / 1e7 >= 10 ? 1 : 2) + " Cr";
    else if (a >= 1e5) s = sym + (a / 1e5).toFixed(a / 1e5 >= 10 ? 1 : 2) + " L";
    else if (a >= 1e3) s = sym + (a / 1e3).toFixed(1) + "K";
    else s = sym + Math.round(a);
  } else {
    if (a >= 1e9) s = sym + (a / 1e9).toFixed(2) + "B";
    else if (a >= 1e6) s = sym + (a / 1e6).toFixed(2) + "M";
    else if (a >= 1e3) s = sym + (a / 1e3).toFixed(1) + "K";
    else s = sym + Math.round(a);
  }
  if (neg) return "−" + s;
  return (sign ? "+" : "") + s;
}
function inrFull(n) {
  if (n === null || n === undefined || isNaN(n)) return "–";
  const cur = curState();
  return cur.symbol + Math.round(n * (cur.rate || 1)).toLocaleString(cur.style === "in" ? "en-IN" : "en-US");
}
function num(n) {
  if (n === null || n === undefined || isNaN(n)) return "–";
  return Math.round(n).toLocaleString("en-IN");
}
function roas(n) {
  if (n === null || n === undefined || isNaN(n) || n === 0) return "–";
  return n.toFixed(2) + "×";
}
function pct(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return "–";
  return (n * 100).toFixed(digits) + "%";
}
function delta(curr, prev) {
  if (prev === null || prev === undefined || prev === 0 || curr === null || curr === undefined) return null;
  return (curr - prev) / Math.abs(prev);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// classify ROAS health
function roasHealth(r) {
  if (r === null || r === undefined || r === 0) return "none";
  if (r < 1) return "bad";
  if (r < 2) return "warn";
  return "good";
}

/* ---------------- Tiny SVG charts ---------------- */

function Sparkline({ data, w = 96, h = 28, color = "var(--accent)", fill = true }) {
  const pts = data.map((v, i) => (v == null ? null : v));
  const vals = pts.filter(v => v != null);
  if (vals.length < 2) return <svg width={w} height={h} />;
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const xy = data.map((v, i) => [i * step, h - 3 - ((v ?? min) - min) / range * (h - 6)]);
  const line = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L ${w} ${h} L 0 ${h} Z`;
  const gid = "sg" + Math.random().toString(36).slice(2, 8);
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      {fill && <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.18" />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>}
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// grouped bar + line combo: monthly spend bars + ROAS line
function ComboChart({ months, bars, line, w = 720, h = 260, barLabel, lineLabel, barFmt, tip, showPct = true }) {
  const bf = barFmt || (v => inr(v));
  const tipAt = (i) => tip && tip[i] ? tip[i] : (months[i] + " · " + bf(bars[i]) + (line[i] != null ? " · ROAS " + line[i].toFixed(2) + "×" : ""));
  const padL = 56, padR = 48, padT = 16, padB = 28;
  const iw = w - padL - padR, ih = h - padT - padB;
  const barVals = bars.map(v => v ?? 0);
  const maxBar = Math.max(...barVals, 1);
  const lineVals = line.map(v => (v == null ? null : v));
  const maxLine = Math.max(...lineVals.filter(v => v != null), 1) * 1.15;
  const n = months.length;
  const slot = iw / n;
  const bw = Math.min(26, slot * 0.5);
  const x = i => padL + slot * i + slot / 2;
  const yBar = v => padT + ih - (v / maxBar) * ih;
  const yLine = v => padT + ih - (v / maxLine) * ih;
  const lpts = months.map((m, i) => lineVals[i] == null ? null : [x(i), yLine(lineVals[i])]);
  let lpath = ""; let started = false;
  lpts.forEach(p => { if (p) { lpath += (started ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " "; started = true; } else started = false; });
  const ticks = 4;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const yy = padT + ih - (ih / ticks) * i;
        return <g key={i}>
          <line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="var(--border)" strokeWidth="1" />
          <text x={padL - 8} y={yy + 3} textAnchor="end" className="ax">{bf(maxBar / ticks * i).replace("₹","")}</text>
        </g>;
      })}
      {months.map((m, i) => (
        <g key={i}>
          <rect x={x(i) - bw / 2} y={yBar(barVals[i])} width={bw} height={Math.max(0, padT + ih - yBar(barVals[i]))}
            rx="3" fill="var(--accent)" opacity={barVals[i] ? 0.85 : 0.12}>
            <title>{tipAt(i)}</title>
          </rect>
          <rect x={x(i) - slot / 2} y={padT} width={slot} height={ih} fill="transparent">
            <title>{tipAt(i)}</title>
          </rect>
          {showPct && i > 0 && barVals[i - 1] > 0 && barVals[i] > 0 && (() => {
            const ch = (barVals[i] - barVals[i - 1]) / barVals[i - 1];
            if (Math.abs(ch) < 0.005) return null;
            return <text x={x(i)} y={yBar(barVals[i]) - 5} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, fill: ch >= 0 ? "var(--good)" : "var(--bad)" }}>{(ch >= 0 ? "+" : "") + Math.round(ch * 100) + "%"}</text>;
          })()}
          <text x={x(i)} y={h - 9} textAnchor="middle" className="ax">{m}</text>
        </g>
      ))}
      <path d={lpath} fill="none" stroke="var(--good)" strokeWidth="2.2" strokeLinejoin="round" />
      {lpts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#fff" stroke="var(--good)" strokeWidth="2" />)}
      {lpts.map((p, i) => p && lineVals[i] != null &&
        <text key={"t"+i} x={p[0]} y={p[1] - 9} textAnchor="middle" className="axb">{lineVals[i].toFixed(1)}×</text>)}
    </svg>
  );
}

function LineMulti({ months, series, w = 720, h = 240, fmt = (v)=>v, fill = false, mode = "linear", tip, trend = false }) {
  const padL = 56, padR = 16, padT = 16, padB = 28;
  const iw = w - padL - padR, ih = h - padT - padB;
  const all = series.flatMap(s => s.data.filter(v => v != null));
  const max = Math.max(...all, 1) * 1.1, min = 0;
  const n = months.length;
  const x = i => n > 1 ? padL + (iw / (n - 1)) * i : padL + iw / 2;
  const y = v => padT + ih - ((v - min) / (max - min)) * ih;
  const ticks = 4;
  const gid = "lm" + Math.random().toString(36).slice(2, 7);
  // build a path through points [{x,y}] in the chosen mode (linear | spline | step)
  const buildPath = (pts) => {
    if (!pts.length) return "";
    if (mode === "step") {
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) d += ` H ${pts[i].x} V ${pts[i].y}`;
      return d;
    }
    if (mode === "spline" && pts.length > 2) {
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
      return d;
    }
    return pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
  };
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {fill && <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={series[series.length - 1].color} stopOpacity="0.22" />
        <stop offset="1" stopColor={series[series.length - 1].color} stopOpacity="0" />
      </linearGradient></defs>}
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const yy = padT + ih - (ih / ticks) * i;
        return <g key={i}><line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="var(--border)" />
          <text x={padL - 8} y={yy + 3} textAnchor="end" className="ax">{fmt(max / ticks * i)}</text></g>;
      })}
      {months.map((m, i) => <text key={i} x={x(i)} y={h - 9} textAnchor="middle" className="ax">{m}</text>)}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => v == null ? null : { x: x(i), y: y(v) }).filter(Boolean);
        const path = buildPath(pts);
        const area = (fill && pts.length) ? path + ` L ${pts[pts.length - 1].x} ${padT + ih} L ${pts[0].x} ${padT + ih} Z` : null;
        return <g key={si}>
          {area && si === series.length - 1 && <path d={area} fill={`url(#${gid})`} />}
          <path d={path} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          {s.data.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r="2.6" fill={s.color}><title>{tip && tip[i] ? tip[i] : (months[i] + " · " + fmt(v))}</title></circle>)}
        </g>;
      })}
      {trend && (() => {
        // least-squares regression line over the last series
        const d = series[series.length - 1].data;
        const pts = d.map((v, i) => v == null ? null : [i, v]).filter(Boolean);
        if (pts.length < 2) return null;
        const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
        const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), intc = (sy - slope * sx) / n;
        const i0 = pts[0][0], i1 = pts[pts.length - 1][0];
        return <path d={`M ${x(i0)} ${y(slope * i0 + intc)} L ${x(i1)} ${y(slope * i1 + intc)}`} fill="none" stroke="var(--violet)" strokeWidth="1.8" strokeDasharray="5 4" opacity="0.8" />;
      })()}
    </svg>
  );
}

// Horizontal bar chart (ranked). items: [{label, value, color?}]
function HBars({ items, w = 720, barH = 22, gap = 11, fmt = (v) => v, color = "var(--accent)" }) {
  const max = Math.max(...items.map(it => it.value || 0), 1);
  const labelW = 130, valW = 70;
  const h = items.length * (barH + gap) + gap;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {items.map((it, i) => {
        const yy = gap + i * (barH + gap);
        const bw = Math.max(2, (it.value || 0) / max * (w - labelW - valW));
        return <g key={i}>
          <text x={0} y={yy + barH / 2 + 4} textAnchor="start" className="ax" style={{ fontSize: 11.5, fill: "var(--text-2)" }}>{it.label}</text>
          <rect x={labelW} y={yy} width={bw} height={barH} rx="4" fill={it.color || color} opacity="0.9">
            <title>{it.label + " · " + fmt(it.value)}</title>
          </rect>
          <text x={labelW + bw + 7} y={yy + barH / 2 + 4} textAnchor="start" className="ax" style={{ fontSize: 11 }}>{fmt(it.value)}</text>
        </g>;
      })}
    </svg>
  );
}

// Funnel (horizontal bars, descending)
function Funnel({ steps }) {
  const max = Math.max(...steps.map(s => s.value || 0), 1);
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const wpct = Math.max(2, (s.value || 0) / max * 100);
        const conv = i > 0 && steps[i - 1].value ? (s.value || 0) / steps[i - 1].value : null;
        return (
          <div className="funnel-row" key={i}>
            <div className="funnel-label">{s.label}</div>
            <div className="funnel-track">
              <div className="funnel-bar" style={{ width: wpct + "%" }} />
            </div>
            <div className="funnel-val mono">{num(s.value)}</div>
            <div className="funnel-conv">{conv != null ? pct(conv, 1) : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ segments, size = 132, stroke = 20, center }) {
  const r = (size - stroke) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  let off = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const frac = (s.value || 0) / total;
          const dash = frac * circ;
          const el = <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-off * circ}
            transform={`rotate(-90 ${c} ${c})`} strokeLinecap="butt" />;
          off += frac; return el;
        })}
      </svg>
      {center && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center" }}>{center}</div>}
    </div>
  );
}

/* ---------------- UI primitives ---------------- */
function Delta({ value, invert = false }) {
  if (value == null) return <span className="delta flat">–</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  return <span className={"delta " + (Math.abs(value) < 0.001 ? "flat" : good ? "up" : "down")}>
    {up ? "▲" : "▼"} {Math.abs(value * 100).toFixed(1)}%
  </span>;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={"badge " + tone}>{children}</span>;
}

function Avatar({ name }) {
  if (!name) return <span className="avatar none">–</span>;
  const init = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const palette = ["#1f6feb","#7c3aed","#0e9f6e","#d97706","#db2777","#0891b2","#65a30d"];
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <span className="avatar" style={{ background: palette[h % palette.length] }}>{init}</span>;
}

// classify a scrum metric label -> formatter
function metricFmt(label) {
  const m = label.toLowerCase();
  if (m.includes("roas")) return v => v == null ? "–" : (+v).toFixed(2) + "×";
  if (m.includes("%") || m.includes("cvr") || m.includes("ctr") || m.includes("share") ||
      m.includes("contribution") || m.includes("return") || m.includes("achievement") || m.includes("δ"))
    return v => v == null ? "–" : (v * 100).toFixed(1) + "%";
  if (/(sales|spend|revenue|aov|cac|cpm|cpc|cpa|target|cp )/.test(m)) return v => inr(v);
  return v => v == null ? "–" : num(v);
}
// is a metric a "headline" row worth emphasising
function isHeadline(label) {
  return /^(total ad spend|dashboard revenue|dashboard roas|shopify gross sales|shopify orders|spend|revenue|roas \(dash\))$/i.test(label.trim());
}

// Drag-to-resize columns. Returns a ref to attach to a <table>. Widths persist
// across re-renders because React reuses the same <th> DOM nodes.
function useColResize() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const table = ref.current;
    if (!table) return;
    table.style.tableLayout = "fixed";
    const ths = table.querySelectorAll("thead th");
    ths.forEach((th) => {
      if (!th.style.width) th.style.width = th.offsetWidth + "px";
      if (th.querySelector(".col-resizer")) return;
      th.style.position = th.style.position || "relative";
      const res = document.createElement("span");
      res.className = "col-resizer";
      let startX = 0, startW = 0;
      const onMove = (e) => { th.style.width = Math.max(48, startW + (e.pageX - startX)) + "px"; };
      const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; };
      res.addEventListener("mousedown", (e) => {
        startX = e.pageX; startW = th.offsetWidth;
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "col-resize"; e.preventDefault(); e.stopPropagation();
      });
      res.addEventListener("click", (e) => e.stopPropagation());
      th.appendChild(res);
    });
  });
  return ref;
}

Object.assign(window, { metricFmt, isHeadline,
  inr, inrFull, num, roas, pct, delta, MONTHS, roasHealth,
  CURRENCIES, curState, applyCurrency, useColResize, sevCls,
  Sparkline, ComboChart, LineMulti, HBars, Funnel, Donut, Delta, Badge, Avatar });
