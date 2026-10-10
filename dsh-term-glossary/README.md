# dsh-term-glossary（术语速查）

选中 DSH 对话里的一个术语，就在它旁边开一个小的追问框：先自动解释**基本含义 → 用途 → 用法**，需要时再在同一个框里继续追问。不需要另开对话，也不会占用当前会话的轮次与上下文。

## 用法

1. 在对话（或任意正文区域）里用鼠标选中一个术语，选区旁边会出现一个「解释」小药丸。
2. 点它，弹出追问框并自动请求解释。
3. 在底部输入框里继续追问（Enter 发送，Shift+Enter 换行）。
4. `Esc`、右上角 `×`、或点击框外任意位置关闭。

被选中的术语会连同它所在的句子一起发送，所以「这个」「它」之类的指代也能问。

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

代价：每次追问的输入大约多 200–700 token（取决于读者消息长度）；线索是本地读取，实测 20–40 ms，不产生额外模型调用。

## 行为边界

- 只在正文选区上出现：输入框、文本域、可编辑区域内选中不会触发。
- 追问走的是一次**旁路模型调用**（Host 半边的 `/api/term-glossary/explain` 路由），不写入会话日志、不进入 Agent 上下文、不影响正在进行的轮次。
- 默认使用 profile 的默认模型（`agent-default-model`，本机为 `deepseek-official / deepseek-flash`）；单次请求超时 90 秒。
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
200 : { ok: true, data: { answer, model: { provider, model } } }
错误: { ok: false, error: { code, message } }
```

`sessionId` 缺失或格式不合法时静默降级为「无背景线索」；`sessionQuery` 缺失或读取失败同样降级，绝不因此让解释失败。

## 本地自检

```powershell
node tools/verify-plugin.mjs
```

用假 Cordis 上下文跑通 Host 半边（路由、头部校验、body 校验、模型路由回退、线索采集与清洗、流式拼装、错误码）、shim 装载路径，以及浏览器半边工厂与槽位注册。
