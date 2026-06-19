/* drr.js — All-DRR service: connector + smart mapping + delta/trend engines.
   Reads each brand's per-month DRR tab via the lightweight gviz CSV endpoint,
   auto-detects headers, normalizes to a common shape. No uploads, no hardcoded
   column positions. Exposes window.DRR. */
(function () {
  const CACHE_PREFIX = "perf.drr.v1.";
  const TTL = 30 * 60 * 1000;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function registry() { return (window.PERFORMITY && window.PERFORMITY.drrSheets) || []; }

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
    if (/^date$|^day$/.test(t) || /date/.test(t)) return "date";
    return null;
  }
  const TARGET_LABELS = { "target budget": "budget", "target revenue": "revRevenue", "target roas": "roas", "target gross": "revGross", "month days": "monthDays", "monthly target": "revRevenue" };

  const DATE_RE = /^\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4}$|^\d{4}-\d\d-\d\d|^\d{1,2}\/\d{1,2}\/\d{2,4}/;
  const isDateCell = (v) => typeof v === "string" && DATE_RE.test(v.trim());

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
    const monthLabel = (rows[1] && String(rows[1][0] || "").trim()) || (rows[0] && /\b\d{2}\b/.test(String(rows[0][0])) && String(rows[0][0])) || fallbackMonth;
    // currency from a sample money cell
    let currency = currencyHint || "₹";
    if (!currencyHint) {
      const probe = String((rows[hdr + 1] || [])[colMap.gross != null ? colMap.gross : colMap.spend] || "");
      if (/\$/.test(probe)) currency = "$"; else if (/€/.test(probe)) currency = "€"; else if (/£/.test(probe)) currency = "£";
    }

    const days = [];
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const dateCell = String(r[colMap.date] == null ? "" : r[colMap.date]).trim();
      if (!dateCell || /total/i.test(dateCell)) { if (days.length) break; else continue; }
      if (!/\d/.test(dateCell)) continue;
      const get = (f) => colMap[f] != null ? numify(r[colMap[f]]) : null;
      const spend = get("spend") != null ? get("spend") : ((get("metaSpend") || 0) + (get("googleSpend") || 0)) || null;
      const gross = get("gross"), net = get("net");
      const d = {
        date: dateCell, spend, metaSpend: get("metaSpend"), googleSpend: get("googleSpend"),
        gross, returns: get("returns"), net: net != null ? net : gross,
        roas: get("grossRoas") != null ? get("grossRoas") : (get("roas") != null ? get("roas") : (spend ? (gross || 0) / spend : null)),
        netRoas: get("netRoas") != null ? get("netRoas") : (spend ? ((net != null ? net : gross) || 0) / spend : null),
        orders: get("orders"), aov: get("aov"), cac: get("cac"),
      };
      if (d.spend != null || d.gross != null) days.push(d);
      if (days.length >= 31) break;
    }
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
    const monthDays = targets.monthDays || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
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

  window.DRRService = { registry, fetchBrand, summaryOf, delta, seriesOf, pool, parseDRR, numify };
})();
