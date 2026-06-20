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
    // ---- Channel-metric diagnostics · benchmark + channel logic + cross-channel scope ----
    // Same reasoning depth as the LPV example, applied to EVERY tracked metric. Each metric
    // carries an industry-standard guideline (channel-aware where Meta vs Google differ), a
    // direction (higher- or lower-is-better), a root-cause explanation and a what-to-check
    // list. The funnel metrics (CTR→LPV→ATC→IC→Purchase) are evaluated as a cascade so the
    // EARLIEST broken stage is reported as the root; cost/efficiency metrics emit on their
    // own. Scope: bad on ≥2 channels = systemic (site/market/offer-side); one of several =
    // channel-specific; site-stage metrics (LPV/ATC/IC/Purchase) read site-side by nature.
    (() => {
      const CHL = { meta: "Meta", google: "Google", other: "Other" };
      const chans = ["meta", "google", "other"];
      const pf = v => (v * 100).toFixed(1) + "%", p2 = v => (v * 100).toFixed(2) + "%", xf = v => roasFmt(v), mf = v => window.inr(v);
      // metric knowledge base
      const KB = {
        CTR: { label: "CTR", unit: "pct", fmt: p2, better: "high", funnel: 0,
          bench: { meta: { good: .010, poor: .007 }, google: { good: .030, poor: .015 }, other: { good: .006, poor: .003 } },
          cause: { meta: "ad creative or audience relevance (people aren’t clicking the ad)", google: "ad copy, keywords or Quality Score / weak search intent", other: "creative or placement relevance" },
          checks: { meta: ["Refresh creative, hooks & formats", "Refresh or tighten audiences", "Watch frequency / creative fatigue"], google: ["Review ad copy & extensions", "Prune low-CTR keywords; add negatives", "Improve Quality Score / landing relevance"], other: ["Refresh creative & placements"] } },
        "LPV CVR": { label: "Landing-page view rate", unit: "pct", fmt: pf, better: "high", funnel: 1, site: true,
          bench: { default: { good: .85, poor: .75 } },
          cause: { default: "a site or landing-page problem where many clicks never load the page" },
          checks: { default: ["PageSpeed / load-time test on the exact landing URL", "Open the URL on mobile: redirects, 404s, server errors", "Confirm the LPV / pixel event is firing", "Check recent theme / app / redirect changes"] } },
        "ATC CVR": { label: "Add-to-cart rate", unit: "pct", fmt: pf, better: "high", funnel: 2, site: true,
          bench: { default: { good: .06, poor: .03 } },
          cause: { default: "the product page or offer (visitors land but don’t add to cart)" },
          checks: { default: ["Review PDP: price, images, reviews, value prop", "Test offer, urgency & bundles", "Check stock & sizing/spec clarity"] } },
        "IC CVR": { label: "Checkout-initiation rate", unit: "pct", fmt: pf, better: "high", funnel: 3, site: true,
          bench: { default: { good: .45, poor: .30 } },
          cause: { default: "cart friction (carts don’t reach checkout)" },
          checks: { default: ["Show shipping cost early", "Add trust signals & a clear CTA", "Test guest checkout"] } },
        "Purchase CVR": { label: "Purchase rate", unit: "pct", fmt: pf, better: "high", funnel: 4, site: true,
          bench: { default: { good: .02, poor: .01 } },
          cause: { default: "checkout friction (sessions reach checkout but don’t convert)" },
          checks: { default: ["Audit checkout for payment failures", "Add payment options (incl. COD)", "Remove unexpected last-step costs"] } },
        CPM: { label: "CPM", unit: "money", fmt: mf, better: "low", mom: .25,
          cause: { default: "rising auction competition, a too-narrow audience, or weak creative raising delivery cost" },
          checks: { default: ["Broaden / refresh audiences to ease auction pressure", "Refresh creative to lift relevance (lowers CPM)", "Check for seasonal competition spikes"] } },
        CPC: { label: "CPC", unit: "money", fmt: mf, better: "low", mom: .25,
          cause: { default: "CTR falling or CPM rising, so each click costs more" },
          checks: { default: ["Lift CTR with stronger creative/copy", "Tighten targeting to more relevant users", "On Google, prune expensive low-converting keywords"] } },
        "ROAS (Dash)": { label: "ROAS", unit: "x", fmt: xf, better: "high",
          bench: { default: { good: 2.0, poor: 1.0 } },
          cause: { default: "this channel is returning too little revenue for its spend" },
          checks: { default: ["Pause the weakest ad sets / keywords", "Shift budget toward the higher-ROAS channel", "Recheck revenue tracking for this channel"] } },
      };
      const pick = (o, sec) => o[sec] || o.default;
      const evalMetric = (key) => {
        const k = KB[key];
        const perCh = chans.map(sec => {
          const cv = chMo(b.key, sec, key, c), pv = chMo(b.key, sec, key, p);
          if (cv == null && pv == null) return null;
          const mom = pctc(cv, pv);
          const bm = k.bench ? pick(k.bench, sec) : null;
          const worseMove = k.better === "high" ? (mom != null && mom <= -(k.mom || 0.15)) : (mom != null && mom >= (k.mom || 0.15));
          const belowBench = bm ? (k.better === "high" ? cv != null && cv < bm.poor : cv != null && cv > bm.poor) : false;
          return { sec, cv, pv, mom, bm, belowBench, bad: belowBench || worseMove };
        }).filter(Boolean);
        return { key, k, perCh, bad: perCh.filter(x => x.bad) };
      };
      const emit = (res, cascade) => {
        const { k, key } = res, badCh = res.bad, availCh = res.perCh.length;
        const systemic = badCh.length >= 2, scope = systemic ? "systemic" : (availCh >= 2 ? "channel" : "single");
        const moved = (x) => x.mom != null && (k.better === "high" ? x.mom <= -(k.mom || 0.15) : x.mom >= (k.mom || 0.15));
        const levelOnly = !badCh.some(moved);                          // flagged purely on benchmark, no MoM move
        const worse = k.better === "high" ? "down" : "up";
        const moms = badCh.filter(moved).map(x => x.mom).sort((a, b) => Math.abs(b) - Math.abs(a));
        const repMom = moms.length ? moms[0] : null;
        // severity: a benchmark breach into the "poor" zone (or ROAS<1) is critical; a big
        // MoM move while still healthy is only a warning, not a crisis.
        let crit;
        if (k.bench) crit = badCh.some(x => x.bm && (k.better === "high" ? x.cv < x.bm.poor * 0.8 : x.cv > x.bm.poor * 1.3));
        else crit = badCh.some(x => x.mom != null && Math.abs(x.mom) >= 0.5);
        if (key === "ROAS (Dash)" && badCh.some(x => x.cv != null && x.cv < 1)) crit = true;
        const sev = crit ? "critical" : "warn";
        const chList = badCh.map(x => CHL[x.sec]).join(" and ");
        const phrase = badCh.map(x => `${CHL[x.sec]} ${k.fmt(x.cv)}${moved(x) ? " (" + pctTxt(x.mom) + " MoM)" : ""}`).join(", ");
        const cause = pick(k.cause, badCh[0].sec);
        let reasoning;
        if (k.site) {
          reasoning = systemic
            ? `${k.label} is weak on ${chList}. Every channel sends traffic to the same store, so a shared problem here is site-side: ${cause}.`
            : `${k.label} reflects what happens on the store after the click, so this is almost always site-side (${cause})${availCh >= 2 ? " rather than one channel’s ads" : "; only " + CHL[badCh[0].sec] + " tracks it here, but the mechanism still points at the site"}.`;
        } else if (systemic) {
          reasoning = `${k.label} is off on ${chList} together, which points to a portfolio or market-wide cause (${cause}) rather than one channel’s setup.`;
        } else if (scope === "single") {
          reasoning = `${k.label} on ${CHL[badCh[0].sec]} signals ${cause}.`;
        } else {
          reasoning = `${k.label} is off on ${CHL[badCh[0].sec]} but holds on the other channel(s), so it’s ${CHL[badCh[0].sec]}-specific: ${cause}.`;
        }
        if (cascade && cascade.length) reasoning += ` Downstream ${cascade.join(", ")} also fell, which is expected once ${k.label} breaks.`;
        const benchNote = badCh.some(x => x.belowBench) ? ` ${k.better === "high" ? "Below" : "Above"} the ~${k.fmt(pick(k.bench, badCh[0].sec).poor)} industry-standard guideline.` : "";
        const head = levelOnly ? `${k.label} off benchmark` : `${k.label} ${worse}`;
        push({ ...ctx, metric: k.label, dir: worse, good: false, sev, pct: repMom, scope,
          metricStr: repMom != null ? pctTxt(repMom) : "vs benchmark", value: k.fmt(badCh[0].cv),
          msg: `${head} · ${phrase}.${benchNote}`,
          reasoning, checks: pick(k.checks, badCh[0].sec), action: pick(k.checks, badCh[0].sec)[0] });
      };
      // 1) funnel cascade → emit earliest broken stage as root
      const funnelKeys = Object.keys(KB).filter(key => KB[key].funnel != null).sort((a, b2) => KB[a].funnel - KB[b2].funnel);
      const funnelRes = funnelKeys.map(evalMetric);
      const root = funnelRes.find(r => r.bad.length);
      const findings = [];
      if (root) {
        // cascade only applies to the on-site funnel (LPV→ATC→IC→Purchase feed each other);
        // a CTR/ad-side drop does NOT mechanically break downstream on-site CVRs.
        const cascade = KB[root.key].site
          ? funnelRes.filter(r => KB[r.key].funnel > KB[root.key].funnel && KB[r.key].site && r.bad.length).map(r => KB[r.key].label)
          : null;
        findings.push({ res: root, cascade });
      }
      // 2) independent cost / efficiency metrics
      ["CPM", "CPC", "ROAS (Dash)"].forEach(key => { const r = evalMetric(key); if (r.bad.length) findings.push({ res: r, cascade: null }); });
      findings.forEach(f => emit(f.res, f.cascade));
    })();

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
