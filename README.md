# dsh-term-glossary（术语速查）

选中 DSH 对话里的一个术语，就在它旁边开一个小的追问框：先自动解释**基本含义 → 用途 → 用法**，需要时再在同一个框里继续追问。不需要另开对话，也不会占用当前会话的轮次与上下文。

## 版本与分支

仓库根目录就是插件包本身（`package.json` 在根），可以直接作为 git 依赖引用。

| 版本 | 分支 | 标签 | 说明 |
|---|---|---|---|
| 第一版 | `main` | `v0.1.0` | 选中术语 + 就地追问框。Host 半边是单体实现，只有「选中的术语 + 所在句子」作为上下文，提示词面向计算机领域读者。 |
| 第二版 | `v2` | `v0.2.0` | 在 v1 之上加了三件事：**方案 B 领域适配**（Host 用 `sessionQuery` 读取会话标题与读者自己的话作为领域线索，交给模型自行判断术语属于哪个领域）、**截断如实上报**（该模型隐藏推理 token 计入 `maxTokens`，实测一次带线索的回答用掉 859/900 导致半句话返回，现上限 2400 且停在上限时返回 `truncated`）、**loader shim**（`index.js` 以 `?v=<内容哈希>` 载入 `lib/impl.js`，此后 Host 侧改动重装即生效、无需重启 dsh）。 |

想看两者差异：`git diff main v2`。

## 用法

1. 在对话（或任意正文区域）里用鼠标选中一个术语，选区右下角会出现一个「解释」小药丸。
2. 点它，弹出追问框并自动请求解释。
3. 在底部输入框里继续追问（Enter 发送，Shift+Enter 换行）。
4. `Esc`、右上角 `×`、或点击框外任意位置关闭。

被选中的术语会在请求时带上它所在的句子作为上下文，所以「这个」这类指代词也能问。

## 安装

**前置条件**：带 Web 界面的 DSH（Desktop 应用，或 `dsh web` 启的 Web 版）。插件声明了 `webServer` 与 `llm` 两个硬依赖：前者用来挂它自己的 `/api/term-glossary/explain` 路由，后者用来发那次旁路模型调用；两者缺一，插件不会激活。

**1. 拿到源码。** 本分支（`main`）即第一版；要第二版用 `-b v2`：

```powershell
git clone https://github.com/ashz555/dsh-term-glossary.git
```

**2. 在 DSH 对话里让 Agent 安装这个目录**（仓库根就是插件包）：

> 用 plugin_manager 的 install_bundle，安装 `D:\path\to\dsh-term-glossary`

等价的工具调用参数是 `plugin_manager` / `action: install_bundle` / `target: <仓库根的绝对路径>`。它会自己完成依赖安装、bundle 注册与启用；**不要手工去改 profile 的 `package.json` 或 `cordis.patch.yml`，也不要在 profile 目录里跑 pnpm** —— 那几步正是 `install_bundle` 代做的。

也可以把本仓库当作 git 依赖来装（`github:ashz555/dsh-term-glossary#v0.1.0`）：仓库根现在是合法包，这条路成立的前提是 pnpm 能访问 github.com —— 我这台机器上 github.com 不通，所以**没能实测这条路径**，本地 clone + Agent 安装那条是我实际验证过的。

**3. 确认生效。** 安装结果应为 `application: applied`（不是 `restart-required`），随后刷新页面即可看到「解释」药丸。若这个 profile 之前加载过同名插件的另一份代码，Host 侧要重启一次 dsh 才会换成新的。

**为什么装完不能移动或删除目录**：`install_bundle` 注册的是 `link:<该目录>` 依赖 —— profile 直接指向这份源码，而不是复制一份。目录被移走或删掉，插件就失效，需要重新安装。

**卸载**：让 Agent 用 `plugin_manager` / `action: remove_bundle` / `target: dsh-term-glossary`，或在插件管理页面里禁用 / 移除该 bundle。

> ⚠️ 开发提示：本仓库的工作树同时就是被 `link:` 的插件目录。**切分支会改变 profile 正在加载的插件**（从 `v2` 切到 `main` 等于把线上插件换成第一版）。想对比另一个版本，请用 `git worktree add ../check <branch>` 在别处检出。

## 行为边界

- 只在正文选区上出现：输入框、文本域、可编辑区域内选中不会触发。
- 追问走的是一次**旁路模型调用**（host 半边的 `/api/term-glossary/explain` 路由），不写入会话日志、不进入 Agent 上下文、不影响正在进行的轮次。
- 默认使用 profile 的默认模型（`agent-default-model`，本机为 `deepseek-official / deepseek-flash`）；单次请求超时 90 秒。

## 结构

仓库根即插件包（`package.json` 在根，`files` 只包含运行期需要的文件）：

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半边：注册 `/api/term-glossary/explain`，拼系统提示与消息，调用 `ctx.llm.stream()` |
| `client.js` | 浏览器半边：手写 `__ModuleLoader__` 包，向 `shell.overlay` 槽位注册浮层组件 |
| `cordis.patch.yml` | bundle 补丁：插入 `term-glossary` 行挂载本包 |
| `locale/{en,zh}.json` | 插件管理页显示的标题与说明 |
| `icon.svg` | 插件图标（≤256 KiB，相对路径） |
| `tools/verify-plugin.mjs` | 本地自检 |
| `tools/asar.mjs` | 开发时用来从 DSH Desktop 的 `app.asar` 里读取随包文档/源码的小工具 |

`reference/` 是开发期间从 dsh 安装包中抽出的**内部文档与源码**，已在 `.gitignore` 中排除，不会进入本仓库。

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
