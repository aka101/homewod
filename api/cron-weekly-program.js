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
    emails = await kv.smembers("weekly_subs");
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
      const sub = await kv.get(`weekly:${email}`);
      if (!sub) continue;

      const program = await generateProgram(sub, anthropicKey);
      if (!program) { errors++; continue; }

      const unsubUrl = `https://homewod.fit/api/unsubscribe?token=${sub.token}&type=weekly`;
      const html = buildProgramEmailHtml(program, unsubUrl);

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "wod@homewod.fit",
        to: email,
        subject: `Your HomeWOD Weekly Program — ${program.programTitle}`,
        html
      });

      sent++;
    } catch (err) {
      console.error(`cron-weekly-program failed for ${email}:`, err.message);
      errors++;
    }
  }

  console.log(`cron-weekly-program: sent=${sent} errors=${errors} total=${emails.length}`);
  return res.status(200).json({ sent, errors, total: emails.length });
};

// ─── PROGRAM GENERATION ───────────────────────────────

async function generateProgram(sub, apiKey) {
  const { mode, goal, days, equipment } = sub;

  const modeMap = {
    crossfit: "CrossFit style — use AMRAPs, EMOMs, For Time. Rx weights for men/women. Standard CrossFit movement names.",
    general: "Plain English — no jargon, optional weights, encouraging tone. Accessible to anyone.",
    beginner: "Beginner-friendly — max 3 movements per session, bodyweight or very light weights, longer rest, simple formats.",
    lowimpact: "Low impact — no jumping or running, mobility focus, light resistance, joint-friendly alternatives throughout."
  };

  const goalMap = {
    general: "Balanced fitness — mix of strength, conditioning, and mobility.",
    strength: "Strength focus — heavy compound lifts, 1-6 rep ranges, longer rest, minimal cardio.",
    conditioning: "Conditioning focus — more metcons, higher reps, shorter rest, aerobic base.",
    weight: "Fat loss focus — higher intensity circuits, elevated heart rate, varied stimulus.",
    competition: "Competition prep — high volume, benchmark WODs, complex movements.",
    mobility: "Mobility focus — longer warmups, stretching, yoga elements, light loading."
  };

  const equipStr = Array.isArray(equipment) && equipment.length > 0 ? equipment.join(", ") : "Bodyweight only";
  const numDays = Number(days) || 4;
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Build day names starting from next Monday
  const dayNames = getNextMondayDays(numDays);

  const prompt = `Create a ${numDays}-day training week. ULTRA BRIEF — every field must be as short as possible.

Mode: ${modeMap[mode] || modeMap.general}
Goal: ${goalMap[goal] || goalMap.general}
Session: 45 min | Equipment: ${equipStr}
Days: ${dayNames.join(", ")} (starting Monday)
Rules: no repeated movement patterns consecutive days, balance push/pull/squat/hinge.

STRICT LENGTH LIMITS:
- warmup.content: exactly 2 bullets, max 6 words each
- strength.content: 1 line (sets x reps + load)
- strength.scaling: 1 short phrase or empty string
- metcon.content: format + 2-3 movements with reps, max 2 lines
- metcon.scaling: 1 short phrase or empty string
- coachingNotes: 1 sentence only
- weeklyNotes: 1 sentence only

Return ONLY valid JSON, no markdown:
{"programTitle":"string","programSubtitle":"string","weekOf":"Week of ${weekLabel}","totalDays":${numDays},"days":[{"dayNumber":1,"dayName":"${dayNames[0]}","focus":"Lower body","estimatedTime":"45 min","warmup":{"duration":"8 min","content":"• item\\n• item"},"strength":{"name":"Back Squat 4x5","content":"4x5 @ 75%. Rest 3 min.","scaling":"Goblet squat"},"metcon":{"name":"NAME","content":"3 rounds: 10 squats, 10 push-ups. Cap 10 min.","scaling":""},"coachingNotes":"One tip here."}],"weeklyNotes":"One sentence."}

Repeat that structure for ALL ${numDays} days: ${dayNames.join(", ")}.`;

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
        max_tokens: 1600,
        system: "You are an expert fitness coach. Respond only with valid JSON — no markdown fences, no explanation, just the raw JSON object.",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getNextMondayDays(numDays) {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // Start from Monday (index 1)
  const result = [];
  let idx = 1; // Monday
  while (result.length < numDays) {
    const name = dayNames[idx % 7];
    if (name !== "Sunday") result.push(name);
    idx++;
  }
  return result;
}

// ─── EMAIL HTML ───────────────────────────────────────

function buildProgramEmailHtml(program, unsubUrl) {
  const daysHtml = (program.days || []).map(day => {
    const warmupContent = (day.warmup?.content || "").replace(/\\n/g, "\n");
    const strengthContent = (day.strength?.content || "").replace(/\\n/g, "\n");
    const metconContent = (day.metcon?.content || "").replace(/\\n/g, "\n");
    const coachingNotes = day.coachingNotes || "";

    return `
      <div style="margin-bottom:0;border-bottom:3px solid #f7f5f0;">
        <div style="background:#1f1f1f;padding:14px 32px;">
          <span style="font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d63a2a;">${esc(day.dayName)}</span>
          <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-left:12px;">${esc(day.focus || "")}</span>
        </div>
        <div style="background:#fff;padding:20px 32px 24px;">
          ${day.warmup ? `
          <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888;">Warmup — ${esc(day.warmup.duration || "")}</p>
          <div style="font-size:14px;color:#444;line-height:1.8;white-space:pre-line;margin-bottom:18px;">${esc(warmupContent)}</div>
          ` : ""}
          ${day.strength && day.strength.name ? `
          <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888;">Strength / Skill</p>
          <p style="margin:0 0 8px;font-size:17px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:1px;">${esc(day.strength.name)}</p>
          <div style="font-size:14px;color:#444;line-height:1.8;white-space:pre-line;margin-bottom:18px;">${esc(strengthContent)}</div>
          ` : ""}
          ${day.metcon && day.metcon.name ? `
          <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d63a2a;">Metcon</p>
          <p style="margin:0 0 8px;font-size:17px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:1px;">${esc(day.metcon.name)}</p>
          <div style="font-size:14px;color:#444;line-height:1.8;white-space:pre-line;margin-bottom:${coachingNotes ? "14px" : "0"};">${esc(metconContent)}</div>
          ` : ""}
          ${coachingNotes ? `
          <div style="padding:10px 14px;background:#f7f5f0;border-left:3px solid #d63a2a;font-size:13px;color:#666;line-height:1.7;font-style:italic;">${esc(coachingNotes)}</div>
          ` : ""}
        </div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:sans-serif;">

  <div style="background:#111;padding:24px 32px;">
    <span style="font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">Home<span style="color:#d63a2a;">WOD</span></span>
  </div>

  <div style="background:#d63a2a;padding:24px 32px;">
    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Your Weekly Program</p>
    <h1 style="margin:8px 0 4px;font-size:34px;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase;line-height:1;">${esc(program.programTitle)}</h1>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.75);">${esc(program.programSubtitle || "")}</p>
  </div>

  <div style="background:#1f1f1f;padding:10px 32px;">
    <span style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;">${esc(program.weekOf || "")}</span>
    <span style="font-size:11px;color:rgba(255,255,255,0.3);margin:0 10px;">&middot;</span>
    <span style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;">${program.totalDays} days</span>
  </div>

  ${daysHtml}

  ${program.weeklyNotes ? `
  <div style="background:#f2f0eb;padding:20px 32px;border-top:1px solid #e8e5de;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888;">Coach's Notes</p>
    <div style="font-size:14px;color:#444;line-height:1.8;">${esc(program.weeklyNotes)}</div>
  </div>` : ""}

  <div style="background:#111;padding:24px 32px;text-align:center;">
    <a href="https://homewod.fit/program" style="display:inline-block;background:#d63a2a;color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:13px 24px;">Generate Another Program &rarr;</a>
    <p style="margin:16px 0 4px;font-size:11px;color:rgba(255,255,255,0.3);">HomeWOD &middot; homewod.fit</p>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">
      <a href="${unsubUrl}" style="color:rgba(255,255,255,0.35);text-decoration:underline;">Unsubscribe from weekly programs</a>
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
