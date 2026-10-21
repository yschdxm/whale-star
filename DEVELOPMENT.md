# 开发与部署文档

面向维护者：架构、部署、更新、扩展套装、本地开发。

## 架构

```
README <img> → GitHub camo → Cloudflare Worker → GitHub API（stargazers_count，缓存 5 分钟）
                                                      ↓
                                    按 pack.json 选档 → 返回对应 WebP
```

- Worker 收到 `?repo=owner/name` 后查星数，对照套装的 `tiers[]` 选档，从静态资产里取图返回。
- 不带 `repo` 的根路径返回单页介绍页（`assets/index.html`）。
- GitHub API 失败时回退 T0 图（`max-age=60`），保证 README 图不裂。
- `wrangler.jsonc` 中 `assets.run_worker_first: true` 必须保留：否则静态文件规则会拦截 `/?repo=` 请求。

## 目录结构

```
whale-star/
├── src/index.js                  # Worker：查星数 → 选档 → 回图 / 介绍页
├── assets/
│   ├── index.html                # 单页介绍页
│   └── packs/default/            # 默认套装 pack.json + t0–t9.webp
├── wrangler.jsonc
├── package.json                  # devDependencies: wrangler
└── README.md                     # 使用说明（面向使用者）
```

## 部署

```bash
cd whale-star
npm install
npx wrangler deploy
```

凭据用环境变量传入，不要写进文件：

```bash
export CLOUDFLARE_API_TOKEN=...   # 需要 Account Workers Scripts 编辑权限
export CLOUDFLARE_ACCOUNT_ID=...
```

### GitHub API 限额

未配置 token 时走匿名额度（60 次/小时/IP）；建议配置只读 token（5000 次/小时）：

```bash
npx wrangler secret put GITHUB_TOKEN
```

token 可用本地 `gh auth token` 的输出，或 GitHub 上建一个无权限勾选的只读 PAT。

## 调用统计（验证后计数）

- **写入**：每次 Worker 实际服务档位图（含回退档）时，`ctx.waitUntil` 异步走两阶段打点到 Durable Object `StatsDO`（`STATS` 绑定，单实例串行，无竞态）：
  1. `POST /hit`：DO 按该仓库的校验结论决定「直接计数 / 需要先校验 / 不计数」；
  2. 需要校验时 Worker 拉取该仓库 README（`GET /repos/{repo}/readme`，raw），弱匹配（含 `whale-star.whale-star.workers.dev` 且含 `repo=owner/name`），把结论 `POST /verdict`——通过才计数。
  GitHub API 失败/限流时本次不计数、不消耗校验预算（宁可少计不可错计），图片照常返回。
- **校验预算**：每仓库每天最多校验 3 次，任意两次校验至少间隔 2 小时；通过的结论 8 小时后视为过期可刷新。结论缓存在 DO 的 `"v"` key。
- **每日复验**：cron（`0 4 * * *` UTC）重新校验名单中全部仓库，README 已移除嵌入的仓库连同其榜单条目一起删除（`total` 为 all-time 累计，不回退）。
- **读取**：`GET /api/stats`（total / today / 近 7 日 / Top5，`max-age=60`）；`GET /api/repos`（分页全名单按 star 降序 + 调用 Top5 + Star Top5，star 取自 GitHub API 前 40 名，`max-age=600`，介绍页消费）；`GET /badge`（SVG 徽章，`max-age=300`）。
- **口径**：`run_worker_first: true` 保证每个图片请求（含边缘缓存命中）都会触发打点流程；但只有「README 确实嵌入了本服务」的仓库才真正累计。私有仓库 README 拉不到，不上榜。
- 明细按 `repo|pack|tier` 聚合，DO 内最多保留 500 个条目、30 天日计数。

## 新增套装

两种途径：

**A. 用户途径（推荐）**：Fork → 改 `assets/packs/<id>/` → 提 PR（见 [CONTRIBUTING.md](./CONTRIBUTING.md)）。

**B. 直接提交**（维护者）：

1. 在 `assets/packs/<pack-id>/` 放入 `pack.json` 与各档图片（建议 WebP，长边 1536，单图 ≤1.5MB）；
2. `pack.json` 结构参考 `default`：

   ```json
   {
     "schema": 1,
     "id": "<pack-id>",
     "name": "套装名",
     "canvas": { "width": 1536, "height": 1024 },
     "tiers": [
       { "level": 0, "min": 0, "max": 0, "text": "文案", "image": "t0.webp" }
     ]
   }
   ```

   约束：`max: null` 表示无上限且必须是最后一档；`min`/`max` 闭区间连续不留空洞；第一档 `min: 0`；图片只允许 `*.webp`/`*.png` 且不带路径。

3. 把 `{ "id", "name" }` 追加到 `assets/packs/index.json`（介绍页下拉菜单数据源）；
4. `npx wrangler deploy` 后以 `?repo=owner/name&pack=<pack-id>` 引用。

Worker 按需从静态资产读取 `/packs/<id>/pack.json`（进程内缓存 5 分钟），无需改代码注册。

## 套装投稿流水线（PR 流程）

| 阶段 | 触发 | 动作 |
|---|---|---|
| 格式校验 | PR opened/synchronize，路径含 `assets/packs/**` | `pack-pr.yml`：对仓库内**全部**套装跑 `scripts/validate-pack.mjs <dir> <id> assets/packs/index.json`（结构、图片、index 一致性）；失败在 PR 上评论修复指引 |
| 发布 | PR 被合并 | `pack-merge.yml`：重新校验 → `npm ci && npx wrangler deploy` → 评论上线成功 |

本地校验命令：

```bash
node scripts/validate-pack.mjs assets/packs/<id> <id> assets/packs/index.json
```

需要的仓库 Actions secrets：

| Secret | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 部署 Worker（Account Workers Scripts 编辑权限） |
| `CLOUDFLARE_ACCOUNT_ID` | 账户 id |

## 本地开发

```bash
npx wrangler dev
# http://127.0.0.1:8787/            → 介绍页
# http://127.0.0.1:8787/?repo=...   → 档位图
# http://127.0.0.1:8787/api/repos   → 分页名单 + 双榜

# 本地手动触发每日复验 cron（scheduled handler 不会自动跑）：
curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"
```

本地校验 README 嵌入需要 GitHub API 配额：把只读 token 写进 `.dev.vars`（已 gitignore）：`GITHUB_TOKEN=...`。

调档位逻辑的边界时，可对 `packs/*/pack.json` 的阈值写表驱动断言（min-1 / min / max / max+1 各测一点）。

## 缓存与生效时间

| 层 | TTL |
|---|---|
| Worker 内 star 数缓存（Cache API） | 300s |
| 图片响应 `Cache-Control` | 300s |
| GitHub camo | 跟随源站 Cache-Control |

跨档生效通常在 10 分钟内。调短 `src/index.js` 里的 `CACHE_TTL` 可加快刷新，但会放大 GitHub API 消耗。
