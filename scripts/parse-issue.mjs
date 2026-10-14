#!/usr/bin/env node
// Parse a GitHub issue-form body and print { packId, packName, zipUrl } as JSON.
// Usage: node scripts/parse-issue.mjs <issue-body-file>

import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: parse-issue.mjs <issue-body-file>");
  process.exit(2);
}
const body = fs.readFileSync(file, "utf8");

function field(label) {
  // Issue forms render as: "### <label>\n\n<value>"
  const re = new RegExp(
    "###\\s*" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\n+([\\s\\S]*?)(?=\\n###\\s|$)",
    "i",
  );
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

const packId = (field("套装 id") || "").replace(/[`*]/g, "").trim().toLowerCase();
const packName = (field("套装名称") || "").replace(/\r/g, "").trim();
let zipUrl = (field("打包文件直链") || "").replace(/[<>\s]/g, "").replace(/^`|`$/g, "");

// First URL in the field wins
const urlMatch = zipUrl.match(/https?:\/\/[^\s)]+/i);
zipUrl = urlMatch ? urlMatch[0] : "";

console.log(JSON.stringify({ packId, packName, zipUrl }));
