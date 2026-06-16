/* model.jsx — turns window.AGENCY into rich brand objects + derived analytics.
   Exposed as window.buildModel() so it runs only after data is loaded (upload). */
window.buildModel = function () {
  const A = window.AGENCY;
  const INTL = { "Verlas USA": "US", "Insta Limb Ph": "PH", "Qatar Moms": "QA" };

  function quarters(momMetric) {
    // momMetric: array of 12 monthly values -> [Q1..Q4] summed (nulls -> 0)
    const q = [0, 0, 0, 0];
    (momMetric || []).forEach((v, i) => { if (v != null) q[Math.floor(i / 3)] += v; });
    return q;
  }

  const tlOv = (window.PStore && window.PStore.get("tlOverrides", {})) || {};
  const brands = A.summary.map(s => {
    const mom = A.mom[s.name.toUpperCase()] || {};
    const ch = A.channels[s.name] || { meta: {}, google: {}, other: {}, shopify: {} };
    const tl = { ...(A.tl[s.name] || {}), ...(tlOv[s.name] || {}) };
    const spendSeries = mom["Ad Spend"] || [];
    const revSeries = mom["Dashboard Revenue"] || [];
    const roasSeries = mom["Dashboard ROAS"] || [];
    const ordersSeries = mom["Orders"] || [];
    // last active month index (has spend or rev)
    let lastActive = -1, prevActive = -1;
    for (let i = 0; i < 12; i++) {
      if ((spendSeries[i] || 0) > 0 || (revSeries[i] || 0) > 0) { prevActive = lastActive; lastActive = i; }
    }
    const active = (s.spend || 0) > 0 || (s.dashRev || 0) > 0;
    return {
      ...s,
      key: s.name,
      region: INTL[s.name] || "IN",
      active,
      leadGen: !!(A.leadGen && A.leadGen[s.name]),
      mom, ch, tl,
      spendSeries, revSeries, roasSeries, ordersSeries,
      lastActive, prevActive,
      qSpend: quarters(spendSeries),
      qRev: quarters(revSeries),
      qOrders: quarters(ordersSeries),
    };
  });

  const byName = {}; brands.forEach(b => byName[b.key] = b);

  // ---- Alerts ----
  const alerts = [];
  brands.forEach(b => {
    if (!b.active) return;
    if (b.dashRoas != null && b.dashRoas > 0 && b.dashRoas < 1) {
      alerts.push({ brand: b.key, sev: "critical", type: "Unprofitable",
        msg: `Dashboard ROAS ${b.dashRoas.toFixed(2)}× — spend exceeds tracked revenue.`, metric: roasFmt(b.dashRoas) });
    }
    if (b.dashRoas != null && b.dashRoas > 10) {
      alerts.push({ brand: b.key, sev: "review", type: "Data anomaly",
        msg: `Dashboard ROAS ${b.dashRoas.toFixed(1)}× looks abnormally high — verify revenue mapping.`, metric: roasFmt(b.dashRoas) });
    }
    // MoM revenue decline on last active month
    if (b.lastActive > 0 && b.prevActive >= 0) {
      const c = b.revSeries[b.lastActive], p = b.revSeries[b.prevActive];
      if (p > 0 && c < p * 0.7) {
        alerts.push({ brand: b.key, sev: "warn", type: "Revenue drop",
          msg: `Revenue fell ${Math.round((1 - c / p) * 100)}% in ${window.MONTHS[b.lastActive]} vs ${window.MONTHS[b.prevActive]}.`,
          metric: "−" + Math.round((1 - c / p) * 100) + "%" });
      }
    }
    // High CAC vs AOV
    if (b.cac != null && b.aov != null && b.aov > 0 && b.cac > b.aov * 0.6) {
      alerts.push({ brand: b.key, sev: "warn", type: "CAC pressure",
        msg: `CAC ${window.inr(b.cac)} is ${Math.round(b.cac / b.aov * 100)}% of AOV ${window.inr(b.aov)}.`, metric: window.inr(b.cac) });
    }
  });
  // brands onboarded (TL assigned) but no spend
  brands.forEach(b => {
    const hasTL = b.tl.tlMeta || b.tl.tlGoogle;
    if (!b.active && hasTL) {
      alerts.push({ brand: b.key, sev: "info", type: "Awaiting data",
        msg: `Team assigned${b.tl.note ? " · " + b.tl.note : ""} but no spend logged yet.`, metric: "0" });
    }
  });
  const sevRank = { critical: 0, warn: 1, review: 2, info: 3 };
  alerts.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);

  function roasFmt(n){ return n.toFixed(2)+"×"; }

  // ---- Smart insights: MoM change detection w/ channel attribution + actions ----
  const W = window.WEEKLY || {};
  const chMo = (key, sec, metric, mi) => {
    const s = W[key] && W[key][sec] && W[key][sec].metrics[metric];
    return s && s.months[mi] ? s.months[mi].mo : null;
  };
  const attrChannel = (b, mi, pi) => {
    const dMeta = (chMo(b.key, "meta", "Revenue", mi) || 0) - (chMo(b.key, "meta", "Revenue", pi) || 0);
    const dG = (chMo(b.key, "google", "Revenue", mi) || 0) - (chMo(b.key, "google", "Revenue", pi) || 0);
    if (!dMeta && !dG) return null;
    return Math.abs(dG) > Math.abs(dMeta) ? "Google" : "Meta";
  };
  const insights = [];
  const MO = window.MONTHS;
  brands.forEach(b => {
    if (!b.active || b.lastActive <= 0 || b.prevActive < 0) return;
    let c = b.lastActive, p = b.prevActive;
    // if the most recent active month looks partial (spend << prior month), compare
    // the two prior complete months instead so end-of-period stubs don't over-flag
    const sp = b.spendSeries;
    if (p >= 0 && sp[p] > 0 && (sp[c] || 0) < 0.4 * sp[p]) {
      c = p; p = -1;
      for (let i = c - 1; i >= 0; i--) { if ((sp[i] || 0) > 0 || (b.revSeries[i] || 0) > 0) { p = i; break; } }
    }
    if (c <= 0 || p < 0) return;
    const leads = b.leadGen;
    const defs = [
      { label: "Revenue", arr: b.revSeries, kind: "money", th: 0.20, goodUp: true, attr: true },
      { label: "ROAS", arr: b.roasSeries, kind: "ratio", th: 0.15, goodUp: true, attr: true },
      { label: leads ? "CPL" : "CAC", arr: b.mom["CAC"] || [], kind: "money", th: 0.20, goodUp: false },
      ...(leads ? [] : [{ label: "AOV", arr: b.mom["AOV"] || [], kind: "money", th: 0.15, goodUp: true }]),
      { label: leads ? "Leads" : "Orders", arr: b.ordersSeries, kind: "count", th: 0.25, goodUp: true },
    ];
    const fmtVal = (kind, v) => kind === "ratio" ? roasFmt(v) : kind === "money" ? window.inr(v) : window.num(v);
    defs.forEach(d => {
      const cur = d.arr[c], prev = d.arr[p];
      if (cur == null || prev == null || prev <= 0) return;
      const ch = (cur - prev) / prev;
      if (Math.abs(ch) < d.th) return;
      const up = ch > 0;
      const good = d.goodUp ? up : !up;
      const channel = d.attr ? attrChannel(b, c, p) : null;
      const pctTxt = (up ? "+" : "−") + Math.round(Math.abs(ch) * 100) + "%";
      const mag = Math.abs(ch);
      const sev = good ? "opportunity" : (mag > 0.4 || (d.label === "ROAS" && cur < 1) ? "critical" : "warn");
      const where = channel ? ` driven by ${channel}` : "";
      const msgs = {
        Revenue: good ? `Revenue up ${pctTxt}${where} — momentum building.` : `Revenue fell ${pctTxt}${where}.`,
        ROAS: good ? `ROAS improved ${pctTxt}${where} — efficiency rising.` : `ROAS dropped ${pctTxt}${where}.`,
        CAC: good ? `CAC down ${pctTxt} — acquiring more efficiently.` : `CAC rose ${pctTxt}${where}.`,
        CPL: good ? `Cost per lead down ${pctTxt}.` : `Cost per lead rose ${pctTxt}${where}.`,
        AOV: good ? `AOV up ${pctTxt} — larger baskets.` : `AOV fell ${pctTxt}.`,
        Orders: good ? `Orders up ${pctTxt}${where}.` : `Orders fell ${pctTxt}${where}.`,
        Leads: good ? `Leads up ${pctTxt}${where}.` : `Leads fell ${pctTxt}${where}.`,
      };
      const actions = {
        Revenue: good ? `Scale ${channel || "top"} budget while ROAS holds; lock in winning creative.` : `Audit ${channel || "top"} campaigns — check pacing, creative fatigue and tracking.`,
        ROAS: good ? `Increase spend in ${channel || "the winning channel"} gradually and watch CAC.` : `Tighten targeting / pause low-ROAS ${channel || ""} sets; review landing-page CVR.`,
        CAC: good ? `Reinvest the saving into proven audiences.` : `Refresh creative & audiences in ${channel || "Meta"}; cap CPA on weak ad sets.`,
        CPL: good ? `Scale the lead campaigns that improved.` : `Tighten lead-form targeting and test new hooks in ${channel || "Meta"}.`,
        AOV: good ? `Promote the bundles that are working.` : `Test bundles, upsells and free-ship thresholds to lift basket size.`,
        Orders: good ? `Protect inventory & retention to sustain volume.` : `Check funnel drop-off (ATC→checkout) and offer/urgency.`,
        Leads: good ? `Keep the lead engine fed; nurture for conversion.` : `Review form friction and lead quality; refresh creative.`,
      };
      insights.push({
        brand: b.key, brandKey: b.key, leadGen: leads, metric: d.label,
        dir: up ? "up" : "down", good, pct: ch, sev, channel,
        metricStr: pctTxt, value: fmtVal(d.kind, cur), prevValue: fmtVal(d.kind, prev),
        month: MO[c], prevMonth: MO[p],
        msg: msgs[d.label], action: actions[d.label],
      });
    });
    // year-level extremes (no monthly series available)
    const rr = b.ch.shopify && b.ch.shopify["Return %"];
    if (rr != null && rr > 0.35) insights.push({ brand: b.key, brandKey: b.key, leadGen: leads, metric: "Return Rate",
      dir: "up", good: false, sev: "warn", channel: null, metricStr: window.pct(rr, 0), value: window.pct(rr, 0),
      month: null, msg: `High return rate ${window.pct(rr, 0)} — eroding net revenue.`,
      action: `Review sizing/quality and PDP expectations; flag high-return SKUs.` });
  });
  const insSev = { critical: 0, warn: 1, opportunity: 2, review: 3 };
  insights.sort((a, b) => (insSev[a.sev] - insSev[b.sev]) || (Math.abs(b.pct || 0) - Math.abs(a.pct || 0)));

  // ---- Team rollup ----
  const teamMap = {};
  brands.forEach(b => {
    [["meta", b.tl.tlMeta], ["google", b.tl.tlGoogle]].forEach(([plat, person]) => {
      if (!person) return;
      if (!teamMap[person]) teamMap[person] = { name: person, brands: new Set(), meta: 0, google: 0, spend: 0, rev: 0, active: 0 };
      teamMap[person].brands.add(b.key);
      teamMap[person][plat]++;
      teamMap[person].spend += b.spend || 0;
      teamMap[person].rev += b.dashRev || 0;
      if (b.active) teamMap[person].active++;
    });
  });
  const team = Object.values(teamMap).map(t => ({ ...t, brandCount: t.brands.size, brands: [...t.brands] }))
    .sort((a, b) => b.spend - a.spend);

  // ---- Portfolio totals ----
  const gt = A.grandTotal;
  const activeBrands = brands.filter(b => b.active);

  window.MODEL = { brands, byName, alerts, insights, team, grandTotal: gt, activeBrands, months: A.meta.months, playbook: A.playbook || [] };
  return window.MODEL;
};
