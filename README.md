# whale-star · 大肥鱼讨 Star

按仓库 star 数自动切换档位的「蓝色大肥鱼」README 应援图。star 越多，盆里的星星越多，大肥鱼越开心。

**实时演示**（跟着本仓库的 star 数走，点 ⭐ 后约 10 分钟换图）：

![star 大肥鱼](https://whale-star.whale-star.workers.dev/?repo=yschdxm/whale-star)

![调用统计](https://whale-star.whale-star.workers.dev/badge)

**在线介绍页（含生成器与套装列表）**：https://whale-star.whale-star.workers.dev/

[![爱发电](https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-%E8%AF%B7%E6%88%91%E5%96%9D%E6%9D%AF%E5%A5%B6%E8%8C%B6-7e5fd9?logo=afdian&logoColor=white)](https://ifdian.net/a/yschdxm)

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

| 套装 | 仓库路径 |
|---|---|
| [蓝色大肥鱼 · 默认套装](https://github.com/yschdxm/whale-star/tree/main/assets/packs/default) | `assets/packs/default/` |

以上列表同步自 `assets/packs/index.json`，新套装上线后会出现在这里与介绍页下拉菜单中。

## 提交自定义套装

Fork 仓库 → 复制 `assets/packs/default` 改成你的套装 → 提 PR，**合并即自动上线**。PR 上会自动跑格式校验，不过会逐条指出问题。三步指南见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 声明

「大肥鱼」为 DeepSeek 社区二创形象，本项目与 DeepSeek 官方无关；插画仅供个人 README 非商业使用。

自部署、新增套装与本地开发见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## 💝 支持开发

大肥鱼会一直免费为大家服务。如果它让你的 README 多了一点乐趣，欢迎请作者喝杯咖啡，也是对持续维护的一份鼓励：

<div align="center">

<a href="https://ifdian.net/a/yschdxm"><img width="200" src="https://pic1.afdiancdn.com/static/img/welcome/button-sponsorme.png" alt="在爱发电支持我"></a>

| 支付宝 | 微信支付 |
|:---:|:---:|
| <img src="./.github/assets/alipay.png" alt="支付宝收款码" height="340"> | <img src="./.github/assets/wechat-pay.png" alt="微信支付收款码" height="340"> |

*不便扫码？也可以在 [爱发电](https://ifdian.net/a/yschdxm) 上支持，那里能留下你想看的功能建议。*

</div>
