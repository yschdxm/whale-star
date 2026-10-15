const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{0,32}$/;
const CACHE_TTL = 300; // seconds
const FALLBACK_TIER = 0;

/** Exact call counter (single-instance Durable Object — no races, no extra tokens). */
export class StatsDO {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/hit") {
      const { repo, pack, tier } = await request.json();
      const data = (await this.state.storage.get("s")) || {
        total: 0,
        days: {},
        repos: {},
      };
      data.total += 1;
      const day = new Date().toISOString().slice(0, 10);
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
      await this.state.storage.put("s", data);
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

/** Fire-and-forget increment; never blocks or fails the image response. */
function countHit(ctx, env, repo, packId, tierLevel) {
  if (!env.STATS || !ctx) return;
  try {
    const stub = env.STATS.get(env.STATS.idFromName("global"));
    ctx.waitUntil(
      stub
        .fetch("https://stats.internal/hit", {
          method: "POST",
          body: JSON.stringify({ repo, pack: packId, tier: tierLevel }),
        })
        .catch(() => {}),
    );
  } catch {
    /* stats must never break serving */
  }
}

const fmtNum = (n) =>
  n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US");

const textW = (s, fs = 11) =>
  [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.6), 0);

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
      countHit(ctx, env, repo, packId, tier.level);
      return await serveTierImage(packId, tier, url.origin, env, {
        "X-Star-Count": String(count),
        "X-Star-Tier": String(tier.level),
        "X-Route": "tier",
      });
    } catch (err) {
      // GitHub API failed: serve tier-0 briefly so the README image never breaks.
      const fallback = pack.tiers[FALLBACK_TIER];
      countHit(ctx, env, repo, packId, FALLBACK_TIER);
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
