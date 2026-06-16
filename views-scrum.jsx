/* views-scrum.jsx — week/month/quarter scrum grid with channel-section accordions,
   trend sparklines, week-on-week deltas, and CSV export */
const { useState: useStateS } = React;

const SCRUM_SECTIONS = [
  { key: "overall", label: "Blended store", sub: "all channels combined", accent: "var(--text)" },
  { key: "meta", label: "Meta", sub: "full funnel", accent: "var(--accent)" },
  { key: "google", label: "Google", sub: "search & shopping", accent: "var(--violet)" },
  { key: "other", label: "Other", sub: "remaining channels", accent: "var(--muted)" },
  { key: "shopify", label: "Shopify store", sub: "store-level totals", accent: "var(--good)" },
];

function activeMonthSet(W) {
  const ov = W.overall.metrics;
  const probe = ov["Total Ad Spend"] || ov["Shopify Gross Sales"];
  const set = [];
  for (let i = 0; i < 12; i++) {
    const mo = probe ? probe.months[i].mo : null;
    const hasWk = probe ? probe.months[i].weeks.some(w => w != null && w !== 0) : false;
    if ((mo != null && mo !== 0) || hasWk) set.push(i);
  }
  return set.length ? set : [0];
}
// Dense count metrics whose week cells reliably reflect the real number of weeks
// (delta / % / achievement rows can carry stray trailing values, so we ignore them).
const WEEK_PROBES = ["Total Ad Spend", "Shopify Gross Sales", "Dashboard Revenue", "Shopify Orders",
  "Spend", "Reach", "Impressions", "Revenue", "Clicks"];
function weeksPerMonth(W, mi) {
  let n = 0;
  ["overall", "meta", "google", "other", "shopify"].forEach(k => {
    const mets = W[k] && W[k].metrics;
    if (!mets) return;
    WEEK_PROBES.forEach(p => {
      const m = mets[p] && mets[p].months[mi];
      if (m && m.weeks.length > n) n = m.weeks.length;
    });
  });
  return Math.max(1, n);
}
function sectionHasData(W, key) {
  const mets = W[key] && W[key].metrics;
  if (!mets) return false;
  return Object.values(mets).some(m => (m.year != null && m.year !== 0));
}
function buildColumns(W, period, activeMonths, weekDates) {
  const cols = [];
  if (period === "quarter") {
    ["Q1", "Q2", "Q3", "Q4"].forEach((q, i) => cols.push({ kind: "qtr", label: q, qi: i }));
    cols.push({ kind: "year", label: "CY26" });
  } else if (period === "month") {
    activeMonths.forEach(mi => cols.push({ kind: "mo", label: MONTHS[mi], mi }));
    cols.push({ kind: "year", label: "CY26" });
  } else {
    activeMonths.forEach(mi => {
      const n = weeksPerMonth(W, mi);
      for (let w = 0; w < n; w++) cols.push({ kind: "wk", label: "W" + (w + 1), mi, wi: w, group: MONTHS[mi], first: w === 0,
        dates: weekDates && weekDates[mi] ? weekDates[mi][w] : null });
      cols.push({ kind: "mo", label: "Mo", mi, total: true, group: MONTHS[mi], last: true });
    });
    cols.push({ kind: "year", label: "CY26", total: true });
  }
  return cols;
}
function cellValue(metric, col) {
  if (!metric) return null;
  if (col.kind === "year") return metric.year;
  if (col.kind === "qtr") return metric.quarters[col.qi];
  if (col.kind === "mo") return metric.months[col.mi].mo;
  if (col.kind === "wk") { const wk = metric.months[col.mi].weeks; return col.wi < wk.length ? wk[col.wi] : null; }
  return null;
}
// a "data" column carries a period observation (not a roll-up total / year)
function isDataCol(c) { return c.kind === "wk" || c.kind === "qtr" || (c.kind === "mo" && !c.total); }
// period-over-period deltas aligned to columns. In weekly view, week cells get
// week-over-week and the monthly "Mo" totals get month-over-month (so you see both).
function rowDeltas(metric, columns) {
  const out = []; let prevData = null, prevMo = null;
  for (const c of columns) {
    if (isDataCol(c)) {
      const v = cellValue(metric, c);
      let d = null;
      if (v != null && prevData != null && prevData !== 0) d = (v - prevData) / Math.abs(prevData);
      if (v != null) prevData = v;
      out.push(d);
    } else if (c.kind === "mo" && c.total) {
      const v = cellValue(metric, c);
      let d = null;
      if (v != null && prevMo != null && prevMo !== 0) d = (v - prevMo) / Math.abs(prevMo);
      if (v != null) prevMo = v;
      out.push(d);
    } else { out.push(null); }
  }
  return out;
}
// trend series for the sparkline
function metricSeries(metric, period, activeMonths) {
  if (!metric) return [];
  if (period === "quarter") return metric.quarters.slice();
  if (period === "month") return activeMonths.map(mi => metric.months[mi].mo);
  const s = []; activeMonths.forEach(mi => metric.months[mi].weeks.forEach(w => s.push(w))); return s;
}
function isCostMetric(label) { return /(cac|cpm|cpc|cp )/i.test(label); }

function WoWChip({ d, label }) {
  if (d == null || Math.abs(d) < 0.001) return null;
  const up = d >= 0;
  const good = isCostMetric(label) ? !up : up;
  return <span className={"wk-d " + (good ? "good" : "bad")}>{up ? "▲" : "▼"}{(Math.abs(d) * 100).toFixed(0)}%</span>;
}

function ScrumSection({ W, secDef, period, columns, activeMonths, open, onToggle, showWoW, onWrapScroll }) {
  const sec = W[secDef.key];
  if (!sec) return null;
  const order = sec.order.filter(k => !/^\d+(\.\d+)?$/.test(k));
  const yr = (m) => { const x = sec.metrics[m]; return x ? x.year : null; };
  const spend = yr("Total Ad Spend") ?? yr("Spend");
  const rev = yr("Dashboard Revenue") ?? yr("Revenue");
  const roasv = yr("Dashboard ROAS") ?? yr("ROAS (Dash)");
  const isWeek = period === "week";

  return (
    <div className={"scrum-sec " + (open ? "open" : "")}>
      <button className="scrum-sec-head" onClick={onToggle}>
        <span className="ss-caret">{open ? "▾" : "▸"}</span>
        <span className="ss-dot" style={{ background: secDef.accent }} />
        <span className="ss-title">{secDef.label}</span>
        <span className="ss-sub">{secDef.sub}</span>
        <span className="ss-stats">
          {spend != null && <span><i>Spend</i> {inr(spend)}</span>}
          {rev != null && <span><i>Revenue</i> {inr(rev)}</span>}
          {roasv != null && <span className="ss-roas"><i>ROAS</i> <b className={roasHealth(roasv)}>{roas(roasv)}</b></span>}
        </span>
      </button>
      {open && (
        <div className="scrum-wrap" onScroll={onWrapScroll}>
          <table className={"scrum-table " + (showWoW ? "with-wow" : "")}>
            <thead>
              {isWeek && (
                <tr className="grp-row">
                  <th className="metric-col gcorner"></th>
                  {(() => {
                    const groups = []; let i = 0; let gk = 0;
                    while (i < columns.length) {
                      const c = columns[i];
                      if (c.kind === "year") { groups.push(<th key={"g" + (gk++)} className="grp year-grp">FY</th>); i++; continue; }
                      let span = 0; const g = c.group;
                      while (i < columns.length && columns[i].group === g) { span++; i++; }
                      groups.push(<th key={"g" + (gk++)} className="grp" colSpan={span}>{g}</th>);
                    }
                    return groups;
                  })()}
                  <th className="trend-col"></th>
                </tr>
              )}
              <tr>
                <th className="metric-col">Metric</th>
                {columns.map((c, i) => (
                  <th key={i} className={"n " + (c.total ? "total-col " : "") + (c.kind === "year" ? "year-col " : "") + (c.first ? "grp-start" : "")}>
                    {c.label}{c.dates && <span className="th-date">{c.dates}</span>}
                  </th>
                ))}
                <th className="n trend-col">Trend</th>
              </tr>
            </thead>
            <tbody>
              {order.map(label => {
                const metric = sec.metrics[label];
                const fmt = metricFmt(label);
                const head = isHeadline(label);
                const deltas = showWoW ? rowDeltas(metric, columns) : null;
                const series = metricSeries(metric, period, activeMonths);
                return (
                  <tr key={label} className={head ? "headline" : ""}>
                    <td className="metric-col">{label.trim()}</td>
                    {columns.map((c, i) => {
                      const v = cellValue(metric, c);
                      return (
                        <td key={i} className={"n mono " + (c.total ? "total-col " : "") + (c.kind === "year" ? "year-col " : "") + (c.first ? "grp-start " : "") + (v == null || v === 0 ? "zero" : "")}>
                          <span className="cell-v">{fmt(v)}</span>
                          {deltas && <WoWChip d={deltas[i]} label={label} />}
                        </td>
                      );
                    })}
                    <td className="trend-cell">
                      <Sparkline data={series} w={84} h={20} color={secDef.accent} fill={false} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function buildCSV(W, brandKey, period, columns, visibleSecs) {
  const esc = x => { const s = x == null ? "" : String(x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [];
  lines.push(["Performity scrum export"]);
  lines.push(["Brand", brandKey]);
  lines.push(["Period", period]);
  lines.push([]);
  const colLabel = c => c.kind === "wk" ? (c.group + " " + c.label) : c.kind === "mo" && c.total ? (c.group + " total") : c.label;
  visibleSecs.forEach(s => {
    const sec = W[s.key];
    lines.push([s.label.toUpperCase()]);
    lines.push(["Metric", ...columns.map(colLabel)]);
    sec.order.filter(k => !/^\d+(\.\d+)?$/.test(k)).forEach(label => {
      const metric = sec.metrics[label];
      lines.push([label.trim(), ...columns.map(c => { const v = cellValue(metric, c); return v == null ? "" : v; })]);
    });
    lines.push([]);
  });
  return lines.map(r => r.map(esc).join(",")).join("\n");
}

function ScrumGrid({ brandKey }) {
  const W = window.WEEKLY[brandKey];
  const [period, setPeriod] = useStateS("week");
  const [showWoW, setShowWoW] = useStateS(false);
  const [range, setRange] = useStateS(null); // { from, to } month indices, null = full year
  const [open, setOpen] = useStateS({ overall: true, meta: true, google: false, other: false, shopify: false });
  if (!W) return null;
  const fullActive = activeMonthSet(W);
  const rFrom = range ? range.from : fullActive[0];
  const rTo = range ? range.to : fullActive[fullActive.length - 1];
  const lo = Math.min(rFrom, rTo), hi = Math.max(rFrom, rTo);
  const ranged = fullActive.filter(mi => mi >= lo && mi <= hi);
  const activeMonths = (period === "quarter" || !ranged.length) ? fullActive : ranged;
  const weekDates = (window.WEEKLY_META[brandKey] || {}).weekDates;
  const columns = buildColumns(W, period, activeMonths, weekDates);
  const visibleSecs = SCRUM_SECTIONS.filter(s => sectionHasData(W, s.key));
  const rangeActive = range && (lo !== fullActive[0] || hi !== fullActive[fullActive.length - 1]);

  const exportCSV = () => {
    const csv = buildCSV(W, brandKey, period, columns, visibleSecs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = brandKey.replace(/\s+/g, "_") + "_" + period + "_scrum.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const wowLabel = period === "week" ? "WoW Δ" : period === "month" ? "MoM Δ" : "QoQ Δ";

  // keep every channel section's horizontal scroll in sync with the one being scrolled
  const syncingRef = React.useRef(false);
  const onWrapScroll = (e) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const src = e.currentTarget, sl = src.scrollLeft;
    const card = src.closest(".scrum-card");
    if (card) card.querySelectorAll(".scrum-wrap").forEach(el => { if (el !== src) el.scrollLeft = sl; });
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  return (
    <div className="card scrum-card">
      <div className="card-head scrum-head">
        <div>
          <h3>Weekly scrum &amp; channel breakdown</h3>
          <span className="muted-sm">blended store first, then per-channel — toggle the time grain</span>
        </div>
        <div className="scrum-tools">
          {period !== "quarter" && fullActive.length > 1 && (
            <div className={"date-range " + (rangeActive ? "on" : "")} title="Filter the date range shown">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              <select value={lo} onChange={e => setRange({ from: +e.target.value, to: hi })}>
                {fullActive.map(mi => <option key={mi} value={mi}>{MONTHS[mi]}</option>)}
              </select>
              <span className="dr-dash">–</span>
              <select value={hi} onChange={e => setRange({ from: lo, to: +e.target.value })}>
                {fullActive.map(mi => <option key={mi} value={mi}>{MONTHS[mi]}</option>)}
              </select>
              {rangeActive && <button className="dr-clear" title="Clear date filter" onClick={() => setRange(null)}>×</button>}
            </div>
          )}
          <button className={"tool-btn " + (showWoW ? "on" : "")} onClick={() => setShowWoW(v => !v)} title="Show period-over-period change">
            <span className="td-ico">Δ</span>{wowLabel}
          </button>
          <button className="tool-btn" onClick={exportCSV} title="Download this view as CSV">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 4 5-4M5 21h14" /></svg>CSV
          </button>
          <div className="period">
            {[["week", "Weekly"], ["month", "Monthly"], ["quarter", "Quarterly"]].map(([k, l]) => (
              <button key={k} className={"seg " + (period === k ? "on" : "")} onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="scrum-legend">
        <span className="sl-item"><span className="sl-sw total-col"></span>Period total</span>
        <span className="sl-item"><span className="sl-sw year-col"></span>Full year</span>
        {showWoW && <span className="sl-item"><span className="wk-d good">▲</span>/<span className="wk-d bad">▼</span> {period === "week" ? "WoW on weeks · MoM on month totals" : "vs prior " + (period === "month" ? "month" : "quarter")}</span>}
        <span className="sl-hint">Scroll horizontally to see every {period === "week" ? "week" : "period"} →</span>
      </div>
      <div className="scrum-sections">
        {visibleSecs.map(s => (
          <ScrumSection key={s.key} W={W} secDef={s} period={period} columns={columns} activeMonths={activeMonths}
            open={!!open[s.key]} onToggle={() => setOpen(o => ({ ...o, [s.key]: !o[s.key] }))} showWoW={showWoW} onWrapScroll={onWrapScroll} />
        ))}
      </div>
    </div>
  );
}

// Per-brand notes/comments tied to the weekly section (saved in browser)
function ScrumComments({ brandKey }) {
  const key = "comments." + brandKey;
  const [items, setItems] = React.useState(() => window.PStore.get(key, []));
  const [text, setText] = React.useState("");
  const [week, setWeek] = React.useState("");
  const add = () => {
    if (!text.trim()) return;
    const next = [{ text: text.trim(), week: week.trim(), at: Date.now() }, ...items];
    setItems(next); window.PStore.set(key, next); setText(""); setWeek("");
  };
  const del = (i) => { const next = items.filter((_, k) => k !== i); setItems(next); window.PStore.set(key, next); };
  return (
    <div className="card comments-card">
      <div className="card-head"><h3>Notes &amp; comments</h3><span className="muted-sm">tag a week · saved in your browser</span></div>
      <div className="cm-add">
        <input className="cm-week tl-input" placeholder="Week / period (e.g. Jun W2)" value={week} onChange={e => setWeek(e.target.value)} />
        <textarea className="cm-text" placeholder="Add a note about this week…" value={text} onChange={e => setText(e.target.value)} />
        <button className="btn-primary" onClick={add}>Add note</button>
      </div>
      <div className="cm-list">
        {items.map((c, i) => (
          <div className="cm-item" key={i}>
            <div className="cm-meta">
              {c.week && <span className="cm-week-tag">{c.week}</span>}
              <span className="cm-date">{new Date(c.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              <button className="cm-del" title="Delete" onClick={() => del(i)}>×</button>
            </div>
            <div className="cm-body">{c.text}</div>
          </div>
        ))}
        {!items.length && <div className="empty">No notes yet — add the first one.</div>}
      </div>
    </div>
  );
}
window.ScrumComments = ScrumComments;
window.ScrumGrid = ScrumGrid;
