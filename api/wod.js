const { Redis } = require("@upstash/redis");
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method === "POST") return handleSave(req, res);
  if (req.method === "GET")  return handleView(req, res);
  return res.status(405).json({ error: "Method not allowed" });
};

// ── POST /api/wod — save a WOD and return a short URL ──────────────────────
async function handleSave(req, res) {
  const { wod } = req.body || {};
  if (!wod || typeof wod !== "object") {
    return res.status(400).json({ error: "Missing wod object" });
  }
  try {
    const id = crypto.randomBytes(4).toString("hex");
    const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    await kv.set("shared_wod:" + id, JSON.stringify(wod), { ex: 7776000 }); // 90 days
    return res.status(200).json({ id, url: "https://homewod.fit/w/" + id });
  } catch (err) {
    console.error("wod save error:", err);
    return res.status(500).json({ error: "Failed to save workout" });
  }
}

// ── GET /api/wod?id=<id> — render shared WOD page ──────────────────────────
async function handleView(req, res) {
  const id = req.query.id;
  if (!id || !/^[0-9a-f]{8}$/.test(id)) {
    return res.status(404).send(notFoundHtml());
  }

  let wod;
  try {
    const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const raw = await kv.get("shared_wod:" + id);
    if (!raw) return res.status(404).send(notFoundHtml());
    wod = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("wod view error:", err);
    return res.status(500).send(notFoundHtml());
  }

  const title = `${wod.name || "Workout"} — ${(wod.meta || []).join(" · ")} · HomeWOD`;
  const desc = `${(wod.meta || []).join(" · ")} · Free AI workout generated at homewod.fit`;
  const pageUrl = `https://homewod.fit/w/${id}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.status(200).send(renderPage({ wod, title, desc, pageUrl }));
}

function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.map(block => {
    const bullets = (block.content || "")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<li>${escHtml(line.replace(/^[•\-–]\s*/, ""))}</li>`)
      .join("\n");

    const scaling = block.scaling
      ? `<p class="block-scaling"><strong>Scaling:</strong> ${escHtml(block.scaling)}</p>`
      : "";

    return `<section class="wod-block">
  <h2 class="block-title">${escHtml(block.name || block.type || "")}</h2>
  <ul class="block-list">${bullets}</ul>
  ${scaling}
</section>`;
  }).join("\n");
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage({ wod, title, desc, pageUrl }) {
  const metaTags = (wod.meta || []).map(m => `<span class="meta-tag">${escHtml(m)}</span>`).join("");
  const blocksHtml = renderBlocks(wod.blocks);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(desc)}">
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(desc)}">
  <meta property="og:url" content="${escHtml(pageUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="HomeWOD">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(desc)}">
  <link rel="canonical" href="${escHtml(pageUrl)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:#ECE6DB;--surface:#F6F1E9;--text:#191C19;--text-muted:#706D64;
      --border:#CEC7B4;--green:#253D2D;--green-mid:#375849;--green-light:#E0EBE6;
      --amber:#B8895A;--font-sans:'Plus Jakarta Sans',system-ui,sans-serif;
      --font-logo:'Bebas Neue',sans-serif;
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:var(--font-sans);font-size:15px;line-height:1.65;-webkit-font-smoothing:antialiased}
    a{color:var(--green)}
    .site-header{background:var(--green);padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
    .site-logo{font-family:var(--font-logo);font-size:24px;color:#fff;text-decoration:none;letter-spacing:1px}
    .header-cta{font-size:13px;color:rgba(255,255,255,0.75);text-decoration:none}
    .header-cta:hover{color:#fff}
    .container{max-width:680px;margin:0 auto;padding:2.5rem 1.5rem 4rem}
    .wod-name{font-family:var(--font-logo);font-size:clamp(36px,8vw,56px);color:var(--green);letter-spacing:1px;margin-bottom:0.5rem}
    .wod-tagline{font-size:16px;color:var(--text-muted);margin-bottom:1rem}
    .meta-tags{display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:2rem}
    .meta-tag{background:var(--green-light);color:var(--green);font-size:12px;font-weight:600;padding:4px 10px;border-radius:100px;text-transform:uppercase;letter-spacing:0.5px}
    .wod-block{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.5rem;margin-bottom:1rem}
    .block-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--green);margin-bottom:1rem}
    .block-list{list-style:none;padding:0}
    .block-list li{padding:5px 0 5px 1.25rem;position:relative;font-size:14px;line-height:1.6;border-bottom:1px solid var(--border)}
    .block-list li:last-child{border-bottom:none}
    .block-list li::before{content:"•";position:absolute;left:0;color:var(--amber);font-weight:700}
    .block-scaling{font-size:13px;color:var(--text-muted);margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)}
    .cta-banner{background:var(--green);color:#fff;border-radius:10px;padding:1.75rem 2rem;text-align:center;margin-top:2.5rem}
    .cta-banner h3{font-family:var(--font-logo);font-size:28px;letter-spacing:1px;margin-bottom:0.5rem}
    .cta-banner p{font-size:14px;opacity:0.8;margin-bottom:1.25rem}
    .cta-btn{display:inline-block;background:#fff;color:var(--green);font-weight:700;font-size:14px;padding:12px 24px;border-radius:6px;text-decoration:none}
    .cta-btn:hover{opacity:0.9}
  </style>
</head>
<body>
  <header class="site-header">
    <a href="https://homewod.fit" class="site-logo">HomeWOD</a>
    <a href="https://homewod.fit" class="header-cta">Generate your own →</a>
  </header>
  <main class="container">
    <h1 class="wod-name">${escHtml(wod.name || "Workout")}</h1>
    ${wod.tagline ? `<p class="wod-tagline">${escHtml(wod.tagline)}</p>` : ""}
    <div class="meta-tags">${metaTags}</div>
    ${blocksHtml}
    <div class="cta-banner">
      <h3>Build Your Own Workout</h3>
      <p>Free AI-generated WODs tailored to your equipment, time and fitness level.</p>
      <a href="https://homewod.fit" class="cta-btn">Generate free workout →</a>
    </div>
  </main>
</body>
</html>`;
}

function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Workout Not Found — HomeWOD</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#ECE6DB;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
    .wrap{max-width:400px}
    h1{font-size:2rem;margin-bottom:1rem;color:#253D2D}
    p{color:#706D64;margin-bottom:1.5rem}
    a{color:#253D2D;font-weight:600}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Workout not found</h1>
    <p>This shared workout may have expired or the link is incorrect.</p>
    <a href="https://homewod.fit">Generate a new workout →</a>
  </div>
</body>
</html>`;
}
