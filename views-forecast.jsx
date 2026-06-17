/* views-forecast.jsx · Forecast & Planning — a decision system.
   Forecast = what happens if nothing changes. Goal = what must change to hit a target.
   All spend is NET media spend (ex-GST). */
const { useState: useStateF } = React;

function parseEndDay(range) {
  if (!range) return null;
  const m = String(range).match(/-\s*(\d+)/) || String(range).match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

// derive everything the forecast/goal views need for a brand
function analyze(b) {
  const W = window.WEEKLY[b.key] || {}, meta = window.WEEKLY_META[b.key] || {};
  const active = []; for (let i = 0; i < 12; i++) if ((b.spendSeries[i] || 0) > 0 || (b.revSeries[i] || 0) > 0) active.push(i);
  const mi = active.length ? active[active.length - 1] : 0;
  const ov = W.overall && W.overall.metrics;
  const probe = ov && (ov["Total Ad Spend"] || ov["Shopify Gross Sales"]);
  const wk = probe && probe.months[mi] ? probe.months[mi].weeks : [];
  const weeksElapsed = wk.filter(x => x != null).length || 1;
  const wd = ((meta.weekDates || [])[mi] || []).filter(Boolean);
  const totalWeeks = Math.max(weeksElapsed, wd.length || weeksElapsed);
  const daysElapsed = (wd.length >= weeksElapsed && parseEndDay(wd[weeksElapsed - 1])) || weeksElapsed * 7;
  const totalDays = (wd.length && parseEndDay(wd[wd.length - 1])) || totalWeeks * 7;
  const partial = weeksElapsed < totalWeeks;
  const complete = partial ? active.slice(0, -1) : active;

  const mtd = { spend: b.spendSeries[mi] || 0, gross: (b.grossSeries || [])[mi] || 0, rev: b.revSeries[mi] || 0, orders: b.ordersSeries[mi] || 0, net: (b.netSeries || [])[mi] || 0 };
  const factor = partial && daysElapsed > 0 ? totalDays / daysElapsed : 1;
  let g = []; for (let i = Math.max(1, complete.length - 3); i < complete.length; i++) { const c = complete[i], p = complete[i - 1]; if (b.revSeries[p] > 0 && b.revSeries[c] != null) g.push(b.revSeries[c] / b.revSeries[p] - 1); }
  const growth = g.length ? g.reduce((a, x) => a + x, 0) / g.length : 0;

  const m = partial ? factor : (1 + growth);
  const proj = { spend: mtd.spend * m, gross: mtd.gross * m, rev: mtd.rev * m, orders: mtd.orders * m, net: mtd.net * m };
  proj.roas = proj.spend ? proj.rev / proj.spend : null;
  proj.grossRoas = proj.spend ? proj.gross / proj.spend : null;
  proj.aov = proj.orders ? proj.gross / proj.orders : null;
  proj.cac = proj.orders ? proj.spend / proj.orders : null;

  const drr = daysElapsed ? mtd.spend / daysElapsed : 0;

  const chan = ["meta", "google", "other"].map(key => {
    const mm = W[key] && W[key].metrics;
    const sp = mm && mm["Spend"] && mm["Spend"].months[mi] ? mm["Spend"].months[mi].mo : 0;
    const rv = mm && mm["Revenue"] && mm["Revenue"].months[mi] ? mm["Revenue"].months[mi].mo : 0;
    return { key, label: key === "meta" ? "Meta" : key === "google" ? "Google" : "Others", spend: (sp || 0) * m, rev: (rv || 0) * m };
  }).filter(c => c.spend > 0 || c.rev > 0);
  const chSpend = chan.reduce((a, c) => a + c.spend, 0), chRev = chan.reduce((a, c) => a + c.rev, 0);
  chan.forEach(c => { c.pct = chSpend ? c.spend / chSpend : 0; c.revPct = chRev ? c.rev / chRev : 0; c.roas = c.spend ? c.rev / c.spend : null; });

  const base = { roas: b.dashRoas, grossRoas: b.grossRoas || b.dashRoas, aov: b.aov, cac: b.cac, cvr: (b.ch.meta && b.ch.meta.Orders && b.ch.meta.Clicks) ? b.ch.meta.Orders / b.ch.meta.Clicks : null };

  // confidence
  let conf = 50; const reasons = [];
  if (weeksElapsed >= 3) { conf += 18; reasons.push("Sufficient weeks of data this month"); } else { conf -= 6; reasons.push("Limited data this month"); }
  if (complete.length >= 3) { conf += 14; reasons.push("Multi-month history"); } else { reasons.push("Short history"); }
  const rv3 = complete.slice(-3).map(i => b.roasSeries[i]).filter(v => v != null);
  if (rv3.length >= 2) { const mean = rv3.reduce((a, x) => a + x, 0) / rv3.length; const sd = Math.sqrt(rv3.reduce((a, x) => a + (x - mean) ** 2, 0) / rv3.length); const cv = mean ? sd / mean : 1; if (cv < 0.15) { conf += 18; reasons.push("Stable ROAS trend"); } else { conf -= 8; reasons.push("Volatile ROAS / spend"); } }
  conf = Math.max(20, Math.min(95, Math.round(conf)));

  return { mi, weeksElapsed, totalWeeks, daysElapsed, totalDays, daysRemaining: Math.max(0, totalDays - daysElapsed), partial, mtd, factor, growth, proj, drr, chan, base, conf, confReasons: reasons, complete };
}

function FCard({ label, value, sub, tone }) {
  return <div className="kpi"><div className="kpi-top"><span className="kpi-label">{label}</span></div>
    <div className={"kpi-value " + (tone || "")}>{value}</div>{sub && <div className="kpi-sub">{sub}</div>}</div>;
}
function ConfBadge({ conf, reasons }) {
  const tone = conf >= 75 ? "good" : conf >= 55 ? "warn" : "bad";
  return <div className={"conf-badge " + tone} title={reasons.join(" · ")}>
    <span className="conf-num">{conf}%</span><span className="conf-lbl">forecast confidence</span></div>;
}
function ChannelTable({ chan }) {
  if (!chan.length) return null;
  const tot = chan.reduce((a, c) => ({ spend: a.spend + c.spend, rev: a.rev + c.rev }), { spend: 0, rev: 0 });
  return (
    <div className="card table-card">
      <div className="card-head"><h3>Channel breakdown</h3><span className="muted-sm">projected month-end · net spend</span></div>
      <div className="table-wrap"><table className="data-table compact">
        <thead><tr><th>Channel</th><th className="n">Spend</th><th className="n">Spend %</th><th className="n">Revenue</th><th className="n">Rev %</th><th className="n">ROAS</th></tr></thead>
        <tbody>
          {chan.map(c => <tr key={c.key}><td className="brand-cell"><span className="chan-dot" style={{ background: c.key === "meta" ? "var(--accent)" : c.key === "google" ? "var(--violet)" : "var(--muted)" }} /> {c.label}</td>
            <td className="n mono">{inr(c.spend)}</td><td className="n mono dim">{pct(c.pct, 0)}</td><td className="n mono">{inr(c.rev)}</td><td className="n mono dim">{pct(c.revPct, 0)}</td><td className="n"><RoasPill value={c.roas} /></td></tr>)}
          <tr className="headline"><td>Total</td><td className="n mono">{inr(tot.spend)}</td><td className="n mono">100%</td><td className="n mono">{inr(tot.rev)}</td><td className="n mono">100%</td><td className="n mono">{roas(tot.spend ? tot.rev / tot.spend : null)}</td></tr>
        </tbody>
      </table></div>
    </div>
  );
}
function InsightCols({ groups }) {
  return (
    <div className="fc-insights">
      {groups.map((g, i) => (
        <div className={"fc-icol " + g.cls} key={i}>
          <div className="fc-icol-h">{g.title}</div>
          <ul>{g.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Forecast Mode ---------------- */
function ForecastMode({ b }) {
  const a = analyze(b);
  if (!a.mtd.spend && !a.mtd.rev) return <div className="empty">No performance history for {b.key} yet.</div>;
  const meta = a.chan.find(c => c.key === "meta"), goog = a.chan.find(c => c.key === "google");
  const monthName = MONTHS[a.mi];
  const contribution = a.proj.rev - a.proj.spend;

  const key = [
    `Current spend pace: ${inr(a.drr)}/day (${a.daysElapsed} of ${a.totalDays} days of ${monthName})`,
    meta ? `Meta is ${pct(meta.pct, 0)} of spend and ${pct(meta.revPct, 0)} of revenue` : null,
    goog ? `Google is ${pct(goog.pct, 0)} of spend and ${pct(goog.revPct, 0)} of revenue` : null,
    `Projected blended ROAS ${roas(a.proj.roas)} on ${inr(a.proj.spend)} net spend`,
  ].filter(Boolean);
  const risks = [];
  if (a.growth < -0.05) risks.push(`Revenue trending down ~${Math.round(a.growth * 100)}% month-over-month`);
  if (a.proj.roas != null && a.proj.roas < 1.5) risks.push(`Low projected ROAS (${roas(a.proj.roas)}) — margin pressure`);
  if (a.conf < 55) risks.push(`Lower forecast confidence — ${a.confReasons.find(r => /Limited|Volatile|Short/.test(r)) || "unstable inputs"}`);
  if (!risks.length) risks.push("No major risks detected at current pace");
  const opps = [];
  const best = a.chan.slice().filter(c => c.roas != null).sort((x, y) => y.roas - x.roas)[0];
  if (best) opps.push(`${best.label} is the most efficient channel (ROAS ${roas(best.roas)}) — room to scale`);
  const overSpend = a.chan.find(c => c.pct - c.revPct > 0.08);
  if (overSpend) opps.push(`${overSpend.label} takes ${pct(overSpend.pct, 0)} of spend but ${pct(overSpend.revPct, 0)} of revenue — reallocate budget`);
  if (a.growth > 0.05) opps.push(`Positive momentum (+${Math.round(a.growth * 100)}% MoM) — sustain and scale`);
  if (!opps.length) opps.push("Maintain current efficient allocation");

  return (
    <>
      <div className="fc-headrow">
        <ConfBadge conf={a.conf} reasons={a.confReasons} />
        <div className="muted-sm">Forecast = what happens if nothing changes. Spend shown is net media spend (ex-GST).</div>
      </div>
      <div className="fc-note">
        Based on current pacing, <b>{b.key}</b> is projected to close {monthName} at <b>{inr(a.proj.rev)}</b> revenue on <b>{inr(a.proj.spend)}</b> net spend with a blended ROAS of <b>{roas(a.proj.roas)}</b>.
        {meta && goog && <> The brand is spending <b>{inr(a.drr)}/day</b>, with {pct(meta.pct, 0)} of spend on Meta and {pct(goog.pct, 0)} on Google.</>}
        {a.growth < -0.02 ? <> Momentum is negative ({Math.round(a.growth * 100)}% MoM), so the close may come in softer.</> : a.growth > 0.02 ? <> Momentum is positive (+{Math.round(a.growth * 100)}% MoM).</> : null}
      </div>

      <div className="fc-sub">Projected {monthName} month-end</div>
      <div className="kpi-row seven">
        <FCard label="Net Ad Spend" value={inr(a.proj.spend)} sub="ex-GST" />
        <FCard label="Gross Revenue" value={inr(a.proj.gross)} />
        <FCard label="Net Revenue" value={inr(a.proj.rev)} />
        <FCard label="Orders" value={num(a.proj.orders)} />
        <FCard label="ROAS" value={roas(a.proj.roas)} tone={roasHealth(a.proj.roas)} />
        <FCard label="AOV" value={a.proj.aov ? inr(a.proj.aov) : "-"} />
        <FCard label="CAC" value={a.proj.cac ? inr(a.proj.cac) : "-"} />
      </div>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
        <FCard label="Daily run-rate" value={inr(a.drr) + "/day"} sub={`${a.daysElapsed}/${a.totalDays} days elapsed`} />
        <FCard label="Net contribution" value={inr(contribution)} sub="revenue − net spend" tone={contribution >= 0 ? "good" : "bad"} />
        <FCard label="MoM momentum" value={(a.growth >= 0 ? "+" : "") + (a.growth * 100).toFixed(1) + "%"} tone={a.growth >= 0 ? "good" : "bad"} sub="avg last 3 months" />
      </div>

      <div className="grid-2"><ChannelTable chan={a.chan} />
        <div className="card"><div className="card-head"><h3>Channel efficiency</h3><span className="muted-sm">ROAS by channel</span></div>
          <HBars items={a.chan.map(c => ({ label: c.label, value: c.roas || 0 }))} fmt={v => v.toFixed(2) + "×"} />
        </div>
      </div>

      <InsightCols groups={[
        { title: "Key insights", cls: "good", items: key },
        { title: "Risks", cls: "bad", items: risks },
        { title: "Opportunities", cls: "accent", items: opps },
      ]} />
      <p className="muted-sm" style={{ marginTop: 4 }}>Forecast blends current-month daily run-rate with recent growth. Confidence reflects data volume and stability.</p>
    </>
  );
}

/* ---------------- Goal Planning Mode ---------------- */
// goal types: kind "outcome" (solve volume from a target) or "efficiency" (hold spend, solve the lift);
// "spend" is forward planning (spend X -> outcomes). unit drives formatting.
const GOAL_META = {
  gross:        { label: "Gross Revenue target", unit: "money", kind: "outcome" },
  net:          { label: "Net / Dash Revenue target", unit: "money", kind: "outcome" },
  spend:        { label: "Ad Spend / budget (forward)", unit: "money", kind: "forward" },
  orders:       { label: "Orders target", unit: "count", kind: "outcome" },
  contribution: { label: "Contribution / Profit target", unit: "money", kind: "outcome" },
  roas:         { label: "ROAS target", unit: "x", kind: "efficiency" },
  netRoas:      { label: "Net ROAS target", unit: "x", kind: "efficiency" },
  aov:          { label: "AOV target", unit: "money", kind: "efficiency" },
  cac:          { label: "CAC target (max)", unit: "money", kind: "efficiency" },
  cvr:          { label: "Conversion rate target", unit: "pct", kind: "efficiency" },
};
const fmtGoal = (unit, v) => v == null ? "-" : unit === "money" ? inr(v) : unit === "x" ? roas(v) : unit === "pct" ? pct(v, 2) : num(v);

// Solve a full plan from a target on `type` (=value), holding other efficiencies at baseline.
function buildPlan(a, base, type, value) {
  const gRoas = base.grossRoas || a.proj.grossRoas || 1;
  const nRoas = base.roas || a.proj.roas || 1;
  const aov = base.aov || a.proj.aov || null;
  const cac = base.cac || a.proj.cac || null;
  const cvr = base.cvr || null;
  const g2n = (a.proj.gross > 0) ? a.proj.rev / a.proj.gross : (gRoas ? nRoas / gRoas : 0.83); // net/gross
  const baseClicks = (cvr && a.proj.orders) ? a.proj.orders / cvr : null;
  let spend = a.proj.spend, gross = a.proj.gross, net = a.proj.rev, orders = a.proj.orders, outCvr = cvr;

  if (type === "spend") { spend = value; gross = spend * gRoas; net = spend * nRoas; orders = aov ? gross / aov : (cac ? spend / cac : null); }
  else if (type === "gross") { gross = value; spend = gross / gRoas; net = spend * nRoas; orders = aov ? gross / aov : null; }
  else if (type === "net") { net = value; spend = net / nRoas; gross = spend * gRoas; orders = aov ? gross / aov : null; }
  else if (type === "orders") { orders = value; spend = cac ? orders * cac : null; gross = aov ? orders * aov : null; net = spend != null ? spend * nRoas : null; }
  else if (type === "contribution") { spend = nRoas > 1 ? value / (nRoas - 1) : null; net = spend != null ? spend * nRoas : null; gross = spend != null ? spend * gRoas : null; orders = aov && gross ? gross / aov : null; }
  else if (type === "roas") { net = a.proj.spend * value; gross = g2n ? net / g2n : a.proj.spend * gRoas; spend = a.proj.spend; orders = aov ? gross / aov : null; }
  else if (type === "netRoas") { net = a.proj.spend * value; gross = g2n ? net / g2n : a.proj.spend * gRoas; spend = a.proj.spend; orders = aov ? gross / aov : null; }
  else if (type === "aov") { orders = a.proj.orders; gross = orders * value; spend = gRoas ? gross / gRoas : a.proj.spend; net = spend * nRoas; }
  else if (type === "cac") { spend = a.proj.spend; orders = value ? spend / value : null; gross = aov && orders ? orders * aov : null; net = spend * nRoas; }
  else if (type === "cvr") { outCvr = value; orders = baseClicks ? baseClicks * value : a.proj.orders; gross = aov ? orders * aov : null; spend = gRoas && gross ? gross / gRoas : a.proj.spend; net = spend * nRoas; }

  return {
    spend, gross, net, orders, outCvr,
    roas: spend ? net / spend : null, grossRoas: spend ? gross / spend : null,
    aov: orders ? gross / orders : null, cac: orders ? spend / orders : null,
    cvr: (type === "cvr") ? value : cvr,
    contribution: (net != null && spend != null) ? net - spend : null,
  };
}
function ScenarioCard({ tag, tagCls, title, lines, outcome }) {
  return <div className="scn-card">
    {tag && <span className={"scn-tag " + (tagCls || "")}>{tag}</span>}
    <div className="scn-title">{title}</div>
    <ul className="scn-lines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    {outcome && <div className="scn-outcome">{outcome}</div>}
  </div>;
}
function summaryFor(b, a, meta, type, tv, plan, fc, L) {
  const grLift = l => l != null ? (l >= 0 ? "+" : "") + Math.round(l * 100) + "%" : "-";
  const name = meta.label.replace(/ target.*| \(.*/, "").toLowerCase();
  if (meta.kind === "forward") {
    return <>If <b>{b.key}</b> spends <b>{inr(tv)}</b> net this month, expect about <b>{inr(plan.gross)}</b> gross / <b>{inr(plan.net)}</b> net revenue and <b>{num(plan.orders)}</b> orders at a blended ROAS of <b>{roas(plan.roas)}</b> (a daily run-rate of ~{inr(tv / a.totalDays)}/day).</>;
  }
  if (meta.kind === "efficiency") {
    return <>Moving {name} from <b>{fmtGoal(meta.unit, fc)}</b> to <b>{fmtGoal(meta.unit, tv)}</b> ({grLift(fc ? tv / fc - 1 : null)}) at the forecast spend of <b>{inr(a.proj.spend)}</b> would take {b.key} to about <b>{inr(plan.net)}</b> net revenue with <b>{num(plan.orders)}</b> orders.</>;
  }
  const onTrack = L != null && L <= 1.001;
  const baseGRoas = a.base.grossRoas || a.proj.grossRoas;
  return <>To hit the <b>{fmtGoal(meta.unit, tv)}</b> {name} target, {onTrack
    ? <>{b.key} is <b>already on track</b> — forecast is {fmtGoal(meta.unit, fc)}.</>
    : <>required net spend is <b>{inr(plan.spend)}</b> ({grLift(a.proj.spend ? plan.spend / a.proj.spend - 1 : null)} vs forecast), generating <b>{num(plan.orders)}</b> orders at <b>{roas(plan.roas)}</b> ROAS. You can get there by raising spend {grLift(L - 1)}, improving ROAS to {roas(baseGRoas * L)}, or lifting AOV to {inr((a.base.aov || 0) * L)}.</>}</>;
}
function GoalMode({ b }) {
  const a = analyze(b);
  const [type, setType] = useStateF("gross");
  const [target, setTarget] = useStateF("");
  const meta = GOAL_META[type];
  let tv = parseFloat(String(target).replace(/[, ]/g, ""));
  if (meta.unit === "pct" && !isNaN(tv)) tv = tv / 100;
  const valid = !isNaN(tv) && tv > 0;
  const fc = { gross: a.proj.gross, net: a.proj.rev, spend: a.proj.spend, orders: a.proj.orders, contribution: a.proj.rev - a.proj.spend, roas: a.proj.roas, netRoas: b.netRoas, aov: a.proj.aov, cac: a.proj.cac, cvr: a.base.cvr }[type];
  const plan = valid ? buildPlan(a, a.base, type, tv) : null;
  const grLift = l => l != null ? (l >= 0 ? "+" : "") + Math.round(l * 100) + "%" : "-";
  const reqDRR = plan && plan.spend != null && a.daysRemaining > 0 ? Math.max(0, (plan.spend - a.mtd.spend) / a.daysRemaining) : null;
  const drrGap = reqDRR != null ? reqDRR - a.drr : null;
  const L = (plan && a.proj.gross > 0) ? plan.gross / a.proj.gross : null;
  const needMore = meta.kind === "outcome" && L != null && L > 1.001;
  const baseGRoas = a.base.grossRoas || a.proj.grossRoas;
  const hyb = L && L > 1 ? Math.pow(L, 1 / 3) - 1 : 0;

  return (
    <>
      <div className="fc-headrow"><div className="muted-sm">Goal planning = what must change to hit the target. {meta.kind === "forward" ? "Forward planning: enter a budget to see the outcome." : "Reverse planning: enter a target to see what's required."} Spend is net media spend (ex-GST).</div></div>
      <div className="fc-form">
        <label>Planning goal type
          <select value={type} onChange={e => { setType(e.target.value); setTarget(""); }}>{Object.keys(GOAL_META).map(k => <option key={k} value={k}>{GOAL_META[k].label}</option>)}</select>
        </label>
        <label>Target {meta.unit === "x" ? "(× ROAS)" : meta.unit === "pct" ? "(%)" : meta.unit === "count" ? "(orders)" : "(₹)"}
          <input type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder={meta.unit === "x" ? "e.g. 4" : meta.unit === "pct" ? "e.g. 2.4" : meta.unit === "count" ? "e.g. 2000" : "e.g. 5000000"} />
        </label>
        <div className="fc-baseline muted-sm">Forecast {meta.label.replace(/ target.*| \(.*/, "").toLowerCase()}: <b>{fmtGoal(meta.unit, fc)}</b></div>
      </div>

      {!valid && <div className="empty">Enter a target to {meta.kind === "forward" ? "see the projected outcome" : "reverse-engineer the plan"}.</div>}

      {valid && plan && (<>
        <div className="fc-note">{summaryFor(b, a, meta, type, tv, plan, fc, L)}</div>

        {needMore && (
          <div className="card gap-card">
            <div className="card-head"><h3>Gap analysis</h3></div>
            <div className="gap-bar"><div className="gap-fill" style={{ width: pct(Math.min(1, fc / tv), 0) }}><span>Forecast {fmtGoal(meta.unit, fc)}</span></div><span className="gap-target">Target {fmtGoal(meta.unit, tv)}</span></div>
            <div className="gap-grid">
              <div><span className="gap-k">Gap</span><span className="gap-v bad">{fmtGoal(meta.unit, tv - fc)}</span></div>
              <div><span className="gap-k">Spend gap</span><span className="gap-v">{inr((plan.spend || 0) - a.proj.spend)}</span></div>
              <div><span className="gap-k">ROAS lift</span><span className="gap-v">{grLift(L - 1)}</span></div>
              <div><span className="gap-k">AOV lift</span><span className="gap-v">{grLift(L - 1)}</span></div>
            </div>
          </div>
        )}

        <div className="fc-sub">{meta.kind === "forward" ? "Projected outcome" : "What it takes"}</div>
        <div className="kpi-row seven">
          <FCard label="Net Ad Spend" value={inr(plan.spend)} sub={a.proj.spend ? grLift(plan.spend / a.proj.spend - 1) + " vs forecast" : null} tone={plan.spend > a.proj.spend ? "warn" : "good"} />
          <FCard label="Gross Revenue" value={inr(plan.gross)} />
          <FCard label="Net Revenue" value={inr(plan.net)} />
          <FCard label="Orders" value={plan.orders ? num(plan.orders) : "-"} />
          <FCard label="ROAS" value={roas(plan.roas)} tone={roasHealth(plan.roas)} />
          <FCard label="AOV" value={plan.aov ? inr(plan.aov) : "-"} />
          <FCard label="CAC" value={plan.cac ? inr(plan.cac) : "-"} />
        </div>
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
          <FCard label="Contribution" value={plan.contribution != null ? inr(plan.contribution) : "-"} sub="net rev − net spend" tone={plan.contribution >= 0 ? "good" : "bad"} />
          <FCard label="Current DRR" value={inr(a.drr) + "/day"} sub={a.daysElapsed + "/" + a.totalDays + " days"} />
          <FCard label="Required DRR" value={reqDRR != null ? inr(reqDRR) + "/day" : "-"} sub={a.daysRemaining + " days left"} tone="warn" />
          <FCard label="DRR gap" value={drrGap != null ? (drrGap >= 0 ? "+" : "") + inr(drrGap) + "/day" : "-"} tone={drrGap > 0 ? "bad" : "good"} sub={drrGap != null && a.drr ? grLift(drrGap / a.drr) : null} />
        </div>

        {needMore && (<>
          <div className="fc-sub">Ways to get there</div>
          <div className="scn-grid">
            <ScenarioCard tag="Easiest to execute" tagCls="warn" title="A · Increase spend" lines={[`Raise net spend ${grLift(L - 1)} to ${inr(a.proj.spend * L)}`, `Hold ROAS at ${roas(baseGRoas)}`, `DRR rises to ~${inr(a.drr * L)}/day`]} outcome="Target met" />
            <ScenarioCard tag="Lowest budget risk" tagCls="good" title="B · Improve ROAS" lines={[`Hold spend at ${inr(a.proj.spend)}`, `Lift ROAS ${grLift(L - 1)} → ${roas(baseGRoas * L)}`, `Tighten targeting, creative & LP CVR`]} outcome="Target met" />
            <ScenarioCard title="C · Improve AOV" lines={[`Hold orders at ${num(a.proj.orders)}`, `Lift AOV ${grLift(L - 1)} → ${inr((a.base.aov || 0) * L)}`, `Bundles, upsells, free-ship thresholds`]} outcome="Target met" />
            <ScenarioCard tag="Most realistic" tagCls="accent" title="D · Hybrid (balanced)" lines={[`Spend +${Math.round(hyb * 100)}% → ${inr(a.proj.spend * (1 + hyb))}`, `ROAS +${Math.round(hyb * 100)}% → ${roas(baseGRoas * (1 + hyb))}`, `AOV +${Math.round(hyb * 100)}% → ${inr((a.base.aov || 0) * (1 + hyb))}`]} outcome="Spreads the risk" />
          </div>
          <div className="card"><div className="card-head"><h3>Recommended action plan</h3></div>
            <ol className="action-plan">
              <li>Scale {best(a).label} budget toward {inr((reqDRR || a.drr) * (best(a).pct || 0.6))}/day (its share of the new pace).</li>
              <li>Shift ~10% of budget toward the highest-ROAS channel ({best(a).label}, {roas(best(a).roas)}).</li>
              <li>Improve landing-page &amp; checkout conversion rate.</li>
              <li>Lift AOV via bundles/upsells toward {inr((a.base.aov || 0) * Math.pow(L, 1 / 3))}.</li>
              <li>Target ROAS improvement from {roas(baseGRoas)} to {roas(baseGRoas * Math.pow(L, 1 / 2))}.</li>
            </ol>
            <div className="ap-outcome">Expected outcome · {fmtGoal(meta.unit, tv)} {meta.label.split(" ")[0]} · spend ~{inr(plan.spend)} · orders ~{num(plan.orders)}</div>
          </div>
        </>)}

        {meta.kind === "efficiency" && (
          <div className="card"><div className="card-head"><h3>What this change unlocks</h3></div>
            <p className="muted-sm" style={{ padding: "2px 2px 0" }}>Holding net spend at {inr(a.proj.spend)}, moving {meta.label.replace(/ target.*| \(.*/, "").toLowerCase()} from <b>{fmtGoal(meta.unit, fc)}</b> to <b>{fmtGoal(meta.unit, tv)}</b> ({grLift(fc ? tv / fc - 1 : null)}) implies the metrics above. Drive it through targeting, creative, landing-page CVR and AOV levers rather than more budget.</p>
          </div>
        )}
      </>)}
    </>
  );
}
function best(a) { return a.chan.slice().filter(c => c.roas != null).sort((x, y) => y.roas - x.roas)[0] || { label: "Meta", roas: null, pct: 0.6 }; }

function Forecast({ navigate }) {
  const M = window.MODEL;
  const activeBrands = M.brands.filter(b => b.active);
  const [mode, setMode] = useStateF("forecast");
  const [brandKey, setBrandKey] = useStateF(() => (activeBrands[0] || M.brands[0] || {}).key);
  const b = M.byName[brandKey] || activeBrands[0];

  return (
    <div className="screen">
      <div className="page-head">
        <div><div className="crumb">Portfolio</div><h1>Forecast &amp; plan</h1>
          <p className="sub">Project month-end performance, or reverse-engineer the plan to hit a target</p></div>
        <div className="period">
          <button className={"seg " + (mode === "forecast" ? "on" : "")} onClick={() => setMode("forecast")}>Forecast</button>
          <button className={"seg " + (mode === "goal" ? "on" : "")} onClick={() => setMode("goal")}>Goal planning</button>
        </div>
      </div>
      <div className="fc-brandbar">
        <span className="muted-sm">Brand</span>
        <select className="cur-select" value={brandKey} onChange={e => setBrandKey(e.target.value)}>
          {activeBrands.map(x => <option key={x.key} value={x.key}>{x.key}</option>)}
        </select>
        {b && <button className="tool-btn" onClick={() => navigate("brand", b.key)}>Open brand →</button>}
      </div>
      {b ? (mode === "forecast" ? <ForecastMode b={b} /> : <GoalMode b={b} />) : <div className="empty">No active brands to forecast.</div>}
    </div>
  );
}

window.Forecast = Forecast;
