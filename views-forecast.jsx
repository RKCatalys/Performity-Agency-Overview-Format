/* views-forecast.jsx · Forecast & Planning module
   Forecast Mode: project month-end KPIs from current-month pacing + recent growth.
   Goal Mode: reverse-engineer the spend / efficiency needed to hit a target. */
const { useState: useStateF } = React;

// how many weeks of the brand's latest active month have data, and how many total
function monthPacing(b) {
  const W = window.WEEKLY[b.key];
  const mi = b.lastActive;
  const probe = W && W.overall && (W.overall.metrics["Total Ad Spend"] || W.overall.metrics["Shopify Gross Sales"]);
  const wkArr = probe && probe.months[mi] ? probe.months[mi].weeks : [];
  const weeksElapsed = wkArr.filter(w => w != null).length || 1;
  const wd = ((window.WEEKLY_META[b.key] || {}).weekDates || [])[mi] || [];
  const totalWeeks = Math.max(weeksElapsed, wd.filter(Boolean).length || weeksElapsed);
  return { mi, weeksElapsed, totalWeeks, partial: weeksElapsed < totalWeeks };
}

// recent average month-over-month growth of revenue across the last complete months
function recentGrowth(b, completeMonths) {
  const g = [];
  for (let i = Math.max(1, completeMonths.length - 3); i < completeMonths.length; i++) {
    const c = completeMonths[i], p = completeMonths[i - 1];
    const rc = b.revSeries[c], rp = b.revSeries[p];
    if (rp > 0 && rc != null) g.push(rc / rp - 1);
  }
  return g.length ? g.reduce((a, x) => a + x, 0) / g.length : 0;
}

function FCard({ label, value, sub, tone }) {
  return <div className="kpi"><div className="kpi-top"><span className="kpi-label">{label}</span></div>
    <div className={"kpi-value " + (tone || "")}>{value}</div>{sub && <div className="kpi-sub">{sub}</div>}</div>;
}

/* ---------------- Forecast Mode ---------------- */
function ForecastMode({ b }) {
  const mom = b.mom || {};
  const gross = mom["Shopify Gross Sales"] || [];
  const active = []; for (let i = 0; i < 12; i++) if ((b.spendSeries[i] || 0) > 0 || (b.revSeries[i] || 0) > 0) active.push(i);
  if (!active.length) return <div className="empty">No performance history for {b.key} yet.</div>;
  const pace = monthPacing(b);
  const complete = pace.partial ? active.filter(m => m !== pace.mi) : active;
  const growth = recentGrowth(b, complete.length ? complete : active);
  const mi = pace.mi;
  const factor = pace.partial && pace.weeksElapsed > 0 ? pace.totalWeeks / pace.weeksElapsed : 1;

  let label, spend, grossV, rev, orders;
  if (pace.partial) {
    label = "Projected " + MONTHS[mi] + " month-end";
    spend = (b.spendSeries[mi] || 0) * factor;
    grossV = (gross[mi] || 0) * factor;
    rev = (b.revSeries[mi] || 0) * factor;
    orders = (b.ordersSeries[mi] || 0) * factor;
  } else {
    label = "Forecast next month";
    const f = 1 + growth;
    spend = (b.spendSeries[mi] || 0) * f;
    grossV = (gross[mi] || 0) * f;
    rev = (b.revSeries[mi] || 0) * f;
    orders = (b.ordersSeries[mi] || 0) * f;
  }
  const roasV = spend ? rev / spend : null, aov = orders ? grossV / orders : null, cac = orders ? spend / orders : null;
  const contribution = rev - spend; // proxy: tracked revenue minus ad spend

  return (
    <>
      <div className="fc-note">
        {pace.partial
          ? <>Based on the current pace ({pace.weeksElapsed} of {pace.totalWeeks} weeks of {MONTHS[mi]} elapsed), <b>{b.key}</b> is projected to spend <b>{inr(spend)}</b> and generate <b>{inr(grossV)}</b> gross revenue with a blended ROAS of <b>{roas(roasV)}</b> by month-end.</>
          : <>{MONTHS[mi]} is complete. Using recent momentum ({(growth * 100).toFixed(0)}% avg MoM), <b>{b.key}</b> is forecast to spend <b>{inr(spend)}</b> and generate <b>{inr(grossV)}</b> gross revenue next month at a blended ROAS of <b>{roas(roasV)}</b>.</>}
      </div>
      <div className="fc-sub">{label}</div>
      <div className="kpi-row seven">
        <FCard label="Ad Spend" value={inr(spend)} sub={pace.partial ? "pace × " + factor.toFixed(2) : "vs last month"} />
        <FCard label="Gross Revenue" value={inr(grossV)} />
        <FCard label="Dash / Net Revenue" value={inr(rev)} />
        <FCard label="Orders" value={num(orders)} />
        <FCard label="ROAS" value={roas(roasV)} tone={roasHealth(roasV)} />
        <FCard label="AOV" value={aov ? inr(aov) : "-"} />
        <FCard label="CAC" value={cac ? inr(cac) : "-"} />
      </div>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <FCard label="Net contribution (proxy)" value={inr(contribution)} sub="tracked revenue − ad spend" tone={contribution >= 0 ? "good" : "bad"} />
        <FCard label="Recent MoM growth" value={(growth >= 0 ? "+" : "") + (growth * 100).toFixed(1) + "%"} sub="avg of last 3 months" tone={growth >= 0 ? "good" : "bad"} />
        <FCard label="Pacing" value={pace.partial ? pace.weeksElapsed + " / " + pace.totalWeeks + " wks" : "month complete"} sub={MONTHS[mi]} />
      </div>
      <p className="muted-sm" style={{ marginTop: 4 }}>Forecast blends current-month run-rate with recent growth. It assumes spend and efficiency hold their current trajectory; large mid-month changes will shift the projection.</p>
    </>
  );
}

/* ---------------- Goal Planning Mode ---------------- */
const GOAL_TYPES = { gross: "Gross Revenue", net: "Dash / Net Revenue", orders: "Order Volume", roas: "Blended ROAS (at current spend)" };
function GoalMode({ b }) {
  const [type, setType] = useStateF("gross");
  const [target, setTarget] = useStateF("");
  const [targetRoas, setTargetRoas] = useStateF("");
  const cur = {
    spend: b.spend, gross: b.grossSales, rev: b.dashRev, orders: b.orders,
    roas: b.dashRoas, grossRoas: b.grossRoas, aov: b.aov,
    cvr: (b.ch.meta && b.ch.meta.Orders && b.ch.meta.Clicks) ? b.ch.meta.Orders / b.ch.meta.Clicks : null,
  };
  const tv = parseFloat(String(target).replace(/[, ]/g, ""));
  const valid = !isNaN(tv) && tv > 0;
  const tRoas = parseFloat(targetRoas) || null;

  let result = null;
  if (valid) {
    if (type === "gross" || type === "net") {
      const baseRoas = type === "gross" ? (tRoas || cur.grossRoas) : (tRoas || cur.roas);
      const reqSpend = baseRoas ? tv / baseRoas : null;
      const revPerOrder = type === "gross" ? cur.aov : (cur.orders ? cur.rev / cur.orders : null);
      const reqOrders = revPerOrder ? tv / revPerOrder : null;
      const reqClicks = (reqOrders && cur.cvr) ? reqOrders / cur.cvr : null;
      const curClicks = b.ch.meta && b.ch.meta.Clicks;
      const spendLift = (reqSpend && cur.spend) ? reqSpend / cur.spend - 1 : null;
      const trafficLift = (reqClicks && curClicks) ? reqClicks / curClicks - 1 : null;
      const roasAtCurSpend = cur.spend ? tv / cur.spend : null; // ROAS needed to hit target without more spend
      result = { reqSpend, reqOrders, reqClicks, spendLift, trafficLift, roasAtCurSpend, baseRoas };
    } else if (type === "orders") {
      const reqSpend = cur.orders ? tv * (cur.spend / cur.orders) : null; // target orders × current CAC
      const reqGross = cur.aov ? tv * cur.aov : null;
      const reqClicks = cur.cvr ? tv / cur.cvr : null;
      const curClicks = b.ch.meta && b.ch.meta.Clicks;
      const spendLift = (reqSpend && cur.spend) ? reqSpend / cur.spend - 1 : null;
      const trafficLift = (reqClicks && curClicks) ? reqClicks / curClicks - 1 : null;
      result = { reqSpend, reqGross, reqOrders: tv, reqClicks, spendLift, trafficLift };
    } else if (type === "roas") {
      const revAtCurSpend = cur.spend ? cur.spend * tv : null;
      const cvrLift = cur.cvr ? (tv / cur.roas) - 1 : null; // rough: efficiency lift proportional to ROAS lift
      result = { revAtCurSpend, roasLift: cur.roas ? tv / cur.roas - 1 : null, cvrTarget: cur.cvr ? cur.cvr * (tv / cur.roas) : null };
    }
  }

  // channel reallocation suggestion based on current channel ROAS
  const mROAS = b.ch.meta && b.ch.meta["ROAS (Dash)"], gROAS = b.ch.google && b.ch.google["ROAS (Dash)"];
  let reallo = null;
  if (mROAS && gROAS) {
    const tot = mROAS + gROAS;
    reallo = { meta: Math.round(mROAS / tot * 100), google: Math.round(gROAS / tot * 100), lean: mROAS >= gROAS ? "Meta" : "Google" };
  }

  return (
    <>
      <div className="fc-form">
        <label>Goal
          <select value={type} onChange={e => setType(e.target.value)}>{Object.keys(GOAL_TYPES).map(k => <option key={k} value={k}>{GOAL_TYPES[k]}</option>)}</select>
        </label>
        <label>Target value
          <input type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder={type === "roas" ? "e.g. 4.5" : "e.g. 10000000"} />
        </label>
        {(type === "gross" || type === "net") && (
          <label>Assumed ROAS (optional)
            <input type="number" step="any" value={targetRoas} onChange={e => setTargetRoas(e.target.value)} placeholder={"current " + roas(type === "gross" ? cur.grossRoas : cur.roas)} />
          </label>
        )}
      </div>

      {!valid && <div className="empty">Enter a target to see the plan. Current baseline · spend {inr(cur.spend)}, ROAS {roas(cur.roas)}, AOV {cur.aov ? inr(cur.aov) : "-"}{cur.cvr ? ", CVR " + pct(cur.cvr, 2) : ""}.</div>}

      {valid && result && (type === "gross" || type === "net") && (
        <>
          <div className="fc-note">
            To reach <b>{inr(tv)}</b> {GOAL_TYPES[type].toLowerCase()} at a <b>{roas(result.baseRoas)}</b> ROAS, estimated spend should be <b>{inr(result.reqSpend)}</b>
            {result.spendLift != null && <> ({result.spendLift >= 0 ? "+" : ""}{Math.round(result.spendLift * 100)}% vs current {inr(cur.spend)})</>}.
            {result.trafficLift != null && <> Traffic would need to grow ~{Math.round(result.trafficLift * 100)}%</>}
            {reallo && <> · lean budget toward <b>{reallo.lean}</b> (~{reallo.meta}% Meta / {reallo.google}% Google by current ROAS).</>}
          </div>
          <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <FCard label="Required spend" value={inr(result.reqSpend)} sub={result.spendLift != null ? (result.spendLift >= 0 ? "+" : "") + Math.round(result.spendLift * 100) + "% vs current" : null} tone={result.spendLift > 0 ? "warn" : "good"} />
            <FCard label="Required orders" value={result.reqOrders ? num(result.reqOrders) : "-"} sub={"at AOV " + (cur.aov ? inr(cur.aov) : "-")} />
            <FCard label="Required clicks" value={result.reqClicks ? num(result.reqClicks) : "-"} sub={result.trafficLift != null ? (result.trafficLift >= 0 ? "+" : "") + Math.round(result.trafficLift * 100) + "% traffic" : "needs CVR data"} />
            <FCard label="ROAS at current spend" value={roas(result.roasAtCurSpend)} sub={"vs current " + roas(cur.roas)} tone={roasHealth(result.roasAtCurSpend)} />
          </div>
        </>
      )}
      {valid && result && type === "orders" && (
        <>
          <div className="fc-note">To reach <b>{num(tv)}</b> orders, estimated spend should be <b>{inr(result.reqSpend)}</b>{result.spendLift != null && <> ({result.spendLift >= 0 ? "+" : ""}{Math.round(result.spendLift * 100)}% vs current)</>}, generating ~<b>{inr(result.reqGross)}</b> gross at the current AOV.{reallo && <> Lean toward <b>{reallo.lean}</b>.</>}</div>
          <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <FCard label="Required spend" value={inr(result.reqSpend)} sub={result.spendLift != null ? (result.spendLift >= 0 ? "+" : "") + Math.round(result.spendLift * 100) + "% vs current" : null} />
            <FCard label="Projected gross" value={inr(result.reqGross)} />
            <FCard label="Required clicks" value={result.reqClicks ? num(result.reqClicks) : "needs CVR data"} sub={result.trafficLift != null ? (result.trafficLift >= 0 ? "+" : "") + Math.round(result.trafficLift * 100) + "% traffic" : null} />
          </div>
        </>
      )}
      {valid && result && type === "roas" && (
        <>
          <div className="fc-note">Improving blended ROAS from <b>{roas(cur.roas)}</b> to <b>{roas(tv)}</b> ({result.roasLift != null ? (result.roasLift >= 0 ? "+" : "") + Math.round(result.roasLift * 100) + "%" : ""}) would lift revenue to <b>{inr(result.revAtCurSpend)}</b> at the current spend of {inr(cur.spend)}{result.cvrTarget ? <>, implying conversion rate rises from {pct(cur.cvr, 2)} to ~{pct(result.cvrTarget, 2)}</> : ""}.</div>
          <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <FCard label="Revenue at current spend" value={inr(result.revAtCurSpend)} tone="good" />
            <FCard label="ROAS lift needed" value={result.roasLift != null ? "+" + Math.round(result.roasLift * 100) + "%" : "-"} tone="warn" />
            <FCard label="Implied CVR target" value={result.cvrTarget ? pct(result.cvrTarget, 2) : "needs CVR data"} sub={cur.cvr ? "from " + pct(cur.cvr, 2) : null} />
          </div>
        </>
      )}
      <p className="muted-sm" style={{ marginTop: 4 }}>Estimates hold current AOV/CVR/channel mix constant and scale linearly. Treat as a planning starting point, not a guarantee.</p>
    </>
  );
}

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
