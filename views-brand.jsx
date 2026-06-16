/* views-brand.jsx — single brand deep-dive */
const { useState: useStateB } = React;

function ChannelCard({ title, color, ch, share }) {
  if (!ch || Object.keys(ch).length === 0) return null;
  const get = (k) => ch[k];
  const rows = [
    ["Spend", inr(get("Spend"))],
    ["Revenue", inr(get("Revenue"))],
    ["ROAS", roas(get("ROAS (Dash)"))],
    ["Orders", num(get("Orders"))],
    ["CAC", inr(get("CAC"))],
    ["AOV", inr(get("AOV"))],
  ];
  return (
    <div className="chan-card">
      <div className="chan-head">
        <span className="chan-dot" style={{ background: color }} />
        <span className="chan-title">{title}</span>
        {share != null && <span className="chan-share">{pct(share, 0)} of spend</span>}
      </div>
      <div className="chan-grid">
        {rows.map(([l, v]) => <div className="chan-cell" key={l}><span className="cl">{l}</span><span className="cv mono">{v}</span></div>)}
      </div>
    </div>
  );
}

// months (0..11) where the brand had spend or revenue
function brandActiveMonths(b) {
  const out = [];
  for (let i = 0; i < 12; i++) if ((b.spendSeries[i] || 0) > 0 || (b.revSeries[i] || 0) > 0) out.push(i);
  return out.length ? out : Array.from({ length: 12 }, (_, i) => i);
}
function sumRange(arr, lo, hi) {
  let s = 0, any = false;
  for (let i = lo; i <= hi; i++) { const v = arr && arr[i]; if (v != null) { s += v; any = true; } }
  return any ? s : 0;
}
// recompute headline KPIs over a month range [lo,hi] from the monthly series
function aggKPIs(b, lo, hi) {
  const m = b.mom || {};
  const spend = sumRange(m["Ad Spend"], lo, hi), gst = sumRange(m["GST Spend"], lo, hi),
    rev = sumRange(m["Dashboard Revenue"], lo, hi), gross = sumRange(m["Shopify Gross Sales"], lo, hi),
    orders = sumRange(m["Orders"], lo, hi);
  let nrN = 0, nrD = 0; const nr = m["Net ROAS"] || [], gs = m["GST Spend"] || [];
  for (let i = lo; i <= hi; i++) if (nr[i] != null && gs[i] != null) { nrN += nr[i] * gs[i]; nrD += gs[i]; }
  return {
    spend, gstSpend: gst, dashRev: rev, grossSales: gross, orders,
    dashRoas: spend ? rev / spend : null, aov: orders ? gross / orders : null,
    cac: orders ? spend / orders : null, netRoas: nrD ? nrN / nrD : null,
  };
}

// sum a channel section's metrics over a month range from WEEKLY, derive ratios
function rangeChAgg(key, sec, lo, hi) {
  const W = window.WEEKLY[key]; const m = W && W[sec] && W[sec].metrics;
  if (!m) return null;
  const sum = (name) => { const x = m[name]; if (!x) return null; let s = 0, any = false; for (let i = lo; i <= hi; i++) { const v = x.months[i] && x.months[i].mo; if (v != null) { s += v; any = true; } } return any ? s : null; };
  const spend = sum("Spend") || 0, rev = sum("Revenue") || 0, orders = sum("Orders") || 0;
  const clicks = sum("Clicks");
  return {
    Spend: spend, Revenue: rev, Orders: orders,
    "ROAS (Dash)": spend ? rev / spend : null, CAC: orders ? spend / orders : null, AOV: orders ? rev / orders : null,
    Reach: sum("Reach"), Impressions: sum("Impressions"), Clicks: clicks, "Clicks (link clicks)": clicks,
    LPV: sum("LPV"), ATC: sum("ATC"), IC: sum("IC"),
  };
}

const CHART_METRICS = ["Ad Spend", "Dashboard Revenue", "Shopify Gross Sales", "GST Spend", "Orders", "AOV", "CAC", "Dashboard ROAS", "GST ROAS", "Net ROAS"];
function isRatioMetric(m) { return m.includes("ROAS"); }
function isMoneyMetric(m) { return ["Ad Spend", "GST Spend", "Shopify Gross Sales", "Dashboard Revenue", "AOV", "CAC"].includes(m); }
function chartFmt(m) { return isRatioMetric(m) ? (v => v == null ? "" : (+v).toFixed(1) + "×") : isMoneyMetric(m) ? (v => inr(v).replace("₹", "")) : (v => num(v)); }

// Customizable performance chart: metric, chart type, and period-over-period compare.
function BrandChart({ b, lo, hi, monthsLabels }) {
  const [metric, setMetric] = useStateB("Ad Spend");
  const [type, setType] = useStateB("combo"); // combo | bars | line
  const [compare, setCompare] = useStateB(false);
  const full = b.mom[metric] || [];
  const series = full.slice(lo, hi + 1);
  const roasLine = (b.mom["Dashboard ROAS"] || []).slice(lo, hi + 1);
  const len = hi - lo + 1;
  const prev = (lo - len >= 0) ? full.slice(lo - len, lo) : null;
  const ratio = isRatioMetric(metric);
  const effType = ratio && type === "combo" ? "line" : type;

  const barFmt = isMoneyMetric(metric) ? (v => inr(v)) : (v => num(v));
  let chart;
  if (effType === "line" || effType === "area") {
    const ser = [{ data: series, color: "var(--accent)" }];
    if (compare && prev) ser.unshift({ data: prev, color: "var(--muted)" });
    chart = <LineMulti months={monthsLabels} series={ser} fmt={chartFmt(metric)} fill={effType === "area"} />;
  } else if (effType === "bars") {
    chart = <ComboChart months={monthsLabels} bars={series} line={series.map(() => null)} barFmt={barFmt} />;
  } else { // combo: metric bars + ROAS line
    chart = <ComboChart months={monthsLabels} bars={series} line={roasLine} barFmt={barFmt} />;
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Performance</h3>
        <div className="chart-tools">
          <select className="cur-select" value={metric} onChange={e => setMetric(e.target.value)}>
            {CHART_METRICS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="cur-select" value={type} onChange={e => setType(e.target.value)}>
            <option value="combo">Bars + ROAS</option>
            <option value="bars">Bars</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
          </select>
          {effType === "line" && prev && (
            <button className={"tool-btn " + (compare ? "on" : "")} onClick={() => setCompare(c => !c)} title="Overlay the previous period of equal length">
              <span className="td-ico">Δ</span>Compare
            </button>
          )}
        </div>
      </div>
      {chart}
      {compare && effType === "line" && prev && <div className="muted-sm" style={{ marginTop: 8 }}><span style={{ color: "var(--muted)" }}>──</span> previous period · <span style={{ color: "var(--accent)" }}>──</span> selected</div>}
    </div>
  );
}

function BrandDetail({ brandKey, navigate }) {
  const M = window.MODEL;
  const b = M.byName[brandKey];
  const [tab, setTab] = useStateB("monthly");
  const [range, setRange] = useStateB(null);
  if (!b) return <div className="screen"><p>Unknown brand.</p></div>;

  const active = brandActiveMonths(b);
  const lo = range ? Math.min(range.lo, range.hi) : active[0];
  const hi = range ? Math.max(range.lo, range.hi) : active[active.length - 1];
  const k = aggKPIs(b, lo, hi);
  const monthsLabels = MONTHS.slice(lo, hi + 1);
  const rangeActive = range && (lo !== active[0] || hi !== active[active.length - 1]);

  // channel data scoped to the selected range (falls back to year totals)
  const rMeta = rangeChAgg(b.key, "meta", lo, hi) || b.ch.meta || {};
  const rGoogle = rangeChAgg(b.key, "google", lo, hi) || b.ch.google || {};
  const rOther = rangeChAgg(b.key, "other", lo, hi) || b.ch.other || {};
  const metaSpend = rMeta.Spend || 0;
  const googleSpend = rGoogle.Spend || 0;
  const otherSpend = rOther.Spend || 0;
  const chTotal = metaSpend + googleSpend + otherSpend;
  const ret = b.ch.shopify?.["Return %"];

  const funnelSteps = [
    { label: "Reach", value: rMeta.Reach },
    { label: "Impressions", value: rMeta.Impressions },
    { label: "Link clicks", value: rMeta.Clicks },
    { label: "Landing views", value: rMeta.LPV },
    { label: "Add to cart", value: rMeta.ATC },
    { label: "Checkout", value: rMeta.IC },
    { label: b.leadGen ? "Leads" : "Orders", value: rMeta.Orders },
  ].filter(s => s.value != null);

  const metricRows = ["Ad Spend","GST Spend","Shopify Gross Sales","Dashboard Revenue","Dashboard ROAS","GST ROAS","Net ROAS","Orders","AOV","CAC"];
  const isRoas = m => m.includes("ROAS");
  const isMoney = m => ["Ad Spend","GST Spend","Shopify Gross Sales","Dashboard Revenue","AOV","CAC"].includes(m);
  const fmtCell = (m, v) => v == null ? "—" : isRoas(m) ? roas(v) : isMoney(m) ? inr(v) : num(v);

  const QHEAD = ["Q1","Q2","Q3","Q4"];
  const qData = {
    "Ad Spend": b.qSpend, "Dashboard Revenue": b.qRev, "Orders": b.qOrders,
    "ROAS": b.qSpend.map((s, i) => s > 0 ? b.qRev[i] / s : null),
  };

  return (
    <div className="screen">
      <div className="brand-head">
        <button className="back" onClick={() => navigate("overview")}>← Portfolio</button>
        <div className="brand-title-row">
          <div>
            <div className="brand-title">
              <span className="brand-dot lg" data-h={roasHealth(b.dashRoas)} />
              <h1>{b.key}</h1><RegionTag r={b.region} />
              {b.leadGen && <Badge tone="accent">Lead-gen</Badge>}
              {!b.active && <Badge tone="neutral">No spend yet</Badge>}
            </div>
            <p className="sub">
              {b.tl.tlMeta && <span>Meta lead <b>{b.tl.tlMeta}</b></span>}
              {b.tl.tlGoogle && <span> · Google lead <b>{b.tl.tlGoogle}</b></span>}
              {b.tl.note && <span> · <i>{b.tl.note}</i></span>}
            </p>
          </div>
          <div className="owners lg"><Avatar name={b.tl.tlMeta} /><Avatar name={b.tl.tlGoogle} /></div>
        </div>
      </div>

      {active.length > 1 && (
        <div className="brand-range">
          <div className={"date-range " + (rangeActive ? "on" : "")} title="Filter KPIs and the chart by month range">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            <select value={lo} onChange={e => setRange({ lo: +e.target.value, hi })}>{active.map(mi => <option key={mi} value={mi}>{MONTHS[mi]}</option>)}</select>
            <span className="dr-dash">–</span>
            <select value={hi} onChange={e => setRange({ lo, hi: +e.target.value })}>{active.map(mi => <option key={mi} value={mi}>{MONTHS[mi]}</option>)}</select>
            {rangeActive && <button className="dr-clear" title="Clear" onClick={() => setRange(null)}>×</button>}
          </div>
          <span className="muted-sm">{rangeActive ? "Showing " + MONTHS[lo] + (lo !== hi ? "–" + MONTHS[hi] : "") : "Full year"}</span>
        </div>
      )}

      <div className="kpi-row six">
        <KPI label="Ad Spend" value={inr(k.spend)} sub={"GST " + inr(k.gstSpend)} spark={b.spendSeries.slice(lo, hi + 1)} />
        <KPI label="Dash Revenue" value={inr(k.dashRev)} spark={b.revSeries.slice(lo, hi + 1)} sparkColor="var(--good)" />
        <KPI label="Dash ROAS" value={roas(k.dashRoas)} tone={roasHealth(k.dashRoas)} spark={b.roasSeries.slice(lo, hi + 1)} sparkColor="var(--good)" />
        <KPI label="Net ROAS" value={roas(k.netRoas)} sub="on GST spend" />
        <KPI label={b.leadGen ? "Leads" : "Orders"} value={k.orders ? num(k.orders) : "—"} sub={b.leadGen ? "lead volume" : (k.aov ? "AOV " + inr(k.aov) : null)} spark={b.ordersSeries.slice(lo, hi + 1)} sparkColor="var(--violet)" />
        <KPI label={b.leadGen ? "CPL" : "CAC"} value={k.cac ? inr(k.cac) : "—"} sub={b.leadGen ? "cost / lead" : (ret != null ? "Return " + pct(ret, 0) : null)} />
      </div>

      {b.active ? (
        <>
          <div className="grid-2">
            <BrandChart b={b} lo={lo} hi={hi} monthsLabels={monthsLabels} />
            <div className="card">
              <div className="card-head"><h3>Channel mix</h3><span className="muted-sm">by ad spend</span></div>
              {chTotal > 0 ? (
                <div className="chan-split">
                  <Donut size={128} stroke={22}
                    segments={[
                      { value: metaSpend, color: "var(--accent)" },
                      { value: googleSpend, color: "var(--violet)" },
                      { value: otherSpend, color: "var(--border-strong)" },
                    ]}
                    center={<><div className="donut-c-v">{inr(chTotal)}</div><div className="donut-c-l">total</div></>} />
                  <div className="chan-cards">
                    <ChannelCard title="Meta" color="var(--accent)" ch={rMeta} share={metaSpend / chTotal} />
                    <ChannelCard title="Google" color="var(--violet)" ch={rGoogle} share={googleSpend / chTotal} />
                  </div>
                </div>
              ) : <div className="empty">No channel-level data logged.</div>}
            </div>
          </div>

          <div className="grid-2">
            {funnelSteps.length > 2 && (
              <div className="card">
                <div className="card-head"><h3>Meta funnel</h3><span className="muted-sm">full year · conversion at each step</span></div>
                <Funnel steps={funnelSteps} />
              </div>
            )}
            <div className="card">
              <div className="card-head"><h3>Quarter on quarter</h3><span className="muted-sm">blended store</span></div>
              <table className="data-table compact">
                <thead><tr><th>Metric</th>{QHEAD.map(q => <th className="n" key={q}>{q}</th>)}<th className="n">Year</th></tr></thead>
                <tbody>
                  {[["Ad Spend", "Ad Spend", inr], ["Dashboard Revenue", "Dashboard Revenue", inr], ["ROAS", "ROAS", roas], ["Orders", "Orders", num]].map(([label, key, f]) => {
                    const arr = qData[key]; const year = key === "ROAS" ? b.dashRoas : (key === "Ad Spend" ? b.spend : key === "Dashboard Revenue" ? b.dashRev : b.orders);
                    return <tr key={label}><td>{label}</td>{arr.map((v, i) => <td className="n mono" key={i}>{v ? f(v) : "—"}</td>)}<td className="n mono strong">{year ? f(year) : "—"}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <ScrumGrid brandKey={b.key} />
          <ScrumComments brandKey={b.key} />
        </>
      ) : (
        <div className="card empty-state">
          <div className="empty-illo">◷</div>
          <h3>No performance data yet</h3>
          <p>{b.key} is onboarded{b.tl.tlMeta ? ` with ${b.tl.tlMeta} on Meta` : ""}{b.tl.tlGoogle ? ` and ${b.tl.tlGoogle} on Google` : ""}. {b.tl.note || "Spend and revenue will appear here once campaigns go live."}</p>
        </div>
      )}
    </div>
  );
}
window.BrandDetail = BrandDetail;
window.ChannelCard = ChannelCard;
