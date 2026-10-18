# dsh-term-glossary（术语速查）

[![npm](https://img.shields.io/npm/v/dsh-term-glossary.svg)](https://www.npmjs.com/package/dsh-term-glossary)
[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/p/ashz555/dsh-term-glossary/)
[![dsh.so](https://www.dsh.so/badge/dsh-term-glossary.svg)](https://www.dsh.so/artifact/dsh-term-glossary/)

在 DSH 对话中选中一个术语，点击选区旁的「搜索」按钮，就地查看该术语的解释：基本含义、用途、常见用法，并附带本次回答的 token 用量。解释通过旁路模型调用完成，不占用当前会话的轮次与上下文。

## 版本

仓库根目录即插件包（`package.json` 位于根目录）。包已发布至 npm：[`dsh-term-glossary`](https://www.npmjs.com/package/dsh-term-glossary)，并已收录进 DSH 插件市场（[精选列表条目](https://awesome-dsh-plugin.com/p/ashz555/dsh-term-glossary/)、[dsh.so 制品页](https://www.dsh.so/artifact/dsh-term-glossary/)），也可作为 git 依赖或预构建包安装。

| 版本 | 标签 | 分支 | 主要变化 |
|---|---|---|---|
| 0.1.0 | `v0.1.0` | `main` | 首个版本：选中术语后就地显示解释。Host 半边为单体实现，仅以「选中的术语 + 所在句子」作为上下文，提示词面向计算机领域读者。 |
| 0.2.0 | `v0.2.0` | `v2` | 增加会话线索领域适配；输出上限提高至 2400 token 并新增 `truncated` 标记；`index.js` 改为按内容哈希装载 `lib/impl.js`，Host 侧改动无需重启 dsh 即可生效。 |
| 0.3.0 | `v0.3.0` | `v3` | 交互重做：选中文本后先显示「搜索」按钮，由读者决定何时发起请求；解释框常驻至主动关闭，等待期间显示进度，返回后显示 token 用量与模型；移除框内追问输入。 |
| 0.3.1 | `v0.3.1` | `v3` | 模型路由自适应：按会话当前路由、profile 默认模型依次尝试，传输层失败时自动换用下一条路由重试一次；错误信息本地化并列出已尝试的路由。 |
| 0.3.2 | `v0.3.2` | `v3` | 文档版本：README 同步插件市场收录信息与三种安装方式。代码与 0.3.1 完全一致。 |
| 0.3.3 | `v0.3.3` | `v3` | 安全加固：读者关闭解释框即中止模型调用（不再空跑到 60 秒超时）；已产生文本的失败不再换路由重试（避免同一次点击重复计费）；错误信息脱敏（去掉 URL、截断长度，完整错误只写宿主日志）。 |

查看版本差异：`git diff main v3`。

## 用法

1. 在对话或任意正文区域选中一个术语，选区旁显示「搜索」按钮；此时不会发起任何请求。
2. 点击「搜索」，就地弹出解释框并显示进度。
3. 回答返回后，框底列出本次消耗的 token（输入 / 缓存 / 输出 / 合计）与使用的模型。
4. 按下 `Esc`、点击右上角 `×` 或点击框外任意位置可关闭解释框。解释框打开期间，仍可选中其他术语并点击按钮发起新的解释。

被选中的术语会连同所在句子一并发送，因此「这个」「它」等指代性表述同样可用。框内不支持追问，如需继续提问请在对话中进行。

## 安装

**前置条件**：带 Web 界面的 DSH，即 Desktop 应用或 `dsh web` 启动的 Web 版本。插件声明了 `webServer` 与 `llm` 两个硬依赖：前者用于注册 `/api/term-glossary/explain` 路由，后者用于发起旁路模型调用；两者缺一时插件不会激活。

### 方式一：从插件市场安装（推荐，无需命令行）

打开 **设置 → 插件 → 市场**，搜索 `dsh-term-glossary`，点击安装即可；安装完成后按 `Ctrl + R` 刷新页面。市场条目已同时关联 npm 包与预构建包，会按可用性自动选择下载来源。

也可以在 DSH 对话中交由 Agent 完成安装，例如发送：**帮我安装插件 dsh-term-glossary**（等价说法：*用 plugin_manager 的 install_bundle 安装 dsh-term-glossary*）。

### 方式二：从 npm 安装

npm 提供的是预构建产物，无需本地构建授权，国内镜像已同步，安装过程不需要访问 GitHub：

```powershell
dsh plugin --profile <profile 名称> add dsh-term-glossary
```

安装完成后按 `Ctrl + R` 刷新页面即可使用。

### 方式三：从源码安装

适用于需要修改代码，或需要使用 `v2`、`main` 等旧版本的情况。

**1. 获取源码。** 默认分支为 `v3`，直接 clone 即可：

```powershell
git clone https://github.com/ashz555/dsh-term-glossary.git
```

**2. 安装本地目录。** 在 DSH 对话中让 Agent 安装该目录（仓库根即插件包）：

> 用 plugin_manager 的 install_bundle，安装 `D:\path\to\dsh-term-glossary`

等价的工具调用参数为 `plugin_manager` / `action: install_bundle` / `target: <仓库根的绝对路径>`。依赖安装、bundle 注册与启用均由该调用完成，无需手工修改 profile 的 `package.json` 或 `cordis.patch.yml`，也不需要在 profile 目录中执行 pnpm。

**3. 确认生效。** 安装结果应为 `application: applied`，而非 `restart-required`；随后刷新页面即可使用。若该 profile 此前加载过同名插件的另一份代码（例如插件目录曾变更位置），需要重启一次 dsh 才会切换到新的实现。

**其他安装来源**：也可将本仓库作为 git 依赖安装（`github:ashz555/dsh-term-glossary#v3`），或指向 Release 中的预构建包（此地址始终指向最新版本）：

```powershell
dsh plugin --profile <profile 名称> add https://github.com/ashz555/dsh-term-glossary/releases/latest/download/dsh-term-glossary.tgz
```

> **网络受限时**：插件市场条目同时提供 npm 包、预构建包与 git 仓库三种来源，任一可达即可安装；其中预构建包与 git 依赖都不需要访问 npm。

### 安装位置与移动限制

`install_bundle` 注册的是 `link:<该目录>` 依赖，profile 直接指向该源码目录而非另行复制。目录被移动或删除后插件即失效，需要重新安装。

### 卸载

让 Agent 调用 `plugin_manager` / `action: remove_bundle` / `target: dsh-term-glossary`，或在插件管理页面中禁用、移除该 bundle。

> ⚠️ 开发提示：本仓库的工作树同时是被 `link:` 的插件目录，切换分支会改变 profile 正在加载的插件（例如从 `v3` 切换到 `main` 等于把运行中的插件替换为 0.1.0 实现）。需要对比其他版本时，请使用 `git worktree add ../check <branch>` 在其他目录检出。

## 领域适配

插件不预设术语所属领域。每次请求由 Host 半边读取当前会话自身的内容作为领域线索，交由模型判断术语所属领域（计算机、医学、法律、金融、化学等），并要求使用该领域通行的说法解释。

线索来自 `sessionQuery`，其行为均以真实会话数据验证：

| 线索 | 来源 | 说明 |
|---|---|---|
| 会话标题 | `sessionQuery.readTitle` | 概括会话主题 |
| 读者发送的消息 | `sessionQuery.filterEvents` 中的 `user/message` 语义文档 | 取最近 6 条，每条不超过 400 字，总计不超过 1500 字 |

线索采集包含两条基于实测结果确定的清洗规则：

- **不采用 assistant 语义文档**：真实会话中，assistant 文档会渲染整条 surface 消息，工具调用会以 `write {"content": …}` 这类机器载荷出现，对判断领域没有价值，只会挤占有效线索。
- **剔除 DSH 自身的运行时通知**：`Current runtime context. …`、`The approval policy changed …` 等注入内容在日志中同样属于 `user/message`，实测占用了大量线索长度；现已被过滤，并按文本去重。

代价：每次解释的输入增加约 200–700 token，取决于读者消息长度；线索为本地读取，实测耗时 20–40 ms，不产生额外的模型调用。

## 接口

```
POST /api/term-glossary/explain
Header: x-dsh-plugin: dsh-term-glossary
Body: { term, context?, question?, sessionId?, history?: [{ role, text }] }
200 : { ok: true, data: { answer, truncated, usage, model: { provider, model } } }
错误: { ok: false, error: { code, message } }
```

`usage` 为 provider 的 token 计数（`inputTokens` / `outputTokens` / `totalTokens`，命中缓存时另有 `cacheReadTokens`），界面直接显示于框底；`truncated` 为真表示模型停在上限、回答不完整。

`sessionId` 缺失或格式不合法时，静默降级为「无背景线索」；`sessionQuery` 缺失或读取失败同样降级，不会导致解释失败。

`question` 与 `history` 仍由接口接受（带历史的一次调用已由自检覆盖），但 0.3.0 起的界面不再发送这两个字段：框内追问已移除，字段保留供后续多轮界面或其他调用方使用。

## 配置

行 `term-glossary` 的 `config` 为可选项。该行没有 schemastery `Config`，因此不做校验，仅做防御性读取：

```yaml
- id: term-glossary
  name: dsh-term-glossary
  config:
    provider: deepseek-official
    model: deepseek-flash
```

两项均省略时使用 profile 的默认模型选择。

## 行为边界

- 仅在正文选区上触发：在输入框、文本域或可编辑区域内选中不会触发。
- 解释通过一次旁路模型调用完成（Host 半边的 `/api/term-glossary/explain` 路由），不写入会话日志、不进入 Agent 上下文、不影响正在进行的轮次。
- 0.3.0 起框内不再提供追问输入，一次解释对应一次调用。
- **模型路由选择顺序**：行 `config` 显式指定的路由（优先级最高）→ 当前会话正在使用的路由 → profile 默认模型；重复路由会被去重。会话路由是本机可用的路由，因此「对话正常但插件报错」的情况通常可以避免。
- 仅当失败发生在**产生任何文本之前**时，才自动换用下一条路由重试一次（此时尚未计费）；已经产出文本的失败一律不重试，避免同一次点击被收两次 token。
- 读者关闭解释框或页面离开时，立即中止这次的模型调用，不再空等到超时。
- 调用失败时，回传的是脱敏摘要（去掉 URL、截断到 400 字以内），并列出已尝试的 `provider/model`；完整错误只写宿主日志，不进入响应体。
- 未显式配置路由时，使用 profile 的默认模型（`agent-default-model`）；单次请求超时为 60 秒。
- 框底显示的 token 数字来自 provider 返回的用量。该模型的隐藏推理 token 计入 `outputTokens`，因此数字会大于可见文字对应的量。
- 输出上限为 2400 token。该模型的隐藏推理 token 同样计入此上限，因此上限设得远高于可见回答长度；若模型确实停在上限，回答会标注「回答达到长度上限」，不会静默返回不完整内容。
- 会话线索仅在本机读取，并随该次请求发送给正在处理这段对话的同一模型，不引入新的数据暴露面。

## 自检

```powershell
node tools/verify-plugin.mjs
```

该命令使用模拟的 Cordis 上下文运行 Host 半边（路由、请求头校验、请求体校验、模型路由回退、线索采集与清洗、流式拼装、错误码）与 shim 装载路径，并检查浏览器半边工厂与槽位注册。

## 包结构

| 文件 | 作用 |
|---|---|
| `index.js` | **字节稳定的 loader shim**：以 `?v=<内容哈希>` 动态载入 `lib/impl.js`，使 Host 侧改动在重装后生效而无需重启 dsh（此文件本身不应修改） |
| `lib/impl.js` | Host 半边实现：路由、会话线索采集、提示词、`ctx.llm.stream()` 调用 |
| `client.js` | 浏览器半边：手写 `__ModuleLoader__` 包，向 `shell.overlay` 槽位注册浮层组件，并通过槽位的 `useSessions` 选择器上报当前会话 id |
| `cordis.patch.yml` | bundle 补丁：插入 `term-glossary` 行以挂载本包 |
| `locale/{en,zh}.json` | 插件管理页显示的标题与说明 |
| `icon.svg` | 插件图标（不大于 256 KiB，相对路径） |

### 仓库内容

仓库根即插件包，`package.json` 的 `files` 字段只包含运行期所需的文件：

| 路径 | 作用 |
|---|---|
| `index.js`、`lib/`、`client.js` | 插件本体（Host 半边、浏览器半边） |
| `cordis.patch.yml`、`locale/`、`icon.svg` | bundle 补丁、显示文案、图标 |
| `tools/verify-plugin.mjs` | 本地自检 |
| `tools/asar.mjs` | 开发工具：从 DSH Desktop 的 `app.asar` 中读取随包文档与源码 |

`reference/` 为开发期间从 dsh 安装包中抽取的内部文档与源码，已在 `.gitignore` 中排除，不进入本仓库。

## 许可证

[MIT](./LICENSE)
