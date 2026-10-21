const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{0,32}$/;
const CACHE_TTL = 300; // seconds
const FALLBACK_TIER = 0;

// Hostname used in README weak-match verification (must match production).
const SERVICE_HOST = "whale-star.whale-star.workers.dev";

// Verification budget: at most 3 README checks per repo per day, and at
// least 2h between consecutive checks of the same repo (cold-start first
// check excepted — nothing to space from). An ok=true verdict goes stale
// after 8h (≈3 refreshes/day max).
const VERIFY_STALE_MS = 8 * 60 * 60 * 1000;
const VERIFY_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const VERIFY_DAILY_BUDGET = 3;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Pure decision: should this repo be README-verified right now?
 * Cross-day checks reset is applied in-memory (read-only for /hit).
 */
function decideVerify(rec, now, day) {
  if (!rec) return true; // cold start
  const checks = rec.day === day ? rec.checks : 0;
  if (rec.ok) {
    if (now - rec.ts <= VERIFY_STALE_MS) return false; // fresh pass
    return checks < VERIFY_DAILY_BUDGET; // stale: refresh within budget
  }
  if (checks >= VERIFY_DAILY_BUDGET) return false;
  return now - rec.ts >= VERIFY_MIN_INTERVAL_MS;
}

/** Accumulate one verified hit into the "s" stats blob (with growth bounds). */
function bumpCount(data, day, repo, pack, tier) {
  data.total += 1;
  data.days[day] = (data.days[day] || 0) + 1;
  const key = `${repo}|${pack}|${tier}`;
  data.repos[key] = (data.repos[key] || 0) + 1;
  // Bound growth: keep the freshest 500 entries by count.
  const entries = Object.entries(data.repos);
  if (entries.length > 500) {
    entries.sort((a, b) => b[1] - a[1]);
    data.repos = Object.fromEntries(entries.slice(0, 500));
  }
  const dayKeys = Object.keys(data.days).sort();
  if (dayKeys.length > 30) {
    for (const k of dayKeys.slice(0, dayKeys.length - 30)) delete data.days[k];
  }
  return data;
}

/** Exact call counter (single-instance Durable Object — no races, no extra tokens). */
export class StatsDO {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/hit") {
      const { repo, pack, tier } = await request.json();
      const day = today();
      const v = (await this.state.storage.get("v")) || {};
      const rec = v[repo];
      const needVerify = decideVerify(rec, Date.now(), day);
      if (!needVerify) {
        if (rec && rec.ok) {
          const data = (await this.state.storage.get("s")) || {
            total: 0,
            days: {},
            repos: {},
          };
          bumpCount(data, day, repo, pack, tier);
          await this.state.storage.put("s", data);
        }
        return Response.json({
          needVerify: false,
          ok: !!(rec && rec.ok),
          counted: !!(rec && rec.ok),
        });
      }
      return Response.json({ needVerify: true, ok: false, counted: false });
    }
    if (request.method === "POST" && url.pathname === "/verdict") {
      const { repo, ok, pack, tier } = await request.json();
      const day = today();
      const v = (await this.state.storage.get("v")) || {};
      const prev = v[repo];
      // Defensive: never blow past the daily budget with extra negative verdicts.
      if (!ok && prev && prev.day === day && prev.checks >= VERIFY_DAILY_BUDGET) {
        return new Response("ok");
      }
      const checks = (prev && prev.day === day ? prev.checks : 0) + 1;
      v[repo] = { ok: !!ok, ts: Date.now(), day, checks };
      await this.state.storage.put("v", v);
      if (ok) {
        const data = (await this.state.storage.get("s")) || {
          total: 0,
          days: {},
          repos: {},
        };
        bumpCount(data, day, repo, pack, tier);
        await this.state.storage.put("s", data);
      }
      return new Response("ok");
    }
    if (request.method === "POST" && url.pathname === "/reverify-list") {
      const data = (await this.state.storage.get("s")) || {
        total: 0,
        days: {},
        repos: {},
      };
      const repos = [
        ...new Set(Object.keys(data.repos).map((key) => key.split("|")[0])),
      ];
      return Response.json({ repos });
    }
    if (request.method === "POST" && url.pathname === "/reverify-result") {
      const { repo, ok } = await request.json();
      if (ok) {
        // Cron re-check passed: refresh the verdict timestamp, spend no budget.
        const day = today();
        const v = (await this.state.storage.get("v")) || {};
        const prev = v[repo];
        v[repo] = {
          ok: true,
          ts: Date.now(),
          day,
          checks: prev && prev.day === day ? prev.checks : 0,
        };
        await this.state.storage.put("v", v);
        return new Response("ok");
      }
      // Embed removed: drop the repo from the list (and its counts) and forget it.
      const data = (await this.state.storage.get("s")) || {
        total: 0,
        days: {},
        repos: {},
      };
      for (const key of Object.keys(data.repos)) {
        if (key.startsWith(`${repo}|`)) delete data.repos[key];
      }
      await this.state.storage.put("s", data);
      const v = (await this.state.storage.get("v")) || {};
      delete v[repo];
      await this.state.storage.put("v", v);
      return new Response("ok");
    }
    if (url.pathname === "/summary") {
      const data = (await this.state.storage.get("s")) || {
        total: 0,
        days: {},
        repos: {},
      };
      const byRepo = {};
      for (const [key, c] of Object.entries(data.repos)) {
        const repo = key.split("|")[0];
        byRepo[repo] = (byRepo[repo] || 0) + c;
      }
      const top = Object.entries(byRepo)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([repo, count]) => ({ repo, count }));
      const today = new Date().toISOString().slice(0, 10);
      const days = Object.entries(data.days)
        .sort()
        .slice(-7)
        .map(([day, count]) => ({ day, count }));
      return Response.json({
        total: data.total,
        today: data.days[today] || 0,
        days,
        top,
      });
    }
    return new Response("not found", { status: 404 });
  }
}

/** Fire-and-forget verified increment; never blocks or fails the image response. */
function countHitVerified(ctx, env, repo, packId, tierLevel) {
  if (!env.STATS || !ctx) return;
  try {
    const stub = env.STATS.get(env.STATS.idFromName("global"));
    ctx.waitUntil(
      (async () => {
        const r = await stub.fetch("https://stats.internal/hit", {
          method: "POST",
          body: JSON.stringify({ repo, pack: packId, tier: tierLevel }),
        });
        const { needVerify } = await r.json();
        if (!needVerify) return; // DO already counted (ok) or skipped (failed/budget)
        const verdict = await verifyRepoEmbed(repo, env);
        if (verdict === null) return; // GitHub API error: count nothing, spend no budget
        await stub.fetch("https://stats.internal/verdict", {
          method: "POST",
          body: JSON.stringify({ repo, ok: verdict, pack: packId, tier: tierLevel }),
        });
      })().catch(() => {}),
    );
  } catch {
    /* stats must never break serving */
  }
}

/**
 * Fetch the repo's README and weak-match for an embed of this service.
 * Returns true (embedded), false (no README / not embedded), or null when the
 * GitHub API itself failed (403/5xx/network) — callers must then count
 * nothing and spend no verification budget ("宁可少计不可错计").
 */
async function verifyRepoEmbed(repo, env) {
  try {
    const headers = {
      Accept: "application/vnd.github.raw",
      "User-Agent": "whale-star",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    const resp = await fetch(`https://api.github.com/repos/${repo}/readme`, { headers });
    if (resp.status === 404) return false; // no README / private / nonexistent
    if (!resp.ok) return null; // rate limit, server error, network weirdness
    const text = await resp.text();
    return (
      text.includes(SERVICE_HOST) &&
      (text.includes(`repo=${repo}`) || text.includes(`repo=${encodeURIComponent(repo)}`))
    );
  } catch {
    return null;
  }
}

const fmtNum = (n) =>
  n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US");

const textW = (s, fs = 11) =>
  [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.6), 0);

/** Read a response body as a base64 data-URI payload. */
async function webpToDataB64(resp) {
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  const CH = 0x2000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/** Tier artwork + live star-count pill — the production image format. */
function countOverlaySvg(b64, count) {
  const countStr = count.toLocaleString("en-US");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <image href="data:image/webp;base64,${b64}" width="1536" height="1024"/>
  <g>
    <rect x="1116" y="892" width="372" height="96" rx="48" fill="#101a33" fill-opacity="0.82"/>
    <text x="1302" y="957" text-anchor="middle" font-size="56" font-weight="700" fill="#f5c518" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif">★ ${countStr}</text>
  </g>
</svg>`;
}

/** Shields-style badge: whale-star | 已调用 N 次 */
function badgeSvg(total) {
  const label = "whale-star";
  const value = `已调用 ${fmtNum(total)} 次`;
  const lw = Math.round(textW(label)) + 20;
  const vw = Math.round(textW(value)) + 20;
  const w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <rect width="${w}" height="20" fill="#101a33"/>
  <path d="M0 0h${w}v20H0z" fill="none"/>
  <rect x="${lw}" width="${vw}" height="20" fill="#4d6bfe"/>
  <g fill="#ffffff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

/** In-isolate pack.json cache: id -> { pack, ts } */
const packCache = new Map();

function tierFor(count, pack) {
  for (const tier of pack.tiers) {
    const max = tier.max == null ? Infinity : tier.max;
    if (count >= tier.min && count <= max) return tier;
  }
  return pack.tiers[FALLBACK_TIER];
}

async function loadPack(env, origin, packId) {
  if (!PACK_ID_RE.test(packId)) return null;
  const now = Date.now();
  const hit = packCache.get(packId);
  if (hit && now - hit.ts < CACHE_TTL * 1000) return hit.pack;
  const res = await env.ASSETS.fetch(
    new Request(new URL(`/packs/${packId}/pack.json`, origin)),
  );
  if (!res.ok) return null;
  const pack = await res.json();
  if (!pack || !Array.isArray(pack.tiers) || pack.tiers.length === 0) return null;
  packCache.set(packId, { pack, ts: now });
  return pack;
}

async function getStarCount(repo, env) {
  const cache = caches.default;
  const cacheKey = new Request(`https://whale-star.internal/star/${repo}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    return data.count;
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "whale-star",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const resp = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status} for ${repo}`);
  }
  const info = await resp.json();
  const count = info.stargazers_count ?? 0;

  await cache.put(
    cacheKey,
    new Response(JSON.stringify({ count }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
      },
    }),
  );
  return count;
}

async function serveTierImage(packId, tier, origin, env, extraHeaders = {}) {
  const imgUrl = new URL(`/packs/${packId}/${tier.image}`, origin);
  const imgResp = await env.ASSETS.fetch(new Request(imgUrl));
  if (!imgResp.ok && imgResp.status !== 304) {
    return new Response("asset not found", { status: 502 });
  }
  const headers = new Headers(imgResp.headers);
  headers.set("Content-Type", "image/webp");
  // Cache stays ON: run_worker_first guarantees the Worker (and the DO
  // counter) executes even on CF-Cache-Status HIT — proven by double-fetch
  // tests (HIT, HIT, total +2). Precision does not require no-store.
  headers.set("Cache-Control", `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  return new Response(imgResp.body, { headers });
}

export default {
  /** Daily cron: re-verify every listed repo; drop those whose README no longer embeds us. */
  async scheduled(event, env, ctx) {
    if (!env.STATS) return;
    const stub = env.STATS.get(env.STATS.idFromName("global"));
    const listResp = await stub.fetch("https://stats.internal/reverify-list", {
      method: "POST",
    });
    const { repos } = await listResp.json();
    const CONCURRENCY = 10;
    for (let i = 0; i < repos.length; i += CONCURRENCY) {
      const batch = repos.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (repo) => {
          try {
            const verdict = await verifyRepoEmbed(repo, env);
            if (verdict === null) return; // API error: skip, retry next cron
            await stub.fetch("https://stats.internal/reverify-result", {
              method: "POST",
              body: JSON.stringify({ repo, ok: verdict }),
            });
          } catch {
            /* one repo failing must not abort the batch */
          }
        }),
      );
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { "X-Route": "method" } });
    }
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "X-Route": "health" } });
    }

    // Aggregated stats JSON (consumed by the landing page strip)
    if (url.pathname === "/api/stats") {
      if (!env.STATS) {
        return new Response(JSON.stringify({ error: "stats unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      try {
        const stub = env.STATS.get(env.STATS.idFromName("global"));
        const r = await stub.fetch("https://stats.internal/summary");
        const data = await r.json();
        return new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            "X-Route": "stats",
          },
        });
      } catch {
        return new Response(JSON.stringify({ error: "stats unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Shields-style badge for README
    if (url.pathname === "/badge") {
      let total = 0;
      try {
        if (env.STATS) {
          const stub = env.STATS.get(env.STATS.idFromName("global"));
          const r = await stub.fetch("https://stats.internal/summary");
          total = (await r.json()).total || 0;
        }
      } catch {
        /* badge still renders with 0 */
      }
      return new Response(badgeSvg(total), {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Route": "badge",
        },
      });
    }

    // TEST-ONLY: live star-count overlay via SVG (does not touch the production image path)
    if (url.pathname === "/preview/count") {
      const previewRepo = (url.searchParams.get("repo") || "").trim();
      const previewPackId = (url.searchParams.get("pack") || "default").trim();
      if (!REPO_RE.test(previewRepo)) {
        return new Response("Usage: /preview/count?repo=owner/name[&pack=default]", { status: 400 });
      }
      try {
        const pack = await loadPack(env, url.origin, previewPackId);
        if (!pack) return new Response(`Unknown pack: ${previewPackId}`, { status: 400 });
        const count = await getStarCount(previewRepo, env);
        const tier = tierFor(count, pack);
        const imgUrl = new URL(`/packs/${previewPackId}/${tier.image}`, url.origin);
        const imgResp = await env.ASSETS.fetch(new Request(imgUrl));
        if (!imgResp.ok) return new Response("asset not found", { status: 502 });
        const bytes = new Uint8Array(await imgResp.arrayBuffer());
        let bin = "";
        const CH = 0x2000;
        for (let i = 0; i < bytes.length; i += CH) {
          bin += String.fromCharCode(...bytes.subarray(i, i + CH));
        }
        const b64 = btoa(bin);
        const countStr = count.toLocaleString("en-US");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <image href="data:image/webp;base64,${b64}" width="1536" height="1024"/>
  <g>
    <rect x="1116" y="892" width="372" height="96" rx="48" fill="#101a33" fill-opacity="0.82"/>
    <text x="1302" y="957" text-anchor="middle" font-size="56" font-weight="700" fill="#f5c518" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif">★ ${countStr}</text>
  </g>
</svg>`;
        return new Response(svg, {
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Route": "preview-count",
            "X-Star-Count": String(count),
          },
        });
      } catch (err) {
        return new Response(`preview error: ${err && err.message}`, { status: 502 });
      }
    }

    const repo = (url.searchParams.get("repo") || "").trim();
    const packId = (url.searchParams.get("pack") || "default").trim();

    if (!REPO_RE.test(repo)) {
      // Landing page at "/", otherwise pass through static assets
      // (pack.json / index.json / tier webp / favicon), else usage hint.
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const page = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
        if (page.ok || page.status === 304) {
          const h = new Headers(page.headers);
          h.set("X-Route", "landing");
          return new Response(page.body, { status: page.status, headers: h });
        }
      }
      if (url.pathname === "/favicon.ico") {
        return new Response(null, { status: 204, headers: { "X-Route": "favicon" } });
      }
      const asset = await env.ASSETS.fetch(request);
      // 304 Not Modified is a successful revalidation — pass it through.
      if (asset.ok || asset.status === 304) {
        const h = new Headers(asset.headers);
        h.set("X-Route", "asset");
        return new Response(asset.body, { status: asset.status, headers: h });
      }
      return new Response("Usage: /?repo=owner/name[&pack=default]", {
        status: 400,
        headers: { "X-Route": "asset-miss" },
      });
    }

    const pack = await loadPack(env, url.origin, packId);
    if (!pack) {
      return new Response(`Unknown pack: ${packId}`, {
        status: 400,
        headers: { "X-Route": "unknown-pack" },
      });
    }

    try {
      const count = await getStarCount(repo, env);
      const tier = tierFor(count, pack);
      countHitVerified(ctx, env, repo, packId, tier.level);
      // Production format: tier artwork as SVG with the live star-count pill.
      const imgUrl = new URL(`/packs/${packId}/${tier.image}`, url.origin);
      const imgResp = await env.ASSETS.fetch(new Request(imgUrl));
      if (!imgResp.ok) return new Response("asset not found", { status: 502 });
      const b64 = await webpToDataB64(imgResp);
      return new Response(countOverlaySvg(b64, count), {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
          "X-Route": "tier-svg",
          "X-Star-Count": String(count),
          "X-Star-Tier": String(tier.level),
        },
      });
    } catch (err) {
      // GitHub API failed: serve tier-0 WebP briefly so the README image never breaks.
      const fallback = pack.tiers[FALLBACK_TIER];
      countHitVerified(ctx, env, repo, packId, FALLBACK_TIER);
      return await serveTierImage(packId, fallback, url.origin, env, {
        "X-Star-Count": "unknown",
        "X-Star-Tier": String(FALLBACK_TIER),
        "X-Route": "tier-fallback",
        "X-Error": String(err && err.message ? err.message : err).slice(0, 120),
        "Cache-Control": "public, max-age=60, s-maxage=60",
      });
    }
  },
};
