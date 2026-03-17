const DEFAULT_STATE = {
  homeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  savedTimezones: [
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    "America/Los_Angeles",
    "America/New_York",
    "UTC"
  ],
  timeFormat: "12h",
  workingHours: {
    "America/Los_Angeles": { start: "09:00", end: "18:00" },
    "America/New_York": { start: "09:00", end: "18:00" }
  },
  compactMode: true,
  lastSourceTimezone: "America/Los_Angeles"
};

const TZ_ALIASES = {
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  PT: "America/Los_Angeles",
  EST: "America/New_York",
  EDT: "America/New_York",
  ET: "America/New_York",
  IST: "Asia/Kolkata",
  GMT: "UTC",
  UTC: "UTC"
};

const app = {
  state: structuredClone(DEFAULT_STATE),
  lastConversion: null
};

const el = {
  cards: document.getElementById("clockCards"),
  timeInput: document.getElementById("timeInput"),
  sourceTimezone: document.getElementById("sourceTimezone"),
  convertBtn: document.getElementById("convertBtn"),
  converterError: document.getElementById("converterError"),
  results: document.getElementById("conversionResults"),
  copySimple: document.getElementById("copyTemplateSimple"),
  copyDetailed: document.getElementById("copyTemplateDetailed"),
  copyStatus: document.getElementById("copyStatus"),
  clientTimezone: document.getElementById("clientTimezone"),
  overlapInfo: document.getElementById("overlapInfo"),
  homeTimezone: document.getElementById("homeTimezone"),
  timeFormat: document.getElementById("timeFormat"),
  compactMode: document.getElementById("compactMode"),
  timezoneInput: document.getElementById("timezoneInput"),
  addTimezoneBtn: document.getElementById("addTimezoneBtn"),
  timezoneList: document.getElementById("timezoneList"),
  settingsError: document.getElementById("settingsError")
};

init();

async function init() {
  const stored = await chrome.storage.local.get(DEFAULT_STATE);
  app.state = normalizeState(stored);
  wireEvents();
  renderAll();
  setInterval(renderClockCards, 60 * 1000);
}

function normalizeState(state) {
  const merged = {
    ...DEFAULT_STATE,
    ...state
  };
  merged.savedTimezones = [...new Set(merged.savedTimezones.map(resolveTimezone))].filter(Boolean);
  if (!merged.savedTimezones.length) merged.savedTimezones = [...DEFAULT_STATE.savedTimezones];
  if (!merged.savedTimezones.includes(merged.homeTimezone)) merged.savedTimezones.unshift(merged.homeTimezone);
  return merged;
}

function wireEvents() {
  el.convertBtn.addEventListener("click", doConvert);
  el.timeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doConvert();
  });
  el.copySimple.addEventListener("click", () => copyTemplate("simple"));
  el.copyDetailed.addEventListener("click", () => copyTemplate("detailed"));
  el.addTimezoneBtn.addEventListener("click", addTimezone);

  el.homeTimezone.addEventListener("change", async () => {
    app.state.homeTimezone = el.homeTimezone.value;
    await persist();
    renderAll();
  });

  el.timeFormat.addEventListener("change", async () => {
    app.state.timeFormat = el.timeFormat.value;
    await persist();
    renderAll();
  });

  el.compactMode.addEventListener("change", async () => {
    app.state.compactMode = el.compactMode.checked;
    await persist();
    renderAll();
  });

  el.sourceTimezone.addEventListener("change", async () => {
    app.state.lastSourceTimezone = el.sourceTimezone.value;
    await persist();
  });

  el.clientTimezone.addEventListener("change", renderOverlap);
}

function renderAll() {
  document.body.classList.toggle("compact", app.state.compactMode);
  renderClockCards();
  renderSelectors();
  renderTimezoneList();
  renderOverlap();
}

function renderClockCards() {
  const now = new Date();
  el.cards.innerHTML = "";
  for (const tz of app.state.savedTimezones) {
    const time = formatTimeInZone(now, tz);
    const rollover = getDayRollover(now, tz, app.state.homeTimezone);
    const within = isWithinWorkHours(now, tz);
    const card = document.createElement("article");
    card.className = "clock-card";
    card.innerHTML = `
      <div class="clock-time">${time}</div>
      <div class="tz-id">${tz}</div>
      <div class="rollover">${rollover}</div>
      <div class="work-status ${within ? "in" : "out"}">${within ? "Within work hours" : "Outside work hours"}</div>
    `;
    el.cards.appendChild(card);
  }
}

function renderSelectors() {
  const options = app.state.savedTimezones
    .map((tz) => `<option value="${tz}">${tz}</option>`)
    .join("");

  el.sourceTimezone.innerHTML = options;
  el.clientTimezone.innerHTML = options;
  el.homeTimezone.innerHTML = options;

  el.sourceTimezone.value = app.state.savedTimezones.includes(app.state.lastSourceTimezone)
    ? app.state.lastSourceTimezone
    : app.state.savedTimezones[0];
  el.homeTimezone.value = app.state.homeTimezone;
  el.clientTimezone.value = app.state.savedTimezones.find((tz) => tz !== app.state.homeTimezone) || app.state.homeTimezone;
  el.timeFormat.value = app.state.timeFormat;
  el.compactMode.checked = app.state.compactMode;
}

function renderTimezoneList() {
  el.timezoneList.innerHTML = "";
  app.state.savedTimezones.forEach((tz, i) => {
    const li = document.createElement("li");
    li.className = "timezone-item";
    li.innerHTML = `
      <span>${tz}</span>
      <button data-action="up" data-index="${i}" title="Move up">↑</button>
      <button data-action="down" data-index="${i}" title="Move down">↓</button>
      <button data-action="remove" data-index="${i}" title="Remove">✕</button>
    `;
    li.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", onTimezoneEdit);
    });
    el.timezoneList.appendChild(li);
  });
}

async function onTimezoneEdit(event) {
  const i = Number(event.target.dataset.index);
  const action = event.target.dataset.action;
  if (action === "remove") {
    const tz = app.state.savedTimezones[i];
    if (app.state.savedTimezones.length <= 1 || tz === app.state.homeTimezone) return;
    app.state.savedTimezones.splice(i, 1);
  }
  if (action === "up" && i > 0) {
    [app.state.savedTimezones[i - 1], app.state.savedTimezones[i]] = [app.state.savedTimezones[i], app.state.savedTimezones[i - 1]];
  }
  if (action === "down" && i < app.state.savedTimezones.length - 1) {
    [app.state.savedTimezones[i + 1], app.state.savedTimezones[i]] = [app.state.savedTimezones[i], app.state.savedTimezones[i + 1]];
  }
  await persist();
  renderAll();
}

async function addTimezone() {
  el.settingsError.textContent = "";
  const raw = el.timezoneInput.value.trim();
  const tz = resolveTimezone(raw);
  if (!tz || !isValidTimezone(tz)) {
    el.settingsError.textContent = "Invalid timezone or abbreviation.";
    return;
  }
  if (!app.state.savedTimezones.includes(tz)) app.state.savedTimezones.push(tz);
  if (!app.state.workingHours[tz]) app.state.workingHours[tz] = { start: "09:00", end: "18:00" };
  el.timezoneInput.value = "";
  await persist();
  renderAll();
}

function doConvert() {
  el.converterError.textContent = "";
  const parsed = parseInputTime(el.timeInput.value);
  if (!parsed) {
    el.converterError.textContent = "Invalid time. Try 9 PM, 9:30 PM, or 21:30.";
    return;
  }

  const sourceTz = resolveTimezone(el.sourceTimezone.value);
  const result = convertFromSource(parsed.hour, parsed.minute, sourceTz, app.state.savedTimezones);
  app.lastConversion = result;
  renderConversion(result);
}

function renderConversion(result) {
  el.results.innerHTML = "";
  result.targets.forEach((item) => {
    const div = document.createElement("div");
    div.className = "result-item";
    const rollover = item.dayShift === 0 ? "Today" : item.dayShift === 1 ? "Tomorrow" : "Yesterday";
    div.textContent = `${item.time} — ${item.timezone} (${rollover})`;
    el.results.appendChild(div);
  });
}

function copyTemplate(type) {
  if (!app.lastConversion || app.lastConversion.targets.length < 2) return;
  const source = app.lastConversion.source;
  const target = app.lastConversion.targets.find((t) => t.timezone !== source.timezone) || app.lastConversion.targets[0];

  let text = `${source.time} ${shortZone(source.timezone)} = ${target.time} ${shortZone(target.timezone)}`;
  if (type === "detailed") {
    text = `${source.weekday}, ${source.time} ${shortZone(source.timezone)} / ${target.weekday}, ${target.time} ${shortZone(target.timezone)}`;
  }

  navigator.clipboard.writeText(text).then(() => {
    el.copyStatus.textContent = "Copied";
    setTimeout(() => (el.copyStatus.textContent = ""), 1200);
  });
}

function renderOverlap() {
  const home = app.state.homeTimezone;
  const client = el.clientTimezone.value || app.state.savedTimezones.find((tz) => tz !== home) || home;
  const homeH = app.state.workingHours[home] || { start: "09:00", end: "18:00" };
  const clientH = app.state.workingHours[client] || { start: "09:00", end: "18:00" };
  const overlap = computeSimpleOverlap(home, client, homeH, clientH);

  el.overlapInfo.innerHTML = `
    <div>Home (${home}): ${homeH.start} - ${homeH.end}</div>
    <div>Client (${client}): ${clientH.start} - ${clientH.end}</div>
    <div><strong>Best overlap:</strong> ${overlap}</div>
  `;
}

function computeSimpleOverlap(homeTz, clientTz, homeHours, clientHours) {
  const baseDate = new Date();
  const startLocal = zonedTimeToDate(baseDate, homeHours.start, homeTz);
  const endLocal = zonedTimeToDate(baseDate, homeHours.end, homeTz);
  const startClient = zonedTimeToDate(baseDate, clientHours.start, clientTz);
  const endClient = zonedTimeToDate(baseDate, clientHours.end, clientTz);
  const start = Math.max(startLocal.getTime(), startClient.getTime());
  const end = Math.min(endLocal.getTime(), endClient.getTime());
  if (end <= start) return "No overlap";
  return `${formatTimeInZone(new Date(start), homeTz)} - ${formatTimeInZone(new Date(end), homeTz)} (${homeTz})`;
}

function convertFromSource(hour, minute, sourceTz, targets) {
  const now = new Date();
  const sourceDate = zonedTimeToDate(now, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, sourceTz);
  const source = {
    timezone: sourceTz,
    time: formatTimeInZone(sourceDate, sourceTz),
    weekday: formatWeekday(sourceDate, sourceTz)
  };

  const targetRows = targets.map((tz) => {
    const dayShift = computeDayShift(sourceDate, sourceTz, tz);
    return {
      timezone: tz,
      time: formatTimeInZone(sourceDate, tz),
      weekday: formatWeekday(sourceDate, tz),
      dayShift
    };
  });

  return { source, targets: targetRows };
}

function parseInputTime(text) {
  const value = text.trim().toUpperCase();
  const match12 = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match12) {
    let hour = Number(match12[1]);
    const minute = Number(match12[2] || "0");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (match12[3] === "AM") hour = hour === 12 ? 0 : hour;
    if (match12[3] === "PM") hour = hour === 12 ? 12 : hour + 12;
    return { hour, minute };
  }

  const match24 = value.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hour = Number(match24[1]);
    const minute = Number(match24[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

function zonedTimeToDate(baseDate, hhmm, timeZone) {
  const [h, m] = hhmm.split(":").map(Number);
  const ymd = getYmd(baseDate, timeZone);
  const guessUtc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, h, m, 0);
  const offset = getOffsetMinutes(new Date(guessUtc), timeZone);
  return new Date(guessUtc - offset * 60_000);
}

function getOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, Number(parts.month) - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - date.getTime()) / 60000;
}

function getYmd(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const [year, month, day] = dtf.format(date).split("-").map(Number);
  return { year, month, day };
}

function formatWeekday(date, tz) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
}

function computeDayShift(date, sourceTz, targetTz) {
  const src = getYmd(date, sourceTz);
  const tgt = getYmd(date, targetTz);
  const srcDate = Date.UTC(src.year, src.month - 1, src.day);
  const tgtDate = Date.UTC(tgt.year, tgt.month - 1, tgt.day);
  const diff = Math.round((tgtDate - srcDate) / 86_400_000);
  if (diff > 0) return 1;
  if (diff < 0) return -1;
  return 0;
}

function getDayRollover(now, tz, homeTz) {
  const shift = computeDayShift(now, homeTz, tz);
  if (shift === -1) return "Yesterday";
  if (shift === 1) return "Tomorrow";
  return "Today";
}

function formatTimeInZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: app.state.timeFormat === "12h"
  }).format(date);
}

function isWithinWorkHours(date, tz) {
  const wh = app.state.workingHours[tz] || { start: "09:00", end: "18:00" };
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return time >= wh.start && time <= wh.end;
}

function shortZone(tz) {
  return Object.keys(TZ_ALIASES).find((k) => TZ_ALIASES[k] === tz && k.length <= 3) || tz.split("/").pop();
}

function resolveTimezone(input) {
  if (!input) return null;
  const normalized = input.trim();
  return TZ_ALIASES[normalized.toUpperCase()] || normalized;
}

function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function persist() {
  await chrome.storage.local.set(app.state);
}
