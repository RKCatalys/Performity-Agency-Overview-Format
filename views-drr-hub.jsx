/* views-drr-hub.jsx — All DRR hub: branch cards + native DRR workspace (no embedded sheets) */
const { useState: useStateD, useEffect: useEffectD } = React;

function drrMoney(v, sym) {
  if (v == null || isNaN(v)) return "-";
  const s = sym || "₹", a = Math.abs(v); let out;
  if (s === "₹") { if (a >= 1e7) out = (a / 1e7).toFixed(2) + " Cr"; else if (a >= 1e5) out = (a / 1e5).toFixed(2) + " L"; else if (a >= 1e3) out = (a / 1e3).toFixed(1) + "K"; else out = Math.round(a); }
  else { if (a >= 1e9) out = (a / 1e9).toFixed(2) + "B"; else if (a >= 1e6) out = (a / 1e6).toFixed(2) + "M"; else if (a >= 1e3) out = (a / 1e3).toFixed(1) + "K"; else out = Math.round(a); }
  return (v < 0 ? "-" : "") + s + out;
}
function drrStatus(s) {
  if (!s) return { cls: "neutral", label: "—" };
  if (s.roas == null) return { cls: "neutral", label: "No data" };
  if (s.roas < 1) return { cls: "bad", label: "Unprofitable" };
  if (s.achievement != null && s.achievement < 0.6 && s.daysElapsed >= s.monthDays * 0.6) return { cls: "warn", label: "Behind target" };
  if (s.roas < 2) return { cls: "warn", label: "Watch" };
  return { cls: "good", label: "On track" };
}

function fmtMetric(metric, v, fmtM) {
  if (v == null) return "-";
  if (metric === "ROAS") return v.toFixed(2) + "×";
  if (metric === "Orders") return num(v);
  return fmtM(v);
}
const SIG_ICON = { bad: "⚠", warn: "⚡", good: "✦", info: "•" };
function SignalRow({ s, fmtM, compact }) {
  const pc = s.pct != null ? (s.dir === "up" ? "▲" : "▼") + " " + Math.abs(s.pct * 100).toFixed(0) + "%" : "";
  const detail = s.msg || (s.cur != null && s.prev != null ? fmtMetric(s.metric, s.cur, fmtM) + " from " + fmtMetric(s.metric, s.prev, fmtM) + " " + s.base : "");
  return (
    <div className={"drr-sig " + s.sev + (compact ? " compact" : "")}>
      <span className="drr-sig-ico">{SIG_ICON[s.sev] || "•"}</span>
      <span className="drr-sig-body"><b>{s.metric}{pc ? " " + pc : ""}</b>{detail && !compact ? <span className="drr-sig-detail"> · {detail}</span> : null}</span>
    </div>
  );
}

function DeltaPill({ d, fmt }) {
  if (!d || d.delta == null || d.pct == null) return null;
  const up = d.delta >= 0, good = d.costMetric ? !up : up;
  return <span className={"drr-d " + (good ? "good" : "bad")}>{up ? "▲" : "▼"} {Math.abs(d.pct * 100).toFixed(0)}%</span>;
}
/* delta KPI card with a per-card comparison dropdown (DoD / WoW / MoM / same-date /
   same-weekday / vs-target). Options are filtered to those the data can actually compute. */
function DeltaCard({ label, field, fmt, cur, prevM, defMode }) {
  const opts = window.DRRService.availableModes(field, cur, prevM);
  const [mode, setMode] = useStateD(defMode || "dod");
  const fallback = opts.length ? opts[0].key : "dod";
  const active = opts.find(o => o.key === mode) ? mode : fallback;
  const d = window.DRRService.compare(field, active, cur, prevM);
  const up = d && d.delta >= 0, good = d ? (d.costMetric ? !up : up) : true;
  return (
    <div className="kpi drr-kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {opts.length > 0 && (
          <select className="kpi-select" value={active} onChange={e => setMode(e.target.value)}>
            {opts.map(o => <option key={o.key} value={o.key}>{o.short}</option>)}
          </select>
        )}
      </div>
      <div className="kpi-value">{d && d.cur != null ? fmt(d.cur) : "-"}</div>
      {d && d.delta != null && d.pct != null
        ? <div className={"drr-d " + (good ? "good" : "bad")}>{up ? "▲" : "▼"} {Math.abs(d.pct * 100).toFixed(0)}% <span className="drr-prev">vs {fmt(d.prev)} · {d.note}</span></div>
        : <div className="kpi-sub">{d && d.note ? d.note : "no comparison"}</div>}
    </div>
  );
}

function ProjInsight({ p, fmtM }) {
  let text;
  if (p.rem === 0) text = "Month complete — final revenue " + fmtM(p.expected) + ".";
  else if (p.targetRev == null) text = "Trending to " + fmtM(p.expected) + " by month-end at " + fmtM(p.runRate) + "/day (recent pace).";
  else if (p.neededDaily === 0) text = "Target already met — MTD " + fmtM(p.expected - p.runRate * p.rem) + " is past the " + fmtM(p.targetRev) + " monthly target. Projected " + fmtM(p.expected) + " by month-end at the current " + fmtM(p.runRate) + "/day pace.";
  else if (p.willHit) text = "On track to beat target by " + pct(Math.abs(p.variancePct), 0) + " — projected " + fmtM(p.expected) + " vs " + fmtM(p.targetRev) + " target. Hold ≥" + fmtM(p.neededDaily) + "/day across the remaining " + p.rem + " days.";
  else {
    const liftTxt = p.lift != null ? " — a " + (p.lift >= 0 ? "+" : "") + Math.round(p.lift * 100) + "% lift over the recent " + fmtM(p.recentMean) + "/day pace" : "";
    text = "Behind target by " + pct(Math.abs(p.variancePct), 0) + ". Needs " + fmtM(p.neededDaily) + "/day for the next " + p.rem + " days" + liftTxt + " to reach " + fmtM(p.targetRev) + ".";
  }
  return <div className={"proj-insight " + (p.willHit === false ? "warn" : p.willHit ? "good" : "")}>{text}</div>;
}

/* ---------------- DRR detail workspace ---------------- */
function DRRWorkspace({ brand, months, onBack, navigate }) {
  const [mIdx, setMIdx] = useStateD(0);
  const m = months[mIdx] || months[0];
  const parsed = m.parsed;
  const prevM = months[mIdx + 1] ? months[mIdx + 1].parsed : null;   // newest-first → next is previous calendar month
  const sym = parsed.currency, t = parsed.totals, days = parsed.days;
  const fmtM = v => drrMoney(v, sym);
  const fmtX = v => v != null ? v.toFixed(2) + "×" : "-";
  const labels = days.map((d, i) => String(d.dom || i + 1));
  const ser = f => window.DRRService.seriesOf(days, f);
  let s = 0; const cumGross = days.map(d => { s += d.gross || 0; return s; });
  const targetLine = parsed.targetRev ? days.map((_, i) => parsed.targetRev * (i + 1) / parsed.monthDays) : null;
  const targetRoas = parsed.targets && parsed.targets.roas;
  const proj = window.DRRService.projectEOM(parsed);
  const confCls = proj ? (proj.confidence >= 0.7 ? "good" : proj.confidence >= 0.5 ? "warn" : "bad") : "warn";

  return (
    <div className="screen">
      <div className="brand-head">
        <button className="back" onClick={onBack}>← All DRR</button>
        <div className="brand-title-row">
          <div>
            <div className="brand-title"><span className="brand-dot lg" data-h={t.roas >= 2 ? "good" : t.roas >= 1 ? "warn" : "bad"} /><h1>{brand.name}</h1>
              <select className="drr-month-sel" value={mIdx} onChange={e => setMIdx(+e.target.value)}>
                {months.map((mm, i) => <option key={mm.key} value={i}>{mm.label}</option>)}
              </select></div>
            <p className="sub">Daily run-rate · {parsed.daysElapsed} of {parsed.monthDays} days · last entry {days[days.length - 1].date}
              {months.length > 1 && <span> · {months.length} months on record</span>}</p>
          </div>
          <div className="drr-jump">
            <button className="tool-btn" onClick={() => navigate("overview")}>Overview</button>
            <button className="tool-btn" onClick={() => navigate("forecast")}>Forecast</button>
            <button className="tool-btn" onClick={() => navigate("drr")}>Daily run-rate</button>
            {window.MODEL && window.MODEL.byName[brand.name] && <button className="tool-btn" onClick={() => navigate("brand", brand.name)}>Weekly / Monthly</button>}
          </div>
        </div>
      </div>

      <div className="fc-sub">Delta engine · pick a comparison per card{!prevM && <span className="muted-sm"> · cross-month options need a prior month</span>}</div>
      <div className="kpi-row seven">
        <DeltaCard label="Revenue" field="gross" fmt={fmtM} cur={parsed} prevM={prevM} />
        <DeltaCard label="Spend" field="spend" fmt={fmtM} cur={parsed} prevM={prevM} />
        <DeltaCard label="ROAS" field="roas" fmt={fmtX} cur={parsed} prevM={prevM} />
        <DeltaCard label="Orders" field="orders" fmt={v => v != null ? num(v) : "-"} cur={parsed} prevM={prevM} />
        <DeltaCard label="AOV" field="aov" fmt={fmtM} cur={parsed} prevM={prevM} />
        <DeltaCard label="CAC" field="cac" fmt={fmtM} cur={parsed} prevM={prevM} />
        <DeltaCard label="Returns" field="returns" fmt={fmtM} cur={parsed} prevM={prevM} />
      </div>

      <div className="fc-sub">Insights &amp; analysis · day-on-day</div>
      <div className="card drr-signals-card">
        {(() => {
          const signals = window.DRRService.drrSignals(parsed);
          return signals.length
            ? <div className="drr-sig-list">{signals.map((s, i) => <SignalRow key={i} s={s} fmtM={fmtM} />)}</div>
            : <div className="drr-sig-none">✓ No unusual day-on-day movements — {brand.name} is steady vs yesterday.</div>;
        })()}
      </div>

      <div className="fc-sub">Month to date</div>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        <div className="kpi"><div className="kpi-label">MTD Revenue</div><div className="kpi-value">{fmtM(t.gross)}</div><div className="kpi-sub">net {fmtM(t.net)}</div></div>
        <div className="kpi"><div className="kpi-label">MTD Spend</div><div className="kpi-value">{fmtM(t.spend)}</div><div className="kpi-sub">meta {fmtM(days.reduce((a, x) => a + (x.metaSpend || 0), 0))} · google {fmtM(days.reduce((a, x) => a + (x.googleSpend || 0), 0))}</div></div>
        <div className="kpi"><div className="kpi-label">Blended ROAS</div><div className={"kpi-value " + roasHealth(t.roas)}>{roas(t.roas)}</div><div className="kpi-sub">net {roas(t.netRoas)}</div></div>
        <div className="kpi"><div className="kpi-label">Target achievement</div><div className="kpi-value">{parsed.achievement != null ? pct(parsed.achievement, 0) : "-"}</div>
          {parsed.targetRev ? <div className="kpi-sub">of {fmtM(parsed.targetRev)}</div> : <div className="kpi-sub">no target set</div>}</div>
      </div>
      {parsed.achievement != null && <div className="drr-progress"><div className="drr-progress-fill" style={{ width: pct(Math.min(1, parsed.achievement), 0) }} /></div>}

      {proj && (
        <div className="card drr-proj">
          <div className="card-head"><h3>End-of-month projection</h3><span className="muted-sm">trend-based · {proj.recentWindow}-day run rate</span></div>
          <div className="drr-proj-grid">
            <div className="proj-main">
              <div className="proj-eyebrow">Expected EOM revenue</div>
              <div className="proj-value">{fmtM(proj.expected)}</div>
              <div className="proj-conf"><span className={"conf-dot " + confCls} /> {proj.confLabel} confidence</div>
              <div className="conf-bar"><div className={"conf-fill " + confCls} style={{ width: pct(proj.confidence, 0) }} /></div>
              {proj.targetRev != null && <div className={"proj-var " + (proj.willHit ? "good" : "bad")}>{proj.variance >= 0 ? "+" : ""}{fmtM(proj.variance)} vs target ({pct(proj.variancePct, 0)})</div>}
            </div>
            <div className="proj-scen">
              <div className="ps worst"><span className="ps-l">Worst case</span><span className="ps-v">{fmtM(proj.worst)}</span></div>
              <div className="ps exp"><span className="ps-l">Expected</span><span className="ps-v">{fmtM(proj.expected)}</span></div>
              <div className="ps best"><span className="ps-l">Best case</span><span className="ps-v">{fmtM(proj.best)}</span></div>
            </div>
          </div>
          <ProjInsight p={proj} fmtM={fmtM} />
          <div className="proj-assume muted-sm">Assumes the last {proj.recentWindow} days' run rate ({fmtM(proj.recentMean)}/day) holds · {proj.daysElapsed} of {proj.monthDays} days done, {proj.rem} remaining · best/worst span ±1 std-dev of recent daily revenue.</div>
        </div>
      )}

      <div className="drr-charts">
        <div className="card"><div className="card-head"><h3>Revenue</h3><span className="muted-sm">gross vs net · daily</span></div>
          <LineMulti months={labels} series={[{ data: ser("gross"), color: "var(--accent)" }, { data: ser("net"), color: "var(--violet)" }]} fmt={fmtM} fill={true} mode="spline" />
          <ChartLegend items={[{ label: "Gross", color: "var(--accent)" }, { label: "Net", color: "var(--violet)" }]} /></div>

        <div className="card"><div className="card-head"><h3>Ad spend split</h3><span className="muted-sm">meta vs google · daily</span></div>
          <StackedBars labels={labels} series={[{ data: ser("metaSpend"), color: "var(--accent)", label: "Meta" }, { data: ser("googleSpend"), color: "var(--violet)", label: "Google" }]} fmt={fmtM} />
          <ChartLegend items={[{ label: "Meta", color: "var(--accent)" }, { label: "Google", color: "var(--violet)" }]} /></div>

        <div className="card"><div className="card-head"><h3>ROAS</h3><span className="muted-sm">gross vs net · daily</span></div>
          <LineMulti months={labels} series={[{ data: ser("roas"), color: "var(--good)" }, { data: ser("netRoas"), color: "var(--muted)" }]} fmt={fmtX} mode="spline"
            refs={[{ value: 1, label: "break-even", color: "var(--bad)" }].concat(targetRoas ? [{ value: targetRoas, label: "target", color: "var(--warn)" }] : [])} />
          <ChartLegend items={[{ label: "Gross ROAS", color: "var(--good)" }, { label: "Net ROAS", color: "var(--muted)" }, { label: "Break-even", color: "var(--bad)", dash: true }].concat(targetRoas ? [{ label: "Target", color: "var(--warn)", dash: true }] : [])} /></div>

        <div className="card"><div className="card-head"><h3>Cumulative revenue vs target</h3><span className="muted-sm">MTD pace</span></div>
          <LineMulti months={labels} series={(targetLine ? [{ data: targetLine, color: "var(--muted)" }] : []).concat([{ data: cumGross, color: "var(--accent)" }])} fmt={fmtM} fill={true} />
          <ChartLegend items={[{ label: "Actual", color: "var(--accent)" }].concat(targetLine ? [{ label: "Target pace", color: "var(--muted)", dash: true }] : [])} /></div>

        <div className="card"><div className="card-head"><h3>Orders</h3><span className="muted-sm">daily</span></div>
          <StackedBars labels={labels} series={[{ data: ser("orders"), color: "var(--review)", label: "Orders" }]} fmt={v => num(v)} /></div>

        <div className="card"><div className="card-head"><h3>Unit economics</h3><span className="muted-sm">AOV vs CAC · daily</span></div>
          <LineMulti months={labels} series={[{ data: ser("aov"), color: "var(--accent)" }, { data: ser("cac"), color: "var(--warn)" }]} fmt={fmtM} mode="spline" />
          <ChartLegend items={[{ label: "AOV", color: "var(--accent)" }, { label: "CAC", color: "var(--warn)" }]} /></div>
      </div>

      <div className="card table-card">
        <div className="card-head"><h3>Daily ledger</h3><span className="muted-sm">{days.length} days · {m.label}</span></div>
        <div className="drr-ledger-wrap"><table className="data-table drr-ledger">
          <thead><tr><th className="stickcol">Date</th><th className="n">Meta</th><th className="n">Google</th><th className="n">Spend</th><th className="n">Gross</th><th className="n">Returns</th><th className="n">Net</th><th className="n">ROAS</th><th className="n">Net ROAS</th><th className="n">Orders</th><th className="n">AOV</th><th className="n">CAC</th></tr></thead>
          <tbody>{days.map((d, i) => <tr key={i}>
            <td className="dim stickcol">{d.date}</td>
            <td className="n mono dim">{fmtM(d.metaSpend)}</td><td className="n mono dim">{fmtM(d.googleSpend)}</td>
            <td className="n mono">{fmtM(d.spend)}</td><td className="n mono">{fmtM(d.gross)}</td>
            <td className="n mono dim">{fmtM(d.returns)}</td><td className="n mono">{fmtM(d.net)}</td>
            <td className="n"><RoasPill value={d.roas} /></td><td className="n mono dim">{fmtX(d.netRoas)}</td>
            <td className="n mono">{d.orders != null ? num(d.orders) : "-"}</td>
            <td className="n mono dim">{fmtM(d.aov)}</td><td className="n mono dim">{fmtM(d.cac)}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

/* loads the full workbook (all months) for a brand, then renders the workspace */
function DRRWorkspaceLoader({ brand, fallbackParsed, onBack, navigate }) {
  const [wb, setWb] = useStateD(null);
  useEffectD(() => {
    let alive = true;
    window.DRRService.fetchWorkbook(brand).then(res => { if (alive) setWb(res); });
    return () => { alive = false; };
  }, [brand.id]);

  if (!wb) return (
    <div className="screen">
      <div className="brand-head"><button className="back" onClick={onBack}>← All DRR</button>
        <h1>{brand.name}</h1><p className="sub">Loading all months…</p></div>
      <div className="drr-charts">{Array.from({ length: 4 }).map((_, i) => <div className="card skeleton" key={i} style={{ height: 220 }} />)}</div>
    </div>
  );
  if (wb.ok) return <DRRWorkspace brand={brand} months={wb.months} onBack={onBack} navigate={navigate} />;
  if (fallbackParsed) return <DRRWorkspace brand={brand} months={[{ key: "cur", label: fallbackParsed.monthLabel || "Current", parsed: fallbackParsed }]} onBack={onBack} navigate={navigate} />;
  return (
    <div className="screen">
      <div className="brand-head"><button className="back" onClick={onBack}>← All DRR</button><h1>{brand.name}</h1></div>
      <div className="empty">{wb.error}</div>
    </div>
  );
}

/* ---------------- All DRR landing ---------------- */
function AllDRR({ navigate }) {
  const reg = window.DRRService.registry();
  const [data, setData] = useStateD({});       // id -> {status, parsed, error, ts}
  const [q, setQ] = useStateD("");
  const [filter, setFilter] = useStateD("all");
  const [selected, setSelected] = useStateD(null);
  const [dod, setDod] = useStateD(false);   // day-on-day signal view

  useEffectD(() => {
    let alive = true;
    setData(d => { const n = { ...d }; reg.forEach(b => { if (!n[b.id]) n[b.id] = { status: "loading" }; }); return n; });
    window.DRRService.pool(reg, (b) => window.DRRService.fetchBrand(b).then(res => {
      if (!alive) return;
      setData(d => ({ ...d, [b.id]: res.ok ? { status: "ok", parsed: res.parsed, ts: res.ts } : { status: "error", error: res.error } }));
    }), 6);
    return () => { alive = false; };
  }, []);

  if (selected) {
    const rec = data[selected.id] || {};
    return <DRRWorkspaceLoader brand={selected} fallbackParsed={rec.status === "ok" ? rec.parsed : null} onBack={() => setSelected(null)} navigate={navigate} />;
  }

  let cards = reg.map(b => ({ brand: b, rec: data[b.id] || { status: "loading" } }));
  cards.forEach(c => { c.alert = c.rec.status === "ok" ? window.DRRService.drrAlert(c.rec.parsed) : { sev: null, count: 0, signals: [] }; });
  if (q) cards = cards.filter(c => c.brand.name.toLowerCase().includes(q.toLowerCase()));
  if (filter !== "all") cards = cards.filter(c => {
    const s = c.rec.status === "ok" ? window.DRRService.summaryOf(c.rec.parsed) : null;
    const st = drrStatus(s).cls;
    if (filter === "movers") return c.alert.sev === "bad" || c.alert.sev === "warn";
    if (filter === "attention") return st === "bad" || st === "warn";
    if (filter === "ontrack") return st === "good";
    if (filter === "unavailable") return c.rec.status === "error";
    return true;
  });
  // in day-on-day mode, surface the biggest movers first
  if (dod) cards = cards.slice().sort((a, b) => {
    const r = window.DRRService.SEV_RANK, rank = x => x.alert && x.alert.sev ? r[x.alert.sev] : -1;
    const dr = rank(b) - rank(a); if (dr) return dr;
    const mv = x => { const d = x.rec.status === "ok" ? window.DRRService.compare("gross", "dod", x.rec.parsed, null) : null; return d && d.pct != null ? Math.abs(d.pct) : 0; };
    return mv(b) - mv(a);
  });
  const loaded = reg.filter(b => (data[b.id] || {}).status && data[b.id].status !== "loading").length;
  const moverCount = reg.map(b => data[b.id]).filter(r => r && r.status === "ok" && ["bad", "warn"].includes(window.DRRService.drrAlert(r.parsed).sev)).length;

  return (
    <div className="screen">
      <div className="page-head">
        <div><div className="crumb">Branches</div><h1>All DRR</h1>
          <p className="sub">Every client's daily run-rate in one place · {loaded}/{reg.length} loaded</p></div>
        <div className="period">
          <button className="seg" onClick={() => navigate("overview")}>Overview</button>
          <button className="seg" onClick={() => navigate("forecast")}>Forecast</button>
          <button className="seg" onClick={() => navigate("drr")}>Daily run-rate</button>
        </div>
      </div>

      <div className="drr-toolbar">
        <input className="drr-search" placeholder="Search brands…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="filter-chips">
          {[["all", "All"], ["movers", "Big movers" + (moverCount ? " (" + moverCount + ")" : "")], ["ontrack", "On track"], ["attention", "Needs attention"], ["unavailable", "Unavailable"]].map(([k, l]) =>
            <button key={k} className={"chip " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>{l}</button>)}
          <button className={"chip dod-toggle " + (dod ? "on" : "")} onClick={() => setDod(v => !v)} title="Show day-on-day changes & signals">⚡ Day-on-day</button>
        </div>
      </div>

      <div className="drr-grid">
        {cards.map(({ brand, rec, alert }) => {
          if (rec.status === "loading") return <div className="card drr-card skeleton" key={brand.id}><div className="drr-card-h">{brand.name}</div><div className="muted-sm">Loading…</div></div>;
          if (rec.status === "error") return (
            <div className="card drr-card err" key={brand.id}><div className="drr-card-h">{brand.name}<span className="drr-status bad">Unavailable</span></div>
              <div className="muted-sm" style={{ marginTop: 6 }}>{rec.error}</div></div>);
          const s = window.DRRService.summaryOf(rec.parsed), st = drrStatus(s), sym = s.currency;
          const fmtM = v => drrMoney(v, sym);
          const dd = f => window.DRRService.compare(f, "dod", rec.parsed, null);
          const ddRev = dd("gross"), ddSpend = dd("spend"), ddRoas = dd("roas");
          return (
            <button className="card drr-card" key={brand.id} onClick={() => setSelected(brand)}>
              <div className="drr-card-h"><span className="drr-card-name">{brand.name}</span>
                <span className="drr-card-tags">
                  {alert && alert.sev && (alert.sev === "bad" || alert.sev === "warn") && <span className={"drr-alert " + alert.sev} title={alert.top ? alert.top.metric : "signals"}>⚡ {alert.count}</span>}
                  <span className={"drr-status " + st.cls}>{st.label}</span>
                </span>
              </div>
              <div className="drr-card-month">{s.monthLabel} · {s.daysElapsed}/{s.monthDays} days</div>

              {dod ? (
                <div className="drr-card-dod">
                  <div className="drr-dod-grid">
                    <div><span className="dl">Revenue</span><span className="dv">{fmtM(ddRev && ddRev.cur)} <DeltaPill d={ddRev} /></span></div>
                    <div><span className="dl">Spend</span><span className="dv">{fmtM(ddSpend && ddSpend.cur)} <DeltaPill d={ddSpend} /></span></div>
                    <div><span className="dl">ROAS</span><span className="dv">{ddRoas && ddRoas.cur != null ? ddRoas.cur.toFixed(2) + "×" : "-"} <DeltaPill d={ddRoas} /></span></div>
                  </div>
                  {alert.signals && alert.signals.length
                    ? <div className="drr-sig-list mini">{alert.signals.slice(0, 3).map((sg, i) => <SignalRow key={i} s={sg} fmtM={fmtM} compact />)}</div>
                    : <div className="drr-sig-none mini">No notable day-on-day moves</div>}
                </div>
              ) : (<>
                <div className="drr-card-kpis">
                  <div><span className="dl">Revenue</span><span className="dv">{drrMoney(s.revenue, s.currency)} <DeltaPill d={s.revDelta} /></span></div>
                  <div><span className="dl">Spend</span><span className="dv">{drrMoney(s.spend, s.currency)}</span></div>
                  <div><span className="dl">ROAS</span><span className="dv"><RoasPill value={s.roas} /></span></div>
                  <div><span className="dl">Target</span><span className="dv">{s.achievement != null ? pct(s.achievement, 0) : "-"}</span></div>
                </div>
                {alert && alert.top && (alert.sev === "bad" || alert.sev === "warn") && <div className="drr-card-topsig"><SignalRow s={alert.top} fmtM={fmtM} compact /></div>}
                {s.achievement != null && <div className="drr-progress sm"><div className="drr-progress-fill" style={{ width: pct(Math.min(1, s.achievement), 0) }} /></div>}
              </>)}

              <div className="drr-card-foot">Updated {rec.ts ? new Date(rec.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
            </button>
          );
        })}
      </div>
      {!cards.length && <div className="empty">No brands match.</div>}
    </div>
  );
}
window.AllDRR = AllDRR;
