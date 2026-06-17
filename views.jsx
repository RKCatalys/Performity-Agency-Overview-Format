/* views.jsx · Overview + Brand deep-dive screens */
const { useState: useStateV, useMemo: useMemoV } = React;

function portfolioMonthly(brands) {
  const spend = Array(12).fill(0), rev = Array(12).fill(0), orders = Array(12).fill(0), gross = Array(12).fill(0), gst = Array(12).fill(0), net = Array(12).fill(0);
  brands.forEach(b => {
    const gs = (b.mom && b.mom["Shopify Gross Sales"]) || [];
    const gp = (b.mom && b.mom["GST Spend"]) || [];
    const ns = b.netSeries || [];
    for (let i = 0; i < 12; i++) {
      spend[i] += b.spendSeries[i] || 0;
      rev[i] += b.revSeries[i] || 0;
      orders[i] += b.ordersSeries[i] || 0;
      gross[i] += gs[i] || 0;
      gst[i] += gp[i] || 0;
      net[i] += ns[i] || 0;
    }
  });
  const roas = spend.map((s, i) => s > 0 ? rev[i] / s : null);
  const grossRoas = spend.map((s, i) => s > 0 ? gross[i] / s : null);
  const aov = orders.map((o, i) => o > 0 ? gross[i] / o : null);
  const cac = orders.map((o, i) => o > 0 ? spend[i] / o : null);
  const returnRate = gross.map((g, i) => g > 0 && net[i] > 0 ? (g - net[i]) / g : null);
  return { spend, rev, orders, gross, gst, net, roas, grossRoas, aov, cac, returnRate };
}

function KPI({ label, value, sub, spark, sparkColor, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {spark && <Sparkline data={spark} color={sparkColor || "var(--accent)"} w={64} h={22} />}
      </div>
      <div className={"kpi-value " + (tone || "")}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function RoasPill({ value }) {
  const h = roasHealth(value);
  return <span className={"roas-pill " + h}>{roas(value)}</span>;
}

function RegionTag({ r }) {
  if (r === "IN") return null;
  return <span className="region">{r}</span>;
}

// portfolio metric catalog for customizable cards + chart
function portfolioMetrics(gt, pm, returnRate) {
  return {
    spend:     { label: "Ad Spend", value: inr(gt.spend), sub: "GST " + inr(gt.gstSpend), series: pm.spend, color: "var(--accent)" },
    gross:     { label: "Gross Sales", value: inr(gt.grossSales), sub: "Shopify gross", series: pm.gross, color: "var(--accent)" },
    revenue:   { label: "Dash / Net Revenue", value: inr(gt.dashRev), sub: "tracked attributed", series: pm.rev, color: "var(--good)" },
    net:       { label: "Net Sales", value: inr(pm.net.reduce((a, x) => a + x, 0)), sub: "after returns", series: pm.net, color: "var(--good)" },
    roas:      { label: "Blended ROAS", value: roas(gt.dashRoas), sub: "Dash Rev / Spend", series: pm.roas, color: "var(--good)", tone: roasHealth(gt.dashRoas) },
    grossRoas: { label: "Gross ROAS", value: roas(gt.grossRoas), sub: "Gross / Spend", series: pm.grossRoas, color: "var(--good)" },
    gstRoas:   { label: "GST ROAS", value: roas(gt.gstRoas), sub: "Gross / GST spend" },
    orders:    { label: "Orders", value: num(gt.orders), sub: "AOV " + inr(gt.aov), series: pm.orders, color: "var(--violet)" },
    aov:       { label: "AOV", value: gt.aov ? inr(gt.aov) : "-", sub: "blended", series: pm.aov, color: "var(--violet)" },
    cac:       { label: "Blended CAC", value: inr(gt.cac), sub: "cost / acquisition", series: pm.cac },
    returnRate:{ label: "Return Rate", value: returnRate != null ? pct(returnRate, 1) : "-", sub: "gross-weighted", series: pm.returnRate, color: "var(--violet)" },
    gstSpend:  { label: "GST Spend", value: inr(gt.gstSpend), sub: "incl. GST", series: pm.gst, color: "var(--accent)" },
  };
}

// a KPI card whose metric is user-selectable via a dropdown
function OvCard({ mkey, metrics, onPick }) {
  const m = metrics[mkey] || {};
  return (
    <div className="kpi">
      <div className="kpi-top">
        <select className="kpi-select" value={mkey} onChange={e => onPick(e.target.value)}>
          {Object.keys(metrics).map(k => <option key={k} value={k}>{metrics[k].label}</option>)}
        </select>
        {m.series && <Sparkline data={m.series} color={m.color || "var(--accent)"} w={58} h={22} />}
      </div>
      <div className={"kpi-value " + (m.tone || "")}>{m.value}</div>
      {m.sub && <div className="kpi-sub">{m.sub}</div>}
    </div>
  );
}

// customizable portfolio chart: metric + chart type + rich tooltip
function PortfolioChart({ pm }) {
  const [metric, setMetric] = useStateV("spend");
  const [type, setType] = useStateV("combo");
  const opts = { spend: "Ad Spend", gross: "Gross Sales", revenue: "Dash Revenue", net: "Net Sales", orders: "Orders", aov: "AOV", cac: "CAC", roas: "Blended ROAS", grossRoas: "Gross ROAS", returnRate: "Return Rate" };
  const ser = { spend: pm.spend, gross: pm.gross, revenue: pm.rev, net: pm.net, orders: pm.orders, aov: pm.aov, cac: pm.cac, roas: pm.roas, grossRoas: pm.grossRoas, returnRate: pm.returnRate }[metric];
  const ratio = metric === "roas" || metric === "grossRoas";
  const isPct = metric === "returnRate";
  const money = ["spend", "gross", "revenue", "net", "aov", "cac"].includes(metric);
  const fmt = ratio ? (v => v == null ? "" : (+v).toFixed(1) + "×") : isPct ? (v => v == null ? "" : (v * 100).toFixed(0) + "%") : money ? (v => inr(v).replace("₹", "")) : (v => num(v));
  const barFmt = money ? (v => inr(v)) : ratio ? (v => roas(v)) : (v => num(v));
  const tip = MONTHS.map((mo, i) => `${mo}\nSpend ${inr(pm.spend[i])}   Gross ${inr(pm.gross[i])}\nRevenue ${inr(pm.rev[i])}   ROAS ${pm.roas[i] != null ? pm.roas[i].toFixed(2) + "×" : "-"}\nOrders ${num(pm.orders[i])}   AOV ${pm.aov[i] != null ? inr(pm.aov[i]) : "-"}   CAC ${pm.cac[i] != null ? inr(pm.cac[i]) : "-"}`);
  const effType = (ratio || isPct) && type === "combo" ? "line" : type;
  let chart;
  if (["line", "spline", "step", "area", "trend"].includes(effType))
    chart = <LineMulti months={MONTHS} series={[{ data: ser, color: ratio ? "var(--good)" : "var(--accent)" }]} fmt={fmt} fill={effType === "area"} mode={effType === "spline" ? "spline" : effType === "step" ? "step" : "linear"} trend={effType === "trend"} tip={tip} />;
  else if (effType === "hbar")
    chart = <HBars items={MONTHS.map((mo, i) => ({ label: mo, value: ser[i] || 0 })).filter(it => it.value)} fmt={barFmt} />;
  else if (effType === "bars")
    chart = <ComboChart months={MONTHS} bars={ser} line={ser.map(() => null)} barFmt={barFmt} tip={tip} />;
  else
    chart = <ComboChart months={MONTHS} bars={ser} line={pm.roas} barFmt={barFmt} tip={tip} />;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Performance trend</h3>
        <div className="chart-tools">
          <select className="cur-select" value={metric} onChange={e => setMetric(e.target.value)}>{Object.keys(opts).map(k => <option key={k} value={k}>{opts[k]}</option>)}</select>
          <select className="cur-select" value={type} onChange={e => setType(e.target.value)}>
            <option value="combo">Bars + ROAS</option><option value="bars">Bars</option><option value="hbar">Horizontal bars</option>
            <option value="line">Line</option><option value="spline">Spline</option><option value="step">Step</option><option value="area">Area</option><option value="trend">Line + trendline</option>
          </select>
        </div>
      </div>
      {chart}
    </div>
  );
}

/* ---------------- Overview ---------------- */
function Overview({ navigate }) {
  const M = window.MODEL;
  const [filter, setFilter] = useStateV("active");
  const [sort, setSort] = useStateV({ k: "spend", dir: -1 });
  const [cards, setCards] = useStateV(() => window.PStore.get("ovCards", ["spend", "gross", "revenue", "roas", "orders", "aov", "cac"]));
  const tref = window.useColResize();
  const pm = useMemoV(() => portfolioMonthly(M.brands), [M]);
  const gt = M.grandTotal;
  const blendedRoas = gt.dashRev / gt.spend;
  // portfolio return rate = gross-weighted average of brands' Shopify return %
  let rN = 0, rD = 0;
  M.brands.forEach(b => { const rr = b.ch.shopify && b.ch.shopify["Return %"]; const g = b.grossSales || 0; if (rr != null && g > 0) { rN += rr * g; rD += g; } });
  const returnRate = rD ? rN / rD : null;
  const now = new Date();
  const fmtDay = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const info = window.__perfInfo;
  const updated = info && info.at ? new Date(info.at) : null;

  let rows = M.brands.slice();
  if (filter === "active") rows = rows.filter(b => b.active);
  if (filter === "attention") {
    const flagged = new Set(M.alerts.filter(a => a.sev !== "info").map(a => a.brand));
    rows = rows.filter(b => flagged.has(b.key));
  }
  rows.sort((a, b) => {
    const av = a[sort.k] ?? -Infinity, bv = b[sort.k] ?? -Infinity;
    if (typeof av === "string") return sort.dir * av.localeCompare(bv);
    return sort.dir * (av - bv);
  });
  const setSortK = k => setSort(s => s.k === k ? { k, dir: -s.dir } : { k, dir: -1 });
  const SortH = ({ k, children, num }) => (
    <th className={num ? "n" : ""} onClick={() => setSortK(k)}>
      <span className="th-inner">{children}{sort.k === k && <i className="sort">{sort.dir < 0 ? "↓" : "↑"}</i>}</span>
    </th>
  );

  const allMetrics = portfolioMetrics(gt, pm, returnRate);
  const pickCard = (i, k) => { const next = cards.slice(); next[i] = k; setCards(next); window.PStore.set("ovCards", next); };

  // top brands by spend for the concentration list (show enough to fill the space)
  const top = M.brands.filter(b => b.active).sort((a, b) => b.spend - a.spend).slice(0, 12);
  const topTotal = top.reduce((s, b) => s + b.spend, 0);

  return (
    <div className="screen">
      <div className="page-head">
        <div>
          <div className="crumb">Portfolio</div>
          <h1>Agency Overview</h1>
          <p className="sub">Full year · CY2026 · {M.activeBrands.length} active of {M.brands.length} brands</p>
        </div>
        <div className="ov-status">
          <span className="live-dot" /><span className="live-txt">Live</span>
          <span className="ov-sep">·</span>
          <span className="ov-date">{fmtDay(now)}</span>
          {updated && <><span className="ov-sep">·</span><span className="muted-sm">Updated {updated.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></>}
        </div>
      </div>

      <div className="kpi-row seven">
        {cards.map((k, i) => <OvCard key={i} mkey={k} metrics={allMetrics} onPick={(nk) => pickCard(i, nk)} />)}
      </div>

      {M.insightsByBrand && M.insightsByBrand.length > 0 && (
        <div className="card insights-card">
          <div className="card-head">
            <h3>Needs attention &amp; opportunities</h3>
            <button className="link-arrow" onClick={() => navigate("alerts")} style={{ background: "none", padding: 0 }}>View all {M.insightsByBrand.length} brands →</button>
          </div>
          <div className="insight-strip">
            {M.insightsByBrand.slice(0, 4).map((g, i) => (
              <button key={i} className={"insight-pill brand-grp " + sevCls(g.items[0].sev)} onClick={() => navigate("brand", g.brandKey)}>
                <div className="ip-top">
                  <span className="ip-brand">{g.brand}</span>
                  <span className="ig-counts">
                    {g.counts.critical ? <span className="igc bad">{g.counts.critical} critical</span> : null}
                    {g.counts.warn ? <span className="igc warn">{g.counts.warn} warning</span> : null}
                    {g.counts.opportunity ? <span className="igc good">{g.counts.opportunity} opp</span> : null}
                  </span>
                </div>
                <div className="ig-items">
                  {g.items.slice(0, 3).map((x, j) => (
                    <div key={j} className="ig-line"><span className={"ig-dot " + sevCls(x.sev)} /><b>{x.metric}</b> <span className="ig-msg">{x.msg}</span></div>
                  ))}
                  {g.items.length > 3 && <div className="ig-more">+{g.items.length - 3} more</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        <PortfolioChart pm={pm} />
        <div className="card">
          <div className="card-head"><h3>Spend concentration</h3><span className="muted-sm">top brands by spend</span></div>
          <div className="share-list">
            {top.map(b => (
              <div className="share-row" key={b.key} onClick={() => navigate("brand", b.key)}>
                <span className="share-name">{b.key}</span>
                <div className="share-track"><div className="share-bar" style={{ width: (b.spend / top[0].spend * 100) + "%" }} /></div>
                <span className="share-val">{inr(b.spend)}</span>
                <span className="share-pct">{pct(b.spend / gt.spend, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card table-card">
        <div className="card-head">
          <h3>Brands</h3>
          <div className="filter-chips">
            {[["active", "Active"], ["all", "All"], ["attention", "Needs attention"]].map(([k, l]) => (
              <button key={k} className={"chip " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>{l}
                {k === "attention" && <span className="chip-count">{new Set(M.alerts.filter(a => a.sev !== "info").map(a => a.brand)).size}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table" ref={tref}>
            <thead>
              <tr>
                <SortH k="name">Brand</SortH>
                <SortH k="spend" num>Ad Spend</SortH>
                <SortH k="dashRev" num>Dash Rev</SortH>
                <SortH k="dashRoas" num>ROAS</SortH>
                <SortH k="netRoas" num>Net ROAS</SortH>
                <SortH k="orders" num>Orders / Leads</SortH>
                <SortH k="aov" num>AOV</SortH>
                <SortH k="cac" num>CAC / CPL</SortH>
                <th className="n">Trend</th>
                <th>Owners</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.key} onClick={() => navigate("brand", b.key)}>
                  <td className="brand-cell">
                    <span className="brand-dot" data-h={roasHealth(b.dashRoas)} />
                    <span className="brand-name">{b.key}</span><RegionTag r={b.region} />
                    {b.leadGen && <span className="region" title="Lead-generation model">LEADS</span>}
                  </td>
                  <td className="n mono">{inr(b.spend)}</td>
                  <td className="n mono">{inr(b.dashRev)}</td>
                  <td className="n"><RoasPill value={b.dashRoas} /></td>
                  <td className="n mono dim">{roas(b.netRoas)}</td>
                  <td className="n mono">{b.orders ? num(b.orders) : "–"}</td>
                  <td className="n mono dim">{b.aov ? inr(b.aov) : "–"}</td>
                  <td className="n mono dim">{b.cac ? inr(b.cac) : "–"}</td>
                  <td className="n"><Sparkline data={b.revSeries} w={72} h={22} color="var(--good)" /></td>
                  <td><div className="owners"><Avatar name={b.tl.tlMeta} /><Avatar name={b.tl.tlGoogle} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.Overview = Overview;
window.portfolioMonthly = portfolioMonthly;
window.KPI = KPI; window.RoasPill = RoasPill; window.RegionTag = RegionTag;
