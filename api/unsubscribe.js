const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token, type } = req.query;

  if (!token || !["daily", "weekly"].includes(type)) {
    return res.status(400).send(errorPage("Invalid unsubscribe link."));
  }

  try {
    const email = await kv.get(`${type}_token:${token}`);

    if (!email) {
      return res.status(404).send(errorPage("This unsubscribe link has already been used or is invalid."));
    }

    await Promise.all([
      kv.del(`${type}:${email}`),
      kv.del(`${type}_token:${token}`),
      kv.srem(`${type}_subs`, email)
    ]);

    const typeLabel = type === "daily" ? "daily WOD" : "weekly program";
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(successPage(typeLabel));

  } catch (err) {
    console.error("unsubscribe error:", err);
    return res.status(500).send(errorPage("Something went wrong — please try again."));
  }
};

function successPage(typeLabel) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribed — HomeWOD</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;background:#f7f5f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;padding:48px 40px;max-width:420px;width:100%;text-align:center}
    .logo{font-size:24px;font-weight:900;letter-spacing:2px;color:#111;margin-bottom:32px}
    .logo span{color:#d63a2a}
    h1{font-size:22px;font-weight:800;color:#111;margin-bottom:12px}
    p{font-size:15px;color:#666;line-height:1.6;margin-bottom:28px}
    a{display:inline-block;background:#d63a2a;color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:12px 24px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Home<span>WOD</span></div>
    <h1>Unsubscribed</h1>
    <p>You've been removed from HomeWOD ${typeLabel} emails. You won't hear from us again on this list.</p>
    <a href="https://homewod.fit">Back to HomeWOD &rarr;</a>
  </div>
</body>
</html>`;
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Error — HomeWOD</title>
  <style>
    body{font-family:sans-serif;background:#f7f5f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;padding:48px 40px;max-width:420px;width:100%;text-align:center}
    h1{font-size:22px;font-weight:800;color:#111;margin-bottom:12px}
    p{font-size:15px;color:#666}
  </style>
</head>
<body>
  <div class="card">
    <h1>Something went wrong</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
