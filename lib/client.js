window.__ModuleLoader__.load({
	id: "dsh-plugin-deepseek-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region dsh-plugin-deepseek-balance client styles
		const css = ".dspb_root{box-sizing:border-box;width:100%;text-align:center;color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;margin:0 auto;padding:2px calc(var(--dsh-composer-side-clearance) + 16px) 4px;font-size:12px;line-height:20px;font-variant-numeric:tabular-nums;display:block;overflow:hidden}.dspb_clickable{cursor:pointer}.dspb_clickable:hover{color:var(--dsw-alias-label-secondary)}.dspb_link{color:inherit;text-decoration:none;cursor:pointer}.dspb_link:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dspb_refresh{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin:0 0 0 4px;padding:0;border:none;background:none;color:inherit;cursor:pointer;vertical-align:-4px;border-radius:4px}.dspb_refresh:hover{color:var(--dsw-alias-label-primary)}.dspb_refresh svg{width:13px;height:13px;fill:currentColor}.dspb_refresh:focus-visible{outline:1px solid var(--dsw-alias-label-primary);outline-offset:1px}.dspb_figure{color:var(--dsw-alias-label-secondary)}";
		const tagId = "dsh-plugin-deepseek-balance/BalanceMeter.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-deepseek-balance";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/client.js
		/** Status endpoint served by this plugin's host half. */
		const STATUS_URL = "/plugin/deepseek-balance/status";
		/** DeepSeek open platform usage page (consumption details; needs login). */
		const USAGE_URL = "https://platform.deepseek.com/usage";
		/** Shared poll loop so one timer serves every mounted session's meter. */
		let state = null;
		let inFlight = null;
		let timer = null;
		const listeners = new Set();
		function notify(next) {
			state = next;
			for (const fn of listeners) fn();
		}
		async function poll() {
			if (inFlight !== null) return inFlight;
			inFlight = fetch(STATUS_URL, { cache: "no-store" }).then((res) => res.json()).then((snap) => notify(snap)).catch(() => {}).finally(() => {
				inFlight = null;
			});
			return inFlight;
		}
		/** Immediate refresh on click: ask the host to re-poll upstream, then re-read. */
		async function refreshNow() {
			try {
				const res = await fetch(STATUS_URL, { method: "POST" });
				if (res.ok) notify(await res.json());
			} catch {}
		}
		function subscribe(fn) {
			listeners.add(fn);
			if (timer === null && typeof setInterval !== "undefined") timer = setInterval(() => {
				void poll();
			}, 60_000);
			return () => {
				listeners.delete(fn);
				if (listeners.size === 0 && timer !== null) {
					clearInterval(timer);
					timer = null;
				}
			};
		}
		/** Point-in-time snapshot re-rendered by the shared poll's notifications. */
		function useBalanceState() {
			const [snap, setSnap] = react.useState(() => state);
			react.useEffect(() => {
				setSnap(state);
				void poll();
				return subscribe(() => setSnap(state));
			}, []);
			return snap;
		}
		function money(value) {
			const n = Number(value);
			return Number.isFinite(n) ? n.toFixed(2) : "--";
		}
		function clock(iso) {
			if (iso === null) return "";
			const date = new Date(iso);
			return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour12: false });
		}
		/**
		 * Snapshot → view model. The ready state splits the line into two
		 * interactive parts: the spent figure (linked to the platform's usage
		 * page) and the balance figure (click-to-refresh).
		 */
		function meterView(snap) {
			if (snap === null || snap.status === "loading") {
				return { kind: "plain", text: "DeepSeek 余额查询中…", clickable: false, title: "正在通过官方余额接口查询" };
			}
			if (!snap.ok) {
				if (snap.error === "missing-key") {
					return {
						kind: "plain",
						text: "DeepSeek 余额：未配置 API Key",
						clickable: true,
						title: "在「设置 → 模型」中填写 DeepSeek API Key（凭据 DEEPSEEK_API_KEY），或在插件配置里设置 apiKey；点击可重试"
					};
				}
				return {
					kind: "plain",
					text: "DeepSeek 余额查询失败",
					clickable: true,
					title: `查询失败（${String(snap.error)}），点击重试`
				};
			}
			const granted = money(snap.grantedBalance);
			const toppedUp = money(snap.toppedUpBalance);
			const time = clock(snap.updatedAt);
			const low = snap.available === false ? " · 余额不足" : "";
			return {
				kind: "ready",
				usageUrl: USAGE_URL,
				spentText: `本次运行已用 ¥${money(snap.spentThisRun)}`,
				balanceText: ` · 余额 ¥${money(snap.totalBalance)}`,
				title: `赠送 ${granted} · 充值 ${toppedUp}${low} · 更新于 ${time} · 点击已用跳转平台用量明细，点击右侧刷新图标立即刷新`
			};
		}
		function BalanceMeter() {
			const snap = useBalanceState();
			const view = meterView(snap);
			if (view.kind === "ready") {
				// The spent figure links to the platform usage page; the
				// balance figure is static text, and a refresh icon on the
				// right re-polls upstream.
				return react.createElement("span", { className: "dspb_root", title: view.title },
					react.createElement("a", {
						className: "dspb_link",
						href: view.usageUrl,
						target: "_blank",
						rel: "noreferrer",
						title: "打开 DeepSeek 开放平台查看用量明细"
					}, view.spentText),
					view.balanceText,
					react.createElement("button", {
						className: "dspb_refresh",
						type: "button",
						title: "立即刷新",
						"aria-label": "立即刷新余额",
						onClick: () => {
							void refreshNow();
						}
					}, react.createElement("svg", {
						viewBox: "0 0 24 24",
						"aria-hidden": "true",
						focusable: "false"
					}, react.createElement("path", {
						d: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
					})))
				);
			}
			const className = `dspb_root${view.clickable ? " dspb_clickable" : ""}`;
			return react.createElement("span", {
				className,
				title: view.title,
				onClick: view.clickable ? () => {
					void refreshNow();
				} : void 0
			}, view.text);
		}
		/** Required services: the slot registry lives in dsh-client-runtime. */
		const inject = ["slots"];
		/**
		 * Client plugin body: contribute the balance meter to the composer dock,
		 * the band under the composer card where the shipped stats line
		 * (tokens / cache-hit / durations) already lives — so the balance
		 * readout sits together with the token bar.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "deepseek-balance",
				order: 10
			}, BalanceMeter));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
