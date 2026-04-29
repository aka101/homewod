const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});
const { Resend } = require("resend");

module.exports = async function handler(req, res) {
  // Verify request is from Vercel Cron
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!anthropicKey || !resendKey) {
    return res.status(500).json({ error: "Missing API keys" });
  }

  let emails;
  try {
    emails = await kv.smembers("daily_subs");
  } catch (err) {
    console.error("KV error:", err);
    return res.status(500).json({ error: "KV unavailable" });
  }

  if (!emails || emails.length === 0) {
    return res.status(200).json({ sent: 0, total: 0 });
  }

  const resend = new Resend(resendKey);
  let sent = 0;
  let errors = 0;

  for (const email of emails) {
    try {
      const sub = await kv.get(`daily:${email}`);
      if (!sub) continue;

      const wod = await generateWOD(sub, anthropicKey);
      if (!wod) { errors++; continue; }

      const unsubUrl = `https://homewod.fit/api/unsubscribe?token=${sub.token}&type=daily`;
      const html = buildWODEmailHtml(wod, sub, unsubUrl);

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "wod@homewod.fit",
        to: email,
        subject: `Your HomeWOD — ${wod.name}`,
        html
      });

      await recordWODHistory(email, wod.name);
      sent++;
    } catch (err) {
      console.error(`cron-daily-wod failed for ${email}:`, err.message);
      errors++;
    }
  }

  console.log(`cron-daily-wod: sent=${sent} errors=${errors} total=${emails.length}`);
  return res.status(200).json({ sent, errors, total: emails.length });
};

// ─── VARIATION HELPERS ───────────────────────────────

const VARIATION_HINTS = [
  "Pair upper and lower body movements in supersets.",
  "Use a descending rep ladder (e.g. 21-15-9 or 10-8-6).",
  "Build the metcon around a single movement done for high volume with accessory work.",
  "Use short, intense intervals with generous rest (e.g. 30 on / 30 off or EMOM).",
  "Use a long, grindy chipper with varied movement patterns.",
  "Emphasise unilateral movements (single-arm or single-leg variations).",
  "Pair a heavy hinge movement with a push and a carry or core hold.",
  "Use a pyramid rep scheme that ascends then descends.",
  "Focus on posterior chain — glutes, hamstrings and upper back.",
  "Focus on pressing and pulling supersets with a short conditioning finisher.",
  "Use a couplet or triplet structure with contrasting movements.",
  "Build around a single compound movement and support it with accessory work.",
  "Use tempo or paused reps in the strength block to increase time under tension.",
  "Keep the metcon simple and brutal — 2 movements, max effort.",
  "Include a bodyweight conditioning finisher after the main strength work.",
];

// Produces a 0–1 float that is stable for (date, email) but different across both dimensions
function seededRandom(dateSeed, emailSeed) {
  const n = Math.sin(dateSeed * 9301 + emailSeed * 49297 + 233720) * 233280;
  return n - Math.floor(n);
}

function getDateSeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function emailToSeed(email) {
  return email.split("").reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
}

// Rotates focus by day-of-week so the muscle emphasis changes naturally each day
const DOW_FOCUS = [
  "Full body — emphasise conditioning",   // Sun
  "Lower body and core",                  // Mon
  "Upper body push and pull",             // Tue
  "Full body strength",                   // Wed
  "Lower body posterior chain",           // Thu
  "Upper body and core finisher",         // Fri
  "Full body — longer, varied chipper",   // Sat
];

// ─── WOD GENERATION ──────────────────────────────────

async function generateWOD(sub, apiKey) {
  const { email, equipment, level, mode } = sub;
  const equipStr = Array.isArray(equipment) ? equipment.join(", ") : "Bodyweight only";

  const dateSeed = getDateSeed();
  const emailSeed = emailToSeed(email || "");
  const rand = seededRandom(dateSeed, emailSeed);

  const variationHint = VARIATION_HINTS[Math.floor(rand * VARIATION_HINTS.length)];
  const focus = DOW_FOCUS[new Date().getDay()];

  // Fetch recent workout names for this subscriber to avoid repeats
  let recentNames = [];
  try {
    recentNames = (await kv.lrange(`daily_history:${email}`, 0, 29)) || [];
  } catch {}

  const avoidSection = recentNames.length > 0
    ? `\nRECENT WORKOUTS TO AVOID — do not repeat these names, themes, or primary movement patterns:\n${recentNames.map(n => `- ${n}`).join("\n")}\n`
    : "";

  const modeMap = {
    crossfit: "CrossFit-style workout using proper CrossFit terminology (AMRAP, EMOM, For Time). Include Rx weights for men and women.",
    beginner: "Beginner-friendly workout. Plain English, max 3 movements, bodyweight or very light weights. Warm, encouraging tone.",
    lowimpact: "Low-impact workout. No jumping, no running. Mobility and light resistance. Joint-friendly throughout.",
    general: "Clear home workout in plain English. Avoid CrossFit jargon. Include optional weights. Encouraging tone."
  };

  const prompt = `You are an expert fitness programmer. Generate a 30-minute home workout.
${modeMap[mode] || modeMap.general}

Parameters:
- Equipment: ${equipStr}
- Fitness level: ${level || "Intermediate"}
- Focus: ${focus}
- Time: 30 minutes total (8 min warmup, 22 min main piece)

VARIATION DIRECTIVE (apply this to make today's workout distinct): ${variationHint}
${avoidSection}
Return ONLY valid JSON, no other text:
{
  "name": "Creative short WOD name (1-3 words, uppercase)",
  "tagline": "One punchy sentence describing the workout feel",
  "meta": ["30 min", "${level || "Intermediate"}", "${focus}"],
  "blocks": [
    {
      "type": "Warmup",
      "name": "Warmup — 8 min",
      "content": "Specific warmup movements as a bulleted list using • character. Relevant to today's focus.",
      "scaling": ""
    },
    {
      "type": "Workout",
      "name": "WOD name repeated here",
      "content": "Full workout description with reps and time. Use • for movement list.",
      "scaling": "Scaling options for each movement"
    },
    {
      "type": "Coaching notes",
      "name": "Strategy",
      "content": "2-3 coaching tips using • character.",
      "scaling": ""
    }
  ]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.content[0].text.trim().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Stores the workout name in a per-subscriber history list (capped at 30 entries)
async function recordWODHistory(email, wodName) {
  try {
    const key = `daily_history:${email}`;
    await kv.lpush(key, wodName);
    await kv.ltrim(key, 0, 29);
  } catch {}
}

// ─── EMAIL HTML ───────────────────────────────────────

function buildWODEmailHtml(wod, sub, unsubUrl) {
  const metaHtml = (wod.meta || []).map(m =>
    `<span style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-right:16px;">${esc(m)}</span>`
  ).join("");

  const blocksHtml = (wod.blocks || []).map(block => {
    const content = (block.content || "").replace(/<[^>]+>/g, "").trim();
    return `
      <div style="padding:24px 0;border-bottom:1px solid #f0ede8;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d63a2a;">${esc(block.type)}</p>
        <h2 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:1px;">${esc(block.name)}</h2>
        <div style="font-size:15px;color:#444;line-height:1.8;white-space:pre-line;">${esc(content)}</div>
        ${block.scaling ? `<div style="margin-top:12px;font-size:13px;color:#888;font-style:italic;white-space:pre-line;">${esc(block.scaling)}</div>` : ""}
      </div>`;
  }).join("");

  const equipStr = Array.isArray(sub.equipment) ? sub.equipment.join(" · ") : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:sans-serif;">

  <div style="background:#111;padding:24px 32px;">
    <span style="font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">Home<span style="color:#d63a2a;">WOD</span></span>
  </div>

  <div style="background:#d63a2a;padding:24px 32px;">
    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Today's Workout</p>
    <h1 style="margin:8px 0 0;font-size:40px;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase;line-height:1;">${esc(wod.name)}</h1>
    ${wod.tagline ? `<p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">${esc(wod.tagline)}</p>` : ""}
  </div>

  <div style="background:#1f1f1f;padding:12px 32px;">${metaHtml}</div>

  <div style="background:#fff;padding:0 32px 8px;">${blocksHtml}</div>

  ${equipStr ? `<div style="background:#f7f5f0;padding:16px 32px;border-top:1px solid #e8e5de;">
    <p style="margin:0;font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;">Equipment: ${esc(equipStr)}</p>
  </div>` : ""}

  <div style="background:#111;padding:24px 32px;text-align:center;">
    <a href="https://homewod.fit" style="display:inline-block;background:#d63a2a;color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:13px 24px;">Generate a Custom WOD &rarr;</a>
    <p style="margin:16px 0 4px;font-size:11px;color:rgba(255,255,255,0.3);">HomeWOD &middot; homewod.fit</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">
      <a href="${unsubUrl}" style="color:rgba(255,255,255,0.35);text-decoration:underline;">Unsubscribe from daily WODs</a>
    </p>
  </div>

</body>
</html>`;
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
