/* lib.jsx — formatting helpers, lightweight SVG charts, UI primitives.
   Exported to window for use across script files. */

/* ---------------- Formatting ---------------- */
// Indian-style compact currency (Cr / L / K)
function inr(n, { sign = false } = {}) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const neg = n < 0; const a = Math.abs(n);
  let s;
  if (a >= 1e7) s = "₹" + (a / 1e7).toFixed(a / 1e7 >= 10 ? 1 : 2) + " Cr";
  else if (a >= 1e5) s = "₹" + (a / 1e5).toFixed(a / 1e5 >= 10 ? 1 : 2) + " L";
  else if (a >= 1e3) s = "₹" + (a / 1e3).toFixed(1) + "K";
  else s = "₹" + Math.round(a);
  if (neg) return "−" + s;
  return (sign ? "+" : "") + s;
}
function inrFull(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function num(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-IN");
}
function roas(n) {
  if (n === null || n === undefined || isNaN(n) || n === 0) return "—";
  return n.toFixed(2) + "×";
}
function pct(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return "—";
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
function ComboChart({ months, bars, line, w = 720, h = 260, barLabel, lineLabel }) {
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
          <text x={padL - 8} y={yy + 3} textAnchor="end" className="ax">{inr(maxBar / ticks * i).replace("₹","")}</text>
        </g>;
      })}
      {months.map((m, i) => (
        <g key={i}>
          <rect x={x(i) - bw / 2} y={yBar(barVals[i])} width={bw} height={Math.max(0, padT + ih - yBar(barVals[i]))}
            rx="3" fill="var(--accent)" opacity={barVals[i] ? 0.85 : 0.12} />
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

function LineMulti({ months, series, w = 720, h = 240, fmt = (v)=>v }) {
  const padL = 56, padR = 16, padT = 16, padB = 28;
  const iw = w - padL - padR, ih = h - padT - padB;
  const all = series.flatMap(s => s.data.filter(v => v != null));
  const max = Math.max(...all, 1) * 1.1, min = 0;
  const n = months.length;
  const x = i => padL + (iw / (n - 1)) * i;
  const y = v => padT + ih - ((v - min) / (max - min)) * ih;
  const ticks = 4;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const yy = padT + ih - (ih / ticks) * i;
        return <g key={i}><line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="var(--border)" />
          <text x={padL - 8} y={yy + 3} textAnchor="end" className="ax">{fmt(max / ticks * i)}</text></g>;
      })}
      {months.map((m, i) => <text key={i} x={x(i)} y={h - 9} textAnchor="middle" className="ax">{m}</text>)}
      {series.map((s, si) => {
        let path = "", started = false;
        s.data.forEach((v, i) => { if (v != null) { path += (started ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " "; started = true; } else started = false; });
        return <g key={si}>
          <path d={path} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          {s.data.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r="2.6" fill={s.color} />)}
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
  if (value == null) return <span className="delta flat">—</span>;
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
  if (!name) return <span className="avatar none">—</span>;
  const init = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const palette = ["#1f6feb","#7c3aed","#0e9f6e","#d97706","#db2777","#0891b2","#65a30d"];
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <span className="avatar" style={{ background: palette[h % palette.length] }}>{init}</span>;
}

// classify a scrum metric label -> formatter
function metricFmt(label) {
  const m = label.toLowerCase();
  if (m.includes("roas")) return v => v == null ? "—" : (+v).toFixed(2) + "×";
  if (m.includes("%") || m.includes("cvr") || m.includes("ctr") || m.includes("share") ||
      m.includes("contribution") || m.includes("return") || m.includes("achievement") || m.includes("δ"))
    return v => v == null ? "—" : (v * 100).toFixed(1) + "%";
  if (/(sales|spend|revenue|aov|cac|cpm|cpc|cpa|target|cp )/.test(m)) return v => inr(v);
  return v => v == null ? "—" : num(v);
}
// is a metric a "headline" row worth emphasising
function isHeadline(label) {
  return /^(total ad spend|dashboard revenue|dashboard roas|shopify gross sales|shopify orders|spend|revenue|roas \(dash\))$/i.test(label.trim());
}

Object.assign(window, { metricFmt, isHeadline,
  inr, inrFull, num, roas, pct, delta, MONTHS, roasHealth,
  Sparkline, ComboChart, LineMulti, Funnel, Donut, Delta, Badge, Avatar });
