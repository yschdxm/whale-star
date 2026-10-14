# whale-star · 大肥鱼讨 Star

按仓库 star 数自动切换档位的「蓝色大肥鱼」README 应援图。star 越多，盆里的星星越多，大肥鱼越开心。

**实时演示**（跟着本仓库的 star 数走，点 ⭐ 后约 10 分钟换图）：

![star 大肥鱼](https://whale-star.whale-star.workers.dev/?repo=yschdxm/whale-star)

**在线介绍页（含生成器与套装列表）**：https://whale-star.whale-star.workers.dev/

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

## 可用套装

| 套装 | 路径 |
|---|---|
| [蓝色大肥鱼 · 默认套装](https://whale-star.whale-star.workers.dev/?pack=default) | `https://whale-star.whale-star.workers.dev/?pack=default` |

以上列表同步自 `assets/packs/index.json`，新套装上线后会出现在这里与介绍页下拉菜单中。

## 提交自定义套装

用 [自定义套装 Issue 模板](https://github.com/yschdxm/whale-star/issues/new?template=custom-pack.yml) 提交：填套装 id、名称和 zip 直链即可。机器人自动做格式校验（不通过会逐条指出问题，改完重新编辑 Issue 会自动复查）；校验通过后仓库主审核，打上批准标签即自动合入仓库并部署上线。

## 声明

「大肥鱼」为 DeepSeek 社区二创形象，本项目与 DeepSeek 官方无关；插画仅供个人 README 非商业使用。

自部署、新增套装与本地开发见 [DEVELOPMENT.md](./DEVELOPMENT.md)。
