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

function BrandDetail({ brandKey, navigate }) {
  const M = window.MODEL;
  const b = M.byName[brandKey];
  const [tab, setTab] = useStateB("monthly");
  if (!b) return <div className="screen"><p>Unknown brand.</p></div>;

  const metaSpend = b.ch.meta?.Spend || 0;
  const googleSpend = b.ch.google?.Spend || 0;
  const otherSpend = b.ch.other?.Spend || 0;
  const chTotal = metaSpend + googleSpend + otherSpend;
  const ret = b.ch.shopify?.["Return %"];

  const funnelSteps = [
    { label: "Reach", value: b.ch.meta?.Reach },
    { label: "Impressions", value: b.ch.meta?.Impressions },
    { label: "Link clicks", value: b.ch.meta?.["Clicks (link clicks)"] },
    { label: "Landing views", value: b.ch.meta?.LPV },
    { label: "Add to cart", value: b.ch.meta?.ATC },
    { label: "Checkout", value: b.ch.meta?.IC },
    { label: "Orders", value: b.ch.meta?.Orders },
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

      <div className="kpi-row six">
        <KPI label="Ad Spend" value={inr(b.spend)} sub={"GST " + inr(b.gstSpend)} spark={b.spendSeries} />
        <KPI label="Dash Revenue" value={inr(b.dashRev)} spark={b.revSeries} sparkColor="var(--good)" />
        <KPI label="Dash ROAS" value={roas(b.dashRoas)} tone={roasHealth(b.dashRoas)} spark={b.roasSeries} sparkColor="var(--good)" />
        <KPI label="Net ROAS" value={roas(b.netRoas)} sub="on GST spend" />
        <KPI label="Orders" value={b.orders ? num(b.orders) : "—"} sub={b.aov ? "AOV " + inr(b.aov) : null} spark={b.ordersSeries} sparkColor="var(--violet)" />
        <KPI label="CAC" value={b.cac ? inr(b.cac) : "—"} sub={ret != null ? "Return " + pct(ret, 0) : null} />
      </div>

      {b.active ? (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3>Spend &amp; ROAS by month</h3>
                <div className="legend"><span className="lg bar" />Spend<span className="lg line" />ROAS</div></div>
              <ComboChart months={MONTHS} bars={b.spendSeries} line={b.roasSeries} />
            </div>
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
                    <ChannelCard title="Meta" color="var(--accent)" ch={b.ch.meta} share={metaSpend / chTotal} />
                    <ChannelCard title="Google" color="var(--violet)" ch={b.ch.google} share={googleSpend / chTotal} />
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
