# Meow · 猫咪连连看 & 咪窝

微信小游戏项目。包含连连看玩法、猫咪养成「咪窝」，以及主页、商城、背包、医院等场景，支持中英文切换与多分辨率适配。

## 运行

用微信开发者工具选择「导入项目」，目录指向本仓库根目录。`compileType` 为 `game`，入口是 `game.js`，AppID 见 `project.config.json`。

## 目录

- `js/core/` — 棋盘、精灵、品种表、国际化等核心逻辑
- `js/scenes/` — 各场景数据与交互
- `js/ui/` — Canvas 绘制、布局与兜底渲染
- `assets/textures/` — 卡面图集、界面素材、分包资源
- `game.json` — 小游戏配置与分包声明

## 无界面自测（AI / CI）

Node 18+ 即可在假 `wx` / 假 Canvas 环境中驱动完整游戏，无需微信开发者工具或浏览器。首次运行 `npm install`，之后 `npm test`。

脚本入口、声明式 YAML 用例、测试文件命名规范与实现原理见 [headless-testing.md](docs/headless-testing.md)。

## 玩法文档

- [CatLink · 连连看玩法（当前实现）](docs/catlink.md)

## 说明

- `assets/textures/nest`、`breeds`、`home2` 三个分包目录根下的 `game.js` 是微信分包规范要求的入口占位文件，请勿删除。
- 25 张 2048 品种原图（`_breed_originals/`）与本地素材构建 / 调试产物（`.workbuddy/`）未纳入仓库，它们只是生成脚本的输入；运行期只需要 `assets/textures/` 下已处理好的素材。
- `project.private.config.json` 是本机个人配置，已由 `.gitignore` 排除。
