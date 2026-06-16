/* views-more.jsx — Team, Alerts, DRR tracker, Playbook */
const { useState: useStateM } = React;

/* ---------------- Team & ownership ---------------- */
function Team({ navigate }) {
  const M = window.MODEL;
  return (
    <div className="screen">
      <div className="page-head">
        <div><div className="crumb">People</div><h1>Team &amp; ownership</h1>
          <p className="sub">{M.team.length} leads across {M.brands.length} brands · Meta &amp; Google split</p></div>
      </div>
      <div className="team-grid">
        {M.team.map(t => (
          <div className="card team-card" key={t.name}>
            <div className="team-top">
              <Avatar name={t.name} /><div><div className="team-name">{t.name}</div>
                <div className="team-role">{t.meta ? t.meta + " Meta" : ""}{t.meta && t.google ? " · " : ""}{t.google ? t.google + " Google" : ""}</div></div>
            </div>
            <div className="team-stats">
              <div><span className="ts-v mono">{t.brandCount}</span><span className="ts-l">brands</span></div>
              <div><span className="ts-v mono">{t.active}</span><span className="ts-l">active</span></div>
              <div><span className="ts-v mono">{inr(t.spend)}</span><span className="ts-l">spend</span></div>
              <div><span className="ts-v mono">{inr(t.rev)}</span><span className="ts-l">revenue</span></div>
            </div>
            <div className="team-brands">
              {t.brands.map(bn => <button key={bn} className="brand-tag" onClick={() => navigate("brand", bn)}>{bn}</button>)}
            </div>
          </div>
        ))}
      </div>

      <div className="card table-card">
        <div className="card-head"><h3>Ownership matrix</h3></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Brand</th><th>Meta lead</th><th>Google lead</th><th className="n">Spend</th><th className="n">ROAS</th><th>Notes</th></tr></thead>
            <tbody>
              {M.brands.filter(b => b.tl.tlMeta || b.tl.tlGoogle).map(b => (
                <tr key={b.key} onClick={() => navigate("brand", b.key)}>
                  <td className="brand-cell"><span className="brand-dot" data-h={roasHealth(b.dashRoas)} /><span className="brand-name">{b.key}</span><RegionTag r={b.region} /></td>
                  <td>{b.tl.tlMeta ? <span className="owner-inline"><Avatar name={b.tl.tlMeta} />{b.tl.tlMeta}</span> : <span className="dim">—</span>}</td>
                  <td>{b.tl.tlGoogle ? <span className="owner-inline"><Avatar name={b.tl.tlGoogle} />{b.tl.tlGoogle}</span> : <span className="dim">Not started</span>}</td>
                  <td className="n mono">{b.active ? inr(b.spend) : "—"}</td>
                  <td className="n">{b.active ? <RoasPill value={b.dashRoas} /> : <span className="dim">—</span>}</td>
                  <td className="dim sm">{b.tl.note || b.tl.comment || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Alerts & insights ---------------- */
const SEV = { critical: { l: "Critical", c: "bad" }, warn: { l: "Warning", c: "warn" }, opportunity: { l: "Opportunity", c: "good" }, review: { l: "Review", c: "review" }, info: { l: "Info", c: "neutral" } };
// merge smart MoM insights with structural status flags into one ranked stream
function buildAlertStream(M) {
  const ins = (M.insights || []).map(x => ({
    sev: x.sev, type: x.metric + " " + (x.dir === "up" ? "▲" : "▼"), brand: x.brand,
    msg: x.msg, action: x.action, metric: x.metricStr, since: x.prevMonth && x.month ? x.prevMonth + "→" + x.month : null,
  }));
  const flags = (M.alerts || []).filter(a => a.type !== "Revenue drop").map(a => ({
    sev: a.sev, type: a.type, brand: a.brand, msg: a.msg, metric: a.metric, action: null,
  }));
  const rank = { critical: 0, warn: 1, opportunity: 2, review: 3, info: 4 };
  return [...ins, ...flags].sort((a, b) => rank[a.sev] - rank[b.sev]);
}
function Alerts({ navigate }) {
  const M = window.MODEL;
  const [sev, setSev] = useStateM("all");
  const all = buildAlertStream(M);
  let list = sev === "all" ? all : all.filter(a => a.sev === sev);
  const counts = { critical: 0, warn: 0, opportunity: 0, review: 0, info: 0 };
  all.forEach(a => counts[a.sev] = (counts[a.sev] || 0) + 1);
  return (
    <div className="screen">
      <div className="page-head">
        <div><div className="crumb">Monitoring</div><h1>Alerts &amp; insights</h1>
          <p className="sub">{all.length} signals · month-over-month change detection with recommended actions</p></div>
      </div>
      <div className="alert-summary">
        {Object.entries(SEV).map(([k, v]) => (
          <button key={k} className={"alert-stat " + v.c + (sev === k ? " on" : "")} onClick={() => setSev(sev === k ? "all" : k)}>
            <span className="as-n">{counts[k]}</span><span className="as-l">{v.l}</span>
          </button>
        ))}
      </div>
      <div className="alert-list">
        {list.map((a, i) => (
          <div className={"alert-item " + SEV[a.sev].c} key={i} onClick={() => navigate("brand", a.brand)}>
            <span className="alert-bar" />
            <div className="alert-body">
              <div className="alert-row1">
                <span className="alert-type">{a.type}</span>
                <span className="alert-brand">{a.brand}</span>
                {a.since && <span className="alert-since">{a.since}</span>}
              </div>
              <div className="alert-msg">{a.msg}</div>
              {a.action && <div className="alert-action"><span className="aa-k">Recommended</span> {a.action}</div>}
            </div>
            <div className="alert-metric mono">{a.metric}</div>
          </div>
        ))}
        {!list.length && <div className="empty">No signals in this category.</div>}
      </div>
    </div>
  );
}

/* ---------------- DRR tracker ---------------- */
function DRR({ navigate }) {
  const M = window.MODEL;
  const [sort, setSort] = useStateM({ k: "drr", dir: -1 });
  const DAYS = 30;
  const rows = M.activeBrands.map(b => {
    const li = b.lastActive;
    const monthRev = b.revSeries[li] || 0;
    const monthSpend = b.spendSeries[li] || 0;
    const prevRev = b.prevActive >= 0 ? b.revSeries[b.prevActive] : null;
    return {
      b, month: MONTHS[li], drr: monthRev / DAYS, spendDay: monthSpend / DAYS,
      roas: monthSpend > 0 ? monthRev / monthSpend : null,
      pace: (prevRev && prevRev > 0) ? (monthRev - prevRev) / prevRev : null,
      monthRev, monthSpend,
    };
  });
  rows.sort((a, b) => sort.dir * ((a[sort.k] ?? -Infinity) - (b[sort.k] ?? -Infinity)));
  const totalDrr = rows.reduce((s, r) => s + r.drr, 0);
  const totalSpendDay = rows.reduce((s, r) => s + r.spendDay, 0);
  return (
    <div className="screen">
      <div className="page-head">
        <div><div className="crumb">Pacing</div><h1>Daily run-rate</h1>
          <p className="sub">Implied per-day pace from each brand's latest active month</p></div>
      </div>
      <div className="kpi-row">
        <KPI label="Portfolio DRR" value={inr(totalDrr)} sub="revenue / day" />
        <KPI label="Spend / day" value={inr(totalSpendDay)} sub="across active brands" />
        <KPI label="Blended day ROAS" value={roas(totalDrr / totalSpendDay)} tone={roasHealth(totalDrr / totalSpendDay)} />
        <KPI label="Active brands" value={num(rows.length)} sub="pacing live" />
      </div>
      <div className="card table-card">
        <div className="card-head"><h3>Per-brand pacing</h3><span className="muted-sm">latest active month</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Brand</th><th>Month</th>
              <th className="n" onClick={() => setSort(s => ({ k: "drr", dir: s.k === "drr" ? -s.dir : -1 }))}>Rev / day</th>
              <th className="n">Spend / day</th><th className="n">Day ROAS</th>
              <th className="n" onClick={() => setSort(s => ({ k: "pace", dir: s.k === "pace" ? -s.dir : -1 }))}>MoM pace</th>
              <th className="n">Month revenue</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.b.key} onClick={() => navigate("brand", r.b.key)}>
                  <td className="brand-cell"><span className="brand-dot" data-h={roasHealth(r.b.dashRoas)} /><span className="brand-name">{r.b.key}</span><RegionTag r={r.b.region} /></td>
                  <td className="dim">{r.month}</td>
                  <td className="n mono strong">{inr(r.drr)}</td>
                  <td className="n mono dim">{inr(r.spendDay)}</td>
                  <td className="n"><RoasPill value={r.roas} /></td>
                  <td className="n">{r.pace != null ? <Delta value={r.pace} /> : <span className="dim">—</span>}</td>
                  <td className="n mono">{inr(r.monthRev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Playbook ---------------- */
const PLAYBOOK = [
  { date: "02 Jun", acct: "Verlas India", what: "Pause broad PMax, consolidate to brand + top-SKU shopping", why: "Dash ROAS 0.31× — spend far ahead of tracked revenue", status: "In progress", learn: "Attribution gap: most orders landing as Direct/Organic in GA4", next: "Add UTM enforcement + server-side tracking, recheck in 2 wks" },
  { date: "01 Jun", acct: "Carbon Tree", what: "Audit revenue mapping in dashboard", why: "Dash ROAS 30.8× is implausibly high vs GST ROAS 1.31×", status: "Open", learn: "Likely double-counted offline/marketplace revenue in Dash feed", next: "Reconcile Dash Rev source with Shopify net before reporting" },
  { date: "28 May", acct: "Bxxy Shoes", what: "Scale Meta ABO winners +20% weekly, hold CPA cap", why: "Net ROAS steady ~2.1× with headroom on top creatives", status: "Working", learn: "Creative fatigue at ~1.8M impressions/wk; refresh cadence = 10d", next: "Brief 3 new UGC angles for Q3 launch" },
  { date: "26 May", acct: "House of Comfort", what: "Shift budget Meta→Google on bestseller terms", why: "Google CAC running below Meta on core SKUs", status: "Working", learn: "Search intent converts at higher AOV than prospecting", next: "Build SKU-level shopping feed tiers" },
  { date: "20 May", acct: "Dhaaga Life", what: "Test premium-AOV bundles in checkout", why: "AOV ₹5.4K with strong 4.1× gross ROAS — room to push basket", status: "Done", learn: "Bundle uptake +14%, AOV +9% with no CVR drop", next: "Roll bundles to Linen on Me (similar AOV profile)" },
  { date: "15 May", acct: "Powersutra", what: "Rework prospecting creative to problem-aware hooks", why: "GST ROAS slipped below 2× in April", status: "In progress", learn: "Hook-rate up but CVR flat — landing page is the bottleneck", next: "A/B new PDP layout, measure ATC CVR" },
];
const PB_TONE = { "Done": "good", "Working": "accent", "In progress": "warn", "Open": "review" };
function Playbook({ navigate }) {
  const M = window.MODEL;
  const uploaded = (M.playbook || []).filter(p => p && (p.what || p.account));
  const PB = uploaded.length ? uploaded.map(p => ({
    date: p.date || "", acct: p.account || "", what: p.what || "", why: p.why || "",
    status: p.status || "", learn: p.insights || "", next: p.nextAction || ""
  })) : PLAYBOOK;
  return (
    <div className="screen">
      <div className="page-head">
        <div><div className="crumb">Knowledge</div><h1>Playbook &amp; insights</h1>
          <p className="sub">Experiments, learnings and next actions across accounts</p></div>
        <button className="btn-primary">+ Log experiment</button>
      </div>
      <div className="pb-list">
        {PB.map((p, i) => (
          <div className="card pb-card" key={i}>
            <div className="pb-side">
              <span className="pb-date">{p.date}</span>
              <button className="pb-acct" onClick={() => M.byName[p.acct] && navigate("brand", p.acct)}>{p.acct}</button>
              <Badge tone={PB_TONE[p.status] || "neutral"}>{p.status}</Badge>
            </div>
            <div className="pb-main">
              <div className="pb-what">{p.what}</div>
              <div className="pb-fields">
                <div className="pb-field"><span className="pb-k">Why</span><span className="pb-v">{p.why}</span></div>
                <div className="pb-field"><span className="pb-k">Learning</span><span className="pb-v">{p.learn}</span></div>
                <div className="pb-field"><span className="pb-k">Next action</span><span className="pb-v accent">{p.next}</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="pb-foot">Entries shown are seeded examples grounded in the current dataset — this is where the team's experiment log lives.</p>
    </div>
  );
}

Object.assign(window, { Team, Alerts, DRR, Playbook });
