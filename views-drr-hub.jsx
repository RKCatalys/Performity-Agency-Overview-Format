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

function DeltaPill({ d, fmt }) {
  if (!d || d.delta == null || d.pct == null) return null;
  const up = d.delta >= 0, good = d.costMetric ? !up : up;
  return <span className={"drr-d " + (good ? "good" : "bad")}>{up ? "▲" : "▼"} {Math.abs(d.pct * 100).toFixed(0)}%</span>;
}
function DeltaCard({ label, value, d, fmt }) {
  const up = d && d.delta >= 0, good = d ? (d.costMetric ? !up : up) : true;
  return (
    <div className="kpi">
      <div className="kpi-top"><span className="kpi-label">{label}</span></div>
      <div className="kpi-value">{value}</div>
      {d && d.delta != null && d.pct != null
        ? <div className={"drr-d " + (good ? "good" : "bad")}>{up ? "▲" : "▼"} {Math.abs(d.pct * 100).toFixed(0)}% <span className="drr-prev">vs {fmt ? fmt(d.prev) : d.prev}</span></div>
        : <div className="kpi-sub">latest day</div>}
    </div>
  );
}

/* ---------------- DRR detail workspace ---------------- */
function DRRWorkspace({ brand, parsed, onBack, navigate }) {
  const sym = parsed.currency;
  const M = drrMoney, t = parsed.totals, days = parsed.days;
  const labels = days.map((d, i) => String(i + 1));
  const fmtM = v => M(v, sym);
  const cum = (field) => { let s = 0; return days.map(d => { s += d[field] || 0; return s; }); };
  const cumGross = cum("gross");
  const targetLine = parsed.targetRev ? labels.map((_, i) => parsed.targetRev * (i + 1) / parsed.monthDays) : null;
  const dRev = window.DRRService.delta(days, "gross"), dSpend = window.DRRService.delta(days, "spend"), dRoas = window.DRRService.delta(days, "roas");
  const dOrders = window.DRRService.delta(days, "orders"), dAov = window.DRRService.delta(days, "aov"), dCac = window.DRRService.delta(days, "cac");

  return (
    <div className="screen">
      <div className="brand-head">
        <button className="back" onClick={onBack}>← All DRR</button>
        <div className="brand-title-row">
          <div>
            <div className="brand-title"><span className="brand-dot lg" data-h={t.roas >= 2 ? "good" : t.roas >= 1 ? "warn" : "bad"} /><h1>{brand.name}</h1>
              <Badge tone="accent">{parsed.monthLabel || "DRR"}</Badge></div>
            <p className="sub">Daily run-rate · {parsed.daysElapsed} of {parsed.monthDays} days · last entry {parsed.days[parsed.days.length - 1].date}</p>
          </div>
          <div className="drr-jump">
            <button className="tool-btn" onClick={() => navigate("overview")}>Overview</button>
            <button className="tool-btn" onClick={() => navigate("forecast")}>Forecast</button>
            <button className="tool-btn" onClick={() => navigate("drr")}>Daily run-rate</button>
            {window.MODEL && window.MODEL.byName[brand.name] && <button className="tool-btn" onClick={() => navigate("brand", brand.name)}>Weekly / Monthly</button>}
          </div>
        </div>
      </div>

      <div className="fc-sub">Latest day vs previous · delta engine</div>
      <div className="kpi-row seven">
        <DeltaCard label="Revenue" value={fmtM(dRev && dRev.cur)} d={dRev} fmt={fmtM} />
        <DeltaCard label="Spend" value={fmtM(dSpend && dSpend.cur)} d={dSpend} fmt={fmtM} />
        <DeltaCard label="ROAS" value={dRoas && dRoas.cur != null ? dRoas.cur.toFixed(2) + "×" : "-"} d={dRoas} fmt={v => v != null ? v.toFixed(2) + "×" : "-"} />
        <DeltaCard label="Orders" value={dOrders && dOrders.cur != null ? num(dOrders.cur) : "-"} d={dOrders} fmt={v => num(v)} />
        <DeltaCard label="AOV" value={fmtM(dAov && dAov.cur)} d={dAov} fmt={fmtM} />
        <DeltaCard label="CAC" value={fmtM(dCac && dCac.cur)} d={dCac} fmt={fmtM} />
        <DeltaCard label="Returns" value={fmtM(window.DRRService.delta(days, "returns") && window.DRRService.delta(days, "returns").cur)} d={window.DRRService.delta(days, "returns")} fmt={fmtM} />
      </div>

      <div className="fc-sub">Month to date</div>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
        <div className="kpi"><div className="kpi-label">MTD Revenue</div><div className="kpi-value">{fmtM(t.gross)}</div><div className="kpi-sub">net {fmtM(t.net)}</div></div>
        <div className="kpi"><div className="kpi-label">MTD Spend</div><div className="kpi-value">{fmtM(t.spend)}</div></div>
        <div className="kpi"><div className="kpi-label">Blended ROAS</div><div className={"kpi-value " + roasHealth(t.roas)}>{roas(t.roas)}</div></div>
        <div className="kpi"><div className="kpi-label">Projected EOM</div><div className="kpi-value">{fmtM(parsed.projGross)}</div><div className="kpi-sub">at current pace</div></div>
        <div className="kpi"><div className="kpi-label">Target achievement</div><div className="kpi-value">{parsed.achievement != null ? pct(parsed.achievement, 0) : "-"}</div>
          {parsed.targetRev ? <div className="kpi-sub">of {fmtM(parsed.targetRev)}</div> : <div className="kpi-sub">no target set</div>}</div>
      </div>
      {parsed.achievement != null && <div className="drr-progress"><div className="drr-progress-fill" style={{ width: pct(Math.min(1, parsed.achievement), 0) }} /></div>}

      <div className="grid-2">
        <div className="card"><div className="card-head"><h3>Revenue &amp; spend</h3><span className="muted-sm">daily</span></div>
          <ComboChart months={labels} bars={window.DRRService.seriesOf(days, "gross")} line={window.DRRService.seriesOf(days, "roas")} barFmt={fmtM} showPct={false} /></div>
        <div className="card"><div className="card-head"><h3>ROAS trend</h3><span className="muted-sm">daily</span></div>
          <LineMulti months={labels} series={[{ data: window.DRRService.seriesOf(days, "roas"), color: "var(--good)" }]} fmt={v => v.toFixed(1) + "×"} mode="spline" /></div>
      </div>
      <div className="grid-2">
        <div className="card"><div className="card-head"><h3>Cumulative revenue vs target</h3><span className="muted-sm">MTD pace</span></div>
          <LineMulti months={labels} series={targetLine ? [{ data: targetLine, color: "var(--muted)" }, { data: cumGross, color: "var(--accent)" }] : [{ data: cumGross, color: "var(--accent)" }]} fmt={fmtM} fill={true} />
          {targetLine && <div className="muted-sm" style={{ marginTop: 6 }}><span style={{ color: "var(--muted)" }}>──</span> target pace · <span style={{ color: "var(--accent)" }}>──</span> actual</div>}</div>
        <div className="card"><div className="card-head"><h3>Spend trend</h3><span className="muted-sm">meta + google</span></div>
          <ComboChart months={labels} bars={window.DRRService.seriesOf(days, "spend")} line={days.map(() => null)} barFmt={fmtM} showPct={false} /></div>
      </div>

      <div className="card table-card">
        <div className="card-head"><h3>Daily ledger</h3><span className="muted-sm">{days.length} days</span></div>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Date</th><th className="n">Spend</th><th className="n">Gross</th><th className="n">Returns</th><th className="n">Net</th><th className="n">ROAS</th><th className="n">Orders</th><th className="n">AOV</th><th className="n">CAC</th></tr></thead>
          <tbody>{days.map((d, i) => <tr key={i}>
            <td className="dim">{d.date}</td><td className="n mono">{fmtM(d.spend)}</td><td className="n mono">{fmtM(d.gross)}</td>
            <td className="n mono dim">{fmtM(d.returns)}</td><td className="n mono">{fmtM(d.net)}</td>
            <td className="n"><RoasPill value={d.roas} /></td><td className="n mono">{d.orders != null ? num(d.orders) : "-"}</td>
            <td className="n mono dim">{fmtM(d.aov)}</td><td className="n mono dim">{fmtM(d.cac)}</td></tr>)}</tbody>
        </table></div>
      </div>
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
    const rec = data[selected.id];
    if (rec && rec.status === "ok") return <DRRWorkspace brand={selected} parsed={rec.parsed} onBack={() => setSelected(null)} navigate={navigate} />;
  }

  let cards = reg.map(b => ({ brand: b, rec: data[b.id] || { status: "loading" } }));
  if (q) cards = cards.filter(c => c.brand.name.toLowerCase().includes(q.toLowerCase()));
  if (filter !== "all") cards = cards.filter(c => {
    const s = c.rec.status === "ok" ? window.DRRService.summaryOf(c.rec.parsed) : null;
    const st = drrStatus(s).cls;
    if (filter === "attention") return st === "bad" || st === "warn";
    if (filter === "ontrack") return st === "good";
    if (filter === "unavailable") return c.rec.status === "error";
    return true;
  });
  const loaded = reg.filter(b => (data[b.id] || {}).status && data[b.id].status !== "loading").length;

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
          {[["all", "All"], ["ontrack", "On track"], ["attention", "Needs attention"], ["unavailable", "Unavailable"]].map(([k, l]) =>
            <button key={k} className={"chip " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>

      <div className="drr-grid">
        {cards.map(({ brand, rec }) => {
          if (rec.status === "loading") return <div className="card drr-card skeleton" key={brand.id}><div className="drr-card-h">{brand.name}</div><div className="muted-sm">Loading…</div></div>;
          if (rec.status === "error") return (
            <div className="card drr-card err" key={brand.id}><div className="drr-card-h">{brand.name}<span className="drr-status bad">Unavailable</span></div>
              <div className="muted-sm" style={{ marginTop: 6 }}>{rec.error}</div></div>);
          const s = window.DRRService.summaryOf(rec.parsed), st = drrStatus(s);
          return (
            <button className="card drr-card" key={brand.id} onClick={() => setSelected(brand)}>
              <div className="drr-card-h">{brand.name}<span className={"drr-status " + st.cls}>{st.label}</span></div>
              <div className="drr-card-month">{s.monthLabel} · {s.daysElapsed}/{s.monthDays} days</div>
              <div className="drr-card-kpis">
                <div><span className="dl">Revenue</span><span className="dv">{drrMoney(s.revenue, s.currency)} <DeltaPill d={s.revDelta} /></span></div>
                <div><span className="dl">Spend</span><span className="dv">{drrMoney(s.spend, s.currency)}</span></div>
                <div><span className="dl">ROAS</span><span className="dv"><RoasPill value={s.roas} /></span></div>
                <div><span className="dl">Target</span><span className="dv">{s.achievement != null ? pct(s.achievement, 0) : "-"}</span></div>
              </div>
              {s.achievement != null && <div className="drr-progress sm"><div className="drr-progress-fill" style={{ width: pct(Math.min(1, s.achievement), 0) }} /></div>}
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
