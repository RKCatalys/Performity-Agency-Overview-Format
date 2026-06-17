/* views-more.jsx · Team, Alerts, DRR tracker, Playbook */
const { useState: useStateM } = React;

/* ---------------- Team & ownership ---------------- */
function Team({ navigate }) {
  const M = window.MODEL;
  const tref = window.useColResize();
  const [editing, setEditing] = useStateM(null);
  const [draft, setDraft] = useStateM({ tlMeta: "", tlGoogle: "" });
  const [, setTick] = useStateM(0);
  const startEdit = (b, e) => { e.stopPropagation(); setEditing(b.key); setDraft({ tlMeta: b.tl.tlMeta || "", tlGoogle: b.tl.tlGoogle || "" }); };
  const saveEdit = (b, e) => {
    e.stopPropagation();
    const ov = window.PStore.get("tlOverrides", {});
    ov[b.key] = { tlMeta: draft.tlMeta.trim() || null, tlGoogle: draft.tlGoogle.trim() || null };
    window.PStore.set("tlOverrides", ov);
    window.buildModel();
    setEditing(null); setTick(t => t + 1);
  };
  const stop = e => e.stopPropagation();
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
        <div className="card-head"><h3>Ownership matrix</h3><span className="muted-sm">click a row to open · use Edit to assign team leads</span></div>
        <div className="table-wrap">
          <table className="data-table" ref={tref}>
            <thead><tr><th>Brand</th><th>Meta lead</th><th>Google lead</th><th className="n">Spend</th><th className="n">ROAS</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {M.brands.map(b => {
                const ed = editing === b.key;
                return (
                <tr key={b.key} onClick={() => !ed && navigate("brand", b.key)}>
                  <td className="brand-cell"><span className="brand-dot" data-h={roasHealth(b.dashRoas)} /><span className="brand-name">{b.key}</span><RegionTag r={b.region} /></td>
                  <td onClick={ed ? stop : undefined}>{ed
                    ? <input className="tl-input" value={draft.tlMeta} onClick={stop} onChange={e => setDraft({ ...draft, tlMeta: e.target.value })} placeholder="Meta lead" />
                    : (b.tl.tlMeta ? <span className="owner-inline"><Avatar name={b.tl.tlMeta} />{b.tl.tlMeta}</span> : <span className="dim">–</span>)}</td>
                  <td onClick={ed ? stop : undefined}>{ed
                    ? <input className="tl-input" value={draft.tlGoogle} onClick={stop} onChange={e => setDraft({ ...draft, tlGoogle: e.target.value })} placeholder="Google lead" />
                    : (b.tl.tlGoogle ? <span className="owner-inline"><Avatar name={b.tl.tlGoogle} />{b.tl.tlGoogle}</span> : <span className="dim">Not started</span>)}</td>
                  <td className="n mono">{b.active ? inr(b.spend) : "–"}</td>
                  <td className="n">{b.active ? <RoasPill value={b.dashRoas} /> : <span className="dim">–</span>}</td>
                  <td className="dim sm">{b.tl.note || b.tl.comment || ""}</td>
                  <td className="n">{ed
                    ? <span className="tl-actions"><button className="tl-btn save" onClick={e => saveEdit(b, e)}>Save</button><button className="tl-btn" onClick={e => { e.stopPropagation(); setEditing(null); }}>Cancel</button></span>
                    : <button className="tl-btn" onClick={e => startEdit(b, e)}>Edit</button>}</td>
                </tr>
              ); })}
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
  // keep only structural legacy flags not already covered by the insights engine
  const flags = (M.alerts || []).filter(a => a.type === "Data anomaly" || a.type === "Awaiting data").map(a => ({
    sev: a.sev, type: a.type, brand: a.brand, msg: a.msg, metric: a.metric, action: null,
  }));
  const rank = { critical: 0, warn: 1, opportunity: 2, review: 3, info: 4 };
  return [...ins, ...flags].sort((a, b) => rank[a.sev] - rank[b.sev]);
}
const CA_METRICS = {
  "ROAS": { get: b => b.dashRoas, fmt: v => window.roas(v) },
  "Net ROAS": { get: b => b.netRoas, fmt: v => window.roas(v) },
  "CAC": { get: b => b.cac, fmt: v => window.inr(v) },
  "AOV": { get: b => b.aov, fmt: v => window.inr(v) },
  "Revenue": { get: b => b.dashRev, fmt: v => window.inr(v) },
  "Spend": { get: b => b.spend, fmt: v => window.inr(v) },
  "Orders": { get: b => b.orders, fmt: v => window.num(v) },
  "Return Rate %": { get: b => (b.ch.shopify && b.ch.shopify["Return %"] != null ? b.ch.shopify["Return %"] * 100 : null), fmt: v => v.toFixed(1) + "%" },
};
function evalCustom(M, rules) {
  const out = [];
  (rules || []).forEach(r => {
    const def = CA_METRICS[r.metric]; if (!def) return;
    M.activeBrands.forEach(b => {
      if (r.scope !== "all" && r.scope !== b.key) return;
      const v = def.get(b); if (v == null) return;
      const hit = r.cond === "below" ? v < r.value : v > r.value;
      if (hit) out.push({ sev: "warn", type: "Custom · " + r.metric + (r.cond === "below" ? " ▼" : " ▲"), brand: b.key,
        msg: `${r.metric} is ${def.fmt(v)} · ${r.cond} the ${def.fmt(r.value)} threshold.`, metric: def.fmt(v), action: null });
    });
  });
  return out;
}
const emptyRule = () => ({ metric: "ROAS", cond: "below", value: 1, scope: "all" });
function Alerts({ navigate }) {
  const M = window.MODEL;
  const [sev, setSev] = useStateM("all");
  const [rules, setRules] = useStateM(() => window.PStore.get("customAlerts", []));
  const [form, setForm] = useStateM(null);
  const saveRule = () => {
    const v = parseFloat(form.value); if (isNaN(v)) return;
    const next = [...rules, { ...form, value: v }];
    setRules(next); window.PStore.set("customAlerts", next); setForm(null);
  };
  const delRule = (i) => { const next = rules.filter((_, k) => k !== i); setRules(next); window.PStore.set("customAlerts", next); };
  const rank = { critical: 0, warn: 1, opportunity: 2, review: 3, info: 4 };
  const all = [...buildAlertStream(M), ...evalCustom(M, rules)].sort((a, b) => rank[a.sev] - rank[b.sev]);
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
      <div className="card ca-card">
        <div className="card-head"><h3>Custom alerts</h3>
          <button className="tool-btn" onClick={() => setForm(form ? null : emptyRule())}>{form ? "Close" : "+ New alert"}</button></div>
        {form && (
          <div className="ca-form">
            <span>Alert when</span>
            <select value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })}>{Object.keys(CA_METRICS).map(m => <option key={m} value={m}>{m}</option>)}</select>
            <select value={form.cond} onChange={e => setForm({ ...form, cond: e.target.value })}><option value="below">is below</option><option value="above">is above</option></select>
            <input className="tl-input" type="number" step="any" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} style={{ width: 90 }} />
            <span>for</span>
            <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}><option value="all">all brands</option>{M.brands.map(b => <option key={b.key} value={b.key}>{b.key}</option>)}</select>
            <button className="btn-primary" onClick={saveRule}>Add alert</button>
          </div>
        )}
        {rules.length > 0 && (
          <div className="ca-rules">
            {rules.map((r, i) => (
              <span className="ca-rule" key={i}>{r.metric} {r.cond} {r.value} · {r.scope === "all" ? "all brands" : r.scope}
                <button onClick={() => delRule(i)} title="Delete rule">×</button></span>
            ))}
          </div>
        )}
        {!rules.length && !form && <div className="muted-sm">No custom alerts yet. Create rules like “ROAS below 1.5 for all brands” · matches show in the list below.</div>}
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
  const tref = window.useColResize();
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
          <table className="data-table" ref={tref}>
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
                  <td className="n">{r.pace != null ? <Delta value={r.pace} /> : <span className="dim">–</span>}</td>
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
  { date: "02 Jun", acct: "Verlas India", what: "Pause broad PMax, consolidate to brand + top-SKU shopping", why: "Dash ROAS 0.31× · spend far ahead of tracked revenue", status: "In progress", learn: "Attribution gap: most orders landing as Direct/Organic in GA4", next: "Add UTM enforcement + server-side tracking, recheck in 2 wks" },
  { date: "01 Jun", acct: "Carbon Tree", what: "Audit revenue mapping in dashboard", why: "Dash ROAS 30.8× is implausibly high vs GST ROAS 1.31×", status: "Open", learn: "Likely double-counted offline/marketplace revenue in Dash feed", next: "Reconcile Dash Rev source with Shopify net before reporting" },
  { date: "28 May", acct: "Bxxy Shoes", what: "Scale Meta ABO winners +20% weekly, hold CPA cap", why: "Net ROAS steady ~2.1× with headroom on top creatives", status: "Working", learn: "Creative fatigue at ~1.8M impressions/wk; refresh cadence = 10d", next: "Brief 3 new UGC angles for Q3 launch" },
  { date: "26 May", acct: "House of Comfort", what: "Shift budget Meta→Google on bestseller terms", why: "Google CAC running below Meta on core SKUs", status: "Working", learn: "Search intent converts at higher AOV than prospecting", next: "Build SKU-level shopping feed tiers" },
  { date: "20 May", acct: "Dhaaga Life", what: "Test premium-AOV bundles in checkout", why: "AOV ₹5.4K with strong 4.1× gross ROAS · room to push basket", status: "Done", learn: "Bundle uptake +14%, AOV +9% with no CVR drop", next: "Roll bundles to Linen on Me (similar AOV profile)" },
  { date: "15 May", acct: "Powersutra", what: "Rework prospecting creative to problem-aware hooks", why: "GST ROAS slipped below 2× in April", status: "In progress", learn: "Hook-rate up but CVR flat · landing page is the bottleneck", next: "A/B new PDP layout, measure ATC CVR" },
];
const PB_TONE = { "Done": "good", "Working": "accent", "In progress": "warn", "Open": "review" };
const PB_STATUSES = ["Open", "In progress", "Working", "Done"];
const emptyPB = () => ({ date: "", acct: "", what: "", why: "", status: "Open", learn: "", next: "" });
function Playbook({ navigate }) {
  const M = window.MODEL;
  const [mine, setMine] = useStateM(() => window.PStore.get("playbook", []));
  const [form, setForm] = useStateM(null); // null = closed, else the draft entry
  const uploaded = (M.playbook || []).filter(p => p && (p.what || p.account)).map(p => ({
    date: p.date || "", acct: p.account || "", what: p.what || "", why: p.why || "",
    status: p.status || "", learn: p.insights || "", next: p.nextAction || ""
  }));
  const seeded = (!mine.length && !uploaded.length) ? PLAYBOOK : [];
  const PB = [...mine.map((p, i) => ({ ...p, _mine: i })), ...uploaded, ...seeded];

  const save = () => {
    if (!form.what && !form.acct) { setForm(null); return; }
    const next = [{ ...form, date: form.date || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }, ...mine];
    setMine(next); window.PStore.set("playbook", next); setForm(null);
  };
  const remove = (i) => { const next = mine.filter((_, k) => k !== i); setMine(next); window.PStore.set("playbook", next); };

  return (
    <div className="screen">
      <div className="page-head">
        <div><div className="crumb">Knowledge</div><h1>Playbook &amp; insights</h1>
          <p className="sub">Experiments, learnings and next actions across accounts</p></div>
        <button className="btn-primary" onClick={() => setForm(form ? null : emptyPB())}>{form ? "Close" : "+ Log experiment"}</button>
      </div>

      {form && (
        <div className="card pb-form">
          <div className="pb-form-grid">
            <label>Account
              <select value={form.acct} onChange={e => setForm({ ...form, acct: e.target.value })}>
                <option value="">Select brand…</option>
                {M.brands.map(b => <option key={b.key} value={b.key}>{b.key}</option>)}
              </select>
            </label>
            <label>Status
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {PB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="pb-wide">Playbook / strategy (what)
              <input value={form.what} onChange={e => setForm({ ...form, what: e.target.value })} placeholder="What are you doing?" />
            </label>
            <label className="pb-wide">Problem (why)
              <input value={form.why} onChange={e => setForm({ ...form, why: e.target.value })} placeholder="Why · the signal that prompted it" />
            </label>
            <label className="pb-wide">Insights / learnings
              <input value={form.learn} onChange={e => setForm({ ...form, learn: e.target.value })} placeholder="What did you learn?" />
            </label>
            <label className="pb-wide">Next action
              <input value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} placeholder="Next step" />
            </label>
          </div>
          <div className="pb-form-foot">
            <button className="tool-btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save playbook</button>
          </div>
        </div>
      )}

      <div className="pb-list">
        {PB.map((p, i) => (
          <div className="card pb-card" key={i}>
            <div className="pb-side">
              <span className="pb-date">{p.date}</span>
              <button className="pb-acct" onClick={() => M.byName[p.acct] && navigate("brand", p.acct)}>{p.acct}</button>
              <Badge tone={PB_TONE[p.status] || "neutral"}>{p.status}</Badge>
              {p._mine != null && <button className="pb-del" title="Delete" onClick={() => remove(p._mine)}>×</button>}
            </div>
            <div className="pb-main">
              <div className="pb-what">{p.what}</div>
              <div className="pb-fields">
                {p.why && <div className="pb-field"><span className="pb-k">Why</span><span className="pb-v">{p.why}</span></div>}
                {p.learn && <div className="pb-field"><span className="pb-k">Learning</span><span className="pb-v">{p.learn}</span></div>}
                {p.next && <div className="pb-field"><span className="pb-k">Next action</span><span className="pb-v accent">{p.next}</span></div>}
              </div>
            </div>
          </div>
        ))}
        {!PB.length && <div className="empty">No playbook entries yet · log your first experiment.</div>}
      </div>
      <p className="pb-foot">Your entries are saved in this browser. Team-shared playbooks come with the backend upgrade.</p>
    </div>
  );
}

Object.assign(window, { Team, Alerts, DRR, Playbook });
