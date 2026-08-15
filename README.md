# dsh-plugin-deepseek-balance

English | [中文](README.zh.md)

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-dsh_web-4a9eff)
![License](https://img.shields.io/badge/license-MIT-green)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) Web plugin that shows your **DeepSeek balance and how much you have spent since this run** right inside the composer stats bar — no need to open the DeepSeek platform.

> 本次运行已用 ¥0.42 · 余额 ¥10.98

It renders one line directly under the existing token stats line (the `517 / 12.2K · 45.2s …` strip). Hover for details (granted / topped-up / last update); **click the spent figure to jump straight to the DeepSeek platform usage page** for official consumption details, and click the refresh icon at the end of the line to re-poll immediately.

## Table of Contents

- [Features](#features)
- [Preview](#preview)
- [How it works](#how-it-works)
- [Why "spent this run"?](#why-spent-this-run)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Verification](#verification)
- [Uninstall](#uninstall)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Development](#development)
- [License](#license)

## Features

- **Zero extra configuration** — reuses the `DEEPSEEK_API_KEY` credential the harness already has (the one the Web Models page writes); no separate key management.
- **Official API only** — reads the documented `GET https://api.deepseek.com/user/balance` endpoint; no scraping, no session tokens.
- **Live readout** — polls every 60 seconds; the readout sits in the same band as the built-in token stats (`conversation.composer.dock` slot), so it always lives together with the token bar.
- **One-click refresh** — the refresh icon at the end of the line forces an immediate upstream re-poll.
- **One click to the usage page** — the `spent this run` figure is a real hyperlink that opens the DeepSeek platform usage page (`platform.deepseek.com/usage`) in a new tab for the official consumption details.
- **Privacy-conscious** — the key never crosses to the browser; the browser only ever sees numbers served from a same-origin route on the local host. Nothing is written to logs or sent anywhere.
- **Top-up aware** — if you top up mid-run, the baseline lifts automatically so the spent figure never goes negative.
- **Dependency-free host** — the host half imports only Node built-ins, so it can be linked from anywhere without resolving extra packages.

## Preview

The meter is the last line under the composer card:

```
┌──────────────────────────────────────────────┐
│  517 / 12.2K · 45.2s · 12 tok/s    │ 42% …    │   ← existing stats line
│  本次运行已用 ¥0.42 · 余额 ¥10.98   ⟳        │   ← this plugin (click spent → platform usage; end-of-line icon → refresh)
└──────────────────────────────────────────────┘
```

Hover tooltip: `赠送 1.23 · 充值 9.75 · 更新于 14:32:05 · 点击已用跳转平台用量明细，点击右侧刷新图标立即刷新` (granted · topped-up · updated at · click spent for the platform usage page, click the refresh icon to re-poll).

## How it works

Two halves in one package:

1. **Host half** (`lib/index.js`) — a Cordis plugin that:
   - resolves the DeepSeek API key through the optional `credentials` seam (`ctx.credentials`), falling back to the process environment;
   - polls the official balance endpoint on an interval (default 60 s);
   - keeps a run-local baseline — the first balance observed after this process started — and computes `spentThisRun = baseline − current`;
   - serves a tiny JSON snapshot on the same-origin route `GET /plugin/deepseek-balance/status` (`POST` forces a refresh). The payload contains numbers only, never the API key.

2. **Browser half** (`lib/client.js`) — a `dsh.client` bundle that registers a component into the `conversation.composer.dock` slot, right after the shipped stats line, and renders the snapshot. A single shared poll loop serves every mounted session.

The plugin is registered through the profile's `cordis.patch.yml` (see [Installation](#installation)).

## Why "spent this run"?

DeepSeek's public API only exposes the current balance — there is **no official endpoint for usage/cost details** (the platform's usage page runs on private, session-authenticated APIs). The honest approximation without any login state is a delta:

- The first successful balance read of this **process run** anchors the baseline.
- Every later read reports `spent = baseline − current`.
- Restarting dsh resets the counter — hence the label **本次运行已用 / spent this run** rather than "today".

A restart also means spend that happened *before* dsh was running is not counted. If you keep dsh running across the whole day, the figure effectively tracks your daily spend.

## Requirements

- A DeepSeek Harness Web profile (this plugin is installed into `~/.dsh/profiles/web`).
- A configured DeepSeek credential — the harness's own `DEEPSEEK_API_KEY` (set via the Web **Settings → Models** page, or exported in the launching environment). The plugin reads it automatically.
- `node` with a built-in `fetch` (Node 18+) — the harness already runs on one.
- `pnpm` only needed at install time (the `dsh plugin` command forwards to it).

## Installation

Two steps:

```sh
# 1) Install the package (link: keeps the sources editable; file: copies instead)
dsh plugin --profile web add link:/path/to/dsh-plugin-deepseek-balance
```

```yaml
# 2) Register the plugin row in the profile patch layer:
#    edit ~/.dsh/profiles/web/cordis.patch.yml and append:
- insert:
    - id: deepseek-balance
      name: 'dsh-plugin-deepseek-balance'
```

Because the shared HMR row is disabled in the Web composition, the patch layer is **not** hot-reloaded: restart dsh (`Ctrl+C`, then run `dsh web` again) and **refresh the browser page**. The meter appears under the token stats line.

> On this machine both steps are already done — a restart + page refresh is all that remains.

## Configuration

The built-in defaults work out of the box. To override, add a `config` block to the row in `cordis.patch.yml`:

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | — | Literal API key. **Not recommended** — the key lands in a config file in plain text. |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential reference resolved through the credentials service (fallback: process env). |
| `baseURL` | `https://api.deepseek.com` | Base URL of the balance endpoint. |
| `currency` | `CNY` | Display currency; falls back to the first entry the API returns. |
| `pollMs` | `60000` | Poll interval (minimum 15 000 ms). |

Example:

```yaml
- insert:
    - id: deepseek-balance
      name: 'dsh-plugin-deepseek-balance'
      config:
        pollMs: 30000
```

## Usage

- **Read** — `本次运行已用 ¥0.42 · 余额 ¥10.98` under the composer.
- **Hover** — tooltip with granted / topped-up balance, an `余额不足` marker when `is_available` is false, and the last update time.
- **Click the spent figure** — opens the DeepSeek platform usage page (`https://platform.deepseek.com/usage`) in a new tab with the official consumption details (platform login required).
- **Click the refresh icon** — forces an immediate refresh (useful right after a spend or top-up).
- **Loading** — shows `DeepSeek 余额查询中…` until the first snapshot arrives.
- **Missing key** — shows `DeepSeek 余额：未配置 API Key` with a hint; the plugin retries every 5 seconds and heals as soon as a key becomes available.

## Verification

After a restart and page refresh you should see, in order:

1. The meter line under the token stats.
2. A hover tooltip with the balance details.
3. A correct `spent this run` figure: it starts at `0.00` right after boot, then grows as you chat.

You can also check the raw snapshot directly:

```sh
curl http://127.0.0.1:3080/plugin/deepseek-balance/status
# {"status":"ready","ok":true,...,"totalBalance":29.36,"spentThisRun":0.3,...}
```

## Uninstall

```sh
dsh plugin --profile web remove dsh-plugin-deepseek-balance
```

Then delete the `insert` block from `~/.dsh/profiles/web/cordis.patch.yml` and restart.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Line shows `未配置 API Key` | The credentials seam has no value for `apiKeyEnv`. Store the key via Settings → Models (or set a literal `apiKey` in the row config), then wait up to 5 s or click the line. |
| Line shows `查询失败` | Transient network/API failure — click the line or wait for the next poll; check the dsh console for a `deepseek-balance` warning. |
| Meter not visible after restart | The page may have loaded the old boot manifest — hard-refresh (Ctrl+F5). If still missing, confirm the row exists in `cordis.patch.yml` and that `dsh plugin --profile web list` shows the dependency. |
| Spent figure differs from the platform page | Expected: the figure measures *this run*, not the platform's daily totals (see [Why "spent this run"?](#why-spent-this-run)). |

## Limitations

- **No official usage API** — "spent this run" is a balance-delta approximation, not a billing report; it excludes spend that happened before dsh started.
- **Run-scoped** — restarting dsh resets the counter.
- **Numbers only on the wire** — the browser receives balance figures, never the API key; the snapshot is served loopback-only by design.

## Development

- The package is linked (`link:`) into the profile, so edits to the sources take effect as follows:
  - **Browser half** (`lib/client.js`): edit → refresh the page (the bundle is re-served from disk with `no-cache`).
  - **Host half** (`lib/index.js`): edit → restart dsh.
- Keep the host half dependency-free (Node built-ins only) so the `link:` install works from any directory.
- The client bundle is a plain, hand-written module in the exact `window.__ModuleLoader__.load({ id, factory })` format the harness serves under `/plugins/<name>/client.js` — no build step required.
- Verify quickly on a second instance: `dsh --profile web --port 3099`, then probe `/plugin/deepseek-balance/status` and `/plugins/dsh-plugin-deepseek-balance/client.js`.

## License

[MIT](LICENSE)
