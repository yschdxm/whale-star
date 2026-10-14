import defaultPack from "../assets/packs/default/pack.json";

const PACKS = { default: defaultPack };
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const CACHE_TTL = 300; // seconds: star-count cache & image CDN cache
const FALLBACK_TIER = 0;

function tierFor(count, pack) {
  for (const tier of pack.tiers) {
    const max = tier.max == null ? Infinity : tier.max;
    if (count >= tier.min && count <= max) return tier;
  }
  return pack.tiers[FALLBACK_TIER];
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
    const packId = url.searchParams.get("pack") || "default";
    const pack = PACKS[packId];
    if (!pack) {
      return new Response(`Unknown pack: ${packId}`, { status: 400 });
    }
    if (!REPO_RE.test(repo)) {
      // Landing page at "/", otherwise pass through static assets
      // (tier webp / pack.json / favicon), else usage hint.
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

    const packCfg = pack;
    try {
      const count = await getStarCount(repo, env);
      const tier = tierFor(count, packCfg);
      return await serveTierImage(packId, tier, url.origin, env, {
        "X-Star-Count": String(count),
        "X-Star-Tier": String(tier.level),
      });
    } catch (err) {
      // GitHub API failed (rate limit / network): serve tier-0 briefly so the
      // README image never breaks, and surface the error in a header.
      const fallback = packCfg.tiers[FALLBACK_TIER];
      return await serveTierImage(packId, fallback, url.origin, env, {
        "X-Star-Count": "unknown",
        "X-Star-Tier": String(FALLBACK_TIER),
        "X-Error": String(err && err.message ? err.message : err).slice(0, 120),
        "Cache-Control": "public, max-age=60, s-maxage=60",
      });
    }
  },
};
