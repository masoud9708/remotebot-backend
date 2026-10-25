// ═══════════════════════════════════════════════════════════════
// RemoteBot Backend v7.6 — Node.js/Express (Render)
// ═══════════════════════════════════════════════════════════════

const express = require("express");
const app = express();

const TELEGRAM_API = "https://api.telegram.org";
const UPSTASH_URL = "https://sure-flea-127238.upstash.io";
const UPSTASH_TOKEN = "gQAAAAAAAfEGAAIgcDFmMjY1NTBmMzFhODI0OTY1YjQ1MjdjYTc1ZjRjNGRjMA";

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS
app.use((req, res, next) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("cache-control", "no-store");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ═══ Health ═══
app.get("/health", (req, res) => {
  res.json({ ok: true, v: "7.6-render", t: Date.now() });
});

// ═══ Redis proxy ═══
app.post("/redis", async (req, res) => {
  try {
    const up = await fetch(UPSTASH_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${UPSTASH_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(req.body)
    });
    const txt = await up.text();
    res.status(up.status).send(txt);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
});

// ═══ Telegram proxy ═══
app.all("/proxy", async (req, res) => {
  try {
    const path = req.query.path;
    if (!path) return res.status(400).json({ ok: false, error: "missing_path" });

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path") continue;
      params.append(k, v);
    }
    const tgUrl = `${TELEGRAM_API}/${path}?${params.toString()}`;

    const fetchOpts = { method: req.method, headers: {} };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const hasJsonBody = req.body && Object.keys(req.body).length > 0;
      if (hasJsonBody) {
        fetchOpts.body = JSON.stringify(req.body);
        fetchOpts.headers["content-type"] = "application/json";
      }
    }

    const up = await fetch(tgUrl, fetchOpts);
    const txt = await up.text();
    res.status(up.status).send(txt);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
});

// ═══ Info ═══
app.get("/info", async (req, res) => {
  try {
    const [activeRes, devicesRes] = await Promise.all([
      redisGet(["GET", "bots:active"]),
      redisGet(["HGETALL", "bots:devices"])
    ]);
    const raw = (devicesRes && devicesRes.result) || [];
    const devices = [];
    const now = Date.now();
    for (let i = 0; i < raw.length; i += 2) {
      try {
        const d = JSON.parse(raw[i + 1]);
        const age = now - (d.last_seen || 0);
        devices.push({
          id: d.id,
          name: d.name,
          model: d.model,
          version: d.version,
          last_seen: d.last_seen,
          online: age < 90000,
          age_sec: Math.floor(age / 1000)
        });
      } catch (_) {}
    }
    devices.sort((a, b) => b.last_seen - a.last_seen);
    res.json({
      ok: true,
      active: (activeRes && activeRes.result) || null,
      count: devices.length,
      devices
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
});

async function redisGet(args) {
  const up = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${UPSTASH_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(args)
  });
  return await up.json();
}

// ═══ Start ═══
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ RemoteBot Backend listening on port ${PORT}`);
});
