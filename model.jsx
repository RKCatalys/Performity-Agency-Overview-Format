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

  const brands = A.summary.map(s => {
    const mom = A.mom[s.name.toUpperCase()] || {};
    const ch = A.channels[s.name] || { meta: {}, google: {}, other: {}, shopify: {} };
    const tl = A.tl[s.name] || {};
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

  window.MODEL = { brands, byName, alerts, team, grandTotal: gt, activeBrands, months: A.meta.months, playbook: A.playbook || [] };
  return window.MODEL;
};
