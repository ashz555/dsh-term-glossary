# dsh-term-glossary

DSH（DeepSeek Harness）插件：**在对话里选中一个术语，就在旁边弹出一个小的追问框**，先自动解释「基本含义 → 用途 → 用法」，需要时再继续追问。不用另开对话，也不占用当前会话的轮次与上下文。

## 两个版本

| 版本 | 分支 | 标签 | 说明 |
|---|---|---|---|
| 第一版 | `main` | `v0.1.0` | 选中术语 + 就地追问框。Host 半边是单体实现，只有「选中的术语 + 所在句子」作为上下文，提示词面向计算机领域读者。 |
| 第二版 | `v2` | `v0.2.0` | 在 v1 之上加了三件事：**方案 B 领域适配**（Host 用 `sessionQuery` 读取当前会话的标题与读者自己的话作为领域线索，交给模型自行判断术语属于哪个领域）、**截断如实上报**（该模型隐藏推理 token 会计入 `maxTokens`，实测一次带线索的回答用掉 859/900 导致半句话返回，现上限提到 2400 并在停在上限时返回 `truncated`）、**loader shim**（`index.js` 以 `?v=<内容哈希>` 载入 `lib/impl.js`，此后 Host 侧改动重装即生效，无需重启 dsh）。 |

想看两者的差异：`git diff main v2 -- dsh-term-glossary/`。

插件本身的文档在 [`dsh-term-glossary/README.md`](dsh-term-glossary/README.md)，两个分支里各有一份、内容对应各自版本。

## 安装

**前置条件**：带 Web 界面的 DSH（Desktop 应用，或 `dsh web` 启的 Web 版）。插件声明了 `webServer` 与 `llm` 两个硬依赖：前者用来挂它自己的 `/api/term-glossary/explain` 路由，后者用来发那次旁路模型调用；两者缺一，插件不会激活。

本插件**没有发布到 npm，也没有上架插件市场**，目前只能从源码安装。

**1. 把仓库放到一个长期保留的位置。** 默认分支是 `main`，也就是**第一版**；要装第二版请指定 `v2`：

```powershell
git clone -b v2 https://github.com/ashz555/dsh-term-glossary.git
```

**2. 在 DSH 对话里让 Agent 安装插件子目录**（注意 `target` 指向的是仓库里的 `dsh-term-glossary/` 子目录，不是仓库根）：

> 用 plugin_manager 的 install_bundle，安装 `D:\path\to\dsh-term-glossary\dsh-term-glossary`

等价的工具调用参数是 `plugin_manager` / `action: install_bundle` / `target: <插件目录的绝对路径>`。它会自己完成依赖安装、bundle 注册与启用；**不要手工去改 profile 的 `package.json` 或 `cordis.patch.yml`，也不要在 profile 目录里跑 pnpm** —— 那几步正是 `install_bundle` 代做的，手改容易把 profile 弄坏。

**3. 确认生效。** 安装结果应为 `application: applied`（不是 `restart-required`），随后刷新页面即可看到「解释」药丸。若这个 profile 之前加载过同名插件的另一份代码，Host 侧要重启一次 dsh 才会换成新的。

**为什么装完不能移动或删除目录**：`install_bundle` 注册的是 `link:<该目录>` 依赖 —— profile 直接指向这份源码，而不是复制一份。目录被移走或删掉，插件就失效，需要重新安装。

**卸载**：让 Agent 用 `plugin_manager` / `action: remove_bundle` / `target: dsh-term-glossary`，或在插件管理页面里禁用 / 移除该 bundle。

## 仓库内容

| 路径 | 作用 |
|---|---|
| `dsh-term-glossary/` | 插件包本体（manifest、Host 半边、浏览器半边、bundle 补丁、locale、图标） |
| `tools/verify-plugin.mjs` | 本地自检：用假 Cordis 上下文跑通 Host 半边与浏览器半边注册 |
| `tools/asar.mjs` | 从 DSH Desktop 的 `app.asar` 中读取随包文档/源码的小工具（开发时用来核对接口） |

`reference/` 是开发期间从 dsh 安装包中抽出的**内部文档与源码**，已在 `.gitignore` 中排除，不会进入本仓库。
