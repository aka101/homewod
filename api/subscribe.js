const { Redis } = require("@upstash/redis");
const { Resend } = require("resend");
const crypto = require("crypto");

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (typeof req.body === "string") {
    try { req.body = JSON.parse(req.body); } catch {}
  }

  const { email, type, equipment, level, mode, goal, days } = req.body || {};

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const isWeekly = type === "weekly";
  const token = crypto.randomBytes(16).toString("hex");

  if (isWeekly) {
    const subscriber = {
      email,
      mode: mode || "general",
      goal: goal || "general",
      days: Number(days) || 4,
      equipment: Array.isArray(equipment) && equipment.length > 0 ? equipment : ["Bodyweight only"],
      token,
      createdAt: new Date().toISOString()
    };

    try {
      await kv.set(`weekly:${email}`, subscriber);
      await kv.set(`weekly_token:${token}`, email);
      await kv.sadd("weekly_subs", email);
    } catch (err) {
      console.error("subscribe weekly KV error:", err);
      return res.status(500).json({ error: "Failed to save subscription" });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const unsubUrl = `https://homewod.fit/api/unsubscribe?token=${token}&type=weekly`;
        const equipStr = subscriber.equipment.join(", ");
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "wod@homewod.fit",
          to: email,
          subject: "Weekly HomeWOD program — starts this Monday",
          html: weeklyWelcomeHtml({ equipStr, mode: subscriber.mode, goal: subscriber.goal, days: subscriber.days, unsubUrl })
        });
      } catch (err) {
        console.error("subscribe weekly email error:", err);
      }
    }

  } else {
    // daily (default)
    const subscriber = {
      email,
      equipment: Array.isArray(equipment) && equipment.length > 0 ? equipment : ["Bodyweight only"],
      level: level || "Intermediate",
      mode: mode || "general",
      token,
      createdAt: new Date().toISOString()
    };

    try {
      await kv.set(`daily:${email}`, subscriber);
      await kv.set(`daily_token:${token}`, email);
      await kv.sadd("daily_subs", email);
    } catch (err) {
      console.error("subscribe daily KV error:", err);
      return res.status(500).json({ error: "Failed to save subscription" });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const unsubUrl = `https://homewod.fit/api/unsubscribe?token=${token}&type=daily`;
        const equipStr = subscriber.equipment.join(", ");
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "wod@homewod.fit",
          to: email,
          subject: "You're in — daily HomeWOD starts tomorrow",
          html: dailyWelcomeHtml({ email, equipStr, level: subscriber.level, unsubUrl })
        });
      } catch (err) {
        console.error("subscribe daily email error:", err);
      }
    }
  }

  return res.status(200).json({ success: true });
};

function dailyWelcomeHtml({ email, equipStr, level, unsubUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:sans-serif;">
  <div style="background:#111;padding:24px 32px;">
    <span style="font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">Home<span style="color:#d63a2a;">WOD</span></span>
  </div>
  <div style="background:#d63a2a;padding:28px 32px;">
    <h1 style="margin:0;font-size:32px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1.2;">You're in.</h1>
    <p style="margin:10px 0 0;font-size:16px;color:rgba(255,255,255,0.85);">Your first daily WOD arrives tomorrow morning.</p>
  </div>
  <div style="background:#fff;padding:28px 32px;">
    <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7;">Every day at 6am UTC we'll generate a personalised workout based on your setup and send it straight to your inbox.</p>
    <div style="background:#f7f5f0;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888;">Your setup</p>
      <p style="margin:0 0 4px;font-size:14px;color:#333;"><strong>Equipment:</strong> ${esc(equipStr)}</p>
      <p style="margin:0;font-size:14px;color:#333;"><strong>Level:</strong> ${esc(level)}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#666;line-height:1.6;">Want to update your preferences? Just visit <a href="https://homewod.fit" style="color:#d63a2a;">homewod.fit</a> and subscribe again with your new settings.</p>
  </div>
  <div style="background:#111;padding:24px 32px;text-align:center;">
    <a href="https://homewod.fit" style="display:inline-block;background:#d63a2a;color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:13px 24px;">Generate a WOD Now &rarr;</a>
    <p style="margin:16px 0 4px;font-size:11px;color:rgba(255,255,255,0.3);">HomeWOD &middot; homewod.fit</p>
    <p style="margin:0;font-size:11px;"><a href="${unsubUrl}" style="color:rgba(255,255,255,0.35);text-decoration:underline;">Unsubscribe</a></p>
  </div>
</body>
</html>`;
}

function weeklyWelcomeHtml({ equipStr, mode, goal, days, unsubUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:sans-serif;">
  <div style="background:#111;padding:24px 32px;">
    <span style="font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">Home<span style="color:#d63a2a;">WOD</span></span>
  </div>
  <div style="background:#d63a2a;padding:28px 32px;">
    <h1 style="margin:0;font-size:32px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1.2;">Program subscription confirmed.</h1>
    <p style="margin:10px 0 0;font-size:16px;color:rgba(255,255,255,0.85);">Your first weekly program lands this Monday at 7am UTC.</p>
  </div>
  <div style="background:#fff;padding:28px 32px;">
    <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7;">Every Monday morning we'll generate a fresh ${days}-day training program tailored to your setup and goals.</p>
    <div style="background:#f7f5f0;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888;">Your program settings</p>
      <p style="margin:0 0 4px;font-size:14px;color:#333;"><strong>Equipment:</strong> ${esc(equipStr)}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#333;"><strong>Style:</strong> ${esc(mode)}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#333;"><strong>Goal:</strong> ${esc(goal)}</p>
      <p style="margin:0;font-size:14px;color:#333;"><strong>Days per week:</strong> ${days}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#666;line-height:1.6;">To update your preferences, visit <a href="https://homewod.fit/program" style="color:#d63a2a;">homewod.fit/program</a> and subscribe again.</p>
  </div>
  <div style="background:#111;padding:24px 32px;text-align:center;">
    <a href="https://homewod.fit/program" style="display:inline-block;background:#d63a2a;color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:13px 24px;">Generate a Program Now &rarr;</a>
    <p style="margin:16px 0 4px;font-size:11px;color:rgba(255,255,255,0.3);">HomeWOD &middot; homewod.fit</p>
    <p style="margin:0;font-size:11px;"><a href="${unsubUrl}" style="color:rgba(255,255,255,0.35);text-decoration:underline;">Unsubscribe</a></p>
  </div>
</body>
</html>`;
}

function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
