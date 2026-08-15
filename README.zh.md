# dsh-plugin-deepseek-balance

[English](README.md) | 中文

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-dsh_web-4a9eff)
![License](https://img.shields.io/badge/license-MIT-green)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）Web 插件：**不用打开 DeepSeek 开放平台**，直接在会话输入框下方的 token 统计栏里显示**本次运行已用的余额和剩余余额**。

> 本次运行已用 ¥0.42 · 余额 ¥10.98

它渲染在原有 token 统计行（`517 / 12.2K · 45.2s …` 那一行）的正下方。鼠标悬停显示明细（赠送 / 充值 / 更新时间）；**点击「本次运行已用」直接跳转 DeepSeek 开放平台用量页**查看官方消费明细，点击行尾的刷新按钮立即刷新。

## 目录

- [功能特性](#功能特性)
- [效果预览](#效果预览)
- [工作原理](#工作原理)
- [为什么是「本次运行已用」](#为什么是本次运行已用)
- [环境要求](#环境要求)
- [安装](#安装)
- [配置](#配置)
- [使用](#使用)
- [验证](#验证)
- [卸载](#卸载)
- [常见问题](#常见问题)
- [已知限制](#已知限制)
- [开发说明](#开发说明)
- [许可证](#许可证)

## 功能特性

- **零额外配置** —— 直接复用 Harness 已有的 `DEEPSEEK_API_KEY` 凭据（就是「设置 → 模型」里填的那个），无需单独管理 Key。
- **只走官方接口** —— 读取文档化的 `GET https://api.deepseek.com/user/balance` 接口，不爬网页、不需要登录态。
- **实时显示** —— 默认每 60 秒轮询；显示位置与内置 token 统计同处一条栏（`conversation.composer.dock` 插槽），始终和 token 栏在一起。
- **一键刷新** —— 行尾的刷新按钮可立即触发一次上游重新查询。
- **一键直达用量页** —— 「本次运行已用」数字本身是超链接，点击即在新标签页打开 DeepSeek 开放平台用量页（`platform.deepseek.com/usage`）查看官方消费明细。
- **隐私安全** —— API Key 从不进入浏览器，浏览器只能读到本机同源路由返回的数字；不写日志、不外发。
- **充值自适应** —— 运行期间充值（余额超过基线）时基线自动抬高，「已用」不会变成负数。
- **宿主零依赖** —— 宿主侧只使用 Node 内置模块，从任意目录 link 安装都能直接运行。

## 效果预览

该行位于输入框卡片下方：

```
┌──────────────────────────────────────────────┐
│  517 / 12.2K · 45.2s · 12 tok/s    │ 42% …    │   ← 原有 token 统计行
│  本次运行已用 ¥0.42 · 余额 ¥10.98   ⟳        │   ← 本插件（点击已用→平台用量页；行尾按钮→刷新）
└──────────────────────────────────────────────┘
```

悬停提示：`赠送 1.23 · 充值 9.75 · 更新于 14:32:05 · 点击已用跳转平台用量明细，点击右侧刷新图标立即刷新`。

## 工作原理

一个包、两半：

1. **宿主侧**（`lib/index.js`）—— 一个 Cordis 插件，负责：
   - 通过可选凭据服务（`ctx.credentials`）解析 DeepSeek API Key，缺省时回退到进程环境变量；
   - 按间隔（默认 60 秒）轮询官方余额接口；
   - 维护一个「本次运行基线」——本进程启动后首次观测到的余额，并计算 `本次运行已用 = 基线 − 当前余额`；
   - 在同源路由 `GET /plugin/deepseek-balance/status` 上暴露一个极小的 JSON 快照（`POST` 立即刷新）。负载只含数字，绝不含 API Key。

2. **浏览器侧**（`lib/client.js`）—— 一个 `dsh.client` bundle，把组件注册进 `conversation.composer.dock` 插槽（紧跟官方统计行之后）并渲染快照；所有会话共用同一个轮询循环。

插件通过 profile 的 `cordis.patch.yml` 注册（见[安装](#安装)）。

## 为什么是「本次运行已用」

DeepSeek 公开 API 只暴露当前余额，**没有官方用量/消费明细接口**（平台用量页走的是私有、需登录态的接口）。不引入登录态的诚实近似就是做差值：

- 本**进程运行**后的首次成功余额读取锚定基线；
- 之后每次读取报告 `已用 = 基线 − 当前余额`；
- 重启 dsh 即归零重计 —— 因此标签是「本次运行已用」，而不是「今日」。

重启也意味着 dsh 启动之前发生的消费不会被计入。如果 dsh 整天保持运行，这个数字实际就能近似你当天的消费。

## 环境要求

- 一个 DeepSeek Harness Web profile（本插件安装在 `~/.dsh/profiles/web`）。
- 已配置 DeepSeek 凭据 —— Harness 自带的 `DEEPSEEK_API_KEY`（在 Web「设置 → 模型」里填写，或从启动环境导出）。插件自动读取。
- 带内置 `fetch` 的 Node（18+）—— Harness 本身就运行在这样的 Node 上。
- `pnpm` 只在安装时用到（`dsh plugin` 命令会转发给它）。

## 安装

两步：

```sh
# 1) 安装插件包（link: 保持源码可编辑；也可用 file: 复制安装）
dsh plugin --profile web add link:/path/to/dsh-plugin-deepseek-balance
```

```yaml
# 2) 在 profile 补丁层注册插件行：编辑 ~/.dsh/profiles/web/cordis.patch.yml，追加：
- insert:
    - id: deepseek-balance
      name: 'dsh-plugin-deepseek-balance'
```

由于 Web 组合中共享 HMR 行默认关闭、补丁层不会热更新：请**重启 dsh**（`Ctrl+C` 后重新运行 `dsh web`），然后**刷新浏览器页面**。余额栏会出现在 token 统计行下方。

> 本机两步均已完成 —— 只差一次重启 + 刷新页面。

## 配置

内置默认值开箱即用。如需覆盖，在 `cordis.patch.yml` 的插件行里加 `config` 块：

| 键 | 默认值 | 说明 |
|---|---|---|
| `apiKey` | 无 | 直接写 API Key。**不建议** —— 明文进入配置文件。 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 凭据引用，经凭据服务解析（回退：进程环境变量）。 |
| `baseURL` | `https://api.deepseek.com` | 余额接口基地址。 |
| `currency` | `CNY` | 显示币种；缺失时取接口返回的第一个。 |
| `pollMs` | `60000` | 轮询间隔（最小 15 000 毫秒）。 |

示例：

```yaml
- insert:
    - id: deepseek-balance
      name: 'dsh-plugin-deepseek-balance'
      config:
        pollMs: 30000
```

## 使用

- **查看** —— 输入框下方显示 `本次运行已用 ¥0.42 · 余额 ¥10.98`。
- **悬停** —— 提示赠送 / 充值余额，`is_available` 为 false 时标注「余额不足」，并显示最后更新时间。
- **点击「本次运行已用」** —— 在新标签页打开 DeepSeek 开放平台用量页（`https://platform.deepseek.com/usage`），查看官方消费明细（需登录平台）。
- **点击行尾刷新按钮** —— 立即刷新（消费或充值后想马上看到可以用）。
- **加载中** —— 首个快照到达前显示 `DeepSeek 余额查询中…`。
- **缺少 Key** —— 显示 `DeepSeek 余额：未配置 API Key` 及提示；插件每 5 秒自动重试，Key 一旦可用即自动恢复。

## 验证

重启并刷新页面后，依次应该看到：

1. token 统计行下方的余额行；
2. 悬停出现余额明细提示；
3. 「本次运行已用」数值正确：刚启动时为 `0.00`，对话后逐渐增长。

也可以直接查看原始快照：

```sh
curl http://127.0.0.1:3080/plugin/deepseek-balance/status
# {"status":"ready","ok":true,...,"totalBalance":29.36,"spentThisRun":0.3,...}
```

## 卸载

```sh
dsh plugin --profile web remove dsh-plugin-deepseek-balance
```

然后删除 `~/.dsh/profiles/web/cordis.patch.yml` 里对应的 `insert` 块，并重启。

## 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 显示「未配置 API Key」 | 凭据服务里没有 `apiKeyEnv` 对应的值。在「设置 → 模型」里填入 Key（或在插件行配置里写 `apiKey`），等 5 秒或点击该行重试。 |
| 显示「查询失败」 | 网络/接口瞬时故障 —— 点击该行或等下一次轮询；可在 dsh 控制台查看 `deepseek-balance` 的警告日志。 |
| 重启后看不到余额行 | 页面可能加载了旧的启动清单 —— 强制刷新（Ctrl+F5）。仍不行则确认 `cordis.patch.yml` 里有该行、且 `dsh plugin --profile web list` 能看到该依赖。 |
| 数字和平台用量页对不上 | 正常：本插件统计的是「本次运行」，不是平台按日汇总（见[为什么是「本次运行已用」](#为什么是本次运行已用)）。 |

## 已知限制

- **无官方用量接口** —— 「本次运行已用」是余额差值的近似，不是账单；dsh 启动前的消费不计入。
- **随运行重置** —— 重启 dsh 后重新计数。
- **线上只有数字** —— 浏览器只拿到余额数字、永远拿不到 API Key；快照默认只在回环地址提供服务。

## 开发说明

- 插件以 `link:` 方式装入 profile，源码修改生效方式如下：
  - **浏览器侧**（`lib/client.js`）：改完直接刷新页面（bundle 以 `no-cache` 从磁盘重新下发）。
  - **宿主侧**（`lib/index.js`）：改完需要重启 dsh。
- 请保持宿主侧零依赖（只用 Node 内置模块），这样 `link:` 从任何目录安装都能运行。
- 客户端 bundle 是手写的、符合 `window.__ModuleLoader__.load({ id, factory })` 格式的纯模块，由 Harness 在 `/plugins/<name>/client.js` 下发，无需构建步骤。
- 快速验证：`dsh --profile web --port 3099` 起第二个实例，然后探测 `/plugin/deepseek-balance/status` 与 `/plugins/dsh-plugin-deepseek-balance/client.js`。

## 许可证

[MIT](LICENSE)
