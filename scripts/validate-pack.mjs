#!/usr/bin/env node
// Validate a pack directory (repo path, e.g. assets/packs/<id>).
// Usage: node scripts/validate-pack.mjs <dir> <expected-id> [index.json path]
// Prints one error per line to stderr and exits 1 on any failure.

import fs from "node:fs";
import path from "node:path";

const [dir, expectedId, indexPath] = process.argv.slice(2);
const errors = [];
const err = (m) => errors.push(m);

if (!dir || !expectedId) {
  console.error("usage: validate-pack.mjs <dir> <expected-id>");
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]{0,32}$/.test(expectedId)) {
  err(`pack id "${expectedId}" 不合法：小写字母/数字/连字符，≤32 字符`);
}

const packPath = path.join(dir, "pack.json");
if (!fs.existsSync(packPath)) {
  err("缺少 pack.json（zip 根目录）");
  finish();
}

let pack;
try {
  pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
} catch (e) {
  err(`pack.json 不是合法 JSON: ${e.message}`);
  finish();
}

if (pack.schema !== 1) err(`pack.json schema 应为 1，实际 ${JSON.stringify(pack.schema)}`);
if (pack.id !== expectedId) err(`pack.json id 应为 "${expectedId}"，实际 ${JSON.stringify(pack.id)}`);
if (typeof pack.name !== "string" || !pack.name.trim() || pack.name.length > 40) {
  err("pack.name 必须是 1–40 字符的非空字符串");
}
if (!pack.canvas || !Number.isFinite(pack.canvas.width) || !Number.isFinite(pack.canvas.height)) {
  err('pack.canvas 需要 {"width":1536,"height":1024} 形式的数字字段');
}
if (!Array.isArray(pack.tiers) || pack.tiers.length === 0) {
  err("pack.tiers 必须是非空数组");
  finish();
}

const tiers = pack.tiers;
const seenLevels = new Set();
const imageFiles = new Set();
let totalImageBytes = 0;

for (let i = 0; i < tiers.length; i++) {
  const t = tiers[i];
  const at = `tiers[${i}]`;
  if (!Number.isInteger(t.level) || t.level < 0 || seenLevels.has(t.level)) {
    err(`${at}.level 必须是不重复的非负整数`);
  } else {
    seenLevels.add(t.level);
  }
  if (!Number.isInteger(t.min) || t.min < 0) err(`${at}.min 必须是非负整数`);
  if (t.max !== null) {
    if (!Number.isInteger(t.max) || t.max < t.min) err(`${at}.max 必须为 null 或 >= min 的整数`);
  }
  if (i === 0 && t.min !== 0) err("第一档 min 必须为 0");
  if (i > 0) {
    const prev = tiers[i - 1];
    if (prev.max === null) err(`${at} 之前已有无上限档（max: null），不能在其后继续加档`);
    else if (Number.isInteger(t.min) && t.min !== prev.max + 1) {
      err(`${at}.min 应为 ${prev.max + 1}（与上一档衔接，不留空洞）`);
    }
  }
  if (typeof t.text !== "string" || !t.text.trim() || t.text.length > 24) {
    err(`${at}.text 必须是 1–24 字符的非空字符串`);
  }
  if (typeof t.image !== "string" || !/^[\w.-]+\.(webp|png)$/i.test(t.image) || t.image.includes("/") || t.image.includes("..")) {
    err(`${at}.image 必须是不含路径的 *.webp 或 *.png 文件名`);
  } else {
    imageFiles.add(t.image);
    const fp = path.join(dir, t.image);
    if (!fs.existsSync(fp)) {
      err(`${at}.image 文件不存在: ${t.image}`);
    } else {
      const size = fs.statSync(fp).size;
      totalImageBytes += size;
      if (size > 1_500_000) err(`${t.image} 过大（${size} 字节），单图请压到 1.5MB 以内（推荐 WebP q90）`);
    }
  }
}
if (tiers[tiers.length - 1].max !== null) err("最后一档 max 必须为 null（无上限）");
if (totalImageBytes > 15_000_000) err(`图片总体积 ${totalImageBytes} 字节超过 15MB 上限`);

// Reject unexpected top-level files (zip-slip leftovers etc.)
for (const name of fs.readdirSync(dir)) {
  if (name === "pack.json") continue;
  if (imageFiles.has(name)) continue;
  err(`目录内存在未引用的文件: ${name}`);
}

// Optional: index.json consistency (every pack must be listed and vice versa)
if (indexPath) {
  if (!fs.existsSync(indexPath)) {
    err(`找不到 ${indexPath}`);
  } else {
    try {
      const list = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      if (!Array.isArray(list)) {
        err("index.json 必须是数组");
      } else {
        const entry = list.find((p) => p.id === expectedId);
        if (!entry) {
          err(`index.json 缺少 id 为 "${expectedId}" 的条目`);
        } else if (typeof entry.name !== "string" || !entry.name.trim()) {
          err("index.json 条目缺少 name");
        } else if (entry.name !== pack.name && pack.name) {
          err(`index.json name（${entry.name}）与 pack.json name（${pack.name}）不一致`);
        }
        const extra = list.filter(
          (p) =>
            !fs.existsSync(path.join(path.dirname(indexPath), p.id, "pack.json")),
        );
        for (const p of extra) {
          err(`index.json 列出了不存在的套装目录: ${p.id}`);
        }
      }
    } catch (e) {
      err(`index.json 不是合法 JSON: ${e.message}`);
    }
  }
}

finish();

function finish() {
  if (errors.length) {
    for (const e of errors) console.error("ERROR: " + e);
    process.exit(1);
  }
  console.log("OK");
  process.exit(0);
}
