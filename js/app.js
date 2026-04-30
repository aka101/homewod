// ─── STATE ─── (EXERCISEDB removed — using instant YouTube links instead)

// ─── STATE ──────────────────────────────────────────
let currentWOD = null;
let expandedHistoryId = null;
let currentMode = "general";
let wodGeneratedThisSession = false;
let currentMovements = [];
let currentHistoryEntryId = null;

// ─── AFFILIATE LINKS ─────────────────────────────────
const AFFILIATE_LINKS = [
  { chipValue: "Dumbbells",        label: "Dumbbells",        url: "https://amzn.to/4vur6SX" },
  { chipValue: "Resistance bands", label: "Resistance bands", url: "https://amzn.to/4engG16" },
  { chipValue: "Kettlebells",      label: "Kettlebell",       url: "https://amzn.to/4cu5PjC" },
  { chipValue: "Pull-up bar",      label: "Pull-up bar",      url: "https://amzn.to/4sBxJjF" },
  { chipValue: "Jump rope",        label: "Jump rope",        url: "https://amzn.to/4tcfVwr" }
];

// ─── LOADING MESSAGES ────────────────────────────────
const loadingMessages = [
  "Selecting movements for your equipment...",
  "Balancing the workout structure...",
  "Calculating Rx weights...",
  "Writing your scaling options...",
  "Almost ready..."
];

// ─── HISTORY LIMIT ───────────────────────────────────
const HISTORY_LIMIT = 50;

// ─── UPGRADE MODAL ─ Reserved for future Pro tier ────
// async function openCheckout() { ... } — Reserved for future Pro tier
// function showUpgradeModal() { ... }
// function hideUpgradeModal() { ... }

// ─── MODE SELECTOR ───────────────────────────────────
function selectMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.mode === mode);
  });
  const disclaimer = document.getElementById("mode-medical-disclaimer");
  if (disclaimer) disclaimer.style.display = (mode === "prenatal" || mode === "postnatal") ? "block" : "none";
}

function getModeLabel(mode) {
  const labels = {
    crossfit: "CrossFit",
    general: "General",
    beginner: "Beginner",
    lowimpact: "Low Impact",
    prenatal: "Prenatal",
    postnatal: "Postnatal"
  };
  return labels[mode] || mode;
}

// ─── HISTORY ─────────────────────────────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("homewod_history") || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(wod, params) {
  const history = getHistory();
  const entryId = Date.now();
  const entry = {
    id: entryId,
    name: wod.name,
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    equipment: params.equipment,
    level: params.level,
    focus: params.focus,
    time: params.time,
    injuries: params.injuries || [],
    otherRestrictions: params.otherRestrictions || "",
    mode: params.mode || "general",
    blocks: wod.blocks,
    shareId: null
  };
  history.unshift(entry);
  while (history.length > HISTORY_LIMIT) history.pop();
  localStorage.setItem("homewod_history", JSON.stringify(history));
  currentHistoryEntryId = entryId;
  renderHistory();

  // Background save to Redis — fire-and-forget, patches shareId back into entry
  fetch("/api/wod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wod })
  }).then(r => r.ok ? r.json() : null).then(data => {
    if (!data || !data.id) return;
    const h = getHistory();
    const idx = h.findIndex(e => e.id === entryId);
    if (idx !== -1) {
      h[idx].shareId = data.id;
      localStorage.setItem("homewod_history", JSON.stringify(h));
    }
  }).catch(() => {});
}

function updateHistoryShareId(entryId, shareId) {
  const h = getHistory();
  const idx = h.findIndex(e => e.id === entryId);
  if (idx !== -1) {
    h[idx].shareId = shareId;
    localStorage.setItem("homewod_history", JSON.stringify(h));
  }
}

function renderHistory() {
  const history = getHistory();
  const section = document.getElementById("history-section");
  const list = document.getElementById("history-list");
  const badge = document.getElementById("history-count");

  if (history.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  badge.textContent = history.length;

  list.innerHTML = history.map((entry, _i) => {
    const equipPills = (entry.equipment || []).map(e =>
      `<span class="history-pill">${e}</span>`
    ).join("");

    const modePill = entry.mode
      ? `<span class="history-pill history-pill-mode">${getModeLabel(entry.mode)}</span>`
      : "";

    const injuryTag = entry.injuries && entry.injuries.length > 0
      ? `<span class="history-injury-tag">⚠ ${entry.injuries.join(", ")}</span>`
      : "";

    const blocks = (entry.blocks || []).map(block => {
      const isCoaching = block.type === "Coaching notes";
      const formattedContent = formatBlockWithDemos(block.content, !isCoaching, entry.id);
      return `
        <div class="wod-block">
          <div class="block-type">${block.type}</div>
          <div class="block-name">${block.name}</div>
          <div class="block-content">${formattedContent}</div>
        </div>`;
    }).join("");

    return `
      <div class="history-row" id="history-row-${entry.id}" onclick="toggleHistoryRow(${entry.id})">
        <div class="history-row-header">
          <div class="history-row-left">
            <div class="history-row-name">${entry.name}</div>
            <div class="history-pills">${equipPills}${modePill}</div>
          </div>
          <div class="history-row-right">
            <span class="history-completed-badge${entry.completed ? ' history-badge-complete' : ''}" id="history-progress-${entry.id}" ${(!entry.progressDone || entry.progressDone === 0) ? 'style="display:none"' : ''}>${entry.completed ? '✓ Done' : `${entry.progressDone || 0} / ${entry.progressTotal || 0}`}</span>
            <span class="history-date">${entry.date}</span>
            <span class="history-chevron" id="chevron-${entry.id}">›</span>
          </div>
        </div>
        <div class="history-row-body" id="history-body-${entry.id}" style="display:none">
          <div class="history-meta">
            <span>${entry.time} min</span>
            <span>${entry.level}</span>
            <span>${entry.focus}</span>
            ${injuryTag}
          </div>
          ${blocks}
          <div class="history-share-row" onclick="event.stopPropagation()">
            <button class="history-share-btn" id="history-share-btn-${entry.id}" onclick="shareHistoryWOD(${entry.id})">
              <i data-lucide="link"></i> Share this WOD
            </button>
          </div>
        </div>
      </div>`;
  }).join("");

  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Restore checked checkbox state for each history entry
  history.forEach(entry => {
    if (!entry.checkedBoxes || !entry.checkedBoxes.length) return;
    const bodyEl = document.getElementById(`history-body-${entry.id}`);
    if (!bodyEl) return;
    const btns = bodyEl.querySelectorAll('.ex-check');
    entry.checkedBoxes.forEach(i => {
      if (!btns[i]) return;
      btns[i].classList.add('checked');
      const row = btns[i].closest('.exercise-row') || btns[i].closest('.bullet-row');
      if (row) row.classList.add('done');
    });
  });
}

function updateHistoryEntryProgress(entryId) {
  const bodyEl = document.getElementById(`history-body-${entryId}`);
  if (!bodyEl) return;
  const allBtns = Array.from(bodyEl.querySelectorAll('.ex-check'));
  const total = allBtns.length;
  const done = allBtns.filter(b => b.classList.contains('checked')).length;
  const h = getHistory();
  const idx = h.findIndex(e => e.id === entryId);
  if (idx !== -1) {
    h[idx].progressDone = done;
    h[idx].progressTotal = total;
    h[idx].completed = done === total && total > 0;
    h[idx].checkedBoxes = allBtns.map((b, i) => b.classList.contains('checked') ? i : -1).filter(i => i !== -1);
    localStorage.setItem("homewod_history", JSON.stringify(h));
  }
  updateHistoryProgressBadge(entryId, done, total);
}

function toggleHistoryRow(id) {
  const body = document.getElementById(`history-body-${id}`);
  const chevron = document.getElementById(`chevron-${id}`);
  if (!body) return;

  if (expandedHistoryId && expandedHistoryId !== id) {
    const prevBody = document.getElementById(`history-body-${expandedHistoryId}`);
    const prevChevron = document.getElementById(`chevron-${expandedHistoryId}`);
    if (prevBody) prevBody.style.display = "none";
    if (prevChevron) prevChevron.classList.remove("open");
  }

  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  chevron.classList.toggle("open", !isOpen);
  expandedHistoryId = isOpen ? null : id;
}

function clearHistory() {
  if (!confirm("Are you sure you want to clear your WOD history?")) return;
  localStorage.removeItem("homewod_history");
  expandedHistoryId = null;
  renderHistory();
}

async function shareHistoryWOD(entryId) {
  const btn = document.getElementById(`history-share-btn-${entryId}`);
  const entry = getHistory().find(e => e.id === entryId);
  if (!entry) return;

  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> Getting link…'; if (typeof lucide !== 'undefined') lucide.createIcons(); }

  let shareId = entry.shareId;

  // If no shareId yet, save to Redis now
  if (!shareId) {
    try {
      const res = await fetch("/api/wod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wod: { name: entry.name, meta: [entry.time + " min", entry.level, entry.focus], blocks: entry.blocks } })
      });
      if (res.ok) {
        const data = await res.json();
        shareId = data.id;
        updateHistoryShareId(entryId, shareId);
      }
    } catch {}
  }

  const url = shareId ? `https://homewod.fit/w/${shareId}` : null;

  if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="link"></i> Share this WOD'; if (typeof lucide !== 'undefined') lucide.createIcons(); }

  if (!url) {
    if (btn) { btn.innerHTML = '<i data-lucide="alert-circle"></i> Couldn\'t get link'; if (typeof lucide !== 'undefined') lucide.createIcons(); }
    return;
  }

  if (navigator.share) {
    navigator.share({ title: entry.name + " — HomeWOD", url }).catch(() => {});
  } else {
    try {
      await navigator.clipboard.writeText(url);
      if (btn) { btn.innerHTML = '<i data-lucide="check"></i> Link copied!'; if (typeof lucide !== 'undefined') lucide.createIcons(); setTimeout(() => { btn.innerHTML = '<i data-lucide="link"></i> Share this WOD'; if (typeof lucide !== 'undefined') lucide.createIcons(); }, 2500); }
    } catch {
      prompt("Copy this link:", url);
    }
  }
}

// ─── INJURY FILTER ───────────────────────────────────
function toggleInjurySection() {
  const body = document.getElementById("injury-body");
  const btn = document.getElementById("injury-toggle-btn");
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  btn.innerHTML = isOpen
    ? '<i data-lucide="plus"></i> Any injuries or restrictions today? (optional)'
    : '− Hide';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function clearInjuries() {
  document.querySelectorAll(".injury-toggle:checked").forEach(cb => { cb.checked = false; });
  document.getElementById("injury-other").value = "";
}

function getInjuries() {
  const injuries = Array.from(document.querySelectorAll(".injury-toggle:checked")).map(c => c.value);
  const otherRestrictions = document.getElementById("injury-other").value.trim();
  return { injuries, otherRestrictions };
}

// ─── EQUIPMENT ───────────────────────────────────────
function getEquipment() {
  const checked = document.querySelectorAll(".chip-toggle:checked");
  if (checked.length === 0) return ["Bodyweight only"];
  return Array.from(checked).map(c => c.value);
}

// ─── TIME ESTIMATE ────────────────────────────────────
function extractEstimatedTime(wod) {
  const pattern = /estimated total time:\s*(\d+)\s*min/i;
  for (const block of (wod.blocks || [])) {
    const match = (block.content || '').match(pattern);
    if (match) return parseInt(match[1]);
  }
  if (wod.selectedTime) return parseInt(wod.selectedTime);
  const meta0 = (wod.meta || [])[0] || '';
  const metaMatch = meta0.match(/(\d+)/);
  return metaMatch ? parseInt(metaMatch[1]) : null;
}

function stripTimeLine(content) {
  return content.replace(/•?\s*estimated total time:.*?(\n|$)/gi, '').trim();
}

// ─── MOVEMENT DEMOS ──────────────────────────────────
function extractMovements(rawContent) {
  // Only look at bullet-point lines — structural text (Set 1, STRENGTH BLOCK etc) never has bullets
  const bulletLines = rawContent
    .split('\n')
    .filter(l => l.trim().startsWith('•'))
    .map(l => l.replace(/^[•\s]+/, '').trim());

  const skipPattern = /^(score|time cap|rest|note|tip|coach|strat|amrap|emom|for time|complete|round|set\s|block|cap\s)/i;
  const movements = [];

  for (const line of bulletLines) {
    if (skipPattern.test(line)) continue;

    const cleaned = line
      .replace(/^\d+\s*(x|×|reps?|sets?)?\s*/i, '')  // strip leading "8 " or "3x"
      .replace(/\(.*?\)/g, '')                         // strip "(suggested 15–25 lbs per hand)"
      .replace(/\d+[\-–]\d+\s*(lbs?|kg)/gi, '')        // strip weight ranges
      .trim();

    if (!cleaned || cleaned.length < 3) continue;
    if (skipPattern.test(cleaned)) continue;

    const movement = cleaned.split(/\s+/).slice(0, 3).join(' ').replace(/[,;:\[\]]/g, '').trim();

    if (movement.length > 2 && !movements.some(m => m.toLowerCase() === movement.toLowerCase())) {
      movements.push(movement);
    }

    if (movements.length >= 10) break;
  }

  return movements;
}

function extractMovementName(bulletText) {
  const raw = bulletText.trim();

  // Skip metadata / structural lines
  if (/^(score|time cap|rest|note|tip|coach|strat|amrap|emom|for time|complete|round|set\s*\d|load[:\s]|suggested[:\s]|rpe\s*\d|weight[:\s]|target[:\s]|aim\s|focus[:\s]|\d+\s*sets?[:\s×x]|\d+\s*rounds?[:\s])/i.test(raw)) return null;
  if (/^\d+\s*(×|x)\s*\d+/i.test(raw)) return null;
  if (/^\d+[\-–]\d+\s*(lb|kg|sec|min|reps?|sets?)/i.test(raw)) return null;
  if (/^(hold|hinge|keep|sit|drive|squeeze|brace|engage|maintain|avoid|ensure|lower|raise|extend|flex|rotate|breathe|pause|control|place|position|step|jump|land|reach|grab|grip|plant|anchor|lock|tuck|spread|open|lean|shift|stay|bring|return|imagine|think|feel\s|make sure|check\s|move\s|let\s|allow\s|initiate|stabilise|stabilize)/i.test(raw)) return null;
  // Skip rep-scheme / tempo annotation lines (e.g. "5 reps @ 31X1 tempo", "Men: 115#")
  if (/^\d+\s+reps?\s*@/i.test(raw)) return null;
  if (/^(men|women)\s*:/i.test(raw)) return null;
  if (/@\s*\d+[A-Za-z]\d+/.test(raw)) return null;

  let s = raw
    .replace(/\(.*?\)/g, '')                                                         // remove (notes)
    .replace(/@\s*\S+.*$/i, '')                                                      // remove tempo notation "@ 31X1 tempo"
    .replace(/\d+[\-–]\d+\s*(lbs?|kg)/gi, '')                                       // remove "35–50 lbs"
    .replace(/^\d+\s+(seconds?|minutes?|secs?|mins?|reps?|sets?)\s+(?:of\s+)?/i, '') // "30 seconds of "
    .replace(/^\d+\s*[×x]\s*/i, '')                                                  // "10 x "
    .replace(/^\d+\s+/i, '')                                                          // fallback: strip leading number
    .replace(/\s*[×x]\s*\d+.*$/i, '')                                                // trailing "× 10 reps"
    .replace(/\s+[-–—]\s*\d+.*$/i, '')                                               // trailing "— 30 seconds"
    .replace(/\s+for\s+\d+.*$/i, '')                                                  // trailing "for 30 sec"
    .replace(/\s+(each\s+(leg|arm|side)|per\s+(leg|arm|side)|alternating?)\s*$/i, '') // "each leg"
    .replace(/[,;:]/g, '')
    .trim();

  if (!s || s.length < 3) return null;
  return s.split(/\s+/).slice(0, 4).join(' ').trim();
}

const ABBR_MAP = {
  'AMRAP':    'As Many Rounds (or Reps) As Possible',
  'EMOM':     'Every Minute On the Minute',
  'For Time': 'Complete the workout as fast as possible',
  'RFT':      'Rounds For Time',
  'WOD':      'Workout of the Day',
  'HIIT':     'High Intensity Interval Training',
  'HSPU':     'Handstand Push-Up',
  'TTB':      'Toes to Bar',
  'T2B':      'Toes to Bar',
  'DU':       'Double Unders',
  'OHS':      'Overhead Squat',
  'C&J':      'Clean and Jerk',
  'RDL':      'Romanian Deadlift',
  'KB':       'Kettlebell',
  'DB':       'Dumbbell',
  'BB':       'Barbell',
  'Rx':       'As prescribed — standard weight and movement',
  'GHD':      'Glute Ham Developer',
  'MU':       'Muscle Up',
  'RPE':      'Rate of Perceived Exertion (1–10 effort scale)',
};

function expandAbbreviations(text) {
  let result = text;
  for (const [abbr, definition] of Object.entries(ABBR_MAP)) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    result = result.replace(regex, `<abbr title="${definition}">${abbr}</abbr>`);
  }
  return result;
}

function extractExerciseNameFromHeader(line) {
  // Extract "Glute Bridge" from "A) Glute Bridge — 3 sets × 12 reps"
  let s = line
    .replace(/^[A-Z]\)\s*/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s*[—–-]\s*\d.*$/, '')
    .trim();
  if (!s || s.length < 3) return null;
  return s.split(/\s+/).slice(0, 4).join(' ').replace(/[,;:\[\]]/g, '').trim();
}

function makeCheckBtn(targetSelector, historyId = null) {
  const updateFn = historyId != null ? `updateHistoryEntryProgress(${historyId})` : `updateProgress()`;
  return `<button class="ex-check" onclick="var r=this.closest('${targetSelector}');this.classList.toggle('checked');r&&r.classList.toggle('done');${updateFn}" aria-label="Mark complete"></button>`;
}

function updateProgress() {
  const body = document.getElementById('wod-body');
  const bar = document.getElementById('wod-progress');
  const fill = document.getElementById('progress-bar-fill');
  const label = document.getElementById('progress-label');
  if (!body || !bar || !fill || !label) return;
  const total = body.querySelectorAll('.ex-check').length;
  if (total === 0) { bar.style.display = 'none'; return; }
  const done = body.querySelectorAll('.ex-check.checked').length;
  const pct = Math.round((done / total) * 100);
  bar.style.display = 'block';
  fill.style.width = pct + '%';
  const isComplete = done === total;
  bar.classList.toggle('progress-complete', isComplete);
  label.textContent = isComplete ? 'Workout complete!' : `${done} / ${total} exercises done`;
  if (currentHistoryEntryId) saveHistoryProgress(currentHistoryEntryId, done, total);
}

function saveHistoryProgress(entryId, done, total) {
  const h = getHistory();
  const idx = h.findIndex(e => e.id === entryId);
  if (idx === -1) return;
  h[idx].progressDone = done;
  h[idx].progressTotal = total;
  h[idx].completed = done === total;
  localStorage.setItem("homewod_history", JSON.stringify(h));
  updateHistoryProgressBadge(entryId, done, total);
}

function updateHistoryProgressBadge(entryId, done, total) {
  const badge = document.getElementById(`history-progress-${entryId}`);
  if (!badge) return;
  if (done === 0) { badge.style.display = 'none'; return; }
  badge.style.display = '';
  badge.textContent = done === total ? '✓ Done' : `${done} / ${total}`;
  badge.classList.toggle('history-badge-complete', done === total);
}

function formatBlockWithDemos(content, showDemos = true, historyId = null) {
  let inExerciseBlock = false;
  return content.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (!trimmed.startsWith('•')) {
      const isExerciseHeader = /^[A-Z]\)\s+\S/i.test(trimmed);
      if (isExerciseHeader) {
        inExerciseBlock = true;
        const dashMatch = trimmed.match(/^(.+?)\s+[—–-]\s+(.+)$/);
        const label = dashMatch ? dashMatch[1] : trimmed;
        const scheme = dashMatch ? dashMatch[2] : '';
        const schemePill = scheme ? `<span class="exercise-scheme">${expandAbbreviations(scheme)}</span>` : '';
        const name = extractExerciseNameFromHeader(trimmed);
        const demoLink = (showDemos && name)
          ? `<a class="inline-demo-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(name)}" target="_blank" rel="noopener">▶ how to</a>`
          : '';
        const checkBtn = showDemos ? makeCheckBtn('.exercise-row', historyId) : '';
        return `<div class="exercise-row">${checkBtn}<span class="exercise-label">${expandAbbreviations(label)}</span>${schemePill}${demoLink}</div>`;
      }
      inExerciseBlock = false;
      return `<div class="block-struct-line">${expandAbbreviations(trimmed)}</div>`;
    }
    const bulletText = trimmed.slice(1).trim();
    if (inExerciseBlock) {
      return `<div class="bullet-row cue-row"><div class="bullet-text">• ${expandAbbreviations(bulletText)}</div></div>`;
    }
    const movement = extractMovementName(bulletText);
    const demoLink = (showDemos && movement)
      ? `<a class="inline-demo-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(movement)}" target="_blank" rel="noopener">▶ how to</a>`
      : '';
    const checkBtn = showDemos ? makeCheckBtn('.bullet-row', historyId) : '';
    return `<div class="bullet-row">${checkBtn}<div class="bullet-text">${expandAbbreviations(bulletText)}${demoLink}</div></div>`;
  }).filter(Boolean).join('');
}

// ─── WOD COUNTER ─────────────────────────────────────
function updateWodCounter(count) {
  if (!count || count < 1) return;
  localStorage.setItem('homewod_wod_count', count);
  const el = document.getElementById('wod-counter-stat');
  if (el) el.textContent = Number(count).toLocaleString('en-US') + (count === 1 ? ' WOD generated' : ' WODs generated');
}

// ─── TOAST ───────────────────────────────────────────
function showToast(message) {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  toast.offsetHeight; // force reflow
  toast.classList.add("toast-visible");

  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-hidden");
    setTimeout(() => toast.remove(), 300);
  }, 1800);
}

// ─── SHARE ───────────────────────────────────────────
function buildPlainTextWOD(wod) {
  const divider = "════════════════════";
  const icons = { "Warmup": "📋", "Workout": "💪", "Coaching notes": "🎯" };

  const blocks = (wod.blocks || []).map(block => {
    const icon = icons[block.type] || "•";
    const clean = (block.content || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return `${icon} ${block.type.toUpperCase()}\n${clean.trim()}`;
  }).join("\n\n");

  return `${divider}\n${wod.name}\nGenerated by HomeWOD\n${divider}\n\n${blocks}\n\nGenerated free at homewod.fit\n${divider}`;
}

function copyWOD() {
  if (!currentWOD) return;
  navigator.clipboard.writeText(buildPlainTextWOD(currentWOD))
    .then(() => {
      showToast("WOD copied!")
      if (typeof gtag !== 'undefined') {
        gtag('event', 'wod_copied', { event_category: 'engagement' })
      }
    })
    .catch(() => showToast("Copy failed — try again"));
}

function shareWhatsApp() {
  if (!currentWOD) return;
  const encoded = encodeURIComponent(buildPlainTextWOD(currentWOD));
  window.open(`https://wa.me/?text=${encoded}`, "_blank");
  if (typeof gtag !== 'undefined') {
    gtag('event', 'wod_shared', { event_category: 'engagement', event_label: 'whatsapp' })
  }
}

async function shareLink() {
  if (!currentWOD) return;
  const shareBtn = document.getElementById("share-btn");
  if (shareBtn) { shareBtn.innerHTML = '<i data-lucide="loader"></i> Saving…'; shareBtn.disabled = true; if (typeof lucide !== 'undefined') lucide.createIcons(); }

  let url;
  try {
    const res = await fetch("/api/wod", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wod: currentWOD })
    });
    if (res.ok) {
      const data = await res.json();
      url = data.url;
    }
  } catch {}

  // Fallback to legacy hash approach if save-wod fails
  if (!url) {
    try {
      const hash = btoa(unescape(encodeURIComponent(JSON.stringify(currentWOD))));
      history.replaceState(null, '', window.location.pathname + window.location.search + '#' + hash);
      url = window.location.href;
    } catch {
      showToast("Could not create share link");
      if (shareBtn) { shareBtn.innerHTML = '<i data-lucide="link"></i> Share link'; shareBtn.disabled = false; if (typeof lucide !== 'undefined') lucide.createIcons(); }
      return;
    }
  }

  if (shareBtn) { shareBtn.innerHTML = '<i data-lucide="link"></i> Share link'; shareBtn.disabled = false; if (typeof lucide !== 'undefined') lucide.createIcons(); }

  if (navigator.share) {
    navigator.share({
      title: `HomeWOD: ${currentWOD.name}`,
      text: `Check out this ${(currentWOD.meta || [])[0] || ""} workout I just generated — ${currentWOD.name}`,
      url
    }).catch(() => {
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => showToast("Link copied! Share it anywhere."))
      .catch(() => showShareModal(url));
  } else {
    showShareModal(url);
  }

  if (typeof gtag !== 'undefined') gtag('event', 'wod_shared', { event_category: 'engagement', event_label: 'link' });
}

// ─── HERO EMAIL CAPTURE ───────────────────────────────
async function heroEmailCapture(e) {
  e.preventDefault();
  const input = document.getElementById("hero-email-input");
  const btn = document.getElementById("hero-email-btn");
  const row = document.getElementById("hero-email-row");
  const email = (input && input.value.trim()) || "";

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) { input && input.focus(); return; }

  if (btn) { btn.textContent = "Subscribing…"; btn.disabled = true; }
  if (input) input.disabled = true;

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "weekly", mode: "general", goal: "general", days: 4, equipment: ["Bodyweight only"] })
    });
    if (!res.ok) throw new Error();
    localStorage.setItem("homewod_subscribed", "true");
    if (row) row.innerHTML = '<p class="hero-email-success">✓ You\'re in — first WOD lands next Monday.</p>';
    if (typeof gtag !== 'undefined') gtag('event', 'hero_email_capture', { event_category: 'conversion' });
  } catch {
    if (btn) { btn.textContent = "Get weekly WODs free"; btn.disabled = false; }
    if (input) { input.disabled = false; input.placeholder = "Couldn't subscribe — try again"; }
  }
}

// ─── SHOP ROW ────────────────────────────────────────
function updateShopRow() {
  const selected = getEquipment();
  const row = document.getElementById("shop-row");
  const pillsEl = document.getElementById("shop-pills");
  if (!row || !pillsEl) return;

  const toShow = AFFILIATE_LINKS.filter(item => !selected.includes(item.chipValue));

  if (toShow.length === 0) {
    row.style.display = "none";
    return;
  }

  pillsEl.innerHTML = toShow.map(item =>
    `<a class="shop-pill" href="${item.url}" target="_blank" rel="noopener sponsored">🛒 ${item.label}</a>`
  ).join("");

  row.style.display = "block";
}

// ─── AFFILIATE CARD ───────────────────────────────────
const WOD_EQUIPMENT_KEYWORDS = [
  { keywords: ["dumbbell"],                      chipValue: "Dumbbells",        label: "Dumbbells",        url: "https://amzn.to/4vur6SX" },
  { keywords: ["kettlebell", " kb ", "(kb)"],    chipValue: "Kettlebells",      label: "Kettlebell",       url: "https://amzn.to/4cu5PjC" },
  { keywords: ["pull-up", "pullup", "pull up"],  chipValue: "Pull-up bar",      label: "Pull-up bar",      url: "https://amzn.to/4sBxJjF" },
  { keywords: ["double under", "jump rope"],     chipValue: "Jump rope",        label: "Jump rope",        url: "https://amzn.to/4tcfVwr" },
  { keywords: ["banded", " band "],              chipValue: "Resistance bands", label: "Resistance bands", url: "https://amzn.to/4engG16" }
];

function showAffiliateCard(wod) {
  const card = document.getElementById("affiliate-card");
  const linksEl = document.getElementById("affiliate-links");
  if (!card || !linksEl) return;

  const selected = getEquipment();
  const content = (wod.blocks || []).map(b => (b.content || "") + " " + (b.name || "")).join(" ").toLowerCase();

  const toRecommend = WOD_EQUIPMENT_KEYWORDS.filter(item =>
    !selected.includes(item.chipValue) &&
    item.keywords.some(kw => content.includes(kw))
  );

  if (toRecommend.length === 0) {
    card.style.display = "none";
    return;
  }

  linksEl.innerHTML = toRecommend.map(item =>
    `<a class="affiliate-link-btn" href="${item.url}" target="_blank" rel="noopener sponsored">${item.label} →</a>`
  ).join("");

  card.style.display = "block";
}

// ─── EMAIL WOD PANEL ─────────────────────────────────
function toggleEmailPanel() {
  const panel = document.getElementById("email-wod-panel");
  if (!panel) return;
  const isOpen = panel.classList.contains("open");

  if (isOpen) {
    panel.classList.remove("open");
    return;
  }

  // Reset form to clean state
  const body = document.getElementById("email-wod-body");
  if (body) {
    body.innerHTML = `
      <div class="email-wod-form-row">
        <input type="email" class="email-input" id="email-wod-input" placeholder="your@email.com"
          onkeydown="if(event.key==='Enter')sendWODEmail()">
        <button type="button" class="email-btn" id="email-wod-btn" onclick="sendWODEmail()">Send ↗</button>
      </div>
      <div class="email-wod-error" id="email-wod-error" style="display:none"></div>
    `;
    // Pre-fill last used email
    const lastEmail = localStorage.getItem("homewod_last_email");
    const input = document.getElementById("email-wod-input");
    if (lastEmail && input) input.value = lastEmail;
  }

  panel.classList.add("open");
  setTimeout(() => {
    const input = document.getElementById("email-wod-input");
    if (input) input.focus();
  }, 310);
}

async function sendWODEmail() {
  if (!currentWOD) return;

  const input = document.getElementById("email-wod-input");
  const btn = document.getElementById("email-wod-btn");
  const errorEl = document.getElementById("email-wod-error");
  const body = document.getElementById("email-wod-body");
  const email = (input && input.value.trim()) || "";

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    if (errorEl) { errorEl.textContent = "Please enter a valid email address"; errorEl.style.display = "block"; }
    return;
  }

  if (input) input.disabled = true;
  if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
  if (errorEl) errorEl.style.display = "none";

  try {
    const wod = { ...currentWOD, equipment: getEquipment() };
    const res = await fetch("/api/email-wod", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, wod })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send");

    localStorage.setItem("homewod_last_email", email);

    const isSubscribed = localStorage.getItem("homewod_subscribed") === "true";
    if (body) {
      body.innerHTML = `
        <div class="email-wod-success-msg">&#10003; Sent to ${email}!</div>
        ${!isSubscribed ? `<div class="email-wod-subscribe-nudge">Want a free WOD every Monday? <button id="quick-sub-btn">&rarr; Subscribe</button></div>` : ""}
      `;
      if (!isSubscribed) {
        const subBtn = document.getElementById("quick-sub-btn");
        if (subBtn) subBtn.addEventListener("click", () => quickSubscribeWOD(email));
      }
    }

    setTimeout(() => {
      const panel = document.getElementById("email-wod-panel");
      if (panel) panel.classList.remove("open");
    }, 3000);

  } catch {
    if (input) input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = "Send ↗"; }
    if (errorEl) { errorEl.textContent = "Couldn't send — try again"; errorEl.style.display = "block"; }
  }
}

async function quickSubscribeWOD(email) {
  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        type: "daily",
        equipment: getEquipment(),
        level: document.getElementById("sel-level")?.value || "Intermediate",
        mode: currentMode
      })
    });
    if (res.ok) {
      localStorage.setItem("homewod_subscribed", "true");
      const nudge = document.querySelector(".email-wod-subscribe-nudge");
      if (nudge) nudge.innerHTML = "&#10003; Subscribed!";
    }
  } catch {}
}

// ─── GENERATE WOD ────────────────────────────────────
async function generateWOD() {
  const equipment = getEquipment();
  const time = document.getElementById("sel-time").value;
  const level = document.getElementById("sel-level").value;
  const focus = document.getElementById("sel-focus").value;
  const format = document.getElementById("sel-format").value;
  const { injuries, otherRestrictions } = getInjuries();
  const mode = currentMode;

  const btn = document.getElementById("gen-btn");
  const loading = document.getElementById("loading-section");
  const wodSection = document.getElementById("wod-section");
  const errorMsg = document.getElementById("error-msg");
  const sharedBanner = document.getElementById("shared-top-banner");

  btn.disabled = true;
  const genLabel = btn.querySelector('.gen-btn-label');
  if (genLabel) genLabel.textContent = "Generating..."; else btn.textContent = "Generating...";
  loading.style.display = "block";
  wodSection.style.display = "none";
  errorMsg.style.display = "none";
  sharedBanner.style.display = "none";
  const fab = document.getElementById("new-wod-fab");
  if (fab) fab.style.display = "none";
  // Clear hash without triggering scroll-to-top
  history.replaceState(null, '', window.location.pathname + window.location.search);
  setTimeout(() => loading.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);

  // Breathing-loader synced message cycling (8s rhythm, change every 4s)
  let msgIdx = 0;
  const msgEl = document.getElementById("loading-msg");
  msgEl.style.transition = 'opacity 0.6s ease';
  msgEl.style.opacity = '1';

  function cycleLoadingMsg() {
    msgEl.style.opacity = '0';
    setTimeout(() => {
      if (msgIdx < loadingMessages.length) msgEl.textContent = loadingMessages[msgIdx++];
      msgEl.style.opacity = '1';
    }, 600);
  }
  const msgInterval = setInterval(cycleLoadingMsg, 4000);

  // Breathe label: JS-driven Inhale/Exhale toggle synced with 8s CSS animation
  const breatheLabel = document.querySelector('.breathe-label');
  let breatheIsInhale = true;
  if (breatheLabel) { breatheLabel.textContent = 'Inhale'; breatheLabel.style.opacity = '1'; }
  const breatheInterval = setInterval(() => {
    if (!breatheLabel) return;
    breatheLabel.style.opacity = '0';
    setTimeout(() => {
      breatheIsInhale = !breatheIsInhale;
      breatheLabel.textContent = breatheIsInhale ? 'Inhale' : 'Exhale';
      breatheLabel.style.opacity = '1';
    }, 600);
  }, 4000);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipment, time, level, focus, format, injuries, otherRestrictions, mode })
    });

    if (!response.ok) {
      let errMsg = `Server error ${response.status} — please try again`;
      try { const e = await response.json(); errMsg = e.error || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const wod = await response.json();
    wod.mode = mode;
    wod.selectedTime = time;

    clearInterval(msgInterval);
    clearInterval(breatheInterval);
    msgEl.style.transition = '';
    loading.style.display = "none";

    saveToHistory(wod, { equipment, time, level, focus, injuries, otherRestrictions, mode });
    localStorage.setItem("homewod_last_mode", mode);
    localStorage.setItem("homewod_last_equipment", JSON.stringify(equipment));
    currentWOD = wod;
    if (wod._wodCount) updateWodCounter(wod._wodCount);
    updateStreak();
    renderWOD(wod);

    wodGeneratedThisSession = true;
    btn.disabled = false;
    if (genLabel) genLabel.textContent = "Generate My WOD"; else btn.textContent = "Generate My WOD";

  } catch (err) {
    clearInterval(msgInterval);
    clearInterval(breatheInterval);
    msgEl.style.transition = '';
    loading.style.display = "none";
    btn.disabled = false;
    if (genLabel) genLabel.textContent = "Generate My WOD"; else btn.textContent = "Generate My WOD";
    showError("Something went wrong: " + err.message + ". Please try again.");
  }
}

// ─── RENDER WOD ──────────────────────────────────────
function renderWOD(wod, isShared = false) {
  const mode = wod.mode || "general";
  currentMovements = [];

  document.getElementById("wod-title").textContent = wod.name;

  const estimatedTime = extractEstimatedTime(wod);
  const timeBadge = estimatedTime ? `<span class="meta-pill">⏱ ~${estimatedTime} min</span>` : "";

  const metaEl = document.getElementById("wod-meta");
  metaEl.innerHTML = (wod.meta || []).map((m, i) =>
    `<span class="meta-pill ${i === 0 ? "red" : ""}">${m}</span>`
  ).join("") + timeBadge;

  const bodyEl = document.getElementById("wod-body");
  bodyEl.innerHTML = (wod.blocks || []).map(block => {
    let hasScaling = block.scaling && block.scaling.trim().length > 0;
    const cleanContent = stripTimeLine(block.content);
    const isCoaching = block.type === "Coaching notes";
    const formattedContent = isCoaching
      ? formatBlockWithDemos(cleanContent, false)
      : formatBlockWithDemos(cleanContent);

    // Mode-specific block type display
    let displayType = block.type;
    if (mode === "beginner" && block.type === "Coaching notes") displayType = "Form Tips";
    if (mode === "lowimpact" && block.type === "Coaching notes") displayType = "Modifications";
    if (mode === "prenatal" && block.type === "Coaching notes") displayType = "Safety Notes";
    if (mode === "postnatal" && block.type === "Coaching notes") displayType = "Recovery Notes";

    // Scaling toggle label; beginner mode hides scaling
    let scalingShowText = "+ Show scaling options";
    let scalingHideText = "− Hide scaling";
    if (mode === "lowimpact") {
      scalingShowText = "+ Show modifications";
      scalingHideText = "− Hide modifications";
    }
    if (mode === "beginner") hasScaling = false;

    return `
      <div class="wod-block reveal">
        <div class="block-type">${displayType}</div>
        <div class="block-name">${block.name}</div>
        <div class="block-content">${formattedContent}</div>
        ${hasScaling ? `
          <button class="scaling-toggle" onclick="toggleScaling(this)" data-show="${scalingShowText}" data-hide="${scalingHideText}">${scalingShowText}</button>
          <div class="scaling-content">${block.scaling.replace(/•/g, "<br>•").replace(/\n/g, "<br>")}</div>
        ` : ""}
      </div>`;
  }).join("");

  updateProgress();

  // Staggered reveal of wod blocks
  const revealBlocks = bodyEl.querySelectorAll('.wod-block.reveal');
  revealBlocks.forEach((block, i) => {
    block.style.transitionDelay = `${i * 0.15}s`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    revealBlocks.forEach(block => block.classList.add('in'));
  }));

  // Show inline subscribe CTA for non-subscribers (not on shared WODs)
  const inlineSub = document.getElementById('inline-subscribe-cta');
  if (inlineSub) {
    const isSubscribed = localStorage.getItem('homewod_subscribed') === 'true';
    if (!isShared && !isSubscribed) {
      inlineSub.style.display = 'block';
      const inlineInput = document.getElementById('inline-sub-email');
      const inlineMsg = document.getElementById('inline-sub-msg');
      const inlineBtn = document.getElementById('inline-sub-btn');
      if (inlineInput) { inlineInput.value = ''; inlineInput.disabled = false; }
      if (inlineMsg) { inlineMsg.style.display = 'none'; inlineMsg.textContent = ''; }
      if (inlineBtn) { inlineBtn.disabled = false; inlineBtn.textContent = 'Get daily WODs →'; }
    } else {
      inlineSub.style.display = 'none';
    }
  }

  // Show rating for non-shared WODs
  const ratingEl = document.getElementById('wod-rating');
  if (ratingEl) {
    if (!isShared) {
      ratingEl.style.display = 'flex';
      ratingEl.querySelectorAll('.wod-rating-btn').forEach(b => b.classList.remove('selected'));
      const thanks = ratingEl.querySelector('.wod-rating-thanks');
      if (thanks) thanks.style.display = 'none';
    } else {
      ratingEl.style.display = 'none';
    }
  }

  // Close email panel if open (new WOD = fresh state)
  const emailWodPanel = document.getElementById("email-wod-panel");
  if (emailWodPanel) emailWodPanel.classList.remove("open");

  // Show contextual affiliate card based on WOD content
  showAffiliateCard(wod);

  // Update page title and OG meta tags
  document.title = `HomeWOD — ${wod.name}`;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogTitle) ogTitle.setAttribute('content', `HomeWOD — ${wod.name}`);
  if (ogDesc) ogDesc.setAttribute('content', `${(wod.meta || []).join(' · ')} · Generated free at homewod.vercel.app`);

  // Swap share button for shared WOD views
  const shareBtn = document.getElementById("share-btn");
  if (shareBtn) {
    if (isShared) {
      shareBtn.innerHTML = 'Try it yourself →';
      shareBtn.onclick = showFormFromShared;
      shareBtn.classList.remove("primary");
    } else {
      shareBtn.innerHTML = '<i data-lucide="link"></i> Share link';
      shareBtn.onclick = shareLink;
      shareBtn.classList.add("primary");
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  const section = document.getElementById("wod-section");
  section.style.display = "block";
  setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  const fab = document.getElementById("new-wod-fab");
  if (fab) { fab.style.display = "flex"; if (typeof lucide !== 'undefined') lucide.createIcons(); }

  if (typeof gtag !== 'undefined') {
    gtag('event', 'wod_generated', {
      event_category: 'engagement',
      event_label: wod.mode || 'unknown',
      value: 1
    })
  }

  // Show workout timer
  resetTimer()
  const selectedTime = parseInt(document.getElementById('sel-time')?.value || '20')
  showTimerBar(selectedTime)
}

// ─── SCALING TOGGLE ──────────────────────────────────
function toggleScaling(btn) {
  const content = btn.nextElementSibling;
  const isOpen = content.classList.contains("open");
  content.classList.toggle("open", !isOpen);
  btn.textContent = isOpen ? btn.dataset.show : btn.dataset.hide;
}

// ─── ERROR ───────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.style.display = "block";
}

// ─── SCROLL TO FORM ──────────────────────────────────
function scrollToForm() {
  document.querySelector(".form-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── SHARED BANNER ───────────────────────────────────
function dismissSharedBanner() {
  sessionStorage.setItem("homewod_shared_banner_dismissed", "true");
  const banner = document.getElementById("shared-top-banner");
  if (banner) banner.style.display = "none";
}

function showFormFromShared() {
  dismissSharedBanner();
  document.getElementById("wod-section").style.display = "none";
  currentWOD = null;
  window.location.hash = "";
  document.querySelector(".form-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── SHARE URL MODAL ─────────────────────────────────
function showShareModal(url) {
  const modal = document.getElementById("share-modal");
  const input = document.getElementById("share-modal-url");
  if (!modal || !input) return;
  input.value = url;
  modal.style.display = "flex";
  setTimeout(() => { input.select(); }, 100);
}

function copyShareModalUrl() {
  const input = document.getElementById("share-modal-url");
  if (!input) return;
  input.select();
  try {
    document.execCommand("copy");
    showToast("Link copied!");
    closeShareModal();
  } catch {
    showToast("Please copy the URL manually");
  }
}

function closeShareModal() {
  const modal = document.getElementById("share-modal");
  if (modal) modal.style.display = "none";
}

// ─── HASH / SHARED WOD LOADING ───────────────────────
function loadFromHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  try {
    const wod = JSON.parse(decodeURIComponent(escape(atob(hash))));
    if (!wod || !wod.name || !wod.blocks) {
      window.location.hash = "";
      return;
    }
    currentWOD = wod;
    renderWOD(wod, true);
    // Show sticky top banner unless already dismissed this session
    if (!sessionStorage.getItem("homewod_shared_banner_dismissed")) {
      document.getElementById("shared-top-banner").style.display = "block";
    }
    // wodGeneratedThisSession stays false — no email banner for shared views
  } catch {
    window.location.hash = "";
  }
}

// ─── RETURNING USER PERSONALIZATION ──────────────────
function initPersonalization() {
  const visitCount = parseInt(localStorage.getItem("homewod_visit_count") || "0");
  const newCount = visitCount + 1;
  localStorage.setItem("homewod_visit_count", newCount);

  const lastMode = localStorage.getItem("homewod_last_mode");
  const lastEquipment = JSON.parse(localStorage.getItem("homewod_last_equipment") || "[]");

  // Pre-select last used mode (or default to general)
  selectMode(lastMode || "general");

  // Pre-check last used equipment chips
  if (lastEquipment.length > 0) {
    document.querySelectorAll(".chip-toggle").forEach(cb => {
      cb.checked = lastEquipment.includes(cb.value);
    });
  }

  // Welcome back message after 3+ visits
  if (newCount > 3 && lastEquipment.length > 0) {
    const userEmail = localStorage.getItem("homewod_last_email");
    const firstName = userEmail ? userEmail.split("@")[0] : null;
    const eq0 = lastEquipment[0] || "";
    const eq1 = lastEquipment[1] ? " + " + lastEquipment[1] : "";
    const msg = `Welcome back${firstName ? ", " + firstName : ""}! Your last session used ${eq0}${eq1}.`;
    const el = document.getElementById("welcome-back-msg");
    if (el) {
      el.textContent = msg;
      setTimeout(() => { el.style.opacity = "1"; }, 500);
    }
  }
}

// ─── WORKOUT TIMER ───────────────────────────────────
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let timerTargetSecs = 1200;

function showTimerBar(targetMins) {
  timerTargetSecs = targetMins * 60;
  const bar = document.getElementById('timer-bar');
  const targetEl = document.getElementById('timer-target');
  if (!bar) return;
  if (targetEl) targetEl.textContent = `Target: ${targetMins} min`;
  bar.classList.add('visible');
  document.body.style.paddingBottom = '56px';
}

function toggleTimer() {
  const toggleBtn = document.getElementById('timer-toggle');
  const resetBtn = document.getElementById('timer-reset');

  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    if (toggleBtn) toggleBtn.textContent = '▶ Resume';
  } else {
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
    timerRunning = true;
    if (toggleBtn) toggleBtn.textContent = '⏸ Pause';
    if (resetBtn) resetBtn.style.display = 'block';
    if (navigator.vibrate) navigator.vibrate(50);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSeconds = 0;
  const display = document.getElementById('timer-display');
  const toggleBtn = document.getElementById('timer-toggle');
  const resetBtn = document.getElementById('timer-reset');
  const targetEl = document.getElementById('timer-target');
  if (display) {
    display.textContent = '00:00';
    display.classList.remove('warning', 'overtime');
  }
  if (toggleBtn) toggleBtn.textContent = '▶ Start';
  if (resetBtn) resetBtn.style.display = 'none';
  const targetMins = timerTargetSecs / 60;
  if (targetEl) targetEl.textContent = `Target: ${targetMins} min`;
}

function updateTimerDisplay() {
  const mins = Math.floor(timerSeconds / 60);
  const secs = timerSeconds % 60;
  const display = document.getElementById('timer-display');
  const targetEl = document.getElementById('timer-target');
  if (!display) return;

  display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  display.classList.remove('warning', 'overtime');

  if (timerSeconds > timerTargetSecs) {
    display.classList.add('overtime');
    const overMins = Math.floor((timerSeconds - timerTargetSecs) / 60);
    const overSecs = (timerSeconds - timerTargetSecs) % 60;
    if (targetEl) targetEl.textContent = `⚠ Over by ${overMins}:${String(overSecs).padStart(2, '0')}`;
  } else if (timerSeconds > timerTargetSecs * 0.8) {
    display.classList.add('warning');
  }

  if (timerRunning) document.title = `⏱ ${display.textContent} — HomeWOD`;

  if (timerSeconds === timerTargetSecs && navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
}

// ─── INLINE SUBSCRIBE ────────────────────────────────
async function inlineSubscribe() {
  const input = document.getElementById('inline-sub-email');
  const btn = document.getElementById('inline-sub-btn');
  const msg = document.getElementById('inline-sub-msg');
  const email = input?.value.trim() || '';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    if (input) input.focus();
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  if (msg) msg.style.display = 'none';

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        type: 'daily',
        equipment: getEquipment(),
        level: document.getElementById('sel-level')?.value || 'Intermediate',
        mode: currentMode
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    localStorage.setItem('homewod_subscribed', 'true');
    localStorage.setItem('homewod_last_email', email);

    const cta = document.getElementById('inline-subscribe-cta');
    if (cta) cta.innerHTML = '<div class="inline-sub-success">✓ You\'re in! First WOD arrives tomorrow morning.</div>';

    if (typeof gtag !== 'undefined') {
      gtag('event', 'email_subscribed', { event_category: 'conversion', event_label: 'inline' });
    }
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = 'Get daily WODs →'; }
    if (msg) { msg.textContent = 'Something went wrong — try again'; msg.style.display = 'block'; }
  }
}

// ─── WOD RATING ──────────────────────────────────────
function rateWOD(rating) {
  if (!currentWOD) return;

  const history = getHistory();
  if (history.length > 0) {
    history[0].rating = rating;
    localStorage.setItem('homewod_history', JSON.stringify(history));
  }

  const ratingEl = document.getElementById('wod-rating');
  if (ratingEl) {
    ratingEl.querySelectorAll('.wod-rating-btn').forEach(b => b.classList.remove('selected'));
    const btn = ratingEl.querySelector(`[data-rating="${rating}"]`);
    if (btn) btn.classList.add('selected');
    const thanks = ratingEl.querySelector('.wod-rating-thanks');
    if (thanks) thanks.style.display = 'inline';
  }

  if (typeof gtag !== 'undefined') {
    gtag('event', 'wod_rated', { event_category: 'engagement', event_label: rating });
  }
}

// ─── DAILY CHALLENGE ─────────────────────────────────
function getDailyChallenge() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const pick = (arr, salt) => arr[Math.abs(seed * salt) % arr.length];

  const modes     = ['crossfit','general','beginner','lowimpact','general','crossfit'];
  const modeNames = ['CrossFit Athlete','General Fitness','Complete Beginner','Low Impact','General Fitness','CrossFit Athlete'];
  const times     = [15, 20, 20, 30, 25, 20];
  const focuses   = ['Full body','Upper body','Lower body','Strength','Cardio','Full body'];

  const modeIdx = Math.abs(seed * 3) % modes.length;
  return {
    mode:      modes[modeIdx],
    modeName:  modeNames[modeIdx],
    time:      pick(times, 7),
    focus:     pick(focuses, 13),
    equipment: ['Bodyweight only']
  };
}

function initDailyChallenge() {
  const ch = getDailyChallenge();
  const detailsEl = document.getElementById('daily-challenge-details');
  if (!detailsEl) return;
  detailsEl.innerHTML = `
    <span class="daily-challenge-tag">${ch.modeName}</span>
    <span class="daily-challenge-tag">${ch.time} min</span>
    <span class="daily-challenge-tag">${ch.focus}</span>
    <span class="daily-challenge-tag">Bodyweight</span>
  `;
}

function acceptDailyChallenge() {
  const ch = getDailyChallenge();

  // Set training mode
  selectMode(ch.mode);

  // Set time
  const timeEl = document.getElementById('sel-time');
  if (timeEl) timeEl.value = ch.time;

  // Set focus
  const focusEl = document.getElementById('sel-focus');
  if (focusEl) focusEl.value = ch.focus;

  // Set equipment — bodyweight only
  document.querySelectorAll('#equipment-chips input[type="checkbox"]').forEach(cb => {
    cb.checked = cb.value === 'No equipment';
  });
  updateShopRow();

  // Scroll to form and generate
  const form = document.getElementById('form');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.getElementById('gen-btn')?.click(), 600);

  if (typeof gtag !== 'undefined') gtag('event', 'daily_challenge_accepted', { event_category: 'engagement' });
}

// ─── STREAK ──────────────────────────────────────────
function updateStreak() {
  const today = new Date().toDateString();
  const lastWod = localStorage.getItem('homewod_last_wod_date');
  let streak = parseInt(localStorage.getItem('homewod_streak') || '0');

  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (lastWod === today) {
    // already generated today — no change
  } else if (lastWod === yesterday) {
    streak += 1;
    localStorage.setItem('homewod_streak', streak);
  } else {
    streak = 1;
    localStorage.setItem('homewod_streak', streak);
  }
  localStorage.setItem('homewod_last_wod_date', today);
  renderStreak(streak);
}

function renderStreak(streak) {
  if (streak < 2) return;
  const item = document.getElementById('streak-bar-item');
  const divider = document.getElementById('streak-divider');
  const count = document.getElementById('streak-count');
  if (item && divider && count) {
    count.textContent = streak;
    item.style.display = '';
    divider.style.display = '';
  }
}

// ─── INIT ────────────────────────────────────────────
window.addEventListener("load", () => {
  renderHistory();
  loadFromHash();
  initPersonalization();

  // Daily challenge + streak
  initDailyChallenge();
  const savedStreak = parseInt(localStorage.getItem('homewod_streak') || '0');
  renderStreak(savedStreak);

  // Restore WOD counter from last session
  const savedCount = localStorage.getItem('homewod_wod_count');
  if (savedCount) updateWodCounter(parseInt(savedCount, 10));

  // Shop row — init and live updates on chip change
  updateShopRow();
  const chipsContainer = document.getElementById("equipment-chips");
  if (chipsContainer) chipsContainer.addEventListener("change", updateShopRow);

  document.getElementById("share-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("share-modal")) closeShareModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeShareModal(); }
  });

  const backToTop = document.getElementById("back-to-top");
  if (backToTop) {
    window.addEventListener("scroll", () => {
      backToTop.classList.toggle("visible", window.scrollY > 400);
    }, { passive: true });
  }
});
