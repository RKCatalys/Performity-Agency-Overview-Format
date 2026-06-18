/* app-config.js — application-level configuration.
   The permanent Google Sheet that powers every dashboard, report, insight and
   forecast. Users never upload or paste a URL; the app always reads this sheet.
   The sheet must stay shared "Anyone with the link → Viewer". */
window.PERFORMITY = {
  sheetId: "1KK11H23QR1yhDNFGIIhwigypvwV0VXzRNnWlxp9-Euk",
  refreshMinutes: 30,   // auto-refresh interval
};
