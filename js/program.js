// ─── EXERCISE GIF API ────────────────────────────────
const EXERCISEDB_KEY = 'd9b1605386msh3c7abd2424df331p1d2cbbjsn8571fcac80fb';

// ─── STATE ───────────────────────────────────────────
let currentProgram = null;
let currentProgramMode = "general";
let selectedDays = 4;
let expandedDayNumber = 1;
let currentStartDay = 'today';

// ─── LOADING MESSAGES ────────────────────────────────
const programLoadingMessages = [
  "Planning your training week...",
  "Balancing push and pull days...",
  "Programming progressive overload...",
  "Writing warmups for each session...",
  "Dialling in the conditioning pieces...",
  "Your program is ready."
];

// ─── PROGRAM HISTORY ─────────────────────────────────
const PROGRAM_HISTORY_LIMIT = 5;

function getProgramHistory() {
  try {
    return JSON.parse(localStorage.getItem("homewod_program_history") || "[]");
  } catch { return []; }
}

function saveProgramToHistory(program, params) {
  const history = getProgramHistory();
  const entry = {
    id: Date.now(),
    title: program.programTitle,
    subtitle: program.programSubtitle || "",
    date: program.weekOf || "",
    days: params.days,
    mode: params.mode,
    goal: params.goal,
    time: params.time,
    equipment: params.equipment
  };
  history.unshift(entry);
  while (history.length > PROGRAM_HISTORY_LIMIT) history.pop();
  localStorage.setItem("homewod_program_history", JSON.stringify(history));
  renderProgramHistory();
}

function renderProgramHistory() {
  const history = getProgramHistory();
  const section = document.getElementById("recent-programs-section");
  const list = document.getElementById("recent-programs-list");
  if (!section || !list) return;

  if (history.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  list.innerHTML = history.map(entry => `
    <div class="recent-program-row" onclick="loadProgramConfig(${entry.id})">
      <div class="recent-program-left">
        <div class="recent-program-title">${escHtmlClient(entry.title)}</div>
        <div class="recent-program-meta">${entry.days} days · ${entry.mode} · ${entry.goal}</div>
      </div>
      <div class="recent-program-date">${entry.date}</div>
    </div>
  `).join("");
}

function loadProgramConfig(id) {
  const history = getProgramHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) return;

  // Restore form to saved config
  selectProgramMode(entry.mode || "general");
  setDays(entry.days || 4);

  const goalSel = document.getElementById("sel-goal");
  if (goalSel) goalSel.value = entry.goal || "general";

  const timeSel = document.getElementById("sel-time");
  if (timeSel) timeSel.value = entry.time || "45";

  if (Array.isArray(entry.equipment)) {
    document.querySelectorAll(".chip-toggle").forEach(cb => {
      cb.checked = entry.equipment.includes(cb.value);
    });
  }

  scrollToForm();
  showToast("Form restored — generate to get a fresh week!");
}

// ─── START DAY ───────────────────────────────────────
function setStartDay(value) {
  currentStartDay = value;
  const todayBtn = document.getElementById('btn-start-today');
  const mondayBtn = document.getElementById('btn-start-monday');
  if (todayBtn && mondayBtn) {
    todayBtn.classList.toggle('active', value === 'today');
    mondayBtn.classList.toggle('active', value === 'monday');
  }
}

// ─── MODE SELECTOR ───────────────────────────────────
function selectProgramMode(mode) {
  currentProgramMode = mode;
  document.querySelectorAll(".mode-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.mode === mode);
  });
}

// ─── DAYS TOGGLE ─────────────────────────────────────
function setDays(n) {
  selectedDays = n;
  document.querySelectorAll(".days-btn").forEach(btn => {
    btn.classList.toggle("selected", parseInt(btn.dataset.days) === n);
  });
}

// ─── EQUIPMENT ───────────────────────────────────────
function getEquipment() {
  const checked = document.querySelectorAll(".chip-toggle:checked");
  if (checked.length === 0) return ["Bodyweight only"];
  return Array.from(checked).map(c => c.value);
}

// ─── INJURIES ────────────────────────────────────────
function toggleInjurySection() {
  const body = document.getElementById("injury-body");
  const btn = document.getElementById("injury-toggle-btn");
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  btn.textContent = isOpen ? "+ Any injuries or restrictions? (optional)" : "− Hide";
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

// ─── SCROLL HELPERS ──────────────────────────────────
function scrollToForm() {
  const form = document.querySelector(".program-form");
  if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToOutput() {
  const out = document.getElementById("program-output");
  if (out) setTimeout(() => out.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
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
  toast.offsetHeight;
  toast.classList.add("toast-visible");
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-hidden");
    setTimeout(() => toast.remove(), 300);
  }, 1800);
}

// ─── GENERATE PROGRAM ────────────────────────────────
async function generateProgram() {
  const equipment = getEquipment();
  const time = document.getElementById("sel-time").value;
  const goal = document.getElementById("sel-goal").value;
  const { injuries, otherRestrictions } = getInjuries();
  const mode = currentProgramMode;
  const days = selectedDays;

  const btn = document.getElementById("gen-btn");
  const loading = document.getElementById("loading-section");
  const output = document.getElementById("program-output");
  const errorMsg = document.getElementById("error-msg");

  btn.disabled = true;
  btn.textContent = "Generating...";
  loading.style.display = "block";
  output.style.display = "none";
  if (errorMsg) errorMsg.style.display = "none";

  let msgIdx = 0;
  const msgEl = document.getElementById("loading-msg");
  const msgInterval = setInterval(() => {
    if (msgIdx < programLoadingMessages.length) msgEl.textContent = programLoadingMessages[msgIdx++];
  }, 1000);

  try {
    const response = await fetch("/api/program", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, goal, days, time, equipment, injuries, otherRestrictions, startDay: currentStartDay })
    });

    if (!response.ok) {
      let errMsg = `Server error ${response.status}`;
      try { const err = await response.json(); errMsg = err.error || errMsg; } catch {}
      throw new Error(errMsg);
    }

    let program;
    try {
      program = await response.json();
    } catch {
      throw new Error("The server returned an unexpected response. Please try again.");
    }
    clearInterval(msgInterval);
    loading.style.display = "none";
    btn.disabled = false;
    btn.textContent = "Generate My Week";

    currentProgram = program;
    saveProgramToHistory(program, { mode, goal, days, time, equipment });

    // Save last mode + equipment for personalization
    localStorage.setItem("homewod_last_mode", mode);
    localStorage.setItem("homewod_last_equipment", JSON.stringify(equipment));

    if (typeof gtag !== 'undefined') {
      gtag('event', 'program_generated', {
        event_category: 'engagement',
        event_label: goal || 'unknown'
      })
    }

    renderProgram(program);

  } catch (err) {
    clearInterval(msgInterval);
    loading.style.display = "none";
    btn.disabled = false;
    btn.textContent = "Generate My Week";
    const errorMsg = document.getElementById("error-msg");
    if (errorMsg) {
      errorMsg.textContent = "Something went wrong: " + err.message + ". Please try again.";
      errorMsg.style.display = "block";
    }
  }
}

// ─── RENDER PROGRAM ──────────────────────────────────
function renderProgram(program) {
  const output = document.getElementById("program-output");

  // Header card
  document.getElementById("prog-title").textContent = program.programTitle || "Your Week";
  document.getElementById("prog-subtitle").textContent = program.programSubtitle || "";
  document.getElementById("prog-week-of").textContent = program.weekOf || "";

  const metaEl = document.getElementById("prog-meta-pills");
  metaEl.innerHTML = [
    `${program.totalDays} days`,
    document.getElementById("sel-time").value + " min/session",
    currentProgramMode,
    document.getElementById("sel-goal").value
  ].map(t => `<span class="prog-meta-pill">${t}</span>`).join("");

  // Days accordion
  const daysList = document.getElementById("days-list");
  daysList.innerHTML = (program.days || []).map((day, i) => {
    const isFirst = i === 0;
    const dateStr = getDayDate(day.dayName);
    return `
      <div class="day-card" id="day-card-${day.dayNumber}">
        <div class="day-header" onclick="toggleDay(${day.dayNumber})">
          <div class="day-header-left">
            <div class="day-name">${escHtmlClient(day.dayName)}</div>
            <div class="day-date">${dateStr}</div>
          </div>
          <div class="day-focus-label">${escHtmlClient(day.focus || "")}</div>
          <div class="day-header-right">
            <span class="day-time-pill">${escHtmlClient(day.estimatedTime || "")}</span>
            <span class="day-chevron ${isFirst ? "open" : ""}" id="day-chevron-${day.dayNumber}">›</span>
          </div>
        </div>
        <div class="day-body" id="day-body-${day.dayNumber}" style="${isFirst ? "" : "display:none"}">
          ${renderDayBlock("Warmup", day.warmup?.duration ? `Warmup — ${day.warmup.duration}` : "Warmup", day.warmup?.content || "", "", "warmup")}
          ${day.strength && day.strength.name ? renderDayBlock("Strength", day.strength.name, day.strength.content || "", day.strength.scaling || "", "strength") : ""}
          ${day.metcon && day.metcon.name ? renderDayBlock("Metcon", day.metcon.name, day.metcon.content || "", day.metcon.scaling || "", "metcon") : ""}
          ${day.coachingNotes ? `<div class="coaching-notes">${escHtmlClient(day.coachingNotes)}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  // Weekly notes
  const notesSection = document.getElementById("weekly-notes-section");
  const notesContent = document.getElementById("weekly-notes-content");
  if (program.weeklyNotes && notesSection && notesContent) {
    notesContent.textContent = program.weeklyNotes;
    notesSection.style.display = "block";
  } else if (notesSection) {
    notesSection.style.display = "none";
  }

  expandedDayNumber = 1;
  output.style.display = "block";
  scrollToOutput();
  showWeeklySubscribeBanner();
}

// ─── INLINE EXERCISE DEMOS ────────────────────────────
function extractMovementName(bulletText) {
  const cleaned = bulletText
    .replace(/^\d+\s*(x|×|reps?|sets?)?\s*/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\d+[\-–]\d+\s*(lbs?|kg)/gi, '')
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (/^(score|time cap|rest|note|tip|coach|strat|amrap|emom|for time|complete|round)/i.test(cleaned)) return null;
  return cleaned.split(/\s+/).slice(0, 3).join(' ').replace(/[,;:\[\]]/g, '').trim();
}

function formatBlockWithDemos(content) {
  const normalized = content.replace(/\\n/g, '\n');
  return normalized.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (!trimmed.startsWith('•')) {
      return `<div class="block-struct-line">${escHtmlClient(trimmed)}</div>`;
    }
    const bulletText = trimmed.slice(1).trim();
    const movement = extractMovementName(bulletText);
    const demoBtn = movement
      ? `<button class="inline-demo-btn" onclick="toggleInlineDemo(this)" data-movement="${movement.replace(/"/g, '&quot;')}">▶ demo</button>`
      : '';
    return `<div class="bullet-row"><div class="bullet-text">• ${escHtmlClient(bulletText)}${demoBtn}</div><div class="inline-gif-wrap" style="display:none"></div></div>`;
  }).filter(Boolean).join('');
}

async function toggleInlineDemo(btn) {
  const wrap = btn.closest('.bullet-row').querySelector('.inline-gif-wrap');
  const movement = btn.dataset.movement;

  if (wrap.style.display !== 'none') {
    wrap.style.display = 'none';
    btn.textContent = '▶ demo';
    return;
  }

  const cacheKey = `homewod_gif_${movement}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    renderDemoResult(wrap, cached === 'none' ? null : cached, movement);
    btn.textContent = cached !== 'none' ? '▲ hide' : '▶ demo';
    return;
  }

  btn.textContent = '⋯';
  btn.disabled = true;

  try {
    const gifUrl = await fetchExerciseGif(movement);
    sessionStorage.setItem(cacheKey, gifUrl || 'none');
    renderDemoResult(wrap, gifUrl, movement);
    btn.textContent = gifUrl ? '▲ hide' : '▶ demo';
  } catch {
    btn.textContent = '▶ demo';
  }
  btn.disabled = false;
}

function renderDemoResult(wrap, gifUrl, movement) {
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(movement + ' exercise how to')}`;
  if (gifUrl) {
    wrap.innerHTML = `<img src="${gifUrl}" alt="${escHtmlClient(movement)}" class="exercise-gif" loading="lazy">
      <a class="demo-yt-link" href="${ytUrl}" target="_blank" rel="noopener">Watch on YouTube ↗</a>`;
  } else {
    wrap.innerHTML = `<a class="demo-yt-link demo-yt-only" href="${ytUrl}" target="_blank" rel="noopener">▶ Watch "${escHtmlClient(movement)}" on YouTube ↗</a>`;
  }
  wrap.style.display = 'block';
}

async function fetchExerciseGif(movement) {
  const terms = buildSearchTerms(movement);
  for (const term of terms) {
    const encoded = encodeURIComponent(term.toLowerCase());
    try {
      const res = await fetch(`https://exercisedb.p.rapidapi.com/exercises/name/${encoded}?limit=1&offset=0`, {
        headers: {
          'X-RapidAPI-Key': EXERCISEDB_KEY,
          'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data[0].gifUrl;
    } catch { continue; }
  }
  return null;
}

function buildSearchTerms(movement) {
  const words = movement.toLowerCase().split(/\s+/);
  const terms = [movement];
  if (words.length >= 3) terms.push(words.slice(1).join(' '));
  if (words.length >= 2) terms.push(words.slice(-2).join(' '));
  terms.push(words[words.length - 1]);
  return [...new Set(terms)];
}

function renderDayBlock(type, name, content, scaling, typeClass) {
  const showDemos = EXERCISEDB_KEY && (typeClass === "warmup" || typeClass === "metcon");
  const formattedContent = showDemos
    ? formatBlockWithDemos(content)
    : escHtmlClient(content).replace(/•/g, "<br>•").replace(/\\n/g, "<br>").replace(/\n/g, "<br>");

  const hasScaling = scaling && scaling.trim().length > 0;

  return `
    <div class="prog-block prog-block-${typeClass}">
      <div class="prog-block-type">${type}</div>
      <div class="prog-block-name">${escHtmlClient(name)}</div>
      <div class="prog-block-content">${formattedContent}</div>
      ${hasScaling ? `
        <button class="prog-scaling-toggle" onclick="toggleProgScaling(this)" data-show="+ Show scaling" data-hide="− Hide scaling">+ Show scaling</button>
        <div class="prog-scaling-content">${escHtmlClient(scaling).replace(/•/g, "<br>•").replace(/\n/g, "<br>")}</div>
      ` : ""}
    </div>`;
}

function getDayDate(dayName) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const targetIdx = days.indexOf(dayName);
  if (targetIdx === -1) return "";

  const today = new Date();
  const todayIdx = today.getDay();
  let diff = targetIdx - todayIdx;
  if (diff <= -2) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── DAY ACCORDION ───────────────────────────────────
function toggleDay(dayNumber) {
  const body = document.getElementById(`day-body-${dayNumber}`);
  const chevron = document.getElementById(`day-chevron-${dayNumber}`);
  if (!body) return;

  // Close previously open
  if (expandedDayNumber && expandedDayNumber !== dayNumber) {
    const prevBody = document.getElementById(`day-body-${expandedDayNumber}`);
    const prevChev = document.getElementById(`day-chevron-${expandedDayNumber}`);
    if (prevBody) prevBody.style.display = "none";
    if (prevChev) prevChev.classList.remove("open");
  }

  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  if (chevron) chevron.classList.toggle("open", !isOpen);
  expandedDayNumber = isOpen ? null : dayNumber;
}

// ─── SCALING TOGGLE ──────────────────────────────────
function toggleProgScaling(btn) {
  const content = btn.nextElementSibling;
  const isOpen = content.classList.contains("open");
  content.classList.toggle("open", !isOpen);
  btn.textContent = isOpen ? btn.dataset.show : btn.dataset.hide;
}

// ─── RESET FORM ──────────────────────────────────────
function resetForm() {
  selectProgramMode("general");
  setDays(4);
  document.getElementById("sel-goal").value = "general";
  document.getElementById("sel-time").value = "45";
  document.querySelectorAll(".chip-toggle").forEach(cb => { cb.checked = false; });
  clearInjuries();
  document.getElementById("program-output").style.display = "none";
  currentProgram = null;
  scrollToForm();
}

// ─── EMAIL PROGRAM PANEL ─────────────────────────────
function toggleProgramEmailPanel() {
  const panel = document.getElementById("email-program-panel");
  if (!panel) return;
  const isOpen = panel.classList.contains("open");
  if (isOpen) { panel.classList.remove("open"); return; }

  const body = document.getElementById("email-program-body");
  if (body) {
    body.innerHTML = `
      <div class="email-wod-form-row">
        <input type="email" class="email-input" id="email-program-input" placeholder="your@email.com"
          onkeydown="if(event.key==='Enter')sendProgramEmail()">
        <button type="button" class="email-btn" id="email-program-btn" onclick="sendProgramEmail()">Send ↗</button>
      </div>
      <div class="email-wod-error" id="email-program-error" style="display:none"></div>
    `;
    const lastEmail = localStorage.getItem("homewod_last_email");
    const input = document.getElementById("email-program-input");
    if (lastEmail && input) input.value = lastEmail;
  }

  panel.classList.add("open");
  setTimeout(() => {
    const input = document.getElementById("email-program-input");
    if (input) input.focus();
  }, 310);
}

async function sendProgramEmail() {
  if (!currentProgram) return;
  const input = document.getElementById("email-program-input");
  const btn = document.getElementById("email-program-btn");
  const errorEl = document.getElementById("email-program-error");
  const body = document.getElementById("email-program-body");
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
    const res = await fetch("/api/email-wod", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, program: currentProgram })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send");

    localStorage.setItem("homewod_last_email", email);

    if (body) {
      body.innerHTML = `<div class="email-wod-success-msg">&#10003; Sent to ${escHtmlClient(email)}!</div>`;
    }
    setTimeout(() => {
      const panel = document.getElementById("email-program-panel");
      if (panel) panel.classList.remove("open");
    }, 3000);

  } catch {
    if (input) input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = "Send ↗"; }
    if (errorEl) { errorEl.textContent = "Couldn't send — try again"; errorEl.style.display = "block"; }
  }
}

// ─── PERSONALIZATION ─────────────────────────────────
function initProgramPersonalization() {
  const visitCount = parseInt(localStorage.getItem("homewod_visit_count") || "0");
  localStorage.setItem("homewod_visit_count", visitCount + 1);

  const lastMode = localStorage.getItem("homewod_last_mode");
  const lastEquipment = JSON.parse(localStorage.getItem("homewod_last_equipment") || "[]");

  selectProgramMode(lastMode || "general");

  if (lastEquipment.length > 0) {
    document.querySelectorAll(".chip-toggle").forEach(cb => {
      cb.checked = lastEquipment.includes(cb.value);
    });
  }
}

// ─── UTIL ────────────────────────────────────────────
function escHtmlClient(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── WEEKLY SUBSCRIBE BANNER ─────────────────────────
function showWeeklySubscribeBanner() {
  const alreadySubscribed = localStorage.getItem("homewod_weekly_subscribed");
  const alreadyDismissed = sessionStorage.getItem("homewod_weekly_banner_dismissed");
  if (alreadySubscribed || alreadyDismissed) return;

  const banner = document.getElementById("weekly-subscribe-banner");
  if (!banner) return;

  // Pre-fill last used email
  const lastEmail = localStorage.getItem("homewod_last_email");
  const input = document.getElementById("weekly-sub-email");
  if (lastEmail && input) input.value = lastEmail;

  banner.style.display = "block";
}

function dismissWeeklyBanner() {
  sessionStorage.setItem("homewod_weekly_banner_dismissed", "true");
  const banner = document.getElementById("weekly-subscribe-banner");
  if (banner) banner.style.display = "none";
}

async function subscribeWeekly() {
  const input = document.getElementById("weekly-sub-email");
  const btn = document.getElementById("weekly-sub-btn");
  const errorEl = document.getElementById("weekly-sub-error");
  const content = document.getElementById("weekly-sub-content");

  const email = (input && input.value.trim()) || "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    if (errorEl) { errorEl.textContent = "Please enter a valid email address"; errorEl.style.display = "block"; }
    return;
  }

  if (input) input.disabled = true;
  if (btn) { btn.disabled = true; btn.textContent = "..."; }
  if (errorEl) errorEl.style.display = "none";

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        type: "weekly",
        mode: currentProgramMode,
        goal: document.getElementById("sel-goal")?.value || "general",
        days: selectedDays,
        equipment: getEquipment()
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Subscription failed");

    localStorage.setItem("homewod_weekly_subscribed", "true");
    localStorage.setItem("homewod_last_email", email);

    if (typeof gtag !== "undefined") {
      gtag("event", "weekly_subscribed", { event_category: "conversion" });
    }

    if (content) {
      content.innerHTML = `<div class="weekly-sub-success">&#10003; You're in! Your first program lands next Monday.</div>`;
    }
    setTimeout(() => {
      const banner = document.getElementById("weekly-subscribe-banner");
      if (banner) banner.style.display = "none";
    }, 4000);

  } catch {
    if (input) input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = "Subscribe free"; }
    if (errorEl) { errorEl.textContent = "Something went wrong — try again"; errorEl.style.display = "block"; }
  }
}

// ─── INIT ────────────────────────────────────────────
window.addEventListener("load", () => {
  setDays(4);
  initProgramPersonalization();
  renderProgramHistory();

  // Set today's day name in start-day toggle
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayLabel = document.getElementById('today-day-name');
  if (todayLabel) todayLabel.textContent = todayName;
});
