# dsh-term-glossary（术语速查）

选中 DSH 对话里的一个术语，就在它旁边开一个小的追问框：先自动解释**基本含义 → 用途 → 用法**，需要时再在同一个框里继续追问。不需要另开对话，也不会占用当前会话的轮次与上下文。

## 用法

1. 在对话（或任意正文区域）里用鼠标选中一个术语，选区右下角会出现一个「解释」小药丸。
2. 点它，弹出追问框并自动请求解释。
3. 在底部输入框里继续追问（Enter 发送，Shift+Enter 换行）。
4. `Esc`、右上角 `×`、或点击框外任意位置关闭。

被选中的术语会在请求时带上它所在的句子作为上下文，所以「这个」这类指代词也能问。

## 行为边界

- 只在正文选区上出现：输入框、文本域、可编辑区域内选中不会触发。
- 追问走的是一次**旁路模型调用**（host 半边的 `/api/term-glossary/explain` 路由），不写入会话日志、不进入 Agent 上下文、不影响正在进行的轮次。
- 默认使用 profile 的默认模型（`agent-default-model`，本机为 `deepseek-official / deepseek-flash`）；单次请求超时 90 秒。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半边：注册 `/api/term-glossary/explain`，拼系统提示与消息，调用 `ctx.llm.stream()` |
| `client.js` | 浏览器半边：手写 `__ModuleLoader__` 包，向 `shell.overlay` 槽位注册浮层组件 |
| `cordis.patch.yml` | bundle 补丁：插入 `term-glossary` 行挂载本包 |
| `locale/{en,zh}.json` | 插件管理页显示的标题与说明 |
| `icon.svg` | 插件图标（≤256 KiB，相对路径） |

## 配置

行 `term-glossary` 的 `config` 可选：

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
Body: { term, context?, question?, history?: [{ role, text }] }
200 : { ok: true, data: { answer, model: { provider, model } } }
错误: { ok: false, error: { code, message } }
```

## 本地自检

```powershell
node tools/verify-plugin.mjs   # 仓库根目录，用假 Cordis 上下文跑 Host 半边 + 加载浏览器半边工厂
```
