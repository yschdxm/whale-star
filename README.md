# whale-star · 大肥鱼讨 Star

按仓库 star 数自动切换档位的「蓝色大肥鱼」README 应援图。star 越多，盆里的星星越多，大肥鱼越开心。

**实时演示**（跟着 deepseek-ai/DeepSeek-V3 的 star 数走）：

![star 大肥鱼](https://whale-star.whale-star.workers.dev/?repo=deepseek-ai/DeepSeek-V3)

## 接入

在你的 README.md 里加一行：

```html
<img src="https://whale-star.whale-star.workers.dev/?repo=你的用户名/仓库名" alt="star 大肥鱼" width="600" />
```

| 参数 | 说明 |
|---|---|
| `repo` | 必填，`owner/name` 格式 |
| `pack` | 选填，套装 id，默认 `default` |

- star 数与图片缓存约 5 分钟，跨档后通常 10 分钟内生效。
- 调试可用响应头 `X-Star-Count` / `X-Star-Tier` 查看当前星数与档位。

## 档位一览

| 档位 | star 数 | 大肥鱼状态 |
|---|---|---|
| T0 | 0 | 空盆，愁眉苦脸 |
| T1 | 1–9 | 几颗星，小心期待 |
| T2 | 10–49 | 盆底一层，小满足 |
| T3 | 50–199 | 冒尖了 |
| T4 | 200–499 | 盆要装不下 |
| T5 | 500–999 | 堆到脚踝 |
| T6 | 1k–2.9k | 埋到腰 |
| T7 | 3k–9.9k | 星星从天而降 |
| T8 | 10k–49.9k | 星海游泳 |
| T9 | 50k+ | 传说级大肥鱼！ |

十档图鉴见在线介绍页：https://whale-star.whale-star.workers.dev/

## 声明

「大肥鱼」为 DeepSeek 社区二创形象，本项目与 DeepSeek 官方无关；插画仅供个人 README 非商业使用。

自部署、新增套装与本地开发见 [DEVELOPMENT.md](./DEVELOPMENT.md)。
