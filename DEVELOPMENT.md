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

## 新增套装

1. 在 `assets/packs/<pack-id>/` 放入 `pack.json` 与各档图片（建议 WebP，长边 1536）；
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

   `max: null` 表示无上限；`min`/`max` 闭区间，按 `level` 升序排列。

3. 在 `src/index.js` 顶部 `PACKS` 中注册（静态 import 该 `pack.json`）；
4. `npx wrangler deploy` 后以 `?repo=owner/name&pack=<pack-id>` 引用。

## 本地开发

```bash
npx wrangler dev
# http://127.0.0.1:8787/            → 介绍页
# http://127.0.0.1:8787/?repo=...   → 档位图
```

调档位逻辑的边界时，可对 `packs/*/pack.json` 的阈值写表驱动断言（min-1 / min / max / max+1 各测一点）。

## 缓存与生效时间

| 层 | TTL |
|---|---|
| Worker 内 star 数缓存（Cache API） | 300s |
| 图片响应 `Cache-Control` | 300s |
| GitHub camo | 跟随源站 Cache-Control |

跨档生效通常在 10 分钟内。调短 `src/index.js` 里的 `CACHE_TTL` 可加快刷新，但会放大 GitHub API 消耗。
