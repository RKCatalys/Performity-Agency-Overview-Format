/* model.jsx · turns window.AGENCY into rich brand objects + derived analytics.
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

  // ---- Currency normalization: some brands' sheet numbers are in local currency.
  // Convert every monetary value to an INR base so the portfolio aggregates correctly;
  // the display-currency selector then converts INR -> chosen currency. RAW data is
  // kept (window.WEEKLY_RAW / window.AGENCY) so this is recomputed, never double-applied.
  const DEFAULT_SRC = { "Verlas USA": "USD", "Insta Limb PH": "PHP", "Insta Limb India": "JPY", "Qatar Moms": "QAR" };
  const srcMap = Object.assign({}, DEFAULT_SRC, (window.PStore && window.PStore.get("brandCurrency", {})) || {});
  window.__srcMap = srcMap;
  const rates = (window.__fx && window.__fx.rates) || null;
  const factorFor = (name) => {
    const src = srcMap[name] || "INR";
    if (src === "INR" || !rates || !rates[src]) return 1;
    return 1 / rates[src]; // INR per 1 unit of src
  };
  const isMoney = (nm) => /(spend|sales|revenue|aov|cac|cpl|cpm|cpc|cp )/i.test(nm) && !/(%|share|roas|cvr|ctr|contribution|return)/i.test(nm);
  const scaleArr = (arr, f) => (arr || []).map(v => v == null ? v : v * f);
  const scaleMetric = (m, f) => ({
    months: m.months.map(mo => ({ weeks: mo.weeks.map(w => w == null ? w : w * f), mo: mo.mo == null ? mo.mo : mo.mo * f })),
    quarters: (m.quarters || []).map(q => q == null ? q : q * f), year: m.year == null ? m.year : m.year * f,
  });

  // normalize the weekly grid from RAW into window.WEEKLY
  const RAW = window.WEEKLY_RAW || window.WEEKLY || {};
  const WN = {};
  Object.keys(RAW).forEach(bk => {
    const f = factorFor(bk), src = RAW[bk], out = {};
    Object.keys(src).forEach(sec => {
      const s = src[sec];
      if (!s || !s.metrics) { out[sec] = s; return; }
      const metrics = {};
      s.order.forEach(nm => { const m = s.metrics[nm]; metrics[nm] = (f !== 1 && isMoney(nm)) ? scaleMetric(m, f) : m; });
      out[sec] = { order: s.order.slice(), metrics };
    });
    WN[bk] = out;
  });
  window.WEEKLY = WN;

  const tlOv = (window.PStore && window.PStore.get("tlOverrides", {})) || {};
  const brands = A.summary.map(s0 => {
    const f = factorFor(s0.name);
    const s = { ...s0 };
    if (f !== 1) ["spend", "gstSpend", "grossSales", "dashRev", "netSales", "aov", "cac"].forEach(k => { if (s[k] != null) s[k] = s[k] * f; });
    const momRaw = A.mom[s0.name.toUpperCase()] || {};
    const mom = {};
    Object.keys(momRaw).forEach(k => { mom[k] = (f !== 1 && isMoney(k)) ? scaleArr(momRaw[k], f) : momRaw[k]; });
    const chRaw = A.channels[s0.name] || { meta: {}, google: {}, other: {}, shopify: {} };
    const ch = {};
    ["meta", "google", "other", "shopify"].forEach(sec => {
      const o = chRaw[sec] || {}, no = {};
      Object.keys(o).forEach(k => { no[k] = (f !== 1 && isMoney(k) && o[k] != null) ? o[k] * f : o[k]; });
      ch[sec] = no;
    });
    const tl = { ...(A.tl[s0.name] || {}), ...(tlOv[s0.name] || {}) };
    const spendSeries = mom["Ad Spend"] || [];
    const revSeries = mom["Dashboard Revenue"] || [];
    const roasSeries = mom["Dashboard ROAS"] || [];
    const ordersSeries = mom["Orders"] || [];
    const grossSeries = mom["Shopify Gross Sales"] || [];
    // monthly Net Sales from the (normalized) weekly overall section, + derived return rate
    const ovNet = WN[s0.name] && WN[s0.name].overall && WN[s0.name].overall.metrics["Shopify Net Sales"];
    const netSeries = Array.from({ length: 12 }, (_, i) => ovNet && ovNet.months[i] ? ovNet.months[i].mo : null);
    const returnSeries = grossSeries.map((g, i) => (g > 0 && netSeries[i] != null) ? (g - netSeries[i]) / g : null);
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
      spendSeries, revSeries, roasSeries, ordersSeries, grossSeries, netSeries, returnSeries,
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
        msg: `Dashboard ROAS ${b.dashRoas.toFixed(2)}× · spend exceeds tracked revenue.`, metric: roasFmt(b.dashRoas) });
    }
    if (b.dashRoas != null && b.dashRoas > 10) {
      alerts.push({ brand: b.key, sev: "review", type: "Data anomaly",
        msg: `Dashboard ROAS ${b.dashRoas.toFixed(1)}× looks abnormally high · verify revenue mapping.`, metric: roasFmt(b.dashRoas) });
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
  // Insights focus on EFFICIENCY (ROAS, CAC/CPL, AOV, CVR) and frame volume moves
  // as spend-driven context · a revenue drop that just tracks lower spend is not a
  // signal. Compares the two most recent COMPLETE months (skips a partial latest one).
  const insights = [];
  const MO = window.MONTHS;
  const pctc = (cur, prev) => (cur != null && prev != null && prev > 0) ? (cur - prev) / prev : null;
  const pctTxt = (ch) => (ch >= 0 ? "+" : "−") + Math.round(Math.abs(ch) * 100) + "%";
  brands.forEach(b => {
    if (!b.active) return;
    const leads = b.leadGen;
    const push = (o) => insights.push(Object.assign({ brand: b.key, brandKey: b.key, leadGen: leads, channel: null, month: null, prevMonth: null, pct: null }, o));

    // structural (level-based, not change): unprofitable
    if (b.dashRoas != null && b.dashRoas > 0 && b.dashRoas < 1) {
      push({ metric: "ROAS", dir: "down", good: false, sev: "critical", metricStr: roasFmt(b.dashRoas), pct: -(1 - b.dashRoas),
        msg: `Unprofitable · blended ROAS ${roasFmt(b.dashRoas)} (spend exceeds tracked revenue).`,
        action: `Pause the lowest-ROAS ad sets and verify revenue tracking before any scaling.` });
    }
    if (b.lastActive <= 0 || b.prevActive < 0) return;
    let c = b.lastActive, p = b.prevActive;
    const sp = b.spendSeries;
    if (p >= 0 && sp[p] > 0 && (sp[c] || 0) < 0.4 * sp[p]) { // drop a partial latest month
      c = p; p = -1;
      for (let i = c - 1; i >= 0; i--) { if ((sp[i] || 0) > 0 || (b.revSeries[i] || 0) > 0) { p = i; break; } }
    }
    if (c <= 0 || p < 0) return;
    const channel = attrChannel(b, c, p);
    const spendCh = pctc(sp[c], sp[p]);
    const roasCh = pctc(b.roasSeries[c], b.roasSeries[p]);
    const scaleCtx = spendCh != null && Math.abs(spendCh) >= 0.1 ? ` while spend ${spendCh >= 0 ? "rose" : "fell"} ${Math.round(Math.abs(spendCh) * 100)}%` : "";
    const ctx = { channel, month: MO[c], prevMonth: MO[p] };

    // ROAS · the core efficiency signal
    if (roasCh != null && Math.abs(roasCh) >= 0.12) {
      const good = roasCh > 0;
      const sev = good ? "opportunity" : (b.roasSeries[c] < 1 || Math.abs(roasCh) > 0.3 ? "critical" : "warn");
      const msg = good
        ? (spendCh > 0.1 ? `ROAS up ${pctTxt(roasCh)}${scaleCtx} · efficient scaling${channel ? " in " + channel : ""}.` : `ROAS improved ${pctTxt(roasCh)} · efficiency rising${channel ? " in " + channel : ""}.`)
        : (spendCh > 0.1 ? `ROAS dropped ${pctTxt(roasCh)}${scaleCtx} · scaling past the efficient point.` : `ROAS dropped ${pctTxt(roasCh)} (spend ~flat) · efficiency erosion${channel ? " in " + channel : ""}.`);
      const action = good ? `Keep scaling ${channel || "the winning channel"} in steps while ROAS holds; watch CAC.`
        : (spendCh > 0.1 ? `Pull budget back to the efficient tier; pause the weakest ${channel || ""} sets.` : `Refresh creative & audiences in ${channel || "Meta"}; check landing-page & checkout CVR.`);
      push({ ...ctx, metric: "ROAS", dir: good ? "up" : "down", good, sev, pct: roasCh, metricStr: pctTxt(roasCh), value: roasFmt(b.roasSeries[c]), msg, action });
    }
    // CAC / CPL · cost efficiency
    const cacArr = b.mom["CAC"] || [], cacCh = pctc(cacArr[c], cacArr[p]);
    if (cacCh != null && Math.abs(cacCh) >= 0.18) {
      const good = cacCh < 0, lbl = leads ? "CPL" : "CAC";
      push({ ...ctx, metric: lbl, dir: cacCh > 0 ? "up" : "down", good, sev: good ? "opportunity" : "warn", pct: cacCh, metricStr: pctTxt(cacCh), value: window.inr(cacArr[c]),
        msg: good ? `${lbl} down ${pctTxt(cacCh)} · acquiring more efficiently.` : `${lbl} rose ${pctTxt(cacCh)}${scaleCtx}${channel ? " in " + channel : ""}.`,
        action: good ? `Reinvest the saving into the proven audiences.` : `Refresh creative & audiences in ${channel || "Meta"}; cap CPA on weak sets.` });
    }
    // AOV · basket size (e-commerce only)
    if (!leads) {
      const aovArr = b.mom["AOV"] || [], aovCh = pctc(aovArr[c], aovArr[p]);
      if (aovCh != null && Math.abs(aovCh) >= 0.15) {
        const good = aovCh > 0;
        push({ ...ctx, metric: "AOV", dir: good ? "up" : "down", good, sev: good ? "opportunity" : "warn", pct: aovCh, metricStr: pctTxt(aovCh), value: window.inr(aovArr[c]),
          msg: good ? `AOV up ${pctTxt(aovCh)} · larger baskets.` : `AOV fell ${pctTxt(aovCh)} · smaller baskets.`,
          action: good ? `Promote the bundles/upsells that are working.` : `Test bundles, upsells and free-ship thresholds.` });
      }
    }
    // Conversion rate (Meta funnel: orders / clicks)
    const clC = chMo(b.key, "meta", "Clicks", c), orC = chMo(b.key, "meta", "Orders", c), clP = chMo(b.key, "meta", "Clicks", p), orP = chMo(b.key, "meta", "Orders", p);
    const cvrC = clC ? orC / clC : null, cvrP = clP ? orP / clP : null, cvrCh = pctc(cvrC, cvrP);
    if (cvrCh != null && Math.abs(cvrCh) >= 0.2) {
      const good = cvrCh > 0;
      push({ ...ctx, metric: "CVR", dir: good ? "up" : "down", good, sev: good ? "opportunity" : "warn", pct: cvrCh, metricStr: pctTxt(cvrCh), value: (cvrC * 100).toFixed(2) + "%",
        msg: good ? `Meta conversion rate up ${pctTxt(cvrCh)} · funnel converting better.` : `Meta conversion rate fell ${pctTxt(cvrCh)} · funnel drop-off worsening.`,
        action: good ? `Push more traffic to the converting offers/LPs.` : `Audit ATC→checkout drop-off; test offer, urgency and the PDP/landing page.` });
    }
    // Spend pace · context only (not a crisis), when efficiency didn't already explain it
    if (spendCh != null && Math.abs(spendCh) >= 0.30 && (roasCh == null || Math.abs(roasCh) < 0.12)) {
      const up = spendCh > 0;
      push({ ...ctx, metric: "Spend", dir: up ? "up" : "down", good: up, sev: up ? "opportunity" : "review", pct: spendCh, metricStr: pctTxt(spendCh), value: window.inr(sp[c]),
        msg: up ? `Spend scaled ${pctTxt(spendCh)} with ROAS ~flat · volume following budget.` : `Spend pulled back ${pctTxt(spendCh)} · lower revenue here is expected, not an efficiency signal.`,
        action: up ? `Confirm efficiency holds at the new spend level; watch CAC weekly.` : `Reallocate the freed budget to higher-ROAS brands/channels.` });
    }
    // year-level return-rate extreme
    const rr = b.ch.shopify && b.ch.shopify["Return %"];
    if (rr != null && rr > 0.35) push({ metric: "Return Rate", dir: "up", good: false, sev: "warn", metricStr: window.pct(rr, 0), value: window.pct(rr, 0),
      msg: `High return rate ${window.pct(rr, 0)} · eroding net revenue.`, action: `Review sizing/quality & PDP expectations; flag high-return SKUs.` });
  });
  const insSev = { critical: 0, warn: 1, opportunity: 2, review: 3, info: 4 };
  insights.sort((a, b) => (insSev[a.sev] - insSev[b.sev]) || (Math.abs(b.pct || 0) - Math.abs(a.pct || 0)));
  // group insights by brand so each brand surfaces as one card with its issues
  const ibMap = {};
  insights.forEach(x => { (ibMap[x.brand] = ibMap[x.brand] || []).push(x); });
  const insightsByBrand = Object.keys(ibMap).map(brand => {
    const items = ibMap[brand].slice().sort((a, b) => insSev[a.sev] - insSev[b.sev]);
    const counts = {}; items.forEach(i => counts[i.sev] = (counts[i.sev] || 0) + 1);
    return { brand, brandKey: items[0].brandKey, items, counts, worst: Math.min.apply(null, items.map(i => insSev[i.sev])) };
  }).sort((a, b) => (a.worst - b.worst) || (b.items.length - a.items.length));

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

  // ---- Portfolio totals (recomputed from normalized, INR-base brands) ----
  const sum = k => brands.reduce((a, b) => a + (b[k] || 0), 0);
  const tSpend = sum("spend"), tGst = sum("gstSpend"), tGross = sum("grossSales"), tRev = sum("dashRev"), tOrders = sum("orders");
  const gt = {
    spend: tSpend, gstSpend: tGst, grossSales: tGross, dashRev: tRev, orders: tOrders,
    dashRoas: tSpend ? tRev / tSpend : null, grossRoas: tSpend ? tGross / tSpend : null,
    gstRoas: tGst ? tGross / tGst : null, aov: tOrders ? tGross / tOrders : null, cac: tOrders ? tSpend / tOrders : null,
  };
  const activeBrands = brands.filter(b => b.active);

  window.MODEL = { brands, byName, alerts, insights, insightsByBrand, team, grandTotal: gt, activeBrands, months: A.meta.months, playbook: A.playbook || [] };
  return window.MODEL;
};
