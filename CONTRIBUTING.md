# 贡献一个自定义套装（Pack）

想要自己风格的大肥鱼？三步就能提交，全程走 Pull Request，审核合并后自动上线。

## 第 1 步：Fork 并复制模板

Fork 本仓库，然后在 `assets/packs/` 下**复制整个 `default` 目录**并改名为你的套装 id：

- id 规则：小写字母 / 数字 / 连字符，≤32 字符（例如 `spring-festival`）
- 最省事的做法：`cp -r assets/packs/default assets/packs/<你的id>`

## 第 2 步：修改 pack.json 与图片

打开 `assets/packs/<你的id>/pack.json`：

- `id`：必须等于目录名
- `name`：套装显示名（介绍页下拉框里看到的名字，≤40 字符）
- `tiers`：保持 10 档结构，改 `text` 文案（每条 ≤24 字）
  - 第一档 `min: 0`，最后一档 `max: null`，中间档位必须连续（下一档 `min` = 上一档 `max` + 1）
- `image`：替换为你的图片文件名（仅 `*.webp` 或 `*.png`，放在同目录）
  - 尺寸建议 1536×1024（3:2 横版），单张 ≤1.5MB，总体积 ≤15MB
  - 目录里不能有多余文件，所有图片都必须被 `tiers` 引用

同时在 `assets/packs/index.json` 数组里追加一项，`id`、`name` 与 pack.json 保持一致：

```json
{ "id": "<你的id>", "name": "<套装显示名>" }
```

## 第 3 步：本地校验并提 PR

```bash
node scripts/validate-pack.mjs assets/packs/<你的id> <你的id> assets/packs/index.json
```

输出 `OK` 后，提交并开 PR（标题建议：`pack: add <你的id>`）。

- **PR 检查会自动跑同样的校验**，不过会评论指出问题，修完 push 即自动复查；
- **你合并（maintainer 通过后）即自动部署上线**，无需其他操作。

素材须为自己创作或已获授权，允许他人在个人 README 中非商业使用。
