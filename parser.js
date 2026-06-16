/* parser.js — Performity Excel → window.AGENCY / window.WEEKLY / window.WEEKLY_META
   Pure browser JS. Operates on a SheetJS workbook. Validated 1:1 against the
   hand-derived data.js / weekly-data.js golden output. No build step required.

   Usage:
     const wb = XLSX.read(arrayBuffer, { type: "array" });
     const { AGENCY, WEEKLY, WEEKLY_META } = PerformityParser.parse(wb);
*/
(function () {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const META_SHEETS = new Set([
    "1. summary","2. qoq","week calendar","all drr","helper",
    "brand & tl index","playbook & insights"
  ]);

  // ---- brand-sheet column geometry (0-indexed; col 0 = metric label) ----
  // each month = 6 week cols + 1 "Mo" col; a "Qtr" col follows every 3 months;
  // a final YEAR/CY26 col follows Q4's qtr col.
  const MONTH_COLS = [];   // [{weeks:[6 idx], mo: idx}]
  const QTR_COLS = [];     // [4 idx]
  let YEAR_COL;
  (function geometry() {
    let idx = 1;
    for (let q = 0; q < 4; q++) {
      for (let m = 0; m < 3; m++) {
        const weeks = [idx, idx + 1, idx + 2, idx + 3, idx + 4, idx + 5];
        MONTH_COLS.push({ weeks, mo: idx + 6 });
        idx += 7;
      }
      QTR_COLS.push(idx); idx += 1;
    }
    YEAR_COL = idx; // 89
  })();

  const norm = (s) => (s == null ? "" : String(s).toLowerCase().replace(/[^a-z0-9]/g, ""));

  function numify(v) {
    if (v == null) return null;
    if (typeof v === "number") return isNaN(v) ? null : v;
    let s = String(v).trim();
    if (s === "" || s === "-" || s === "—" || s === "–" ||
        /^n\/?a$/i.test(s) || s === "#DIV/0!") return null;
    s = s.replace(/,/g, "").replace(/₹/g, "").replace(/%/g, "")
         .replace(/x/gi, "").replace(/×/g, "").trim();
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  const cell = (row, i) => (row && i < row.length ? row[i] : null);
  const get = (row, i) => numify(cell(row, i));

  function rowsOf(wb, name) {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }

  // fuzzy match a name to a canonical brand-tab name
  function bestMatch(target, candidates /* [{k,o}] */) {
    const t = norm(target);
    for (const c of candidates) if (c.k === t) return c.o;
    let best = null, bestLen = 0;
    for (const c of candidates) {
      if (c.k.startsWith(t) || t.startsWith(c.k)) {
        const ov = Math.min(c.k.length, t.length);
        if (ov > bestLen) { bestLen = ov; best = c.o; }
      }
    }
    if (best) return best;
    for (const c of candidates) {
      let p = 0;
      const n = Math.min(c.k.length, t.length);
      for (let i = 0; i < n; i++) { if (c.k[i] === t[i]) p++; else break; }
      if (p >= 6 && p > bestLen) { bestLen = p; best = c.o; }
    }
    return best;
  }

  // ---- MoM metric label → canonical key (Gross ROAS intentionally dropped) ----
  const MOM_MAP = {
    "ad spend": "Ad Spend", "gst spend": "GST Spend",
    "shopify gross sales": "Shopify Gross Sales", "dashboard revenue": "Dashboard Revenue",
    "dashboard roas": "Dashboard ROAS", "gst roas": "GST ROAS", "net roas": "Net ROAS",
    "orders": "Orders", "aov": "AOV", "cac": "CAC"
  };

  function isSectionHeader(lbl) {
    // Section banners are ALL-CAPS ("SHOPIFY (STORE)"); metric rows are Title Case
    // ("Shopify Gross Sales"). Reject anything containing a lowercase letter so that
    // metrics beginning with a section word don't falsely start a new section.
    const letters = String(lbl).replace(/[^A-Za-z]/g, "");
    if (!letters || /[a-z]/.test(letters)) return false;
    const u = String(lbl).toUpperCase();
    return u.startsWith("OVERALL") || u.startsWith("META") || u.startsWith("GOOGLE") ||
           u.startsWith("OTHER") || u.startsWith("SHOPIFY");
  }
  function sectionOf(lbl) {
    const u = norm(lbl);
    if (u.startsWith("overall")) return "overall";
    if (u.startsWith("meta")) return "meta";
    if (u.startsWith("google")) return "google";
    if (u.startsWith("other")) return "other";
    if (u.startsWith("shopify")) return "shopify";
    return null;
  }

  function parseBrandSheet(rows) {
    // some sheets put the title/section banners in column B (col A empty) — read both
    const txt = (r, i) => { const v = cell(r, i); return typeof v === "string" ? v.trim() : ""; };
    let tlLine = null, gst = null;
    for (let i = 0; i < Math.min(7, rows.length); i++) {
      const s = txt(rows[i], 0) || txt(rows[i], 1);
      if (s.toLowerCase().startsWith("tl ")) tlLine = s;
      if (s.toLowerCase().includes("gst") && s.includes("%")) gst = get(rows[i], 1) != null ? get(rows[i], 1) : get(rows[i], 2);
    }
    // week date ranges from the header row (e.g. "W1\n01-07" -> "01-07")
    let hdrRow = null;
    for (const r of rows) { if (norm(txt(r, 0)) === "metric" || norm(txt(r, 1)) === "metric") { hdrRow = r; break; } }
    const weekDates = MONTH_COLS.map(({ weeks }) => weeks.map((c) => {
      const v = hdrRow ? cell(hdrRow, c) : null;
      if (typeof v !== "string") return null;
      const parts = v.split(/\n/); const d = parts.length > 1 ? parts[1].trim() : null;
      return (!d || d === "—" || d === "-") ? null : d;
    }));

    const weekly = {};
    const channels = { meta: {}, google: {}, other: {}, shopify: {} };
    let cur = null;
    for (const r of rows) {
      const a = cell(r, 0);
      // section banner may live in col A or (when A is blank) col B
      if (a == null || !String(a).trim()) {
        const b = txt(r, 1);
        if (b && isSectionHeader(b)) { cur = sectionOf(b); weekly[cur] = { order: [], metrics: {} }; }
        continue;
      }
      const lbl = String(a).trim();
      if (isSectionHeader(lbl)) {
        cur = sectionOf(lbl); weekly[cur] = { order: [], metrics: {} }; continue;
      }
      if (lbl.toLowerCase().includes("channel breakdown")) continue;
      if (cur == null) continue;
      if (norm(lbl) === "metric") continue; // column-header row, not a metric
      const name = lbl.replace(/\s+/g, " ").trim();
      const months = MONTH_COLS.map(({ weeks, mo }) => {
        const w = weeks.map((c) => get(r, c));
        // trim trailing empties (None or a stray 0) so week counts match the calendar
        while (w.length && (w[w.length - 1] == null || w[w.length - 1] === 0)) w.pop();
        return { weeks: w, mo: get(r, mo) };
      });
      const quarters = QTR_COLS.map((c) => get(r, c));
      const year = get(r, YEAR_COL);
      weekly[cur].order.push(name);
      weekly[cur].metrics[name] = { months, quarters, year };
      if (channels[cur]) channels[cur][name] = year;
    }
    // guarantee all sections exist (views assume order:[] + metrics:{})
    for (const s of ["overall","meta","google","other","shopify"])
      if (!weekly[s]) weekly[s] = { order: [], metrics: {} };
    return { weekly, channels, tlLine, gst, weekDates };
  }

  function mkSummaryRow(r, name, gross, spend) {
    const grossRoas = gross != null ? (spend ? gross / spend : null) : (spend ? 0 : null);
    return {
      name, spend: spend || 0, gstSpend: get(r, 2) || 0,
      grossSales: gross || 0, dashRev: get(r, 5) || 0,
      dashRoas: get(r, 6), grossRoas,
      gstRoas: get(r, 8), netRoas: get(r, 9),
      orders: get(r, 10) || 0, aov: get(r, 11), cac: get(r, 12)
    };
  }

  function rollup(summary) {
    const f = (k) => summary.reduce((a, b) => a + (b[k] || 0), 0);
    const spend = f("spend"), gst = f("gstSpend"), gross = f("grossSales"),
          rev = f("dashRev"), orders = f("orders");
    return {
      spend, gstSpend: gst, grossSales: gross, dashRev: rev,
      dashRoas: spend ? rev / spend : null,
      grossRoas: spend ? gross / spend : null,
      gstRoas: gst ? gross / gst : null,
      orders,
      aov: orders ? gross / orders : null,
      cac: orders ? spend / orders : null
    };
  }

  function parseMom(sumrows, AGENCY, cand) {
    let start = -1;
    for (let i = 0; i < sumrows.length; i++) {
      const a = cell(sumrows[i], 0);
      if (typeof a === "string" && norm(a).includes("monthonmonth")) { start = i; break; }
    }
    if (start < 0) return;
    let i = start + 1;
    while (i < sumrows.length) {
      const r = sumrows[i], a = cell(r, 0);
      if (a && String(a).trim()) {
        const au = norm(a);
        const nxt = sumrows[i + 1] || [];
        if (au !== "metric" && typeof cell(nxt, 0) === "string" && norm(cell(nxt, 0)) === "metric") {
          const canon = bestMatch(a, cand) || String(a).trim();
          const metrics = {};
          let j = i + 2;
          while (j < sumrows.length) {
            const rr = sumrows[j], lbl = cell(rr, 0);
            if (lbl == null || !String(lbl).trim()) break;
            if (norm(lbl) === "metric") break;
            const nn = sumrows[j + 1] || [];
            if (typeof cell(nn, 0) === "string" && norm(cell(nn, 0)) === "metric") break;
            // a brand metered in leads/CPL rather than orders/CAC is a lead-gen model
            if (/lead|cpl/i.test(String(lbl))) AGENCY.leadGen[canon] = true;
            const baseLabel = String(lbl).split("/")[0].trim().toLowerCase().replace(/\s+/g, " ");
            const key = MOM_MAP[baseLabel];
            if (key) {
              const arr = [];
              for (let c = 1; c <= 12; c++) arr.push(get(rr, c));
              metrics[key] = arr;
            }
            j++;
          }
          AGENCY.mom[canon.toUpperCase()] = metrics;
          i = j; continue;
        }
      }
      i++;
    }
  }

  function parseTl(rows, AGENCY, cand) {
    if (!rows.length) return;
    let hdr = -1;
    for (let i = 0; i < rows.length; i++)
      if (typeof cell(rows[i], 0) === "string" && norm(cell(rows[i], 0)) === "brand") { hdr = i; break; }
    if (hdr < 0) return;
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i], nm = cell(r, 0);
      if (nm == null || !String(nm).trim()) continue;
      const canon = bestMatch(nm, cand) || String(nm).trim();
      const s = (idx) => {
        const v = cell(r, idx);
        if (v == null) return null;
        const t = String(v).trim();
        return (t === "" || t === "-" || t === "Not Started") ? null : t;
      };
      AGENCY.tl[canon] = { tlMeta: s(1), tlGoogle: s(2), comment: s(3), note: s(4) };
    }
  }

  function parsePlaybook(rows) {
    if (!rows.length) return [];
    let hdr = -1;
    for (let i = 0; i < rows.length; i++) {
      const a = cell(rows[i], 0);
      if (typeof a === "string" && norm(a) === "" + norm("#")) { hdr = i; break; }
      if (a === "#") { hdr = i; break; }
    }
    if (hdr < 0) return [];
    const out = [];
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i];
      const date = cell(r, 1), acct = cell(r, 2), what = cell(r, 3);
      if (!acct && !what) continue;
      out.push({
        date: date ? String(date) : null,
        account: acct ? String(acct) : null,
        what: what ? String(what) : null,
        why: cell(r, 4) ? String(cell(r, 4)) : null,
        status: cell(r, 5) ? String(cell(r, 5)) : null,
        insights: cell(r, 6) ? String(cell(r, 6)) : null,
        nextAction: cell(r, 7) ? String(cell(r, 7)) : null
      });
    }
    return out;
  }

  function parse(wb) {
    const sheetNames = wb.SheetNames;
    const brandTabs = sheetNames.filter((n) => !META_SHEETS.has(n.trim().toLowerCase()));

    const yearLabel = (() => {
      // try to read a CY label from the summary title
      const sr = rowsOf(wb, sheetNames.find((n) => n.trim().toLowerCase() === "1. summary"));
      for (const r of sr.slice(0, 4)) {
        const a = cell(r, 0);
        const m = a && String(a).match(/CY\s?20\d\d|FY\s?20\d\d|20\d\d/);
        if (m) return m[0].replace(/\s/g, "");
      }
      return "CY2026";
    })();

    const AGENCY = { meta: { year: yearLabel, months: MONTHS },
                     summary: [], grandTotal: {}, mom: {}, tl: {}, channels: {}, leadGen: {} };
    const WEEKLY = {}, WEEKLY_META = {};

    // per-brand sheets
    for (const tab of brandTabs) {
      const parsed = parseBrandSheet(rowsOf(wb, tab));
      WEEKLY[tab] = parsed.weekly;
      AGENCY.channels[tab] = parsed.channels;
      WEEKLY_META[tab] = { tl: parsed.tlLine, gst: parsed.gst, weekDates: parsed.weekDates };
    }
    const cand = brandTabs.map((t) => ({ k: norm(t), o: t }));

    // summary table
    const sumName = sheetNames.find((n) => n.trim().toLowerCase() === "1. summary");
    const sumrows = rowsOf(wb, sumName);
    let hdr = -1;
    for (let i = 0; i < sumrows.length; i++)
      if (typeof cell(sumrows[i], 0) === "string" && norm(cell(sumrows[i], 0)) === "accounts") { hdr = i; break; }
    for (let i = hdr + 1; i < sumrows.length; i++) {
      const r = sumrows[i], nm = cell(r, 0);
      if (nm == null || !String(nm).trim()) continue;
      const u = norm(nm);
      if (u.includes("grandtotal")) break;
      if (u.includes("monthonmonth")) break;
      const canon = bestMatch(nm, cand) || String(nm).trim();
      AGENCY.summary.push(mkSummaryRow(r, canon, get(r, 3), get(r, 1)));
    }

    parseMom(sumrows, AGENCY, cand);
    parseTl(rowsOf(wb, sheetNames.find((n) => n.trim().toLowerCase() === "brand & tl index")), AGENCY, cand);
    AGENCY.grandTotal = rollup(AGENCY.summary);
    AGENCY.playbook = parsePlaybook(rowsOf(wb, sheetNames.find((n) => n.trim().toLowerCase() === "playbook & insights")));

    return { AGENCY, WEEKLY, WEEKLY_META };
  }

  // ---- derived rows ----
  // Element-wise ratio of two metric objects ({months,quarters,year}); null where denominator is 0/null.
  function ratioRow(num, den) {
    if (!num || !den) return null;
    const div = (a, b) => (a != null && b != null && b !== 0) ? a / b : null;
    const months = num.months.map((m, i) => {
      const dm = den.months[i] || { weeks: [], mo: null };
      const weeks = m.weeks.map((w, wi) => div(w, dm.weeks[wi]));
      while (weeks.length && weeks[weeks.length - 1] == null) weeks.pop();
      return { weeks, mo: div(m.mo, dm.mo) };
    });
    const quarters = num.quarters.map((q, i) => div(q, (den.quarters || [])[i]));
    return { months, quarters, year: div(num.year, den.year) };
  }

  // Adds a derived "Gross ROAS" row (Shopify Gross Sales / Total Ad Spend) to every
  // brand's blended-store section, so it shows for all brands — not just ones whose
  // sheet happened to include it. Idempotent; skips if already present.
  function augmentWeekly(WEEKLY) {
    Object.keys(WEEKLY || {}).forEach((k) => {
      const ov = WEEKLY[k] && WEEKLY[k].overall;
      if (!ov || !ov.metrics || ov.metrics["Gross ROAS"]) return;
      const gross = ov.metrics["Shopify Gross Sales"];
      const spend = ov.metrics["Total Ad Spend"] || ov.metrics["Spend"];
      const row = ratioRow(gross, spend);
      if (!row) return;
      ov.metrics["Gross ROAS"] = row;
      const i = ov.order.indexOf("Dashboard ROAS");
      if (i >= 0) ov.order.splice(i + 1, 0, "Gross ROAS");
      else ov.order.push("Gross ROAS");
    });
    return WEEKLY;
  }

  window.PerformityParser = { parse, augmentWeekly };
})();
