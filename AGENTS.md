# whale-star

按 GitHub 仓库 star 数自动切换「蓝色大肥鱼」插画档位的 README 组件。
线上：https://whale-star.whale-star.workers.dev/ ｜ 仓库：https://github.com/yschdxm/whale-star

给 AI agent / 维护者的操作指南。**用户接入方式见 README.md，开发流水线细节见 DEVELOPMENT.md。**

## 修改方式

所有改动都在本仓库内编辑，然后用 wrangler 部署，不经过 Cloudflare 后台网页：

| 改什么 | 动哪里 |
|---|---|
| 档位逻辑 / 星数叠加 / 统计（验证计数、cron、/api/repos）/ 徽章 | `src/index.js` |
| 介绍页 | `assets/index.html` |
| 套装（图片 + 阈值文案） | `assets/packs/<id>/`（`pack.json` + t*.webp）+ `assets/packs/index.json` 登记 |
| 绑定 / DO 迁移 | `wrangler.jsonc` |
| PR 自动校验与发布 | `.github/workflows/pack-*.yml`、`scripts/validate-pack.mjs` |

关键行为（改代码前必读）：

- `wrangler.jsonc` 里 `assets.run_worker_first: true` **不能删**——它保证每次请求都经过 Worker（统计精确、静态资源路由都依赖它）。
- 生产图片响应是 **SVG**（档位 WebP 内嵌 base64 + 右下角实时星数胶囊），GitHub API 失败时回退为 T0 WebP。
- 统计走 Durable Object（`StatsDO`，绑定名 `STATS`）：`/api/stats` 供介绍页，`/api/repos` 供分页名单+双榜（`max-age=600`），`/badge` 供 README 徽章。计数在 `ctx.waitUntil` 里异步打点，绝不阻塞出图。
- **计数是「验证后计数」**：只有 README 里真实嵌入本服务（含域名且含 `repo=owner/name`）的仓库才累计。每仓库每天最多校验 3 次、两次校验至少间隔 2 小时；GitHub API 失败时本次不计数、不耗预算。每日 cron（04:00 UTC）复验全名单，已移除嵌入的仓库连同榜单条目剔除。
- 星数有 300s 边缘缓存；`/preview/count` 是测试路由，生产路径之外。

## 上线方式

```bash
cd whale-star
npm install                 # 首次；之后一般不用
npx wrangler login          # 首次：浏览器 OAuth，凭据存本机，之后免登
npx wrangler deploy         # 发布（代码+静态资产整体上传，生成新 Version）
```

- 凭据：本机 OAuth（`~\AppData\Roaming\xdg.config\.wrangler\`），**不要把任何 token 写进仓库**。
- 社区 PR 合并后的自动部署走 GitHub Actions secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`（与本机登录无关）。
- 回滚：Cloudflare 后台 → Workers & Pages → whale-star → Deployments → 选旧版本。
- 敏感操作（`wrangler secret put`、删资源）先向仓库主确认。

## 常用验证

```bash
npx wrangler dev --port 8787     # 本地起服务
# /health | /（介绍页）| /?repo=owner/name（档位图+星数）| /badge | /api/stats | /api/repos
curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"   # 本地手动触发每日复验 cron
```

线上自检：`curl -sD - -o /dev/null "https://whale-star.whale-star.workers.dev/?repo=yschdxm/whale-star"`
看 `X-Route: tier-svg`、`X-Star-Count`、`X-Star-Tier` 三个响应头。
（自检不要用 `octocat/Hello-World`——它是文档示例、README 未嵌入本服务，验证后计数不会给它计数，只白耗一次校验。）
