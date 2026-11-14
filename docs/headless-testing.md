# 无界面测试（Headless Testing）

> 目标：让 AI / CI 在**不打开微信开发者工具、不启动浏览器**的前提下驱动这个微信小游戏、读取状态、断言结果、复现失败。
> 特点：同参数运行结果完全可复现；测试期依赖 `js-yaml`（仅用于解析 YAML 用例），游戏本身与打包产物不受影响。

## 1. 能力与边界

| 能覆盖 | 不能覆盖 |
| --- | --- |
| `js/core/` 全部玩法逻辑（关卡、连线、死局、道具、存档、结算） | 像素 / 视觉效果（假 Canvas 只吞绘制调用，不产生画面） |
| 9 个场景的 `update()` / `render()` 全链路不抛脚本错误 | 真机兼容性（基础库版本、触摸实测、性能） |
| 触摸事件从 wx 回调到场景命中判定的完整链路 | 真实图片解码（图片是同步模拟"加载成功"或"失败"） |
| 9 个场景全部命中区的逐个点击矩阵与选关 / 商城 / 设置面板定向交互 | 分包下载的真实网络过程（`loadSubpackage` 直接成功） |
| 1..300 关配置与棋盘生成的全量扫描，5 个阶段全部边界关自动通关 | 浏览器预览页分支（本套环境走 wx 分支） |
| 含冰块 / 翻面 / 锁链的完整通关，以及 4 种道具的按钮、失败分支、落盘与背包规范化 | 玩家实际操作手感 |
| 局内流程：暂停 / 商店 / 购买 / 胜负弹窗按钮 / 移动元素换位 / 重玩不发奖 | 音频输出（未注入 `createWebAudioContext`，音效降级为 no-op） |
| 每日奖励弹窗、跨天判重、任务领取与重置、猫咪养成、存档经济、医院治疗 | 部分纯绘制分支（立绘、装饰、温馨小屋动画） |
| 固定 seed / 时钟下的确定性重放与操作序列回放 | — |

一句话：**行为级无界面测试，不是视觉级**。

## 2. 环境要求

- Node **18+**，测试期依赖一个包：`js-yaml`（解析 YAML 用例）。首次运行需 `npm install`。
- 游戏源码和微信小游戏包体不依赖这些 npm 包；`node_modules/`、`package.json`、`package-lock.json`、`test/` 都已由 `project.config.json` 的 `packOptions.ignore` 排除。

本机 Windows 的 `node` / `npm` 不在 PATH，可直接使用已有二进制：

```powershell
$NODE = 'C:\Users\XYHUOYU\.workbuddy\binaries\node\versions\22.22.2-6\node.exe'
$NPM  = 'C:\Users\XYHUOYU\.workbuddy\binaries\node\versions\22.22.2-6\npm.cmd'
& $NPM install
& $NODE --test test/catlink.core.test.js test/catlink.play.test.js test/catlink.items.test.js test/engine.smoke.test.js test/ui.scenes.test.js test/meta.economy.test.js test/specs.test.js
& $NODE test/harness.js --scene=play --level=5 --seed=42 --frames=60 --board
```

> `node` 不在 PATH 时直接跑 `npm run ...` 会报 `'node' is not recognized`（npm 内部要调 `node`）。用 npm 脚本前先执行 `$env:PATH = '<node 目录>;' + $env:PATH`，或者按上面的方式直接用 `& $NODE --test ...`。

若已把 Node 加入 PATH：

```bash
npm install           # 首次运行，安装 js-yaml
npm test              # 全部 58 个用例（45 个脚本 + 13 个 YAML 声明式用例）
npm run test:report   # 同上，并把结果落盘到 test/results/（见 3.1）
npm run catlink       # 只跑连连看：core + play + items（27）
npm run catlink:core  # 连连看核心逻辑 + 全关卡扫描（9）
npm run catlink:play  # 自动通关与局内流程（13）
npm run catlink:items # 道具全分支（5）
npm run engine:smoke  # 引擎级冒烟（7）
npm run ui:scenes     # 场景交互矩阵（5）
npm run meta:economy  # 每日奖励 / 养成 / 经济（6）
npm run cases         # 只跑声明式用例（13），内容在 test/cases/*.yaml
npm run probe:play    # 单场景探针：play / level 1 / 60 帧
npm run probe         # 默认探针：启动后渲染 1 帧
```

分组脚本统一按「功能域:主题」命名，与文件名前缀一致，规则见第 10 节。

## 3. 快速开始

```bash
node test/harness.js --scene=play --level=5 --seed=42 --frames=60 --board
```

输出是**纯 JSON**，字段含义见 5.3。异常时 JSON 里多一个 `fatal` 字段，进程退出码为 `1`；正常为 `0`。`actions` 字段是本轮实际执行的操作序列，可直接保存下来复现。

**新增常规回归用例优先用声明式配置**（见 4.5），不必再写脚本。

### 3.1 测试结果落盘

`npm test` 只把结果打到终端。要留存结果跑：

```bash
npm run test:report
```

**每次运行生成一份独立报告，历史不会被覆盖。** 文件名是运行时的本地时间戳，例如 `test/results/2026-11-14_12-49-35-917.xml`；万一同一毫秒内重复运行，会自动追加序号。终端仍同步输出 spec 可读结果（用例名、耗时、`pass 58 / fail 0` 摘要），退出码与 `npm test` 一致（有失败为 `1`）。

| 位置 | 内容 |
| --- | --- |
| `test/results/<时间戳>.xml` | 标准 JUnit XML：每个 `<testcase>` 的名称与耗时，失败时含 `<failure>` 详情，供 CI / IDE 测试面板导入 |
| 终端 | 即时可读的 spec 输出，不落盘 |

`test/report.js` 负责建目录、生成唯一文件名，并直接从 `package.json` 的 `scripts.test` 读取测试文件列表（不用两处维护）；落盘用 Node 内置多 reporter，无额外依赖。`test/results/` 已写入 `.gitignore`，历史报告不入库；`project.config.json` 忽略整个 `test/`，也不会打进小游戏包体。报告会一直累积，需要清理时手动删除该目录即可。

> 覆盖率不在这个脚本里，仍按第 9 节的方式单独查看。

## 4. 方案与原理

### 4.1 分层与两种写法

| 层 | 入口 | 做法 |
| --- | --- | --- |
| L1 逻辑层 | `catlink.core.test.js`(9) | 零 mock，直接构造 `Grid` / `Game` / `Save`；对 1..300 关做配置与棋盘全量扫描 |
| L2 引擎层 | `engine.smoke.test.js`(7) | 全局注入替身 → 原样 `require('game.js')` → 手动逐帧 / 逐触摸驱动 |
| L3 玩法与业务流 | `catlink.play.test.js`(13)、`catlink.items.test.js`(5)、`meta.economy.test.js`(6)、`ui.scenes.test.js`(5) | 每轮用 `findAnyPair()` 找一对，反算像素坐标后真实点击；弹窗、养成、场景按钮全部由触摸驱动 |
| 声明式层 | `cases/*.yaml`(13) + `_fields.yaml` + `runner.js` + `specs.test.js` | 用例只写「初始条件 / 步骤 / 期望」，别名在字典里，执行器用注册表翻译 |

6 个 `*.test.js` 是**脚本式用例**（45 个），适合需要 stub 内部方法、监听事件、构造复杂夹具的场合；`cases/*.yaml` 是**声明式用例**（13 个），适合常规回归；`specs.test.js` 只是注册层，自身没有用例内容。三者共用同一套 `env.js` + `harness.js`。文件命名规则见第 10 节。

> 关卡号无上限（`docs/catlink.md` 明确没有静态关卡表），所以"每个关卡"用**全量配置 / 棋盘扫描 + 阶段边界关自动通关**覆盖，而不是逐关硬编码。

### 4.2 为什么可以不改游戏源码

1. `js/adapter.js:4` 只用 `typeof wx !== 'undefined' && !!wx.getSystemInfoSync` 判断平台，且平台调用几乎全部收口在该文件。定义全局 `wx` 即让 `isWx === true`，避免它去找 `document` / `localStorage` / `AudioContext`。
2. `js/core/` 是纯 ES5 CommonJS，不依赖 canvas / DOM / wx；`js/adapter.js:40-47`、`:60-63` 的 `try/catch` 还会把缺失环境下的存档与音效降级为 no-op。
3. `game.js:74` 已有 `window.__engine = engine`。设 `global.window = globalThis`，句柄就落到 `globalThis.__engine`，测试无需新增任何导出即可拿到引擎。

> 唯一一处游戏源码改动：`js/scenes/catroom.js` 把高级食物的 `itemId` 从 `food_pudding`（其实是图标名）修正为 `food_milk`，否则 `Shop.byId()` 返回 `null` 会让喂食崩溃。该缺陷由 `ui.scenes.test.js` 的回归用例锁定。

### 4.3 替身清单

| 替身（`test/env.js`） | 原理 | 解决的问题 |
| --- | --- | --- |
| 假 `wx` | 约 15 个方法：`getSystemInfoSync` / `createCanvas` / `createImage` / 存储 / 触摸回调 / 生命周期 / 胶囊按钮 rect 等 | 适配层走 wx 分支，平台调用变内存实现 |
| 假 2D context | `Proxy`：绘制方法返回 noop；渐变返回带 `addColorStop` 的对象；`measureText` 返回 `{width}`；`getImageData` 返回合法 `Uint8ClampedArray` | 渲染代码完整执行（能暴露异常），但不产生像素，无需 `node-canvas` 这类原生依赖 |
| 假 `Image` | 给 `src` 赋值时**同步**触发 `onload`（`imageFail` 时触发 `onerror`） | `engine.preload()` 的 68 张图瞬间完成；也能模拟全部缺图时的兜底渲染 |
| 假 `requestAnimationFrame` | 只保存回调、不自动调度，由 `step()` 用递增时间戳手动调用 | 帧数、\(dt\)、`Date.now()` 全由测试控制 |
| 假定时器 | `setInterval` 同步把轮询跑完（`preload` 的 8 秒超时逻辑瞬间走完）；`setTimeout` 排队、按需 `flushTimers()` | 无挂起句柄、结果不依赖真实墙钟 |
| 可控时钟 | `class FakeDate extends Date`，`Date.now()` 与 `new Date()` 都读 `clock.now`，`step()` 按帧推进 | 每日奖励判重、任务跨天、猫咪衰减全部可复现 |
| 种子随机 | mulberry32 替换全局 `Math.random` | 关卡生成、洗牌、粒子动画确定；同 `--seed` 必然同一棋盘 |

`boot()` 每次清掉 `js/` 下的 `require.cache`，用于隔离 `adapter`（`isWx` 在模块加载时求值）与 `Save.data` 等模块级单例；`finish()` 会完整还原所有全局。

### 4.4 断言与可观测性

- `js/render.js` 在 `loop` / `update` / `render` / 触摸处都有 `try/catch` 并写入 `engine._lastError`；env 同时拦截 `console.error`。`assertNoError()` 检查两者，任一帧抛错即失败。
- `state()` / `board()` 把状态序列化为纯 JSON，AI 可直接读取并决定下一步。`state()` 里的 `save.props` / `play.items` 都是拷贝，不会因后续操作改变已有快照（相对断言依赖这一点）。
- `tap(x, y)` 调用 `wx.onTouchStart/onTouchEnd` 注册时保存的回调，经过 `js/render.js:597` 的坐标换算与场景命中判定，**不是**直接调逻辑层。按钮命中区是在 `render()` 里计算的，所以 `touch()` 会在尚未渲染过时自动补渲一帧。
- 场景按钮坐标一律从 `render()` 产出的 `x/y/w/h` 读取，不硬编码像素；`ui.scenes.test.js` 会遍历场景对象里所有矩形命中区逐个点击。
- 每个驱动方法记一条 action，`exportActions()` 导出、`replay(actions)` 回放；配合固定 seed 与时钟，同序列必然得到同状态。
- 道具 / 经济落盘可直接断言 `h.env.storage.get('catlink_save_v2')`，验证的是真正写入存储的值，而非内存引用。

### 4.5 声明式用例（推荐给新用例）

用例是**带注释的 YAML**，写中文业务词，不写代码。四类文件的分工：

| 文件 | 角色 |
| --- | --- |
| `test/cases/_fields.yaml` | **公共字典**：中文业务词 → 内部标识。下划线开头，不会被当作用例加载 |
| `test/cases/<功能域>.<主题>.yaml` | **用例数据**，唯一需要日常编辑的地方；目前 3 个文件 13 个用例 |
| `test/runner.js` | 执行器：动作注册表 + 断言注册表 + 通用 `runCase()`，不写死业务映射 |
| `test/specs.test.js` | 注册层：扫描 YAML 并用 `node:test` 注册，约 20 行，没有用例内容 |

一个完整用例：

```yaml
# test/cases/catlink.play.yaml
默认:
  种子: 42

用例:
  - 名称: 第 1 关真实触摸自动通关并写入进度
    进入: 对局
    关卡: 1
    步骤:
      - 自动通关: 触摸
      - 推进: 10
    期望:
      对局状态: 胜利
      剩余方块: 0
      分数: '> 0'
      已解锁关卡: 初始 +1
      喵币: 增加
```

**顶层字段**：`名称`、`进入`（场景别名）、`关卡`、`启动参数`（`种子` / `图片全部失败` / `跳过每日奖励` / `宽度` / `高度` / `起始时间`）、`步骤`、`期望`、`无异常`（默认开启 `assertNoError()`）。文件级 `默认` 会与用例级 `启动参数` 合并。

**步骤**是「动作名: 参数」的单键写法，可用动作（在 `runner.js` 的 `ACTIONS` 注册表里，新增一个 `def()` 即可）：

| 动作 | 参数 | 含义 |
| --- | --- | --- |
| `推进` | 帧数 | `step()` |
| `进入` / `压入` | 场景别名 | `goto()` / `push()` |
| `点击` | `[x, y]` | 固定坐标点击 |
| `点击格子` | `[行, 列]` | 反算像素坐标后真实点击 |
| `点击道具` / `点击弹窗按钮` / `点击顶栏` | 按钮别名 | 按 key 找命中区并点击 |
| `消除一对` / `自动通关` | `触摸` / `逻辑` / `真实规则` | 配对 / 自动打完一关 |
| `使用道具` | 道具别名 | 直接调 `useItem()` |
| `设置存档` | `{ 存档字段: 值 }` | 预置存档 |
| `设置日期` | ISO 日期 | 固定虚拟时钟 |
| `关闭弹窗` / `执行定时器` | — | 清弹窗 / 执行排队定时器 |

**期望**的键是 `_fields.yaml` 里 `字段` 定义的中文业务词（如 `剩余方块` → `play.remain`），值支持：

| 写法 | 含义 |
| --- | --- |
| `0` / `胜利` / `空` | 字面量或 `枚举` 别名，深度相等 |
| `'> 0'` / `'>= 36'` / `'< 200'` / `'<= 0'` | 数值比较 |
| `初始 +1` / `初始 -2` | 相对进入场景后的初始值（**不用写死具体数字**） |
| `增加` / `减少` / `不变` | 相对初始值的变化方向 |
| `非空` / `为空` / `包含 xxx` | 存在性与包含 |

所有中文词到内部标识的映射都在 `_fields.yaml`（`字段` / `枚举` / `按钮` / `模式` / `场景` / `启动` / `存档字段` 七张表），新增字段、按钮、状态值、启动参数只改字典，不用改 `runner.js`。断言操作符也在注册表里，新增比较规则只加一个 `matcher()`。

新增用例只需在 `test/cases/*.yaml` 的 `用例` 列表里加一段，或按第 10 节的命名规范新建一个 YAML 文件，然后 `npm run cases`。**什么时候仍要写脚本**：需要 stub 内部方法、监听自定义事件、构造复杂夹具、验证调用顺序或时序的用例，用 `*.test.js` 更直接。

## 5. 编程接口（`test/harness.js`）

### 5.1 `boot(opts)`

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `seed` | `20260101` | 固定 `Math.random` 序列 |
| `now` | `2026-01-01T12:00:00+08:00` | 初始时间戳，随 `step()` 推进；YAML 用例支持 ISO 字符串 |
| `width` / `height` | `375` / `667` | 逻辑屏幕尺寸 |
| `dpr` | `2` | 像素比 |
| `safeTop` | `0` | 顶部安全区 |
| `imageFail` | `false` | 所有图片加载失败，验证兜底渲染 |
| `quiet` | `true` | 接管并收集 console 输出，不打印 |
| `skipDailyGift` | `true` | 预置当日已领奖，避免启动时两个每日奖励弹窗 |
| `imageWidth` / `imageHeight` | `64` / `64` | 假图片尺寸 |

> `dpr` / `safeTop` / `quiet` / `imageWidth` / `imageHeight` 只在脚本接口可用，命令行未暴露。

### 5.2 `Harness` 方法

| 方法 | 说明 |
| --- | --- |
| `step(frames = 1, dt = 1/60)` | 手动推进主循环；时间戳、`Date.now()`、逻辑计时同步推进 |
| `goto(name, params)` / `push(name, params)` | 切换场景；`play` 支持 `{ level: N }` |
| `tap(x, y)` / `touch(x, y, 'down' \| 'up')` | 注入触摸；必要时自动补渲一帧 |
| `closeModals()` | 清空弹窗队列（最多 20 个） |
| `flushTimers()` | 执行排队的 `setTimeout` |
| `play()` | 返回 `play` 场景实例，`.game` 即 `Game` 对象，`._cx(c)/._cy(r)` 给出格子中心像素坐标，`.itemBtns` / `.popupBtns` 是按钮命中区 |
| `state()` | 全局状态快照（纯 JSON） |
| `board()` | 棋盘快照 + 当前可消除的一对 |
| `assertNoError()` | 断言主循环 / 更新 / 渲染 / 输入无异常 |
| `replay(actions)` / `exportActions()` | 回放 / 导出操作序列 |
| `finish()` | 清模块缓存并还原全局，**每个用例结束必须调用** |

### 5.3 `state()` 字段

```
scene / stack[] / modal / error / consoleErrors[] / missingAssets[]
frames / now / tapCount
save: { maxLevel, coin, props }
play:  { level, replay, state, score, combo, timeLeft, stepsLeft, remain, items, popup }
```

`board()` 返回 `{ rows, cols, cells, pair }`：`cells[r][c]` 为 `null` 或 `{ img, ice, chain, flip, revealed, move, bomb }`；`pair` 是 `findAnyPair()` 的结果（`[{r,c,path}, {r,c,path}]`）。

### 5.4 完整示例

```js
const h = require('./test/harness').boot({ seed: 42 });
h.goto('play', { level: 5 }).step(60);
h.tap(180, 400);
const snapshot = { ...h.state(), board: h.board() };
h.assertNoError();
h.finish();                       // 必须在读取快照之后
console.log(JSON.stringify(snapshot, null, 2));
```

> **注意**：`boot()` 之后 `console` 默认被 env 接管（`quiet: true`），`finish()` 之前 `console.log` 看不到输出。要么先把快照存下来、在 `finish()` 后打印，要么用 `process.stdout.write`，要么 `boot({ quiet: false })`。

## 6. 命令行参数（`node test/harness.js`）

| 参数 | 说明 |
| --- | --- |
| `--scene=NAME` / `--level=N` | 切换场景；`--level` 只在 `play` 生效 |
| `--seed=N` / `--width=N` / `--height=N` | 确定性参数 |
| `--frames=N` / `--dt=SEC` | 推进帧数与单帧步长 |
| `--taps=x,y;x,y` | 依次注入点击 |
| `--board` | 附带棋盘快照与可消除的一对 |
| `--logs` | 附带被接管的 console 记录 |
| `--imageFail` | 全部图片加载失败 |
| `--skipDailyGift=false` | 不预置存档，观察真实的每日奖励弹窗流程 |
| `--actions='[...]'` / `--actions=@path/to.json` | 回放操作序列（路径相对项目根） |

`actions` 支持的类型：`step` / `goto` / `push` / `tap` / `down` / `up` / `closeModals` / `flushTimers`。使用 `--actions` 且未指定 `--frames` 时不再额外补帧。命令行始终会自动 `closeModals()` 一次。

> Windows PowerShell 下传内联 JSON 建议先赋给变量，或直接用文件，避免引号被吞：
> `$acts = '[{"type":"goto","scene":"shop"},{"type":"step","frames":3}]'; node test/harness.js --actions=$acts`

## 7. AI 自测推荐流程

1. **准备**：首次 `npm install`（装 `js-yaml`）。
2. **回归**：`npm test`（约 0.9s，58 个用例）；只想验某一块时用 `npm run catlink` / `catlink:core` / `catlink:play` / `catlink:items` / `engine:smoke` / `ui:scenes` / `meta:economy` / `cases`。需要把结果存成文件时用 `npm run test:report`（见 3.1）。
3. **定位**：用探针拿 JSON 快照，例如 `--scene=play --level=61 --board`，读 `error` / `consoleErrors` / `play` / `board.pair`。
4. **固定现场**：记下本次的 `--seed` 与探针输出的 `actions`，两者合起来就是完整的复现输入，失败时原样重跑。
5. **自动驱动**：常规场景优先直接写 `test/cases/*.yaml`（见 4.5）；脚本里也可以用 `h.board().pair` 找可消除的一对，`h.play().game.tapCell(r, c)` 按行列驱动，或 `_cx/_cy` 反算像素后 `h.tap(x, y)` 走真实触摸。
6. **断言**：优先用 `assertNoError()` 守异常，再断言 `state().play` / `save` 的具体数值；视觉与真机问题另外走人工或截图流程。

## 8. 编写新测试

- **常规回归（首选）**：在 `test/cases/*.yaml` 里加一段 `用例`，写 `进入` / `步骤` / `期望`；新词加到 `_fields.yaml`；`npm run cases` 验证。新建文件按 `<功能域>.<主题>.yaml` 命名（见第 10 节）。
- 复杂 L1：照 `catlink.core.test.js`，用 `fresh(name)` 清 `js/` 模块缓存隔离单例，`deterministic(t, seed)` 通过 `t.after` 恢复 `Math.random` 与 `Date`。
- 复杂 L2：照 `engine.smoke.test.js` 的 `withHarness(opts, fn)`，`finally` 里 `h.finish()`。
- 复杂 L3：照 `catlink.play.test.js` 的 `autoPlay(h, level, useTouch)` / `tapPopup(h, key)`、`catlink.items.test.js` 的 `tapItem(h, key)`、`ui.scenes.test.js` 的 `enter(h, name)` / `collect(h)` / `find(scene, key)`。
- 注意：不要嵌套 `boot()`；`finish()` 之后不能再调 `state()`；触摸前保证至少渲染过一帧（`touch()` 已自动处理，`_cx/_cy`、`itemBtns`、`popupBtns` 都依赖 `render()` 算出的布局）；`console` 默认被接管。
- 断言基线以 `docs/catlink.md` 为准（难度阶段、道具、计分、结算规则）。

## 9. 已知限制与后续扩展

- 当前覆盖率基线（Node 内置覆盖率，排除 `test/` 与 IDE 注入脚本）：**88.49% 行 / 73.96% 分支 / 87.39% 函数**。关键模块：`core/game.js` 97.52%、`scenes/play.js` 94.82%、`core/cats.js` 84.57%、`core/save.js` 97.22%、`core/tasks.js` 98.81%、`scenes/hospital.js` 与 `scenes/select.js` 100%。
- **覆盖率 ≠ 正确性**：绘制代码被执行只代表"没抛异常"，因为 canvas 是 noop，一个像素都没被验证。
- 声明式配置的代价：表达力受限于注册表里的动作与操作符；失败堆栈指向执行器而非 YAML 行，需要靠 `名称` 定位；无法表达 stub / 事件监听 / 时序断言。这正是保留脚本用例的原因。
- 仍未覆盖：浏览器预览分支（`adapter.js:25-31`、`:153-157`，`render.js:616-628`）、`ui/catRig.js` / `ui/cozy.js` 等纯绘制分支、`home2.js` 装饰动画、`catroom.js` 抚摸 / 换装分支，以及视觉、真机兼容、性能、音频、分包真实下载。
- 假 Canvas 不做像素断言，图片也不读真实 PNG。要做视觉回归，可另建静态预览页 + Playwright 截图对比；项目里已有的 `window.__FORCE_SIZE`、`__RIG_TIME`、`__RIG_POSE` 钩子正是为此准备的。
- 依赖只有 `js-yaml`，且只用于测试期；`node_modules/`、`package.json`、`package-lock.json`、`test/` 都不会打进小游戏包体。

## 10. 命名规范与文件清单

### 10.1 命名规范

测试文件按「**功能域.主题.类型**」命名，看文件名就知道测什么、属于哪个模块。后续新增功能只需换前缀，不要再造 `core.test.js` / `flow.test.js` 这类泛名。

```
test/<功能域>.<主题>.test.js      脚本式用例
test/cases/<功能域>.<主题>.yaml   声明式用例
```

| 前缀 | 覆盖范围 | 现有文件 |
| --- | --- | --- |
| `catlink.*` | **连连看**：核心逻辑、对局流程、道具、自动通关 | `catlink.core.test.js`、`catlink.play.test.js`、`catlink.items.test.js`、`cases/catlink.play.yaml`、`cases/catlink.items.yaml` |
| `engine.*` | 引擎 / 运行环境级冒烟：启动、渲染、确定性、缺图兜底 | `engine.smoke.test.js`、`cases/engine.smoke.yaml` |
| `ui.*` | 跨场景 UI 交互与命中区 | `ui.scenes.test.js` |
| `meta.*` | 元系统：每日奖励、任务、经济、猫咪养成、存档 | `meta.economy.test.js` |

约定：

- 连连看相关**一律带 `catlink`**；未来新增模块（例如 `shop.*`、`catroom.*`、`tasks.*`）用各自的功能域前缀，不复用 `catlink`。
- 每个功能域内按主题拆文件，主题相近的合并到同一文件并用分组注释隔开：`catlink.core.test.js` 合并了逻辑单测与全关卡扫描，`catlink.play.test.js` 合并了自动通关与局内流程。
- **下划线开头**表示字典 / 公共数据而不是用例：`cases/_fields.yaml` 会被 `caseFiles()` 跳过。
- 跨功能域共用的基建不加前缀：`env.js`（假运行时）、`harness.js`（驱动 + CLI）、`runner.js`（声明式执行器）、`report.js`（结果落盘）。
- `specs.test.js` 是唯一不带功能域前缀的 `*.test.js`：它扫描全部 YAML 并注册用例，本身不含用例内容。
- 分组 npm 脚本与前缀对齐：`<功能域>:<主题>`（`npm run catlink:play`），`npm run catlink` 跑该域全部文件；`cases` 是声明式层的专用别名。
- `test/results/` 只存放每次运行的独立报告（带时间戳、不覆盖），不是测试文件，已由 `.gitignore` 排除（见 3.1）。

### 10.2 文件清单

| 文件 | 类型 | 作用 |
| --- | --- | --- |
| `test/env.js` | 基建 | 假运行时：wx / Canvas / Image / 定时器 / 时钟 / 随机种子 |
| `test/harness.js` | 基建 + CLI | 启动、逐帧与触摸驱动、状态快照、操作回放、命令行探针 |
| `test/runner.js` | 基建 | YAML 用例执行器：动作注册表、断言注册表、通用 `runCase()` |
| `test/report.js` | 基建 | 每次运行生成一份带时间戳的独立 JUnit 报告，不覆盖历史（见 3.1） |
| `test/specs.test.js` | 注册层 | 扫描 YAML 注册 13 个声明式用例，本身无用例内容 |
| `test/cases/_fields.yaml` | **字典（配置）** | 中文业务词 ↔ 内部标识的 7 张映射表 |
| `test/cases/engine.smoke.yaml` | **用例（配置）** | 启动 / 渲染 / 缺图兜底 / 每日弹窗，4 个 |
| `test/cases/catlink.play.yaml` | **用例（配置）** | 连连看自动通关与配对，4 个 |
| `test/cases/catlink.items.yaml` | **用例（配置）** | 道具、弹窗流程、炸弹选格，5 个 |
| `test/catlink.core.test.js` | 用例（脚本） | 9 个：7 个逻辑层单测 + 2 个全关卡扫描 |
| `test/catlink.play.test.js` | 用例（脚本） | 13 个：6 个自动通关 + 7 个局内流程与弹窗 |
| `test/catlink.items.test.js` | 用例（脚本） | 5 个道具全分支 |
| `test/engine.smoke.test.js` | 用例（脚本） | 7 个引擎级无界面冒烟 |
| `test/ui.scenes.test.js` | 用例（脚本） | 5 个场景交互矩阵 |
| `test/meta.economy.test.js` | 用例（脚本） | 6 个每日奖励 / 养成 / 经济 |
| `test/results/` | **结果（gitignore）** | 每次运行一份 `<时间戳>.xml`，历史不覆盖、不入库、不打包（见 3.1） |
| `package.json` / `package-lock.json` | 配置 | 依赖 `js-yaml`、`test` / `test:report` 及按功能域划分的分组脚本 |
| `.gitignore` | 配置 | 排除 `test/results/`、个人配置、素材原图等 |
| `README.md` | 文档 | 项目简介与本文档链接 |
