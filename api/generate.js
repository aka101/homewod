const { Redis } = require("@upstash/redis");

const RATE_LIMIT = 10; // requests per hour per IP

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { equipment, time, level, focus, format, injuries, otherRestrictions, mode } = req.body || {};

  if (!equipment || !time || !level || !focus || !format) {
    return res.status(400).json({ error: "Missing required fields: equipment, time, level, focus, format" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
  }

  // Rate limiting — 10 requests per hour per IP
  let kv;
  try {
    kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const ip = ((req.headers["x-forwarded-for"] || "") + "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
    const rlKey = `rl:gen:${ip}`;
    const count = await kv.incr(rlKey);
    if (count === 1) await kv.expire(rlKey, 3600);
    if (count > RATE_LIMIT) {
      return res.status(429).json({ error: "You've generated a lot of workouts today! Rest up and try again in an hour." });
    }
  } catch {
    // If Redis is unavailable, allow the request through rather than blocking users
  }

  const prompt = buildPrompt({
    equipment,
    time,
    level,
    focus,
    format,
    injuries: Array.isArray(injuries) ? injuries : [],
    otherRestrictions: otherRestrictions || "",
    mode: mode || "general"
  });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: "You are an expert fitness programmer. Respond only with valid JSON — no markdown fences, no explanation, no apologies, just the raw JSON object.",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || `Anthropic API error ${response.status}` });
    }

    const data = await response.json();

    if (data.stop_reason === "max_tokens") {
      return res.status(500).json({ error: "The workout was too long to generate — try reducing the session time or equipment, then try again." });
    }

    const text = data.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();

    let wod;
    try {
      wod = JSON.parse(clean);
    } catch {
      console.error("JSON parse failed. stop_reason:", data.stop_reason, "| first 300 chars:", clean.slice(0, 300));
      return res.status(500).json({ error: "The AI returned an unexpected response — please try again." });
    }

    // Increment global WOD counter — fire-and-forget, never blocks the response
    let wodCount = null;
    try {
      if (!kv) kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      wodCount = await kv.incr("wod_count");
    } catch {}

    return res.status(200).json(wodCount ? { ...wod, _wodCount: wodCount } : wod);

  } catch (err) {
    console.error("generate error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate workout" });
  }
};

function getModeInstruction(mode) {
  switch (mode) {
    case "crossfit":
      return `Generate a CrossFit-style workout using proper CrossFit terminology (AMRAP, EMOM, For Time, Rx, scaled). Use movement names as a CrossFit coach would (TTB, HSPU, DU). Include Rx weights for men and women.`;
    case "beginner":
      return `Generate a beginner-friendly workout. Rules you must follow:
- Maximum 3 different movements total across the entire session. Do not add a separate strength block AND a metcon — pick one simple structure and stick to it.
- Use only bodyweight or very light dumbbells (5–15 lb). No barbells.
- Zero fitness jargon. Never use: AMRAP, EMOM, metcon, Rx, WOD, TTB, HSPU, chipper. Write as if the person has never exercised before.
- Explain every movement in plain English with one sentence of form guidance inline.
- No time pressure. Always suggest rest as needed between sets or rounds.
- Tone is warm, encouraging and non-intimidating throughout.
- Include 2–3 form tips per movement in the coaching notes block.
- Structure: one simple block only — either timed rounds (e.g. 3 rounds of 3 movements) or timed intervals (e.g. 30 on / 30 off). Not both.`;
    case "lowimpact":
      return `Generate a low-impact workout suitable for older adults or anyone avoiding high-impact movement. No jumping, no running, no heavy loading. Focus on mobility, stability and light resistance. Include modifications for common limitations in the coaching notes block. Tone is calm, supportive and focused on feeling good rather than performance.`;
    case "prenatal":
      return `Generate a prenatal-safe workout. Non-negotiable safety rules:
- No jumping, no high-impact movements, no contact or balance-risk exercises.
- No lying flat on the back after the first trimester — substitute side-lying, seated or standing variations.
- No heavy loading or breath-holding. Keep intensity conversational — the person should be able to talk throughout.
- No deep twisting movements or extreme spinal flexion.
- No traditional core work (crunches, sit-ups, double-leg raises).
- Preferred movements: modified push-ups (incline or wall), bodyweight squats, supported lunges, bird dog, side-lying clamshells, seated rows, cat-cow, hip hinges with light weight, resistance band work.
- Include at least one pelvic floor awareness cue in the coaching notes.
- Always include this disclaimer as the final bullet in the coaching notes: "⚠️ Always check with your midwife or OB before starting or continuing any exercise programme during pregnancy — particularly if you have any complications, are in your third trimester, or experience dizziness, shortness of breath or pelvic pain during exercise."
- Tone: calm, supportive and focused on feeling good and moving safely — never performative.`;
    case "postnatal":
      return `Generate a postnatal recovery workout. Non-negotiable safety rules:
- No high-impact movement (no running, jumping) — this is appropriate only from 12+ weeks postpartum with medical clearance.
- No traditional abdominal crunches or sit-ups — diastasis recti risk.
- Prioritise pelvic floor rehab and gradual core restoration: dead bugs, glute bridges, bird dog, heel slides.
- Include upper body work for carrying strength: banded rows, incline push-ups, shoulder mobility.
- Keep loading very light. Focus on neuromuscular reconnection, not performance.
- Always include this disclaimer as the final bullet in the coaching notes: "⚠️ Always get clearance from your doctor or women's health physiotherapist before returning to exercise postpartum — especially if you are fewer than 12 weeks postpartum, had a C-section, or are experiencing any pelvic floor symptoms."
- Tone: warm, encouraging and non-pressured. Normalise slow progress.`;
    case "general":
    default:
      return `Generate a clear home workout using plain English. Avoid CrossFit jargon — say 'as many rounds as possible' not AMRAP, say 'kettlebell swings' not 'American KB swings'. Include suggested weights but make them optional. Tone is encouraging and approachable.`;
  }
}

function getBandInstruction(equipment) {
  const equipArr = Array.isArray(equipment) ? equipment : [equipment];
  if (!equipArr.includes("Resistance bands")) return "";
  return `Include resistance band-specific movements appropriate for the selected mode and level. Good band movements include: banded squats, banded pull-aparts, banded rows, banded glute bridges, banded shoulder press, banded deadlifts, banded face pulls, banded lateral walks.\nFor Low Impact and Beginner modes, prioritize band movements as the primary equipment.`;
}

function getFormatInstruction(format) {
  switch (format) {
    case "hiit":
      return `Use a high intensity format — for CrossFit mode use AMRAP or For Time. For other modes use interval-style work with short rest periods. The workout should feel fast-paced and breathless.`;
    case "steady":
      return `Use a rhythmic, paced format — for CrossFit mode use EMOM. For other modes use timed intervals with a consistent work/rest ratio like 40 seconds on, 20 seconds off. The workout should feel controlled and sustainable.`;
    case "strength":
      return `Use a straight sets format — specific sets and reps with clear rest periods between sets (e.g. 4 sets of 8, rest 90 seconds). For CrossFit mode include percentage-based loading. For other modes use RPE or descriptive loading (light/moderate/heavy).`;
    case "circuit":
      return `Use a circuit format — a series of movements performed back to back with minimal rest, then rest between full circuits. For CrossFit mode this is a chipper or round-based metcon. For other modes describe it as a circuit clearly.`;
    case "any":
    default:
      return `Choose the most appropriate workout format for the selected mode, equipment and focus. No restrictions on format.`;
  }
}

function getTimeStructureInstruction(time) {
  const t = parseInt(time);
  const structures = {
    15: `  Warmup: 3 min\n  One focused piece only: 10-12 min\n  No separate strength and metcon`,
    20: `  Warmup: 5 min\n  One main piece: 15 min\n  OR short strength (2 sets): 7 min + short metcon: 8 min`,
    30: `  Warmup: 8 min\n  Strength (3 sets): 9 min\n  Transition / barbell change: 1 min\n  Metcon: 12 min`,
    45: `  Warmup: 8 min\n  Strength (4-5 sets): 16 min\n  Transition / barbell change: 2 min\n  Metcon: 17 min\n  Cooldown: 2 min`,
    60: `  Warmup: 10 min\n  Strength (5-6 sets): 20 min\n  Transition / barbell change: 3 min\n  Metcon: 20 min\n  Cooldown: 7 min`,
    75: `  Warmup: 10 min\n  Strength (6 sets): 25 min\n  Transition: 5 min\n  Metcon: 25 min\n  Accessory work: 10 min`
  };
  const structure = structures[t] || `  Warmup: 8 min\n  Main work: ${t - 10} min`;

  // Derive metcon window so the rep budget can be calculated
  const metconMin = t <= 20 ? t - 5 : t <= 30 ? 12 : t <= 45 ? 17 : t <= 60 ? 20 : 25;
  const repBudget = Math.round(metconMin * 60 / 5.5);

  return `STRICT TIME REQUIREMENT: This workout must fit exactly within ${t} minutes total. You must account for every minute explicitly.

Use these time estimates per element:
- Warmup: 8-10 minutes (always include)
- Equipment setup / weight changes: 2-3 minutes (factor into your time math silently — do NOT output this as a block or mention it in the workout content)
- Per strength set (including rest): 3-4 minutes
- AMRAP / For Time metcon: exactly as stated
- EMOM: exactly as stated
- Rest between strength and metcon: 3-5 min
- Circuit round: 4-6 minutes per round
- Cooldown (60+ min sessions only): 5 min

REP VOLUME RULES — you must calculate this before writing any metcon:
Use these time estimates per rep:
- Bodyweight movement (air squat, push-up, burpee): 4 sec/rep
- Moderate barbell or dumbbell movement: 5 sec/rep
- Heavy barbell or technical lift: 7 sec/rep
- UNILATERAL movement (single-leg or single-arm, "each side"): 7 sec per side — count EACH SIDE as a separate rep
- Transition between movements: 20 sec

CRITICAL UNILATERAL RULE: "10 lunges each leg" = 20 reps in your time budget. "15 single-leg RDLs each leg" = 30 reps. Always double the stated reps for any "each leg / each arm" movement.

For the ${metconMin}-minute metcon window in this session:
- Maximum total rep count (all movements summed, each side of unilateral moves counted separately): ${repBudget} reps
- If your rep total exceeds ${repBudget}, cut rounds or reps — do NOT expand the time cap. Never include rep calculations or time stamps in the JSON output.
- Before writing the JSON, silently calculate: (reps × sec/rep) per movement + (transitions × 20s) = seconds per round. Divide metcon duration by that to estimate max rounds. Verify total reps stay under ${repBudget}. Do NOT include this calculation in the JSON output — it is internal reasoning only.
- Be conservative with round estimates — do not round down round time to inflate the round count.

Before writing the workout, calculate:
[warmup time] + [strength time] + [transition] + [metcon time] = [total]

If total exceeds ${t} minutes, reduce:
- Number of strength sets first
- Then metcon duration/rounds
- Never cut the warmup

For this ${t}-minute session use this structure:
${structure}

At the end of the coaching notes content, include this exact line:
• Estimated total time: X minutes
where X must be within 2 minutes of the requested ${t}.`;
}

function getFocusInstruction(focus) {
  switch (focus) {
    case "Upper body":
      return `Focus on upper body movements — pushing, pulling and pressing. Avoid lower body dominant movements like squats, lunges and deadlifts. Include a mix of horizontal and vertical pushing and pulling.`;
    case "Lower body":
      return `Focus on lower body movements — squats, hinges, lunges and single leg work. Avoid upper body dominant movements. Include posterior chain work (hamstrings, glutes) and quad-dominant movements for balance. IMPORTANT: If you include unilateral movements (lunges, single-leg RDLs, step-ups), remember each side counts separately in your rep budget — limit to 1 unilateral movement per session and keep per-side reps low (5-8 each side per round maximum).`;
    default:
      return "";
  }
}

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

function buildPrompt({ equipment, time, level, focus, format, injuries, otherRestrictions, mode }) {
  const equipStr = Array.isArray(equipment) ? equipment.join(", ") : equipment;
  const t = parseInt(time);
  const warmupTime = t >= 60 ? 10 : t <= 15 ? 3 : t <= 20 ? 5 : 8;
  const variationHint = VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];

  const injurySection = (injuries.length > 0 || otherRestrictions)
    ? `\nIMPORTANT: The athlete has the following injuries or restrictions today: ${
        [injuries.join(", "), otherRestrictions].filter(Boolean).join(". ")
      }.\nYou MUST avoid all movements that stress these areas. Provide safe substitutions and note them clearly.\n`
    : "";

  const modeInstruction = getModeInstruction(mode);
  const focusInstruction = getFocusInstruction(focus);
  const bandInstruction = getBandInstruction(equipment);
  const formatInstruction = getFormatInstruction(format);
  const timeInstruction = getTimeStructureInstruction(time);

  return `You are an expert fitness programmer creating a home gym workout.
${modeInstruction}

${timeInstruction}
${injurySection}
MOVEMENT SAFETY RULES — apply to every metcon:
- Never programme balance-dependent movements (single-leg RDL, pistol squats, single-arm overhead) with a barbell in a metcon. These movements require KBs or DBs so the athlete can bail safely under fatigue.
- Heavy hinge movements (deadlifts, RDLs) should never share the same load as squat movements unless the weights happen to match logically. Don't force "same weight" for movements where the appropriate load differs significantly.
- Any movement that requires significant technique concentration (muscle-ups, snatches, heavy cleans) should not appear in a For Time or AMRAP at intermediate level with high rep counts — save these for lower rep EMOMs.

WEIGHT SELECTION GUIDE — select loads appropriate for the fitness level, not CrossFit Rx defaults:
- Beginner: ~30-40% of a typical 1RM. Should feel easy and controlled.
- Intermediate: ~50-65% of a typical 1RM. Challenging but technique stays solid throughout all sets.
- Rx / Advanced: ~70-80% of a typical 1RM.
Reference 1RMs for an average adult: Back squat M 225# / W 155#, Deadlift M 275# / W 185#, Press M 135# / W 95#, KB swing M 53# / W 35#.
So an intermediate back squat working weight is roughly M 115-145# / W 75-100# — not the 1RM itself.
Never prescribe 1RM-level weights as metcon weights. In metcons, drop an additional 10-15% from the strength weight.

VARIATION DIRECTIVE (apply this to make the workout distinct): ${variationHint}

Generate a complete workout with these parameters:
- Equipment available: ${equipStr}${bandInstruction ? `\n  ${bandInstruction}` : ""}
- Fitness level: ${level}
- Focus: ${focus}${focusInstruction ? `\n  ${focusInstruction}` : ""}
- Format: ${formatInstruction}

CONTENT FORMAT RULES — strictly follow these for the workout block:
- Strength sets: write as one compact line per exercise, never list sets individually. Use format: "4×8 @ 40# DB, rest 90 sec" not "Set 1: 8 reps, Set 2: 8 reps…"
- No equipment transition blocks or transition text in the output — omit entirely
- No inline technique cues attached to exercise names — all coaching tips go in the Coaching notes block only
- Keep workout content tight — every line should be something the athlete acts on, not explanatory prose

Return ONLY valid JSON in exactly this structure, no other text:
{
  "name": "Creative short WOD name (1-3 words, uppercase)",
  "tagline": "One punchy sentence describing the workout feel",
  "meta": ["${time} min", "${level}", "${focus}", "format type"],
  "blocks": [
    {
      "type": "Warmup",
      "name": "Warmup — ${warmupTime} min",
      "content": "Specific warmup movements as a bulleted list using • character. Make warmup relevant to today's movements.",
      "scaling": ""
    },
    {
      "type": "Workout",
      "name": "WOD name repeated here",
      "content": "Full workout description with reps, weights, and time. Use • for movement list. Include score type (Score = time / total rounds / etc).",
      "scaling": "Scaling options for each movement and weight"
    },
    {
      "type": "Coaching notes",
      "name": "Strategy",
      "content": "2-3 coaching tips using • character. Pacing, movement tips, common mistakes to avoid.",
      "scaling": ""
    }
  ]
}`;
}
