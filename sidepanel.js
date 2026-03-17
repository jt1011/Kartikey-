const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const DEFAULT_STATE = {
  homeTimezone: detectedTz,
  savedTimezones: [detectedTz, "America/Los_Angeles", "America/New_York", "UTC"],
  timeFormat: "12h",
  workingHours: {},
  compactMode: false,
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
  UTC: "UTC",
  CET: "Europe/Paris",
  BST: "Europe/London"
};

const FALLBACK_HOURS = { start: "09:00", end: "18:00" };
const SUPPORTED_TZS = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
const TZ_INDEX = new Map(SUPPORTED_TZS.map((tz) => [tz.toLowerCase(), tz]));

const app = { state: structuredClone(DEFAULT_STATE), lastConversion: null };
const el = {
  cards: document.getElementById("clockCards"),
  currentDate: document.getElementById("currentDate"),
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
  timezoneSuggestions: document.getElementById("timezoneSuggestions"),
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
  setInterval(renderClockCards, 60_000);
}

function normalizeState(state) {
  const merged = { ...DEFAULT_STATE, ...state };
  merged.savedTimezones = [...new Set(merged.savedTimezones.map(resolveTimezone).filter(Boolean))];
  if (!merged.savedTimezones.length) merged.savedTimezones = [...DEFAULT_STATE.savedTimezones];
  if (!merged.savedTimezones.includes(merged.homeTimezone)) merged.savedTimezones.unshift(merged.homeTimezone);
  for (const tz of merged.savedTimezones) {
    if (!merged.workingHours[tz]) merged.workingHours[tz] = { ...FALLBACK_HOURS };
  }
  return merged;
}

function wireEvents() {
  el.convertBtn.addEventListener("click", doConvert);
  el.timeInput.addEventListener("keydown", (e) => e.key === "Enter" && doConvert());
  el.copySimple.addEventListener("click", () => copyTemplate("simple"));
  el.copyDetailed.addEventListener("click", () => copyTemplate("detailed"));

  el.addTimezoneBtn.addEventListener("click", addTimezone);
  el.timezoneInput.addEventListener("keydown", (e) => e.key === "Enter" && addTimezone());

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

  el.homeTimezone.addEventListener("change", async () => {
    app.state.homeTimezone = el.homeTimezone.value;
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
  renderSelectors();
  renderClockCards();
  renderTimezoneList();
  renderOverlap();
  renderSuggestions();
}

function renderSuggestions() {
  if (!SUPPORTED_TZS.length) return;
  el.timezoneSuggestions.innerHTML = SUPPORTED_TZS.slice(0, 400).map((z) => `<option value="${z}"></option>`).join("");
}

function renderSelectors() {
  const options = app.state.savedTimezones.map((tz) => `<option value="${tz}">${tz}</option>`).join("");
  el.sourceTimezone.innerHTML = options;
  el.homeTimezone.innerHTML = options;
  el.clientTimezone.innerHTML = options;

  el.sourceTimezone.value = app.state.savedTimezones.includes(app.state.lastSourceTimezone)
    ? app.state.lastSourceTimezone
    : app.state.savedTimezones[0];
  el.homeTimezone.value = app.state.homeTimezone;
  el.clientTimezone.value = app.state.savedTimezones.find((tz) => tz !== app.state.homeTimezone) || app.state.homeTimezone;
  el.timeFormat.value = app.state.timeFormat;
  el.compactMode.checked = app.state.compactMode;
}

function renderClockCards() {
  const now = new Date();
  el.currentDate.textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(now);
  el.cards.innerHTML = "";

  for (const tz of app.state.savedTimezones) {
    const within = isWithinWorkHours(now, tz);
    const card = document.createElement("article");
    card.className = "clock-card";
    card.innerHTML = `
      <div class="clock-time">${formatTimeInZone(now, tz)}</div>
      <div class="tz-id">${tz}</div>
      <div class="badges">
        <span class="badge">${getDayRollover(now, tz, app.state.homeTimezone)}</span>
        <span class="badge ${within ? "ok" : "warn"}">${within ? "Within work hours" : "Outside work hours"}</span>
      </div>
    `;
    el.cards.appendChild(card);
  }
}

function renderTimezoneList() {
  el.timezoneList.innerHTML = "";
  app.state.savedTimezones.forEach((tz, i) => {
    const wh = app.state.workingHours[tz] || { ...FALLBACK_HOURS };
    const li = document.createElement("li");
    li.className = "timezone-item";
    li.innerHTML = `
      <div class="timezone-row">
        <strong>${tz}</strong>
        <div class="timezone-actions">
          <button data-action="up" data-index="${i}">↑</button>
          <button data-action="down" data-index="${i}">↓</button>
          <button data-action="remove" data-index="${i}">✕</button>
        </div>
      </div>
      <div class="timezone-hours">
        <label>Work start <input data-action="work-start" data-index="${i}" type="time" value="${wh.start}" /></label>
        <label>Work end <input data-action="work-end" data-index="${i}" type="time" value="${wh.end}" /></label>
      </div>
    `;
    li.querySelectorAll("button").forEach((b) => b.addEventListener("click", onTimezoneEdit));
    li.querySelectorAll('input[type="time"]').forEach((t) => t.addEventListener("change", onWorkHoursChange));
    el.timezoneList.appendChild(li);
  });
}

async function onTimezoneEdit(e) {
  const i = Number(e.target.dataset.index);
  const action = e.target.dataset.action;
  const tz = app.state.savedTimezones[i];

  if (action === "remove") {
    if (app.state.savedTimezones.length <= 1) return showSettingsError("At least one timezone is required.");
    if (tz === app.state.homeTimezone) return showSettingsError("You cannot remove your home timezone.");
    app.state.savedTimezones.splice(i, 1);
  }
  if (action === "up" && i > 0) [app.state.savedTimezones[i - 1], app.state.savedTimezones[i]] = [app.state.savedTimezones[i], app.state.savedTimezones[i - 1]];
  if (action === "down" && i < app.state.savedTimezones.length - 1) [app.state.savedTimezones[i + 1], app.state.savedTimezones[i]] = [app.state.savedTimezones[i], app.state.savedTimezones[i + 1]];

  await persist();
  renderAll();
}

async function onWorkHoursChange(e) {
  const i = Number(e.target.dataset.index);
  const tz = app.state.savedTimezones[i];
  const action = e.target.dataset.action;
  if (!app.state.workingHours[tz]) app.state.workingHours[tz] = { ...FALLBACK_HOURS };
  if (action === "work-start") app.state.workingHours[tz].start = e.target.value;
  if (action === "work-end") app.state.workingHours[tz].end = e.target.value;
  await persist();
  renderClockCards();
  renderOverlap();
}

async function addTimezone() {
  clearSettingsError();
  const raw = el.timezoneInput.value.trim();
  const tz = resolveTimezone(raw);

  if (!tz || !isValidTimezone(tz)) return showSettingsError(`Could not understand "${raw}". Use an IANA zone like America/Chicago or alias like PST.`);
  if (app.state.savedTimezones.includes(tz)) return showSettingsError(`${tz} is already in your list.`);

  app.state.savedTimezones.push(tz);
  app.state.workingHours[tz] = app.state.workingHours[tz] || { ...FALLBACK_HOURS };
  el.timezoneInput.value = "";
  await persist();
  renderAll();
}

function doConvert() {
  el.converterError.textContent = "";
  const parsed = parseInputTime(el.timeInput.value);
  if (!parsed) return (el.converterError.textContent = "Invalid time. Try 9 PM, 9:30 PM, or 21:30.");

  const sourceTz = resolveTimezone(el.sourceTimezone.value);
  const result = convertFromSource(parsed.hour, parsed.minute, sourceTz, app.state.savedTimezones);
  app.lastConversion = result;
  el.results.innerHTML = result.targets
    .map((item) => `<div class="result-item">${item.time} — ${item.timezone} (${labelFromShift(item.dayShift)})</div>`)
    .join("");
}

function copyTemplate(type) {
  if (!app.lastConversion?.targets?.length) return;
  const source = app.lastConversion.source;
  const target = app.lastConversion.targets.find((t) => t.timezone !== source.timezone) || app.lastConversion.targets[0];
  const text = type === "detailed"
    ? `${source.weekday}, ${source.time} ${shortZone(source.timezone)} / ${target.weekday}, ${target.time} ${shortZone(target.timezone)}`
    : `${source.time} ${shortZone(source.timezone)} = ${target.time} ${shortZone(target.timezone)}`;

  navigator.clipboard.writeText(text).then(() => {
    el.copyStatus.textContent = "Copied";
    setTimeout(() => (el.copyStatus.textContent = ""), 1000);
  });
}

function renderOverlap() {
  const home = app.state.homeTimezone;
  const client = el.clientTimezone.value || app.state.savedTimezones.find((tz) => tz !== home) || home;
  const homeH = app.state.workingHours[home] || { ...FALLBACK_HOURS };
  const clientH = app.state.workingHours[client] || { ...FALLBACK_HOURS };
  const overlap = computeSimpleOverlap(home, client, homeH, clientH);

  el.overlapInfo.innerHTML = `
    <div>Home (${home}): ${homeH.start} - ${homeH.end}</div>
    <div>Client (${client}): ${clientH.start} - ${clientH.end}</div>
    <div><strong>Best overlap:</strong> ${overlap}</div>
  `;
}

function computeSimpleOverlap(homeTz, clientTz, homeHours, clientHours) {
  const now = new Date();
  const homeStart = zonedTimeToDate(now, homeHours.start, homeTz);
  const homeEnd = zonedTimeToDate(now, homeHours.end, homeTz);
  const clientStart = zonedTimeToDate(now, clientHours.start, clientTz);
  const clientEnd = zonedTimeToDate(now, clientHours.end, clientTz);

  const start = Math.max(homeStart.getTime(), clientStart.getTime());
  const end = Math.min(homeEnd.getTime(), clientEnd.getTime());
  if (end <= start) return "No overlap";
  return `${formatTimeInZone(new Date(start), homeTz)} - ${formatTimeInZone(new Date(end), homeTz)} (${shortZone(homeTz)})`;
}

function parseInputTime(text) {
  const v = text.trim().toUpperCase();
  const m12 = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m12) {
    let hour = Number(m12[1]);
    const minute = Number(m12[2] || 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (m12[3] === "AM") hour = hour === 12 ? 0 : hour;
    if (m12[3] === "PM") hour = hour === 12 ? 12 : hour + 12;
    return { hour, minute };
  }
  const m24 = v.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hour = Number(m24[1]);
    const minute = Number(m24[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

function convertFromSource(hour, minute, sourceTz, targets) {
  const now = new Date();
  const sourceDate = zonedTimeToDate(now, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, sourceTz);
  const source = {
    timezone: sourceTz,
    time: formatTimeInZone(sourceDate, sourceTz),
    weekday: formatWeekday(sourceDate, sourceTz)
  };

  const rows = targets.map((tz) => ({
    timezone: tz,
    time: formatTimeInZone(sourceDate, tz),
    weekday: formatWeekday(sourceDate, tz),
    dayShift: computeDayShift(sourceDate, sourceTz, tz)
  }));

  return { source, targets: rows };
}

function resolveTimezone(input) {
  if (!input) return null;
  const raw = input.trim();
  const alias = TZ_ALIASES[raw.toUpperCase()];
  if (alias) return alias;

  const canonical = TZ_INDEX.get(raw.toLowerCase());
  if (canonical) return canonical;
  return raw;
}

function isValidTimezone(tz) {
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; }
  catch { return false; }
}

function zonedTimeToDate(baseDate, hhmm, timeZone) {
  const [h, m] = hhmm.split(":").map(Number);
  const ymd = getYmd(baseDate, timeZone);
  const guessUtc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, h, m, 0);
  const offset = getOffsetMinutes(new Date(guessUtc), timeZone);
  return new Date(guessUtc - offset * 60_000);
}

function getOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const parts = Object.fromEntries(dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, Number(parts.month) - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - date.getTime()) / 60000;
}

function getYmd(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const [year, month, day] = dtf.format(date).split("-").map(Number);
  return { year, month, day };
}

function computeDayShift(date, sourceTz, targetTz) {
  const src = getYmd(date, sourceTz);
  const tgt = getYmd(date, targetTz);
  const srcDate = Date.UTC(src.year, src.month - 1, src.day);
  const tgtDate = Date.UTC(tgt.year, tgt.month - 1, tgt.day);
  const diff = Math.round((tgtDate - srcDate) / 86_400_000);
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}

function getDayRollover(now, tz, homeTz) { return labelFromShift(computeDayShift(now, homeTz, tz)); }
function labelFromShift(shift) { return shift === 1 ? "Tomorrow" : shift === -1 ? "Yesterday" : "Today"; }
function formatWeekday(date, tz) { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date); }
function formatTimeInZone(date, tz) { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: app.state.timeFormat === "12h" }).format(date); }

function isWithinWorkHours(date, tz) {
  const wh = app.state.workingHours[tz] || FALLBACK_HOURS;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return local >= wh.start && local <= wh.end;
}

function shortZone(tz) { return Object.keys(TZ_ALIASES).find((k) => TZ_ALIASES[k] === tz && k.length <= 3) || tz.split("/").pop(); }
function showSettingsError(msg) { el.settingsError.textContent = msg; }
function clearSettingsError() { el.settingsError.textContent = ""; }
async function persist() { await chrome.storage.local.set(app.state); }
