/* drr.js — All-DRR service: connector + smart mapping + delta/trend engines.
   Reads each brand's per-month DRR tab via the lightweight gviz CSV endpoint,
   auto-detects headers, normalizes to a common shape. No uploads, no hardcoded
   column positions. Exposes window.DRR. */
(function () {
  const CACHE_PREFIX = "perf.drr.v1.";
  const TTL = 30 * 60 * 1000;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // runtime registry = built-in defaults (app-config) merged with shared overrides
  // (added/hidden brands stored in Supabase, loaded at boot via setOverrides).
  let _overrides = [];
  function setOverrides(list) { _overrides = Array.isArray(list) ? list : []; }
  function getOverrides() { return _overrides.slice(); }
  function parseSheetId(s) {
    s = String(s == null ? "" : s).trim(); if (!s) return null;
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;   // already a bare id
    return null;
  }
  function registry() {
    const base = (window.PERFORMITY && window.PERFORMITY.drrSheets) || [];
    const byId = new Map(base.map(b => [b.id, Object.assign({ source: "built-in" }, b)]));
    _overrides.forEach(o => {
      const id = o.sheet_id || o.id; if (!id) return;
      if (o.removed) { byId.delete(id); }
      else { const e = { name: o.name, id: id, source: "custom" }; if (o.currency) e.currency = o.currency; byId.set(id, e); }
    });
    return Array.from(byId.values());
  }

  function monthCandidates(d) {
    const full = MONTHS[d.getMonth()], abbr = full.slice(0, 3), yy = String(d.getFullYear()).slice(2);
    return [full + "'" + yy, full + yy, abbr + "'" + yy, full + " " + d.getFullYear(), abbr + yy, full];
  }
  function gvizUrl(id, sheet) {
    return "https://docs.google.com/spreadsheets/d/" + id + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(sheet);
  }
  function numify(v) {
    if (v == null) return null;
    if (typeof v === "number") return isNaN(v) ? null : v;
    let s = String(v).trim();
    if (!s || /^[-–—]$/.test(s)) return null;
    s = s.replace(/[^0-9.\-]/g, "");
    if (s === "" || s === "-" || s === ".") return null;
    const n = parseFloat(s); return isNaN(n) ? null : n;
  }
  const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();

  // map a header label -> normalized field (priority matters: specific first)
  function fieldFor(h) {
    const t = norm(h);
    if (!t) return null;
    if (/meta\s*spend/.test(t)) return "metaSpend";
    if (/google\s*spend/.test(t)) return "googleSpend";
    if (/total\s*spend|^spend$|ad\s*spend/.test(t)) return "spend";
    if (/gross\s*(revenue|sales)/.test(t)) return "gross";
    if (/net\s*(revenue|sales)/.test(t)) return "net";
    if (/^returns?$|return\s*amount/.test(t)) return "returns";
    if (/gross\s*roas/.test(t)) return "grossRoas";
    if (/net\s*roas/.test(t)) return "netRoas";
    if (/roas/.test(t)) return "roas";
    if (/orders|leads/.test(t)) return "orders";
    if (/aov/.test(t)) return "aov";
    if (/^cac|cac$|cpl/.test(t)) return "cac";
    if (/date/.test(t)) return "date";   // note: weekday "DAY" column intentionally not mapped
    return null;
  }
  const SHORTM = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function parseDateStr(s) {
    if (s instanceof Date) return isNaN(s) ? null : s;
    s = String(s == null ? "" : s).trim(); if (!s) return null;
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})/))) { const mi = SHORTM.findIndex(x => x.toLowerCase() === m[2].slice(0, 3).toLowerCase()); if (mi < 0) return null; let y = +m[3]; if (y < 100) y += 2000; return new Date(y, mi, +m[1]); }
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[1] - 1, +m[2]); }
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  // parse a workbook tab name ("June26","Apr26","January26","Dec24") -> {monthIdx,year,label}
  function parseMonthName(nm) {
    const m = String(nm).trim().match(/^([A-Za-z]{3,9})['’]?\s*'?\s*(\d{2})$/);
    if (!m) return null;
    const name = m[1].toLowerCase();
    let idx = MONTHS.findIndex(M => M.toLowerCase().slice(0, 3) === name.slice(0, 3));
    if (idx < 0) return null;
    const year = 2000 + (+m[2]);
    return { monthIdx: idx, year, label: MONTHS[idx] + " '" + m[2] };
  }
  const TARGET_LABELS = { "target budget": "budget", "target revenue": "revRevenue", "target roas": "roas", "target gross": "revGross", "month days": "monthDays", "monthly target": "revRevenue" };

  const DATE_RE = /^\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4}$|^\d{4}-\d\d-\d\d|^\d{1,2}\/\d{1,2}\/\d{2,4}/;
  const isDateCell = (v) => (v instanceof Date && !isNaN(v)) || (typeof v === "string" && DATE_RE.test(v.trim()));

  // smart mapping engine: rows (2D) -> normalized DRR object.
  // (1) header-keyword detection; (2) position fallback keyed off the date column
  // for header-less feeds (gviz drops header rows) using the standard DRR template.
  function parseDRR(rows, fallbackMonth, currencyHint) {
    let colMap = {}, dataStart = -1;
    for (let i = 0; i < Math.min(rows.length, 14); i++) {
      const r = rows[i] || [];
      const map = {};
      r.forEach((c, j) => { const f = fieldFor(c); if (f && map[f] == null) map[f] = j; });
      if (map.date != null && (map.gross != null || map.spend != null || map.net != null)) { colMap = map; dataStart = i + 1; break; }
    }
    if (dataStart < 0) {
      // position fallback: locate the column that holds dates across rows
      const hits = {};
      rows.forEach(r => (r || []).forEach((c, j) => { if (isDateCell(c)) hits[j] = (hits[j] || 0) + 1; }));
      let dc = -1, best = 0;
      Object.keys(hits).forEach(j => { if (hits[j] > best) { best = hits[j]; dc = +j; } });
      if (dc < 0 || best < 2) return null;
      colMap = { date: dc, metaSpend: dc + 1, googleSpend: dc + 2, spend: dc + 3, gross: dc + 4, returns: dc + 5, net: dc + 6, grossRoas: dc + 7, netRoas: dc + 8, orders: dc + 9, aov: dc + 10, cac: dc + 11 };
      for (let i = 0; i < rows.length; i++) { if (isDateCell((rows[i] || [])[dc])) { dataStart = i; break; } }
    }
    if (dataStart < 0) return null;
    const hdr = dataStart - 1;
    // targets from the side panel (label cell, value to its right)
    const targets = {};
    rows.forEach(r => (r || []).forEach((c, j) => {
      const key = TARGET_LABELS[norm(c)];
      if (key) { const v = numify(r[j + 1]); if (v != null) targets[key] = v; }
    }));
    // monthly target: a header row whose first cell ends in a 2-digit year (e.g. "June'26")
    // carries the target revenue in the cell to its right.
    if (targets.revRevenue == null) {
      for (let i = 0; i <= hdr; i++) {
        const r = rows[i] || [], c0 = norm(r[0]);
        if (c0 && c0 !== "totals" && /\d{2}$/.test(c0) && /[a-z]/.test(c0)) {
          const v = numify(r[1]); if (v != null && v > 1000) { targets.revRevenue = v; break; }
        }
      }
    }
    const monthLabel = fallbackMonth || (rows[1] && String(rows[1][0] || "").trim()) || (rows[0] && /\b\d{2}\b/.test(String(rows[0][0])) && String(rows[0][0])) || "DRR";
    // currency from a sample money cell
    let currency = currencyHint || "₹";
    if (!currencyHint) {
      const probe = String((rows[hdr + 1] || [])[colMap.gross != null ? colMap.gross : colMap.spend] || "");
      if (/\$/.test(probe)) currency = "$"; else if (/€/.test(probe)) currency = "€"; else if (/£/.test(probe)) currency = "£";
    }

    const days = [];
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const raw = r[colMap.date];
      const dateCell = String(raw == null ? "" : raw).trim();
      if (!dateCell || /total/i.test(dateCell)) { if (days.length) break; else continue; }
      if (!isDateCell(raw)) continue;
      const dObj = parseDateStr(raw);
      const disp = dObj ? dObj.getDate() + " " + SHORTM[dObj.getMonth()] : dateCell;
      const get = (f) => colMap[f] != null ? numify(r[colMap[f]]) : null;
      const spend = get("spend") != null ? get("spend") : ((get("metaSpend") || 0) + (get("googleSpend") || 0)) || null;
      const gross = get("gross"), net = get("net");
      const d = {
        date: disp, dateObj: dObj, dom: dObj ? dObj.getDate() : days.length + 1, dow: dObj ? dObj.getDay() : null,
        spend, metaSpend: get("metaSpend"), googleSpend: get("googleSpend"),
        gross, returns: get("returns"), net: net != null ? net : gross,
        roas: get("grossRoas") != null ? get("grossRoas") : (get("roas") != null ? get("roas") : (spend ? (gross || 0) / spend : null)),
        netRoas: get("netRoas") != null ? get("netRoas") : (spend ? ((net != null ? net : gross) || 0) / spend : null),
        orders: get("orders"), aov: get("aov"), cac: get("cac"),
      };
      if (d.spend != null || d.gross != null) days.push(d);
      if (days.length >= 31) break;
    }
    // trim trailing not-yet-filled days (templates pre-seed every date of the month
    // with zero/blank metrics) so daysElapsed and projections reflect real data only
    while (days.length && !days[days.length - 1].gross && !days[days.length - 1].spend) days.pop();
    if (!days.length) return null;
    // MTD totals
    const sum = (k) => days.reduce((a, x) => a + (x[k] || 0), 0);
    const tSpend = sum("spend"), tGross = sum("gross"), tNet = sum("net"), tOrders = sum("orders");
    const totals = {
      spend: tSpend, gross: tGross, net: tNet, orders: tOrders,
      roas: tSpend ? tGross / tSpend : null, netRoas: tSpend ? tNet / tSpend : null,
      aov: tOrders ? tGross / tOrders : null, cac: tOrders ? tSpend / tOrders : null,
      returns: sum("returns"),
    };
    const daysElapsed = days.length;
    const fd = days[0].dateObj;
    const monthDays = targets.monthDays || (fd ? new Date(fd.getFullYear(), fd.getMonth() + 1, 0).getDate() : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
    const projGross = daysElapsed ? tGross / daysElapsed * monthDays : null;
    const targetRev = targets.revRevenue || targets.revGross || (targets.budget && targets.roas ? targets.budget * targets.roas : null);
    const achievement = targetRev ? tGross / targetRev : (targets.budget ? tSpend / targets.budget : null);
    return { days, totals, targets, monthLabel, currency, daysElapsed, monthDays, projGross, targetRev, achievement };
  }

  // fetch one tab as 2D rows via gviz CSV (returns null on failure/non-CSV)
  function fetchTab(id, sheet) {
    return fetch(gvizUrl(id, sheet)).then(r => r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status))).then(txt => {
      if (!txt || /Closure Library|<!DOCTYPE|<html/i.test(txt.slice(0, 200))) return null; // gviz error / not shared
      try { const wb = XLSX.read(txt, { type: "string" }); const ws = wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null }); }
      catch (e) { return null; }
    });
  }

  function cacheGet(id) { try { const v = JSON.parse(localStorage.getItem(CACHE_PREFIX + id)); return v && (Date.now() - v.ts) < TTL ? v : (v || null); } catch (e) { return null; } }
  function cacheSet(id, parsed) { try { localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ parsed, ts: Date.now() })); } catch (e) {} }

  // fetch a brand's current-month DRR (tries tab-name candidates, then previous month)
  function fetchBrand(brand, opts) {
    opts = opts || {};
    const id = brand.id;
    if (!opts.fresh) { const c = cacheGet(id); if (c && c.parsed && (Date.now() - c.ts) < TTL) return Promise.resolve({ ok: true, parsed: c.parsed, ts: c.ts, cached: true }); }
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const cands = monthCandidates(now);
    const prevCands = monthCandidates(prev);
    const tryList = (names, idx) => {
      if (idx >= names.length) return Promise.resolve(null);
      return fetchTab(id, names[idx]).then(rows => {
        if (rows) { const p = parseDRR(rows, names[idx], brand.currency); if (p) return p; }
        return tryList(names, idx + 1);
      }).catch(() => tryList(names, idx + 1));
    };
    return tryList(cands, 0).then(p => p || tryList(prevCands, 0)).then(parsed => {
      if (parsed) { cacheSet(id, parsed); return { ok: true, parsed, ts: Date.now() }; }
      const stale = cacheGet(id);
      if (stale && stale.parsed) return { ok: true, parsed: stale.parsed, ts: stale.ts, stale: true };
      return { ok: false, error: "Couldn't read this DRR — check it's shared “Anyone with the link → Viewer”." };
    }).catch(err => ({ ok: false, error: (err && err.message) || "Fetch failed" }));
  }

  // run promise-returning tasks with a concurrency cap
  function pool(items, worker, limit) {
    limit = limit || 6; let i = 0; const out = new Array(items.length);
    return new Promise(resolve => {
      let active = 0, done = 0;
      const next = () => {
        if (done === items.length) return resolve(out);
        while (active < limit && i < items.length) {
          const idx = i++; active++;
          Promise.resolve(worker(items[idx], idx)).then(r => { out[idx] = r; }).catch(() => { out[idx] = null; })
            .then(() => { active--; done++; next(); });
        }
      };
      next();
    });
  }

  // delta of a daily field: latest day vs previous day
  function delta(days, field) {
    const vals = days.map(d => d[field]).filter(v => v != null);
    if (!vals.length) return null;
    const cur = vals[vals.length - 1], prev = vals.length > 1 ? vals[vals.length - 2] : null;
    const pct = (prev != null && prev !== 0) ? (cur - prev) / Math.abs(prev) : null;
    return { cur, prev, delta: prev != null ? cur - prev : null, pct, costMetric: /cac|spend|cpc|cpl/i.test(field) };
  }
  function seriesOf(days, field) { return days.map(d => d[field]); }

  function xlsxUrl(id) { return "https://docs.google.com/spreadsheets/d/" + id + "/export?format=xlsx"; }

  // Fetch the WHOLE workbook (all month tabs) in one request. xlsx export keeps
  // header rows (gviz strips them), so mapping is header-driven and reliable, and
  // we get every historical month for switching + cross-month comparisons.
  function fetchWorkbook(brand) {
    const id = brand.id;
    const ck = CACHE_PREFIX + "wb." + id;
    return fetch(xlsxUrl(id)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error("HTTP " + r.status))).then(buf => {
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      const months = [];
      wb.SheetNames.forEach(nm => {
        const mi = parseMonthName(nm); if (!mi) return;
        const ws = wb.Sheets[nm];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true, defval: null });
        const p = parseDRR(rows, mi.label, brand.currency);
        if (p && p.days.length) months.push({ key: nm, label: mi.label, year: mi.year, monthIdx: mi.monthIdx, sortKey: mi.year * 12 + mi.monthIdx, parsed: p });
      });
      months.sort((a, b) => b.sortKey - a.sortKey);   // newest first
      if (!months.length) return { ok: false, error: "No monthly tabs found in this sheet." };
      return { ok: true, months };
    }).catch(err => ({ ok: false, error: (err && err.message) || "Couldn't read this workbook — check it's shared “Anyone with the link → Viewer”." }));
  }

  // proper aggregate of a field over the first `count` days (ratios recomputed, not summed)
  function aggField(days, field, count) {
    const sl = count ? days.slice(0, count) : days;
    const sum = k => sl.reduce((a, x) => a + (x[k] || 0), 0);
    switch (field) {
      case "roas": { const s = sum("spend"); return s ? sum("gross") / s : null; }
      case "netRoas": { const s = sum("spend"); return s ? sum("net") / s : null; }
      case "aov": { const o = sum("orders"); return o ? sum("gross") / o : null; }
      case "cac": { const o = sum("orders"); return o ? sum("spend") / o : null; }
      default: return sum(field);
    }
  }
  function nearestWeekday(daysArr, dow, dom) {
    let best = null, bd = 99;
    daysArr.forEach(d => { if (d.dow === dow) { const dist = Math.abs((d.dom || 0) - dom); if (dist < bd) { bd = dist; best = d; } } });
    return best;
  }
  const COMPARE_MODES = [
    { key: "dod", short: "Day on day", note: "vs previous day" },
    { key: "wow", short: "Week on week", note: "vs 7 days ago" },
    { key: "mom", short: "Month on month", note: "MTD vs last month" },
    { key: "sdpm", short: "Same date last mo.", note: "same date last month" },
    { key: "swpm", short: "Same weekday last mo.", note: "same weekday last month" },
    { key: "target", short: "vs Target", note: "vs target pace" },
  ];
  // unified comparison engine: returns {cur,prev,delta,pct,costMetric,note} or null
  function compare(field, mode, cur, prevM) {
    if (!cur || !cur.days || !cur.days.length) return null;
    const days = cur.days, last = days[days.length - 1];
    const cost = /cac|spend|cpc|cpl|returns/i.test(field);
    const out = (c, p, note) => (c == null && p == null) ? null : ({
      cur: c, prev: p, delta: (c != null && p != null) ? c - p : null,
      pct: (c != null && p != null && p !== 0) ? (c - p) / Math.abs(p) : null, costMetric: cost, note,
    });
    if (mode === "dod") { const p = days[days.length - 2]; return out(last[field], p ? p[field] : null, "vs previous day"); }
    if (mode === "wow") { const p = days[days.length - 8]; return p ? out(last[field], p[field], "vs 7 days ago") : null; }
    if (mode === "mom") { if (!prevM) return null; return out(aggField(days, field), aggField(prevM.days, field, days.length), "MTD vs last month"); }
    if (mode === "sdpm") { if (!prevM) return null; const p = prevM.days.find(d => d.dom === last.dom); return p ? out(last[field], p[field], "same date last month") : null; }
    if (mode === "swpm") { if (!prevM || last.dow == null) return null; const p = nearestWeekday(prevM.days, last.dow, last.dom); return p ? out(last[field], p[field], "same weekday last month") : null; }
    if (mode === "target") {
      const n = days.length, M = cur.monthDays || 30;
      if (field === "gross") { if (!cur.targetRev) return null; return out(aggField(days, "gross"), cur.targetRev * n / M, "MTD vs target pace"); }
      if (field === "spend") { const b = cur.targets && cur.targets.budget; if (!b) return null; return out(aggField(days, "spend"), b * n / M, "MTD vs budget pace"); }
      if (field === "roas") { const tr = cur.targets && cur.targets.roas; if (!tr) return null; return out(aggField(days, "roas"), tr, "vs target ROAS"); }
      return null;
    }
    return null;
  }
  // which modes actually yield a value for a metric, given the data on hand
  function availableModes(field, cur, prevM) {
    return COMPARE_MODES.filter(m => compare(field, m.key, cur, prevM) != null);
  }

  // Trend-based End-of-Month projection with scenarios, confidence and an insight.
  function projectEOM(parsed) {
    const days = parsed.days, n = days.length, M = parsed.monthDays || 30, rem = Math.max(0, M - n);
    const gross = days.map(d => d.gross).filter(v => v != null);
    if (!gross.length) return null;
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const mtd = parsed.totals.gross;
    const recent = gross.slice(-7), recentMean = mean(recent), allMean = mean(gross);
    const runRate = recentMean * 0.7 + allMean * 0.3;            // weight recent pace
    const sd = recent.length > 1 ? Math.sqrt(mean(recent.map(v => (v - recentMean) ** 2))) : 0;
    const expected = mtd + runRate * rem;
    const best = mtd + (recentMean + sd) * rem;
    const worst = mtd + Math.max(0, recentMean - sd) * rem;
    const cv = recentMean ? sd / recentMean : 1;                 // coefficient of variation
    const confidence = Math.max(0.3, Math.min(0.95, 1 - cv));
    const confLabel = confidence >= 0.7 ? "High" : confidence >= 0.5 ? "Medium" : "Low";
    const targetRev = parsed.targetRev;
    const variance = targetRev != null ? expected - targetRev : null;
    const variancePct = (targetRev) ? variance / targetRev : null;
    const neededDaily = (targetRev && rem) ? Math.max(0, (targetRev - mtd) / rem) : null;
    const lift = (neededDaily != null && recentMean) ? (neededDaily - recentMean) / recentMean : null;
    const willHit = targetRev != null ? expected >= targetRev : null;
    return {
      expected, best, worst, confidence, confLabel, runRate, recentMean, rem, daysElapsed: n, monthDays: M,
      targetRev, variance, variancePct, neededDaily, lift, willHit,
      recentWindow: recent.length,
    };
  }

  // card summary
  function summaryOf(parsed) {
    if (!parsed) return null;
    const t = parsed.totals;
    return {
      monthLabel: parsed.monthLabel, currency: parsed.currency,
      revenue: t.gross, spend: t.spend, roas: t.roas, orders: t.orders,
      achievement: parsed.achievement, daysElapsed: parsed.daysElapsed, monthDays: parsed.monthDays,
      lastDate: parsed.days.length ? parsed.days[parsed.days.length - 1].date : null,
      revDelta: delta(parsed.days, "gross"), roasDelta: delta(parsed.days, "roas"),
    };
  }

  // Day-on-day signal engine: flags notable/"crazy" daily changes (latest day vs the
  // day before, plus anomalies vs the trailing 7-day average) per brand. Returns
  // structured signals (the view formats the numbers) sorted most-severe first.
  const SEV_RANK = { bad: 3, warn: 2, good: 1, info: 0 };
  function drrSignals(parsed) {
    const days = (parsed && parsed.days) || [];
    if (days.length < 2) return [];
    const last = days[days.length - 1], prev = days[days.length - 2];
    const recent = days.slice(Math.max(0, days.length - 8), days.length - 1);
    const avgOf = f => { const v = recent.map(d => d[f]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const S = [];
    const add = (sev, metric, dir, pct, cur, prv, msg, base) => S.push({ sev, metric, dir, pct, cur, prev: prv, msg, base: base || "vs yesterday" });
    const dod = f => { const c = last[f], p = prev[f]; if (c == null || p == null || p === 0) return null; return { c, p, pct: (c - p) / Math.abs(p) }; };
    const thr = { gross: .25, spend: .30, roas: .20, orders: .25, cac: .25, aov: .20, returns: .50 };
    let d;
    d = dod("gross"); if (d && Math.abs(d.pct) >= thr.gross) add(d.pct > 0 ? "good" : (d.pct <= -.4 ? "bad" : "warn"), "Revenue", d.pct > 0 ? "up" : "down", d.pct, d.c, d.p);
    d = dod("spend"); if (d && Math.abs(d.pct) >= thr.spend) add(d.pct > 0 ? (d.pct >= .5 ? "bad" : "warn") : "info", "Spend", d.pct > 0 ? "up" : "down", d.pct, d.c, d.p);
    d = dod("roas"); if (d && Math.abs(d.pct) >= thr.roas) add(d.pct > 0 ? "good" : (last.roas != null && last.roas < 1 ? "bad" : "warn"), "ROAS", d.pct > 0 ? "up" : "down", d.pct, d.c, d.p);
    d = dod("orders"); if (d && Math.abs(d.pct) >= thr.orders) add(d.pct > 0 ? "good" : "warn", "Orders", d.pct > 0 ? "up" : "down", d.pct, d.c, d.p);
    d = dod("cac"); if (d && Math.abs(d.pct) >= thr.cac) add(d.pct > 0 ? "bad" : "good", "CAC", d.pct > 0 ? "up" : "down", d.pct, d.c, d.p);
    d = dod("aov"); if (d && Math.abs(d.pct) >= thr.aov) add(d.pct > 0 ? "good" : "info", "AOV", d.pct > 0 ? "up" : "down", d.pct, d.c, d.p);
    d = dod("returns"); if (d && Math.abs(d.pct) >= thr.returns && d.c > 0) add(d.pct > 0 ? "warn" : "good", "Returns", d.pct > 0 ? "up" : "down", d.pct, d.c, d.p);
    // level flags
    if (last.roas != null && last.roas < 1) add("bad", "ROAS", "down", null, last.roas, prev.roas, "Unprofitable today — ROAS below 1×");
    // efficiency combo: spend climbing faster than revenue
    const sg = dod("spend"), gg = dod("gross");
    if (sg && gg && sg.pct >= .2 && gg.pct <= .05) add("warn", "Efficiency", "up", null, null, null, "Spend rose " + Math.round(sg.pct * 100) + "% but revenue didn’t follow");
    // anomaly vs trailing 7-day average
    const ag = avgOf("gross");
    if (ag && last.gross != null) { const r = last.gross / ag; if (r >= 1.6) add("good", "Revenue", "up", r - 1, last.gross, ag, "Well above the 7-day average", "vs 7-day avg"); else if (r <= .5) add("warn", "Revenue", "down", r - 1, last.gross, ag, "Well below the 7-day average", "vs 7-day avg"); }
    // keep one signal per metric+base (highest severity wins), then sort
    const seen = {}; const uniq = [];
    S.sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev]);
    S.forEach(s => { const k = s.metric + "|" + s.base; if (!seen[k]) { seen[k] = 1; uniq.push(s); } });
    return uniq;
  }
  function drrAlert(parsed) { const s = drrSignals(parsed); return { sev: s.length ? s[0].sev : null, count: s.length, top: s[0] || null, signals: s }; }

  window.DRRService = { registry, setOverrides, getOverrides, parseSheetId, fetchBrand, fetchWorkbook, summaryOf, delta, seriesOf, pool, parseDRR, numify, compare, availableModes, COMPARE_MODES, aggField, projectEOM, drrSignals, drrAlert, SEV_RANK };
})();
