// ═══════════════════════════════════════════════════════════════
// RemoteBot Worker v7.6 — Complete & Stable
// ═══════════════════════════════════════════════════════════════

const TELEGRAM_API = "https://api.telegram.org";
const UPSTASH_URL = "https://sure-flea-127238.upstash.io";
const UPSTASH_TOKEN = "gQAAAAAAAfEGAAIgcDFmMjY1NTBmMzFhODI0OTY1YjQ1MjdjYTc1ZjRjNGRjMA";
const UA = "RemoteBot/7.6";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    try {
      if (url.pathname === "/health") return json({ ok: true, v: "7.6", t: Date.now() });
      if (url.pathname === "/redis") return await handleRedis(request);
      if (url.pathname === "/info") return await handleInfo();
      if (url.pathname === "/proxy") return await handleProxy(request, url);
      return json({ ok: true, v: "7.6" });
    } catch (e) {
      console.error("Worker error:", e);
      return json({ ok: false, error: String(e) }, 502);
    }
  }
};

async function redis(args) {
  const up = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: { "authorization": `Bearer ${UPSTASH_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(args)
  });
  return await up.json();
}

async function handleRedis(request) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await request.text();
  if (!body) return json({ ok: false, error: "empty_body" }, 400);
  const up = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: { "authorization": `Bearer ${UPSTASH_TOKEN}`, "content-type": "application/json" },
    body
  });
  const txt = await up.text();
  return new Response(txt, {
    status: up.status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" }
  });
}

async function handleInfo() {
  const [activeId, devicesRes] = await Promise.all([
    redis(["GET", "bots:active"]),
    redis(["HGETALL", "bots:devices"])
  ]);
  const raw = devicesRes?.result || [];
  const devices = [];
  const now = Date.now();
  for (let i = 0; i < raw.length; i += 2) {
    try {
      const d = JSON.parse(raw[i + 1]);
      const age = now - (d.last_seen || 0);
      devices.push({ id: d.id, name: d.name, model: d.model, version: d.version, last_seen: d.last_seen, online: age < 90000, age_sec: Math.floor(age / 1000) });
    } catch (_) {}
  }
  devices.sort((a, b) => b.last_seen - a.last_seen);
  return json({ ok: true, active: activeId?.result || null, count: devices.length, devices });
}

async function handleProxy(request, url) {
  const path = url.searchParams.get("path");
  if (!path) return json({ ok: false, error: "missing_path" }, 400);
  const tgUrl = new URL(`${TELEGRAM_API}/${path}`);
  for (const [k, v] of url.searchParams) {
    if (k === "path") continue;
    tgUrl.searchParams.append(k, v);
  }
  const headers = new Headers();
  headers.set("user-agent", UA);
  const ct = request.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? request.body : null;
  const up = await fetch(tgUrl.toString(), { method: request.method, headers, body });
  return passThrough(up);
}

function passThrough(up) {
  const h = new Headers();
  const ct = up.headers.get("content-type");
  if (ct) h.set("content-type", ct);
  h.set("access-control-allow-origin", "*");
  h.set("cache-control", "no-store");
  const retryAfter = up.headers.get("retry-after");
  if (retryAfter) h.set("retry-after", retryAfter);
  return new Response(up.body, { status: up.status, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "*"
  };
}
