const { Redis } = require("@upstash/redis");

const RATE_LIMIT = 5; // program generation is expensive — 5 per hour per IP

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  }

  // Rate limiting — 5 requests per hour per IP
  try {
    const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const ip = ((req.headers["x-forwarded-for"] || "") + "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
    const rlKey = `rl:prog:${ip}`;
    const count = await kv.incr(rlKey);
    if (count === 1) await kv.expire(rlKey, 3600);
    if (count > RATE_LIMIT) {
      return res.status(429).json({ error: "You've generated a lot of programs today! Rest up and try again in an hour." });
    }
  } catch {
    // If Redis is unavailable, allow the request through
  }

  const {
    mode = "general",
    goal = "general",
    days = 4,
    time = "45",
    equipment = [],
    injuries = [],
    otherRestrictions = "",
    startDay = "today"
  } = req.body || {};

  const modeInstructions = {
    crossfit: "CrossFit style — use AMRAPs, EMOMs, For Time. Rx weights for men/women. Standard CrossFit movement names.",
    general: "Plain English — no jargon, optional weights, encouraging tone. Accessible to anyone.",
    beginner: "Beginner-friendly — max 3 movements per session, bodyweight or very light weights, longer rest, simple formats.",
    lowimpact: "Low impact — no jumping or running, mobility focus, light resistance, joint-friendly alternatives throughout."
  };

  const goalInstructions = {
    general: "Balanced fitness — mix of strength, conditioning, and mobility.",
    strength: "Strength focus — heavy compound lifts, 1-6 rep ranges, longer rest, minimal cardio.",
    conditioning: "Conditioning focus — more metcons, higher reps, shorter rest, aerobic base.",
    weight: "Fat loss focus — higher intensity circuits, elevated heart rate, varied stimulus.",
    competition: "Competition prep — high volume, benchmark WODs, complex movements.",
    mobility: "Mobility focus — longer warmups, stretching, yoga elements, light loading."
  };

  function getProgramDays(numDays, startDayParam) {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    let startIndex;

    if (startDayParam === "today") {
      startIndex = todayIndex;
    } else {
      // Next Monday — if today is Monday, go to next Monday
      startIndex = todayIndex === 1 ? 8 : 1;
    }

    const programDays = [];
    let idx = startIndex;
    while (programDays.length < numDays) {
      const dayName = dayNames[idx % 7];
      if (dayName !== "Sunday") {
        programDays.push(dayName);
      }
      idx++;
    }
    return programDays;
  }

  const sessionStructures = {
    "30": "5min warmup + 25min single main piece (combine strength and conditioning into one)",
    "45": "8min warmup + 17min strength/skill + 20min metcon",
    "60": "10min warmup + 25min strength + 25min metcon",
    "75": "10min warmup + 30min strength + 25min metcon + 10min accessory"
  };

  const dayNames = getProgramDays(Number(days) || 4, startDay);
  const equipmentStr = Array.isArray(equipment) && equipment.length > 0 ? equipment.join(", ") : "Bodyweight only";
  const warmupMin = { "30": "5", "45": "8", "60": "10", "75": "10" }[String(time)] || "8";
  const sessionStructure = sessionStructures[String(time)] || sessionStructures["45"];
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const injuryText = injuries.length > 0
    ? `Injuries to avoid: ${injuries.join(", ")}${otherRestrictions ? `, ${otherRestrictions}` : ""}.`
    : otherRestrictions ? `Restrictions: ${otherRestrictions}.` : "";

  const startDayLabel = startDay === "today"
    ? `today (${new Date().toLocaleDateString("en-US", { weekday: "long" })})`
    : "next Monday";

  const prompt = `Create a ${days}-day training week. ULTRA BRIEF — every field must be as short as possible.

Mode: ${modeInstructions[mode] || modeInstructions.general}
Goal: ${goalInstructions[goal] || goalInstructions.general}
Session: ${time} min | Equipment: ${equipmentStr}
Days: ${dayNames.join(", ")} (starting ${startDayLabel})
${injuryText ? `AVOID: ${injuryText}` : ""}
Rules: no repeated movement patterns consecutive days, balance push/pull/squat/hinge.

STRICT LENGTH LIMITS — exceed these and the response is invalid:
- warmup.content: exactly 2 bullets, max 6 words each
- strength.content: 1 line (sets x reps + load)
- strength.scaling: 1 short phrase or empty string
- metcon.content: 1 line for format/cap, then each movement on its own bullet using •
- metcon.scaling: 1 short phrase or empty string
- coachingNotes: 1 sentence only
- weeklyNotes: 1 sentence only

Return ONLY valid JSON, no markdown:
{"programTitle":"string","programSubtitle":"string","weekOf":"Week of ${weekLabel}","totalDays":${days},"days":[{"dayNumber":1,"dayName":"${dayNames[0]}","focus":"Lower body","estimatedTime":"${time} min","warmup":{"duration":"${warmupMin} min","content":"• item\\n• item"},"strength":{"name":"Back Squat 4x5","content":"4x5 @ 75%. Rest 3 min.","scaling":"Goblet squat"},"metcon":{"name":"NAME","content":"3 rounds (cap 10 min):\\n• 10 squats\\n• 10 push-ups","scaling":""},"coachingNotes":"One tip here."}],"weeklyNotes":"One sentence."}

Repeat that structure for ALL ${days} days: ${dayNames.join(", ")}.`;

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

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    const raw = data.content[0].text.trim();

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let program;
    try {
      program = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("JSON parse failed. Stop reason:", data.stop_reason);
      console.error("Raw response (first 800 chars):", raw.slice(0, 800));
      const hint = data.stop_reason === "max_tokens"
        ? "Response was cut off — try fewer days or a shorter session length."
        : "Please try again.";
      return res.status(500).json({ error: `The AI returned an unexpected response. ${hint}` });
    }

    return res.status(200).json(program);

  } catch (err) {
    console.error("program.js error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate program" });
  }
};
