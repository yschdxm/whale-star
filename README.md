# whale-star · 大肥鱼讨 Star

按仓库 star 数自动切换档位的「蓝色大肥鱼」README 应援图。star 越多，盆里的星星越多，大肥鱼越开心。

**实时演示**（跟着本仓库的 star 数走，点 ⭐ 后约 10 分钟换图）：

![star 大肥鱼](https://whale-star.whale-star.workers.dev/?repo=yschdxm/whale-star)

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

<table>
  <tr>
    <td align="center" width="50%">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t0.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t0.webp" width="400" alt="T0 · 0 star" />
      </a>
      <br /><b>T0</b> · 0 star — 呜…一颗星都没有
    </td>
    <td align="center" width="50%">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t1.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t1.webp" width="400" alt="T1 · 1–9 star" />
      </a>
      <br /><b>T1</b> · 1–9 — 有一颗了！谢谢你！
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t2.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t2.webp" width="400" alt="T2 · 10–49 star" />
      </a>
      <br /><b>T2</b> · 10–49 — 十几颗啦，本鱼开心
    </td>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t3.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t3.webp" width="400" alt="T3 · 50–199 star" />
      </a>
      <br /><b>T3</b> · 50–199 — 冒尖了！还要还要～
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t4.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t4.webp" width="400" alt="T4 · 200–499 star" />
      </a>
      <br /><b>T4</b> · 200–499 — 盆要装不下啦！
    </td>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t5.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t5.webp" width="400" alt="T5 · 500–999 star" />
      </a>
      <br /><b>T5</b> · 500–999 — 堆到脚踝咯，嘿嘿
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t6.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t6.webp" width="400" alt="T6 · 1k–2.9k star" />
      </a>
      <br /><b>T6</b> · 1k–2.9k — 已经埋到腰啦！
    </td>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t7.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t7.webp" width="400" alt="T7 · 3k–9.9k star" />
      </a>
      <br /><b>T7</b> · 3k–9.9k — 天上也下星星了！
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t8.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t8.webp" width="400" alt="T8 · 10k–49.9k star" />
      </a>
      <br /><b>T8</b> · 10k–49.9k — 本鱼在星海游泳～
    </td>
    <td align="center">
      <a href="https://whale-star.whale-star.workers.dev/packs/default/t9.webp">
        <img src="https://whale-star.whale-star.workers.dev/packs/default/t9.webp" width="400" alt="T9 · 50k+ star" />
      </a>
      <br /><b>T9</b> · 50k+ — 传说级大肥鱼！
    </td>
  </tr>
</table>

## 提交自定义套装

用 [自定义套装 Issue 模板](https://github.com/yschdxm/whale-star/issues/new?template=custom-pack.yml) 提交：填套装 id、名称和 zip 直链即可。机器人自动做格式校验（不通过会逐条指出问题，改完重新编辑 Issue 会自动复查）；校验通过后仓库主审核，打上批准标签即自动合入仓库并部署上线。

## 声明

「大肥鱼」为 DeepSeek 社区二创形象，本项目与 DeepSeek 官方无关；插画仅供个人 README 非商业使用。

自部署、新增套装与本地开发见 [DEVELOPMENT.md](./DEVELOPMENT.md)。
