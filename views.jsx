/* views.jsx — Overview + Brand deep-dive screens */
const { useState: useStateV, useMemo: useMemoV } = React;

function portfolioMonthly(brands) {
  const spend = Array(12).fill(0), rev = Array(12).fill(0), orders = Array(12).fill(0);
  brands.forEach(b => {
    for (let i = 0; i < 12; i++) {
      spend[i] += b.spendSeries[i] || 0;
      rev[i] += b.revSeries[i] || 0;
      orders[i] += b.ordersSeries[i] || 0;
    }
  });
  const roas = spend.map((s, i) => s > 0 ? rev[i] / s : null);
  return { spend, rev, orders, roas };
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

/* ---------------- Overview ---------------- */
function Overview({ navigate }) {
  const M = window.MODEL;
  const [filter, setFilter] = useStateV("active");
  const [sort, setSort] = useStateV({ k: "spend", dir: -1 });
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

  // top brands by spend for share bar
  const top = M.brands.filter(b => b.active).sort((a, b) => b.spend - a.spend).slice(0, 6);
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
        <KPI label="Ad Spend" value={inr(gt.spend)} sub={"GST " + inr(gt.gstSpend)} spark={pm.spend} />
        <KPI label="Dashboard Revenue" value={inr(gt.dashRev)} sub="tracked attributed" spark={pm.rev} sparkColor="var(--good)" />
        <KPI label="Blended ROAS" value={roas(blendedRoas)} sub="Dash Rev ÷ Spend" tone={roasHealth(blendedRoas)} spark={pm.roas} sparkColor="var(--good)" />
        <KPI label="Orders" value={num(gt.orders)} sub={"AOV " + inr(gt.aov)} spark={pm.orders} sparkColor="var(--violet)" />
        <KPI label="AOV" value={gt.aov ? inr(gt.aov) : "—"} sub="blended" />
        <KPI label="Return Rate" value={returnRate != null ? pct(returnRate, 1) : "—"} sub="gross-weighted" />
        <KPI label="Blended CAC" value={inr(gt.cac)} sub="cost / acquisition" />
      </div>

      {M.insights && M.insights.length > 0 && (
        <div className="card insights-card">
          <div className="card-head">
            <h3>Needs attention &amp; opportunities</h3>
            <button className="link-arrow" onClick={() => navigate("alerts")} style={{ background: "none", padding: 0 }}>View all {M.insights.length} →</button>
          </div>
          <div className="insight-strip">
            {M.insights.slice(0, 4).map((x, i) => (
              <button key={i} className={"insight-pill " + (x.good ? "good" : x.sev === "critical" ? "bad" : "warn")} onClick={() => navigate("brand", x.brandKey)}>
                <div className="ip-top"><span className="ip-brand">{x.brand}</span><span className="ip-delta mono">{x.metricStr}</span></div>
                <div className="ip-msg">{x.msg}</div>
                {x.action && <div className="ip-act">{x.action}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Spend &amp; blended ROAS</h3>
            <div className="legend"><span className="lg bar" />Ad spend<span className="lg line" />ROAS</div>
          </div>
          <ComboChart months={MONTHS} bars={pm.spend} line={pm.roas} />
        </div>
        <div className="card">
          <div className="card-head"><h3>Spend concentration</h3><span className="muted-sm">top 6 brands</span></div>
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
                  <td className="n mono">{b.orders ? num(b.orders) : "—"}</td>
                  <td className="n mono dim">{b.aov ? inr(b.aov) : "—"}</td>
                  <td className="n mono dim">{b.cac ? inr(b.cac) : "—"}</td>
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
