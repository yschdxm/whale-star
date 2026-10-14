# whale-star · 大肥鱼讨 Star 档位图服务

按 GitHub 仓库 star 数返回不同档位的「蓝色大肥鱼」插画（WebP）。Cloudflare Worker + Static Assets，使用者零配置。

**在线入口（含介绍页）**：https://whale-star.whale-star.workers.dev/

## 使用者接入（一行）

把下面这行放进你的 README：

```html
<img src="https://whale-star.whale-star.workers.dev/?repo=owner/repo" alt="star 大肥鱼" width="600" />
```

- `repo`：必填，`owner/name` 格式。
- `pack`：选填，套装 id，默认 `default`（蓝色大肥鱼）。
- 不带 `repo` 访问根路径会返回单页介绍页。
- 响应带 `X-Star-Count` / `X-Star-Tier` 响应头，方便调试。
- 图片缓存 5 分钟（含 GitHub camo 缓存），跨档后通常 10 分钟内刷新。

## 档位表（默认套装）

| 档位 | star 数 | 文案 |
|---|---|---|
| T0 | 0 | 呜…一颗星都没有 |
| T1 | 1–9 | 有一颗了！谢谢你！ |
| T2 | 10–49 | 十几颗啦，本鱼开心 |
| T3 | 50–199 | 冒尖了！还要还要～ |
| T4 | 200–499 | 盆要装不下啦！ |
| T5 | 500–999 | 堆到脚踝咯，嘿嘿 |
| T6 | 1k–2.9k | 已经埋到腰啦！ |
| T7 | 3k–9.9k | 天上也下星星了！ |
| T8 | 10k–49.9k | 本鱼在星海游泳～ |
| T9 | 50k+ | 传说级大肥鱼！ |

## 部署与更新

```bash
cd whale-star
npx wrangler deploy                          # 更新 Worker
npx wrangler secret put GITHUB_TOKEN         # 可选：GitHub 只读 PAT，提升 API 限额
```

未配置 token 时走 GitHub 匿名额度（60 次/小时/IP）；配置后 5000 次/小时，配合 5 分钟缓存足够大量接入。API 失败时回退 T0 图并加 `max-age=60`，保证 README 图不裂。

## 新增套装

1. 在 `assets/packs/<pack-id>/` 放入 `pack.json` 与各档图片；
2. `pack.json` 结构参考 `default`：`tiers[]` 含 `level / min / max / text / image`，`max: null` 表示无上限；
3. 在 `src/index.js` 的 `PACKS` 里注册该 pack（静态 JSON import）；
4. 部署后用 `?repo=owner/name&pack=<pack-id>` 引用。

## 本地开发

```bash
npx wrangler dev
# http://127.0.0.1:8787/            → 介绍页
# http://127.0.0.1:8787/?repo=...   → 档位图
```

## 项目结构

```
whale-star/
├── src/index.js                  # Worker：查星数 → 选档 → 回图 / 介绍页
├── assets/
│   ├── index.html                # 单页介绍页
│   └── packs/default/            # 默认套装 pack.json + t0–t9.webp
├── wrangler.jsonc
└── README.md
```

## 声明

「大肥鱼」为 DeepSeek 社区二创形象，本项目与 DeepSeek 官方无关；插画仅供个人 README 非商业使用。
