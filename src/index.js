const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{0,32}$/;
const CACHE_TTL = 300; // seconds
const FALLBACK_TIER = 0;

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
  if (!imgResp.ok) {
    return new Response("asset not found", { status: 502 });
  }
  const headers = new Headers(imgResp.headers);
  headers.set("Content-Type", "image/webp");
  headers.set("Cache-Control", `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  return new Response(imgResp.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    const repo = (url.searchParams.get("repo") || "").trim();
    const packId = (url.searchParams.get("pack") || "default").trim();

    if (!REPO_RE.test(repo)) {
      // Landing page at "/", otherwise pass through static assets
      // (pack.json / index.json / tier webp / favicon), else usage hint.
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const page = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
        if (page.ok) return page;
      }
      if (url.pathname === "/favicon.ico") {
        return new Response(null, { status: 204 });
      }
      const asset = await env.ASSETS.fetch(request);
      if (asset.ok) return asset;
      return new Response("Usage: /?repo=owner/name[&pack=default]", { status: 400 });
    }

    const pack = await loadPack(env, url.origin, packId);
    if (!pack) {
      return new Response(`Unknown pack: ${packId}`, { status: 400 });
    }

    try {
      const count = await getStarCount(repo, env);
      const tier = tierFor(count, pack);
      return await serveTierImage(packId, tier, url.origin, env, {
        "X-Star-Count": String(count),
        "X-Star-Tier": String(tier.level),
      });
    } catch (err) {
      // GitHub API failed: serve tier-0 briefly so the README image never breaks.
      const fallback = pack.tiers[FALLBACK_TIER];
      return await serveTierImage(packId, fallback, url.origin, env, {
        "X-Star-Count": "unknown",
        "X-Star-Tier": String(FALLBACK_TIER),
        "X-Error": String(err && err.message ? err.message : err).slice(0, 120),
        "Cache-Control": "public, max-age=60, s-maxage=60",
      });
    }
  },
};
