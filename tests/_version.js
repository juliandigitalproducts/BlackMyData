// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

// Current build version from strato_app.js and a numeric semver comparison (B34: "1.10.0" > "1.5.0").
const fs = require("fs");
const path = require("path");
const code = fs.readFileSync(path.join(__dirname, "../app/static/strato_app.js"), "utf8");
const current = (code.match(/const CURRENT_BUILD_VERSION = "([\d.]+)";/) || [])[1];
function compare(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
module.exports = { current, compare };
