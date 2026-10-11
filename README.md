# dsh-term-glossary（术语速查）

选中 DSH 对话里的一个术语，点它旁边浮出的「搜索」按钮，就在原地弹出一个小框解释**基本含义 → 用途 → 用法**，并显示这次解释花了多少 token。不需要另开对话，也不会占用当前会话的轮次与上下文。

## 版本与分支

仓库根目录就是插件包本身（`package.json` 在根），可以直接作为 git 依赖引用。

| 版本 | 分支 | 标签 | 说明 |
|---|---|---|---|
| 第一版 | `main` | `v0.1.0` | 选中术语 + 就地解释框。Host 半边是单体实现，只有「选中的术语 + 所在句子」作为上下文，提示词面向计算机领域读者。 |
| 第二版 | `v2` | `v0.2.0` | 在 v1 之上加了三件事：**方案 B 领域适配**（Host 用 `sessionQuery` 读取会话标题与读者自己的话作为领域线索，交给模型自行判断术语属于哪个领域）、**截断如实上报**（该模型隐藏推理 token 计入 `maxTokens`，实测一次带线索的回答用掉 859/900 导致半句话返回，现上限 2400 且停在上限时返回 `truncated`）、**loader shim**（`index.js` 以 `?v=<内容哈希>` 载入 `lib/impl.js`，此后 Host 侧改动重装即生效、无需重启 dsh）。 |
| 第三版 | `v3` | `v0.3.0` | 交互重做：选中文本先浮出**「搜索」按钮**，由读者决定何时发问（不自动发请求）；解释框**常驻直到主动关闭**、等待期间显示「正在思考…」、落地后显示本次 **token 用量**与模型；**移除了框内追问输入**（旧实现里框绑定在页面选区状态上，一点进框选区就被清空、框随即卸载，所以追问框点不动、框也会闪没）。 |

想看差异：`git diff main v3`。

## 用法

1. 在对话（或任意正文区域）里用鼠标选中一个术语 —— 选区旁浮出一个「搜索」按钮，此时**不会**发任何请求。
2. 点「搜索」，就地弹出解释框并显示「正在思考…」。
3. 回答出现后，框底会列出本次消耗的 token（输入 / 缓存 / 输出 / 合计）与使用的模型。
4. 框会一直留着，直到你按 `Esc`、点右上角 `×`、或点击框外任意位置；框开着时也可以选中另一个词、再点按钮换词解释。

被选中的术语会连同它所在的句子一起发送，所以「这个」「它」之类的指代也能问。框内**不支持追问** —— 想追问就直接在对话里问。

## 安装

**前置条件**：带 Web 界面的 DSH（Desktop 应用，或 `dsh web` 启的 Web 版）。插件声明了 `webServer` 与 `llm` 两个硬依赖：前者用来挂它自己的 `/api/term-glossary/explain` 路由，后者用来发那次旁路模型调用；两者缺一，插件不会激活。

**1. 拿到源码。** 当前**默认分支就是 `v3`（第三版）**，直接 clone 即可：

```powershell
git clone https://github.com/ashz555/dsh-term-glossary.git
```

要看别的版本：第一版在 `main`（`git clone -b main …`），第二版在 `v2`。

**2. 在 DSH 对话里让 Agent 安装这个目录**（仓库根就是插件包）：

> 用 plugin_manager 的 install_bundle，安装 `D:\path\to\dsh-term-glossary`

等价的工具调用参数是 `plugin_manager` / `action: install_bundle` / `target: <仓库根的绝对路径>`。它会自己完成依赖安装、bundle 注册与启用；**不要手工去改 profile 的 `package.json` 或 `cordis.patch.yml`，也不要在 profile 目录里跑 pnpm** —— 那几步正是 `install_bundle` 代做的。

也可以把本仓库当作 git 依赖来装（`github:ashz555/dsh-term-glossary#v3`）：仓库根现在是合法包，这条路成立的前提是 pnpm 能访问 github.com —— 我这台机器上 github.com 不通，所以**没能实测这条路径**，本地 clone + Agent 安装那条是我实际验证过的。

**3. 确认生效。** 安装结果应为 `application: applied`（不是 `restart-required`），随后刷新页面即可用。若这个 profile 之前加载过同名插件的另一份代码（尤其是插件目录搬过位置），Host 侧必须重启一次 dsh 才会换成新的。

**为什么装完不能移动或删除目录**：`install_bundle` 注册的是 `link:<该目录>` 依赖 —— profile 直接指向这份源码，而不是复制一份。目录被移走或删掉，插件就失效，需要重新安装。

**卸载**：让 Agent 用 `plugin_manager` / `action: remove_bundle` / `target: dsh-term-glossary`，或在插件管理页面里禁用 / 移除该 bundle。

> ⚠️ 开发提示：本仓库的工作树同时就是被 `link:` 的插件目录。**切分支会改变 profile 正在加载的插件**（从 `v3` 切到 `main` 等于把线上插件换成第一版）。想对比另一个版本，请用 `git worktree add ../check <branch>` 在别处检出。

## 领域适配（方案 B：让模型自取线索）

插件不预设领域。每次请求都由 Host 半边读取**当前会话自己的内容**作为领域线索，交给模型自行判断术语属于哪个领域（计算机 / 医学 / 法律 / 金融 / 化学 …），并要求用该领域通行的说法解释。

线索来自 `sessionQuery`，都经过实测校准（用真实会话数据探针验证过）：

| 线索 | 来源 | 说明 |
|---|---|---|
| 会话标题 | `sessionQuery.readTitle` | 一句话点题 |
| 读者自己说过的话 | `sessionQuery.filterEvents` 的 `user/message` 语义文档 | 取最近 6 条、每条 ≤400 字、总计 ≤1500 字 |

两条**实测得出**的清洗规则：

- **不取 assistant 文档**：真实数据里 assistant 语义文档会渲染整条 surface 消息，工具调用会变成 `write {"content": …}` 这种机器载荷，对判断领域毫无价值，只会挤掉真正的线索。
- **剔除 DSH 自己的运行时通知**：`Current runtime context. …`、`The approval policy changed …` 这类注入内容在日志里同样是 `user/message`，实测占了 935 字符里的大半；现在被过滤并按文本去重。

代价：每次解释的输入大约多 200–700 token（取决于读者消息长度）；线索是本地读取，实测 20–40 ms，不产生额外模型调用。

## 行为边界

- 只在正文选区上出现：输入框、文本域、可编辑区域内选中不会触发。
- 解释走的是一次**旁路模型调用**（Host 半边的 `/api/term-glossary/explain` 路由），不写入会话日志、不进入 Agent 上下文、不影响正在进行的轮次。
- 第三版起框内不再有追问输入：一次解释 = 一次调用。
- 默认使用 profile 的默认模型（`agent-default-model`，本机为 `deepseek-official / deepseek-flash`）；单次请求超时 90 秒。
- 框底显示的 token 数字来自 provider 返回的用量（`inputTokens` / `outputTokens` / `totalTokens`，有缓存命中时另列 `cacheReadTokens`）—— 注意该模型的**隐藏推理 token 计入 `outputTokens`**，所以数字会比可见文字对应的量偏大。
- 输出上限 2400 token：实测该模型的**隐藏推理 token 也计入这个上限**（一次带线索的回答用了 859/900，可见文字只有 248 字就被截断）。现在上限放宽，且若模型确实停在上限，回答会标注「回答达到长度上限」而不是静默给出半句话。
- 会话线索只在本机读取，随后随该次请求发给同一个模型——也就是本来就在处理这段对话的模型，不产生新的数据暴露面。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | **字节稳定的 loader shim**：以 `?v=<内容哈希>` 动态载入 `lib/impl.js`，让 Host 侧的改动重装后即可生效，无需重启 dsh（此文件本身不要改） |
| `lib/impl.js` | Host 半边真正的实现：路由、会话线索采集、提示词、`ctx.llm.stream()` 调用 |
| `client.js` | 浏览器半边：手写 `__ModuleLoader__` 包，向 `shell.overlay` 槽位注册浮层组件，并通过槽位的 `useSessions` 选择器报告当前会话 id |
| `cordis.patch.yml` | bundle 补丁：插入 `term-glossary` 行挂载本包 |
| `locale/{en,zh}.json` | 插件管理页显示的标题与说明 |
| `icon.svg` | 插件图标（≤256 KiB，相对路径） |

## 配置

行 `term-glossary` 的 `config` 可选（没有 schemastery `Config`，因此不做校验，只做防御性读取）：

```yaml
- id: term-glossary
  name: dsh-term-glossary
  config:
    provider: deepseek-official
    model: deepseek-flash
```

两项都省略时使用 profile 的默认模型选择。

## 接口

```
POST /api/term-glossary/explain
Header: x-dsh-plugin: dsh-term-glossary
Body: { term, context?, question?, sessionId?, history?: [{ role, text }] }
200 : { ok: true, data: { answer, truncated, usage, model: { provider, model } } }
错误: { ok: false, error: { code, message } }
```

`usage` 即 provider 的 token 计数（`inputTokens` / `outputTokens` / `totalTokens` / 可选 `cacheReadTokens`），界面直接把它显示在框底；`truncated` 为真表示模型停在上限、回答不完整。

`sessionId` 缺失或格式不合法时静默降级为「无背景线索」；`sessionQuery` 缺失或读取失败同样降级，绝不因此让解释失败。

`question` 与 `history` 仍被接口接受（一次带历史的调用已由自检覆盖），但第三版的界面不再发它们 —— 框内追问已移除，这两个字段留给以后可能的多轮界面或其他调用方。

## 本地自检

```powershell
node tools/verify-plugin.mjs
```

用假 Cordis 上下文跑通 Host 半边（路由、头部校验、body 校验、模型路由回退、线索采集与清洗、流式拼装、错误码）、shim 装载路径，以及浏览器半边工厂与槽位注册。

## 仓库内容

仓库根即插件包（`package.json` 在根，`files` 只包含运行期需要的文件）：

| 路径 | 作用 |
|---|---|
| `index.js`、`lib/`、`client.js` | 插件本体（Host 半边、浏览器半边） |
| `cordis.patch.yml`、`locale/`、`icon.svg` | bundle 补丁、显示文案、图标 |
| `tools/verify-plugin.mjs` | 本地自检 |
| `tools/asar.mjs` | 开发时用来从 DSH Desktop 的 `app.asar` 里读取随包文档/源码的小工具 |

`reference/` 是开发期间从 dsh 安装包中抽出的**内部文档与源码**，已在 `.gitignore` 中排除，不会进入本仓库。
