const { Resend } = require("resend");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, wod, program } = req.body || {};

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — mock mode");
    return res.status(200).json({ success: true, mock: true });
  }

  let subject, emailHtml;

  if (program) {
    // ─── WEEKLY PROGRAM EMAIL ────────────────────────────
    if (!program.programTitle || !program.days) {
      return res.status(400).json({ error: "Invalid program data" });
    }

    const daysHtml = (program.days || []).map(day => {
      const warmupContent = (day.warmup?.content || "").replace(/\\n/g, "\n");
      const strengthContent = (day.strength?.content || "").replace(/\\n/g, "\n");
      const metconContent = (day.metcon?.content || "").replace(/\\n/g, "\n");
      const coachingNotes = day.coachingNotes || "";

      return `
      <div style="margin-bottom:0;border-bottom:3px solid #f7f5f0;">
        <div style="background:#1f1f1f;padding:16px 32px;">
          <span style="font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d63a2a;">${escHtml(day.dayName)}</span>
          <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-left:12px;">${escHtml(day.focus || "")}</span>
        </div>
        <div style="background:#ffffff;padding:20px 32px 24px;">
          ${day.warmup ? `
          <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888880;">Warmup — ${escHtml(day.warmup.duration || "")}</p>
          <div style="font-size:14px;color:#444444;line-height:1.8;white-space:pre-line;margin-bottom:20px;">${escHtml(warmupContent)}</div>
          ` : ""}
          ${day.strength && day.strength.name ? `
          <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888880;">Strength / Skill</p>
          <p style="margin:0 0 8px;font-size:18px;font-weight:800;color:#111111;text-transform:uppercase;letter-spacing:1px;">${escHtml(day.strength.name)}</p>
          <div style="font-size:14px;color:#444444;line-height:1.8;white-space:pre-line;margin-bottom:20px;">${escHtml(strengthContent)}</div>
          ` : ""}
          ${day.metcon && day.metcon.name ? `
          <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d63a2a;">Metcon / Conditioning</p>
          <p style="margin:0 0 8px;font-size:18px;font-weight:800;color:#111111;text-transform:uppercase;letter-spacing:1px;">${escHtml(day.metcon.name)}</p>
          <div style="font-size:14px;color:#444444;line-height:1.8;white-space:pre-line;margin-bottom:${coachingNotes ? "16px" : "0"};">${escHtml(metconContent)}</div>
          ` : ""}
          ${coachingNotes ? `
          <div style="padding:12px 16px;background:#f7f5f0;border-left:3px solid #d63a2a;font-size:13px;color:#666;line-height:1.7;font-style:italic;">${escHtml(coachingNotes)}</div>
          ` : ""}
        </div>
      </div>`;
    }).join("");

    subject = `Your HomeWOD Weekly Program \u2014 ${program.programTitle}`;
    emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:sans-serif;">

  <div style="background:#111111;padding:24px 32px;">
    <span style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:2px;">Home<span style="color:#d63a2a;">WOD</span></span>
  </div>

  <div style="background:#d63a2a;padding:24px 32px;">
    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Weekly Program</p>
    <h1 style="margin:8px 0 4px;font-size:36px;font-weight:900;color:#ffffff;letter-spacing:2px;text-transform:uppercase;line-height:1;">${escHtml(program.programTitle)}</h1>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);font-weight:300;">${escHtml(program.programSubtitle || "")}</p>
  </div>

  <div style="background:#1f1f1f;padding:12px 32px;">
    <span style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;">${escHtml(program.weekOf || "")}</span>
    <span style="font-size:11px;color:rgba(255,255,255,0.3);margin:0 12px;">·</span>
    <span style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;">${program.totalDays} days</span>
  </div>

  ${daysHtml}

  ${program.weeklyNotes ? `
  <div style="background:#f2f0eb;padding:24px 32px;border-top:1px solid #e8e5de;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#888880;">Coach's Notes for the Week</p>
    <div style="font-size:14px;color:#444;line-height:1.8;white-space:pre-line;">${escHtml(program.weeklyNotes)}</div>
  </div>` : ""}

  <div style="background:#111111;padding:28px 32px;text-align:center;">
    <a href="https://homewod.fit/program" style="display:inline-block;background:#d63a2a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Generate Another Program &rarr;</a>
    <p style="margin:16px 0 0;font-size:11px;color:rgba(255,255,255,0.3);">Sent from HomeWOD &middot; homewod.fit</p>
  </div>

</body>
</html>`;

  } else {
    // ─── SINGLE WOD EMAIL ────────────────────────────────
    if (!wod || !wod.name || !wod.blocks) {
      return res.status(400).json({ error: "Invalid WOD data" });
    }

    const metaHtml = (wod.meta || []).map(m =>
      `<span style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-right:16px;">${escHtml(m)}</span>`
    ).join("");

    const blocksHtml = (wod.blocks || []).map(block => {
      const cleanContent = (block.content || "").replace(/<[^>]+>/g, "").trim();
      return `
      <div style="padding-top:28px;border-bottom:1px solid #f0ede8;padding-bottom:28px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#d63a2a;">${escHtml(block.type)}</p>
        <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111111;text-transform:uppercase;letter-spacing:1px;">${escHtml(block.name)}</h2>
        <div style="font-size:15px;color:#444444;line-height:1.8;white-space:pre-line;">${escHtml(cleanContent)}</div>
      </div>`;
    }).join("");

    const equipmentStr = Array.isArray(wod.equipment) && wod.equipment.length > 0
      ? wod.equipment.map(escHtml).join(" · ")
      : "";

    subject = `Your HomeWOD \u2014 ${wod.name}`;
    emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:sans-serif;">

  <div style="background:#111111;padding:24px 32px;">
    <span style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:2px;">Home<span style="color:#d63a2a;">WOD</span></span>
  </div>

  <div style="background:#d63a2a;padding:24px 32px;">
    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Today's Workout</p>
    <h1 style="margin:8px 0 0;font-size:42px;font-weight:900;color:#ffffff;letter-spacing:2px;text-transform:uppercase;line-height:1;">${escHtml(wod.name)}</h1>
  </div>

  <div style="background:#1f1f1f;padding:12px 32px;">${metaHtml}</div>

  <div style="background:#ffffff;padding:0 32px 32px;">${blocksHtml}</div>

  ${equipmentStr ? `
  <div style="background:#f7f5f0;padding:20px 32px;border-top:1px solid #e8e5de;">
    <p style="margin:0;font-size:11px;color:#888880;letter-spacing:1px;text-transform:uppercase;">Equipment used: ${equipmentStr}</p>
  </div>` : ""}

  <div style="background:#111111;padding:28px 32px;text-align:center;">
    <a href="https://homewod.fit" style="display:inline-block;background:#d63a2a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Generate Another WOD &rarr;</a>
    <p style="margin:16px 0 0;font-size:11px;color:rgba(255,255,255,0.3);">You requested this workout be emailed to you via HomeWOD &middot; homewod.fit</p>
  </div>

</body>
</html>`;
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to: email,
      subject,
      html: emailHtml
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("email-wod error:", err);
    return res.status(500).json({ error: "Failed to send" });
  }
};

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
