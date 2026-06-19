/* app-config.js — application-level configuration.
   The permanent Google Sheet that powers every dashboard, report, insight and
   forecast. Users never upload or paste a URL; the app always reads this sheet.
   The sheet must stay shared "Anyone with the link → Viewer". */
window.PERFORMITY = {
  sheetId: "1KK11H23QR1yhDNFGIIhwigypvwV0VXzRNnWlxp9-Euk",
  refreshMinutes: 30,   // auto-refresh interval
  // Per-brand DRR (Daily Run-Rate) Google Sheets. Add new brands here only —
  // the All-DRR hub reads them all automatically (each must be shared view-only).
  drrSheets: [
    { name: "Advait",          id: "1g0vD660kCVpIqmEjbqrWgvm4ooBLMK0azDztOyw528Q" },
    { name: "Axesouar",        id: "1MQSOBbN0snFkdEpbsgMnWbFOuoTQqIz-0Sv67Awtbeo" },
    { name: "Bxxy Shoes",      id: "16CJx_mxWqWrEIitur6T26WRYN5c59gT0V6iK19bqFAM" },
    { name: "CarbonTree",      id: "1yEPkqVp-8Zghg73HOx7KHRKCAbSGwwcDn2d9R0RoJ-8" },
    { name: "Dhaaga Life",     id: "1DdSN5ExdrACh9cNbbXzXaKp18Y7FF1XKwS_0_57sm0w" },
    { name: "Giama Label",     id: "1albJQtkB4w8AppT__vOU290YCGv6RjsmmhBS4Crrot0" },
    { name: "HOC",             id: "1RLbxzOzaKJpS4QhGsKKVZydLKFGtiQI80MG88PegB3I" },
    { name: "HOM",             id: "10BLvayJANGIicQEUGU8kd80jh87-fbkLyDMzgCSyO88" },
    { name: "Hatkay",          id: "1D38K-_4nhcbKHkZ0sdB0mLTdQ3HlSnUz2W9PV_GeolM" },
    { name: "Kennel Kitchen",  id: "1b3Hwcr-86YHq-V6B4ORvl4wBc4zJ01uFZYst5X31mWg" },
    { name: "LOM",             id: "1sGXq9DyphdpN-RLMUzO68RBXKsYDepE_oZmU1D4k18o" },
    { name: "Mitali Wadhwa",   id: "1F_W-NfN_nrGat85o_d8_jUGmlseTGTcFvtBWeJqfaUk" },
    { name: "Oshin",           id: "1xs21PQARCXu3SuQyv-DzHkY1teU7RD6AP6xG5jLsaxs" },
    { name: "Powersutra",      id: "1MKILRCdHu_iMtjObqfbU4z3jBe_EsBdL9DYtHPHe9fk" },
    { name: "Q Moms",          id: "1d22U5GyQjmjgLTtQ_-1kU_BxJ52T_t__bHDxUvT7bog" },
    { name: "TSV",             id: "1ApCHUes9qEu5mF4s5qqyh2RViF4czyHTmJwYbOMOssE" },
    { name: "Tonoto",          id: "1fExsMwG6cFtJ9iA6h8fb7eVYuw0M0sizDmWcgZ1nTwc" },
    { name: "Vedic Essential", id: "1aKcjrNeA5tkyb61Eg3ehnkI94ThP4TGwcNiGK0tVUpE" },
    { name: "Verlas India",    id: "191bWVrBkh7uy70wxspNEx4yHfQbsbmbjX1EBc7e5Z9k" },
    { name: "Verlas USA",      id: "14q65KUxK6KfI_kajyXAIDcAPQi8yY9MRCaYkXCTqdCU", currency: "$" },
  ],
};
