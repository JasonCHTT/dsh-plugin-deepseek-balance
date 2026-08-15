/**
 * dsh-plugin-deepseek-balance — host half.
 *
 * Polls the official DeepSeek balance API (`GET /user/balance`, documented at
 * https://api-docs.deepseek.com/api/get-user-balance/) with the API key that
 * the harness already uses for the DeepSeek LLM adapter (resolved through the
 * `credentials` seam, falling back to the process environment), and exposes a
 * tiny JSON status route to the browser plugin:
 *
 *   GET  /plugin/deepseek-balance/status   → cached snapshot
 *   POST /plugin/deepseek-balance/status   → refresh immediately, then return
 *
 * "Spent this run" is the delta between the first balance observed after THIS
 * process started and the current balance, kept in memory only — a restart
 * starts the counter fresh. A top-up that lifts the balance above the
 * in-memory baseline resets the baseline, so the figure never goes negative.
 *
 * The plugin is deliberately dependency-free so it can be linked from anywhere.
 * @module dsh-plugin-deepseek-balance
 */

export const name = 'deepseek-balance';
export const inject = ['webServer', 'timer'];

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_CURRENCY = 'CNY';
const DEFAULT_POLL_MS = 60_000;
const MIN_POLL_MS = 15_000;
const RETRY_MS = 5_000;

function round2(value) {
	return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Error snapshot for the browser half (never carries the API key). */
function errorState(status, error) {
	return {
		status,
		ok: false,
		error,
		available: null,
		currency: null,
		totalBalance: null,
		grantedBalance: null,
		toppedUpBalance: null,
		spentThisRun: null,
		updatedAt: new Date().toISOString()
	};
}

/**
 * Client-plugin body: poll the balance API on an interval and serve the
 * snapshot on a webserver route for the browser half.
 * @param ctx - plugin context supplying the webserver service.
 * @param config - row config merged over the built-in defaults.
 */
export function apply(ctx, config = {}) {
	const cfg = {
		apiKeyEnv: DEFAULT_API_KEY_ENV,
		baseURL: DEFAULT_BASE_URL,
		currency: DEFAULT_CURRENCY,
		pollMs: DEFAULT_POLL_MS,
		...config
	};
	const apiKeyEnv = REF_PATTERN.test(String(cfg.apiKeyEnv ?? '')) ? cfg.apiKeyEnv : DEFAULT_API_KEY_ENV;
	const baseURL = String(cfg.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/u, '');
	const currency = String(cfg.currency ?? DEFAULT_CURRENCY);
	const pollMs = Math.max(MIN_POLL_MS, Number(cfg.pollMs) || DEFAULT_POLL_MS);

	const logger = ctx.logger('deepseek-balance');

	/** The snapshot the browser half reads. Mutated in place; serialized per request. */
	const state = {
		status: 'loading',
		ok: false,
		error: null,
		available: null,
		currency: null,
		totalBalance: null,
		grantedBalance: null,
		toppedUpBalance: null,
		spentThisRun: null,
		updatedAt: null
	};

	/** First balance observed after this process started; null until the first success. */
	let baseline = null;

	/** Resolve the DeepSeek API key for one poll, never retained. */
	async function resolveApiKey() {
		const literal = cfg.apiKey;
		if (typeof literal === 'string' && literal.trim().length > 0) return literal.trim();
		// The credentials seam can settle slightly after this plugin's own
		// activation; the optional `get` reads it live per poll, and the
		// retry below re-polls shortly after boot.
		const credentials = ctx.get('credentials');
		if (credentials !== void 0) {
			try {
				const hit = await credentials.resolve(apiKeyEnv);
				if (hit !== void 0 && typeof hit.value === 'string' && hit.value.length > 0) return hit.value;
			} catch (error) {
				logger.warn(`credential resolution for ${apiKeyEnv} failed: ${String(error)}`);
			}
		}
		const ambient = process.env[apiKeyEnv] ?? process.env[apiKeyEnv.toUpperCase()];
		if (typeof ambient === 'string' && ambient.length > 0) return ambient;
		return void 0;
	}

	let retryHandle = null;
	let refreshInFlight = false;

	async function refresh() {
		if (refreshInFlight) return;
		refreshInFlight = true;
		try {
			const apiKey = await resolveApiKey();
			if (apiKey === void 0) {
				Object.assign(state, errorState('error', 'missing-key'));
				scheduleRetry();
				return;
			}
			let response;
			try {
				response = await fetch(`${baseURL}/user/balance`, {
					headers: {
						authorization: `Bearer ${apiKey}`,
						accept: 'application/json'
					}
				});
			} catch (error) {
				Object.assign(state, errorState('error', 'fetch-failed'));
				logger.warn(`balance request failed: ${String(error)}`);
				scheduleRetry();
				return;
			}
			if (!response.ok) {
				Object.assign(state, errorState('error', `http-${response.status}`));
				scheduleRetry();
				return;
			}
			const body = await response.json();
			const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : [];
			const info = infos.find((entry) => entry?.currency === currency) ?? infos[0];
			if (info === void 0 || typeof info.total_balance !== 'string') {
				Object.assign(state, errorState('error', 'empty-balance'));
				scheduleRetry();
				return;
			}
			const total = Number(info.total_balance);
			const granted = Number(info.granted_balance ?? 0);
			const toppedUp = Number(info.topped_up_balance ?? 0);
			if (baseline === null || total > baseline + 1e-9) {
				// First observation of this run, or a top-up lifted the balance:
				// (re)anchor the baseline so spend stays non-negative.
				baseline = total;
			}
			const spent = Math.max(0, baseline - total);
			Object.assign(state, {
				status: 'ready',
				ok: true,
				error: null,
				available: body?.is_available === true,
				currency: info.currency ?? currency,
				totalBalance: round2(total),
				grantedBalance: round2(granted),
				toppedUpBalance: round2(toppedUp),
				spentThisRun: round2(spent),
				updatedAt: new Date().toISOString()
			});
		} catch (error) {
			Object.assign(state, errorState('error', 'fetch-failed'));
			logger.warn(`balance refresh failed: ${String(error)}`);
			scheduleRetry();
		} finally {
			refreshInFlight = false;
		}
	}

	/** Quick recovery while the state is broken; the regular poll keeps it fresh. */
	function scheduleRetry() {
		if (retryHandle !== null) return;
		retryHandle = setTimeout(() => {
			retryHandle = null;
			void refresh();
		}, RETRY_MS);
	}

	// Poll loop and retry timer are disposal-aware.
	ctx.interval(() => {
		void refresh();
	}, pollMs);
	ctx.effect(() => () => {
		if (retryHandle !== null) clearTimeout(retryHandle);
	}, 'deepseek-balance: retry cleanup');
	void refresh();

	// Status route for the browser half (same-origin; exposes numbers only,
	// never the API key).
	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: '/plugin/deepseek-balance/status',
		handler: async (req, res) => {
			if (req.method === 'POST') await refresh();
			const body = JSON.stringify(state);
			res.writeHead(200, {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store'
			});
			res.end(body);
		}
	}), 'deepseek-balance: status route');
}
