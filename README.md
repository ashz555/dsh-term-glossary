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

```
plugin_manager install_bundle  <本仓库 dsh-term-glossary 目录的绝对路径>
```

或把目录放到稳定位置后用 `link:` 依赖挂进 profile。

## 仓库内容

| 路径 | 作用 |
|---|---|
| `dsh-term-glossary/` | 插件包本体（manifest、Host 半边、浏览器半边、bundle 补丁、locale、图标） |
| `tools/verify-plugin.mjs` | 本地自检：用假 Cordis 上下文跑通 Host 半边与浏览器半边注册 |
| `tools/asar.mjs` | 从 DSH Desktop 的 `app.asar` 中读取随包文档/源码的小工具（开发时用来核对接口） |

`reference/` 是开发期间从 dsh 安装包中抽出的**内部文档与源码**，已在 `.gitignore` 中排除，不会进入本仓库。
