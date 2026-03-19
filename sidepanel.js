const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const DEFAULT_STATE = {
  homeTimezone: detectedTz,
  savedTimezones: [detectedTz, "America/Los_Angeles", "America/New_York", "UTC"],
  timeFormat: "12h",
  workingHours: {
    "America/Los_Angeles": { start: "09:00", end: "18:00" },
    "America/New_York": { start: "09:00", end: "18:00" }
  },
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

const app = { state: structuredClone(DEFAULT_STATE), lastConversion: null, activeTab: "dashboard" };

const el = {
  app: document.getElementById("app"),
  cards: document.getElementById("clockCards"),
  currentDate: document.getElementById("currentDate"),
  heroHomeTimezone: document.getElementById("heroHomeTimezone"),
  heroHomeMeta: document.getElementById("heroHomeMeta"),
  heroHomeTime: document.getElementById("heroHomeTime"),
  heroHomeStatus: document.getElementById("heroHomeStatus"),
  heroClientLabel: document.getElementById("heroClientLabel"),
  heroOverlapWindow: document.getElementById("heroOverlapWindow"),
  heroOverlapSummary: document.getElementById("heroOverlapSummary"),
  heroOverlapBadges: document.getElementById("heroOverlapBadges"),
  jumpToConverter: document.getElementById("jumpToConverter"),
  tabs: [...document.querySelectorAll(".tab")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
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
  settingsError: document.getElementById("settingsError"),
  zoneCount: document.getElementById("zoneCount"),
  timelineHome: document.getElementById("timelineHome"),
  timelineClient: document.getElementById("timelineClient"),
  timelineOverlap: document.getElementById("timelineOverlap"),
  timelineNow: document.getElementById("timelineNow")
};

init();

async function init() {
  const stored = await chrome.storage.local.get(DEFAULT_STATE);
  app.state = normalizeState(stored);
  wireEvents();
  renderAll();
  setInterval(() => {
    renderHero();
    renderClockCards();
    renderOverlap();
  }, 60_000);
}

function normalizeState(state) {
  const merged = {
    ...structuredClone(DEFAULT_STATE),
    ...state,
    workingHours: { ...structuredClone(DEFAULT_STATE.workingHours), ...(state.workingHours || {}) }
  };

  merged.homeTimezone = resolveTimezone(merged.homeTimezone) || detectedTz;
  merged.savedTimezones = [...new Set(merged.savedTimezones.map(resolveTimezone).filter(Boolean))];
  if (!merged.savedTimezones.length) merged.savedTimezones = [...DEFAULT_STATE.savedTimezones];
  if (!merged.savedTimezones.includes(merged.homeTimezone)) merged.savedTimezones.unshift(merged.homeTimezone);
  for (const tz of merged.savedTimezones) {
    merged.workingHours[tz] = normalizeWorkingHours(merged.workingHours[tz]);
  }
  merged.lastSourceTimezone = merged.savedTimezones.includes(merged.lastSourceTimezone)
    ? merged.lastSourceTimezone
    : merged.savedTimezones[0];
  return merged;
}

function normalizeWorkingHours(hours) {
  const start = /^\d{2}:\d{2}$/.test(hours?.start) ? hours.start : FALLBACK_HOURS.start;
  const end = /^\d{2}:\d{2}$/.test(hours?.end) ? hours.end : FALLBACK_HOURS.end;
  return { start, end };
}

function wireEvents() {
  el.tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tabTarget)));
  el.jumpToConverter.addEventListener("click", () => setActiveTab("converter"));
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

  el.homeTimezone.addEventListener("change", async () => {
    app.state.homeTimezone = resolveTimezone(el.homeTimezone.value);
    if (!app.state.savedTimezones.includes(app.state.homeTimezone)) {
      app.state.savedTimezones.unshift(app.state.homeTimezone);
    }
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

  el.clientTimezone.addEventListener("change", () => {
    renderHero();
    renderOverlap();
  });
}

function setActiveTab(tabName) {
  app.activeTab = tabName;
  el.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tabTarget === tabName));
  el.tabPanels.forEach((panel) => panel.classList.toggle("is-active", panel.id === `tab-${tabName}`));
}

function renderAll() {
  document.body.classList.toggle("compact", app.state.compactMode);
  renderSelectors();
  renderSuggestions();
  renderHero();
  renderClockCards();
  renderTimezoneList();
  renderOverlap();
  if (!app.lastConversion && el.timeInput.value.trim()) doConvert();
}

function renderSuggestions() {
  if (!SUPPORTED_TZS.length) return;
  el.timezoneSuggestions.innerHTML = SUPPORTED_TZS.slice(0, 400).map((z) => `<option value="${z}"></option>`).join("");
}

function renderSelectors() {
  const options = app.state.savedTimezones
    .map((tz) => `<option value="${tz}">${formatTimezoneLabel(tz)}</option>`)
    .join("");

  el.sourceTimezone.innerHTML = options;
  el.clientTimezone.innerHTML = options;
  el.homeTimezone.innerHTML = options;
  el.sourceTimezone.value = app.state.savedTimezones.includes(app.state.lastSourceTimezone) ? app.state.lastSourceTimezone : app.state.savedTimezones[0];
  el.homeTimezone.value = app.state.homeTimezone;
  el.clientTimezone.value = getSelectedClientTimezone();
  el.timeFormat.value = app.state.timeFormat;
  el.compactMode.checked = app.state.compactMode;
  el.zoneCount.textContent = `${app.state.savedTimezones.length} active zone${app.state.savedTimezones.length === 1 ? "" : "s"}`;
}

function renderHero() {
  const now = new Date();
  const home = app.state.homeTimezone;
  const client = getSelectedClientTimezone();
  const overlap = computeOverlapDetails(home, client, app.state.workingHours[home], app.state.workingHours[client]);
  const homeWithin = isWithinWorkHours(now, home);

  el.currentDate.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(now);
  el.heroHomeTimezone.textContent = formatTimezoneLabel(home);
  el.heroHomeMeta.textContent = `${formatGmtOffset(now, home)} • ${getDayRollover(now, home, home)}`;
  el.heroHomeTime.textContent = formatTimeInZone(now, home);
  el.heroHomeStatus.textContent = homeWithin ? "Within work hours" : "Outside work hours";
  el.heroHomeStatus.style.color = homeWithin ? "var(--success)" : "var(--warn)";
  el.heroClientLabel.textContent = formatTimezoneLabel(client);
  el.heroOverlapWindow.textContent = overlap.label;
  el.heroOverlapSummary.textContent = overlap.summary;
  el.heroOverlapBadges.innerHTML = `
    <span class="badge ${overlap.minutes > 0 ? "ok" : "warn"}">${overlap.minutes > 0 ? `${Math.round(overlap.minutes / 60 * 10) / 10}h overlap` : "No shared time"}</span>
    <span class="badge info">${formatTimeRange(app.state.workingHours[home], home)}</span>
    <span class="badge info">${formatTimeRange(app.state.workingHours[client], client)}</span>
  `;
}

function renderClockCards() {
  const now = new Date();
  el.cards.innerHTML = "";

  for (const tz of app.state.savedTimezones) {
    const within = isWithinWorkHours(now, tz);
    const card = document.createElement("article");
    card.className = "clock-card";
    card.innerHTML = `
      <div class="clock-card__header">
        <div>
          <div class="clock-card__zone">${formatTimezoneLabel(tz)}</div>
          <div class="clock-card__meta">${tz}</div>
        </div>
        <span class="badge ${within ? "ok" : "warn"}">${within ? "Work window" : "Off hours"}</span>
      </div>
      <div class="clock-card__footer">
        <div>
          <div class="clock-time">${formatTimeInZone(now, tz)}</div>
          <div class="clock-card__meta">${formatWeekday(now, tz)} • ${getDayRollover(now, tz, app.state.homeTimezone)}</div>
        </div>
        <div class="clock-card__offset">${formatGmtOffset(now, tz)}</div>
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
        <div class="timezone-title">
          <strong>${formatTimezoneLabel(tz)}</strong>
          <span class="muted">${tz} • ${formatTimeRange(wh, tz)}</span>
        </div>
        <div class="timezone-actions">
          <button data-action="up" data-index="${i}" title="Move up">↑</button>
          <button data-action="down" data-index="${i}" title="Move down">↓</button>
          <button data-action="remove" data-index="${i}" title="Remove timezone">✕</button>
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
    delete app.state.workingHours[tz];
  }
  if (action === "up" && i > 0) {
    [app.state.savedTimezones[i - 1], app.state.savedTimezones[i]] = [app.state.savedTimezones[i], app.state.savedTimezones[i - 1]];
  }
  if (action === "down" && i < app.state.savedTimezones.length - 1) {
    [app.state.savedTimezones[i + 1], app.state.savedTimezones[i]] = [app.state.savedTimezones[i], app.state.savedTimezones[i + 1]];
  }

  clearSettingsError();
  await persist();
  renderAll();
}

async function onWorkHoursChange(e) {
  const i = Number(e.target.dataset.index);
  const tz = app.state.savedTimezones[i];
  const action = e.target.dataset.action;
  app.state.workingHours[tz] = normalizeWorkingHours(app.state.workingHours[tz]);
  if (action === "work-start") app.state.workingHours[tz].start = e.target.value;
  if (action === "work-end") app.state.workingHours[tz].end = e.target.value;
  await persist();
  renderHero();
  renderClockCards();
  renderOverlap();
  renderTimezoneList();
}

async function addTimezone() {
  clearSettingsError();
  const raw = el.timezoneInput.value.trim();
  if (!raw) return;
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
  if (!parsed) {
    el.converterError.textContent = "Invalid time. Try 9 PM, 9:30 PM, or 21:30.";
    return;
  }

  const sourceTz = resolveTimezone(el.sourceTimezone.value);
  const result = convertFromSource(parsed.hour, parsed.minute, sourceTz, app.state.savedTimezones);
  app.lastConversion = result;
  el.results.innerHTML = result.targets.map((item) => `
    <article class="result-item">
      <strong>${item.time}</strong>
      <div>${formatTimezoneLabel(item.timezone)}</div>
      <div class="result-item__meta">
        <span>${item.weekday}</span>
        <span>${labelFromShift(item.dayShift)}</span>
      </div>
    </article>
  `).join("");
}

async function copyTemplate(type) {
  if (!app.lastConversion?.targets?.length) return;
  const source = app.lastConversion.source;
  const target = app.lastConversion.targets.find((t) => t.timezone !== source.timezone) || app.lastConversion.targets[0];
  const text = type === "detailed"
    ? `${source.weekday}, ${source.time} ${shortZone(source.timezone)} / ${target.weekday}, ${target.time} ${shortZone(target.timezone)}`
    : `${source.time} ${shortZone(source.timezone)} = ${target.time} ${shortZone(target.timezone)}`;

  try {
    await navigator.clipboard.writeText(text);
    el.copyStatus.textContent = "Copied!";
    setTimeout(() => (el.copyStatus.textContent = ""), 1200);
  } catch {
    el.copyStatus.textContent = "Clipboard blocked";
  }
}

function renderOverlap() {
  const home = app.state.homeTimezone;
  const client = getSelectedClientTimezone();
  const homeHours = app.state.workingHours[home] || { ...FALLBACK_HOURS };
  const clientHours = app.state.workingHours[client] || { ...FALLBACK_HOURS };
  const overlap = computeOverlapDetails(home, client, homeHours, clientHours);

  el.overlapInfo.innerHTML = `
    <div class="overlap-stat">
      <strong>${formatTimezoneLabel(home)}</strong>
      <span class="muted">${formatTimeRange(homeHours, home)}</span>
    </div>
    <div class="overlap-stat">
      <strong>${formatTimezoneLabel(client)}</strong>
      <span class="muted">${formatTimeRange(clientHours, client)}</span>
    </div>
    <div class="overlap-stat">
      <strong>${overlap.label}</strong>
      <span class="muted">${overlap.summary}</span>
    </div>
  `;

  paintTimeline(home, client, overlap);
}

function paintTimeline(home, client, overlap) {
  const homeHours = app.state.workingHours[home] || FALLBACK_HOURS;
  const clientHours = app.state.workingHours[client] || FALLBACK_HOURS;
  positionRange(el.timelineHome, toDecimalHours(homeHours.start), toDecimalHours(homeHours.end));
  positionRange(el.timelineClient, toDecimalHours(clientHours.start), toDecimalHours(clientHours.end));
  if (overlap.minutes > 0) {
    positionRange(el.timelineOverlap, overlap.startHour, overlap.endHour);
    el.timelineOverlap.style.display = "block";
  } else {
    el.timelineOverlap.style.display = "none";
  }

  const now = new Date();
  const nowLabel = new Intl.DateTimeFormat("en-GB", { timeZone: home, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const nowHour = toDecimalHours(nowLabel);
  el.timelineNow.style.left = `${(nowHour / 24) * 100}%`;
}

function positionRange(element, startHour, endHour) {
  const safeStart = Math.max(0, Math.min(startHour, 24));
  const safeEnd = Math.max(safeStart, Math.min(endHour, 24));
  element.style.left = `${(safeStart / 24) * 100}%`;
  element.style.width = `${((safeEnd - safeStart) / 24) * 100}%`;
}

function computeOverlapDetails(homeTz, clientTz, homeHours, clientHours) {
  const now = new Date();
  const homeStart = zonedTimeToDate(now, homeHours.start, homeTz);
  const homeEnd = zonedTimeToDate(now, homeHours.end, homeTz);
  const clientStart = zonedTimeToDate(now, clientHours.start, clientTz);
  const clientEnd = zonedTimeToDate(now, clientHours.end, clientTz);
  const start = Math.max(homeStart.getTime(), clientStart.getTime());
  const end = Math.min(homeEnd.getTime(), clientEnd.getTime());
  const minutes = Math.max(0, Math.round((end - start) / 60_000));

  if (minutes <= 0) {
    return {
      minutes: 0,
      label: "No overlap",
      summary: "Shift one of the work windows to create a shared block.",
      startHour: 0,
      endHour: 0
    };
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const startHour = toDecimalHours(new Intl.DateTimeFormat("en-GB", { timeZone: homeTz, hour: "2-digit", minute: "2-digit", hour12: false }).format(startDate));
  const endHour = toDecimalHours(new Intl.DateTimeFormat("en-GB", { timeZone: homeTz, hour: "2-digit", minute: "2-digit", hour12: false }).format(endDate));
  return {
    minutes,
    label: `${formatTimeInZone(startDate, homeTz)} - ${formatTimeInZone(endDate, homeTz)} ${shortZone(homeTz)}`,
    summary: `${Math.floor(minutes / 60)}h ${minutes % 60}m shared between ${shortZone(homeTz)} and ${shortZone(clientTz)}.`,
    startHour,
    endHour
  };
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
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
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

function computeDayShift(date, sourceTz, targetTz) {
  const src = getYmd(date, sourceTz);
  const tgt = getYmd(date, targetTz);
  const srcDate = Date.UTC(src.year, src.month - 1, src.day);
  const tgtDate = Date.UTC(tgt.year, tgt.month - 1, tgt.day);
  const diff = Math.round((tgtDate - srcDate) / 86_400_000);
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}

function getDayRollover(now, tz, homeTz) {
  return labelFromShift(computeDayShift(now, homeTz, tz));
}

function labelFromShift(shift) {
  return shift === 1 ? "Tomorrow" : shift === -1 ? "Yesterday" : "Today";
}

function formatWeekday(date, tz) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
}

function formatTimeInZone(date, tz) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: app.state.timeFormat === "12h"
  }).format(date);
}

function formatTimezoneLabel(tz) {
  if (tz === "UTC") return "UTC";
  const parts = tz.split("/");
  const city = parts[parts.length - 1].replace(/_/g, " ");
  const region = parts.length > 1 ? parts[0].replace(/_/g, " ") : tz;
  return `${city} · ${region}`;
}

function formatGmtOffset(date, tz) {
  const offset = getOffsetMinutes(date, tz);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isWithinWorkHours(date, tz) {
  const wh = app.state.workingHours[tz] || FALLBACK_HOURS;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return local >= wh.start && local <= wh.end;
}

function formatTimeRange(range, tz) {
  const base = new Date();
  return `${formatTimeInZone(zonedTimeToDate(base, range.start, tz), tz)} - ${formatTimeInZone(zonedTimeToDate(base, range.end, tz), tz)}`;
}

function shortZone(tz) {
  return Object.keys(TZ_ALIASES).find((k) => TZ_ALIASES[k] === tz && k.length <= 3) || tz.split("/").pop();
}

function toDecimalHours(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}

function getSelectedClientTimezone() {
  const candidate = el.clientTimezone?.value;
  if (candidate && app.state.savedTimezones.includes(candidate) && candidate !== app.state.homeTimezone) return candidate;
  return app.state.savedTimezones.find((tz) => tz !== app.state.homeTimezone) || app.state.homeTimezone;
}

function showSettingsError(msg) { el.settingsError.textContent = msg; }
function clearSettingsError() { el.settingsError.textContent = ""; }
async function persist() { await chrome.storage.local.set(app.state); }
