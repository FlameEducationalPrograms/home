const SHEET_PUBHTML_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSRXJ-jhwIECRf7DMDJQpCSDN6PAR0e0hN3UINjqsuZUvOnfApgN2wGRmzjC3XyqJ1boQJrfDTB4ie2/pubhtml";

const state = {
  birthdays: [],
  filtered: [],
  viewDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDateKey: null,
  search: "",
};

const $ = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
const unique = (items) => [...new Set(items.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function get(row, names, fallback = "") {
  const lookup = names.map(key);
  const found = Object.keys(row).find((name) => lookup.includes(key(name)));
  return found ? clean(row[found]) : fallback;
}

function getAnyStartingWith(row, prefixes) {
  const normalizedPrefixes = prefixes.map(key);
  const found = Object.keys(row).find((name) => normalizedPrefixes.some((prefix) => key(name).startsWith(prefix)));
  return found ? clean(row[found]) : "";
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

function rowsFromCsv(csv) {
  const rows = parseCsv(csv).filter((cells) => cells.some(Boolean));
  const headers = (rows.shift() || []).map((h, i) => clean(h) || `Column ${i + 1}`);
  return rows.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] || ""])));
}

function discoverSheetsFromHtml(html, workbookUrl) {
  const sheets = [];
  const regex = /items\.push\(\{name: "([^"]+)", pageUrl: "([^"]+)", gid: "([^"]+)"/g;
  let match = regex.exec(html);
  while (match) {
    const name = match[1];
    sheets.push({ name, gid: match[3], base: workbookUrl.replace(/\/pubhtml.*$/, "") });
    match = regex.exec(html);
  }
  return sheets.filter((sheet, index, all) => all.findIndex((item) => item.gid === sheet.gid) === index);
}

async function discoverSheets() {
  const response = await fetch(SHEET_PUBHTML_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not inspect workbook: ${response.status}`);
  const html = await response.text();
  const sheets = discoverSheetsFromHtml(html, SHEET_PUBHTML_URL);
  if (!sheets.length) throw new Error("No sheets were detected in the published workbook.");
  return sheets;
}

async function loadSheet(sheet) {
  const url = `${sheet.base}/pub?gid=${sheet.gid}&single=true&output=csv`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheet.name} failed with ${response.status}`);
  const rows = rowsFromCsv(await response.text());
  return rows.flatMap((row, index) => normalizeBirthday(row, sheet, index)).filter(Boolean);
}

function parseGoogleSerialDate(value) {
  const numeric = Number(clean(value));
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 60000) return null;
  const utc = Date.UTC(1899, 11, 30) + numeric * 24 * 60 * 60 * 1000;
  const date = new Date(utc);
  return { day: date.getUTCDate(), month: date.getUTCMonth() };
}

function parseDob(value) {
  const raw = clean(value);
  if (!raw) return null;

  const serial = parseGoogleSerialDate(raw);
  if (serial) return serial;

  const iso = raw.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (iso) {
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    return isValidMonthDay(month, day) ? { day, month } : null;
  }

  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let first = Number(dmy[1]);
    let second = Number(dmy[2]);
    let day = first;
    let month = second - 1;

    // Prefer D/M/Y. If the first number cannot be a day or the second cannot be a month, correct it.
    if (first <= 12 && second > 12) {
      day = second;
      month = first - 1;
    }

    return isValidMonthDay(month, day) ? { day, month } : null;
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return { day: direct.getDate(), month: direct.getMonth() };
  }

  return null;
}

function isValidMonthDay(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 0 || month > 11 || day < 1 || day > 31) return false;
  const test = new Date(2024, month, day);
  return test.getMonth() === month && test.getDate() === day;
}

function birthdayDateForCurrentYear(month, day) {
  const year = new Date().getFullYear();
  if (month === 1 && day === 29) {
    const test = new Date(year, 1, 29);
    if (test.getMonth() !== 1) return new Date(year, 1, 28);
  }
  return new Date(year, month, day);
}

function makeDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function formatShortDate(date) {
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function displayName(row) {
  const full = get(row, [
    "Name", "Full Name", "Student Name", "Servant Name", "Member Name", "Person Name", "Child Name", "Teacher Name", "Priest Name", "Responsible Name"
  ]);
  if (full) return full;

  const parts = [
    get(row, ["First Name", "First"]),
    get(row, ["Middle Name", "Middle"]),
    get(row, ["Last Name", "Family Name", "Surname", "Last"]),
  ].filter(Boolean);
  return parts.join(" ") || "Name not specified";
}

function normalizeBirthday(row, sheet, index) {
  const dobRaw = get(row, ["DOB", "Date of Birth", "Birth Date", "Birthday", "Date Birth"]);
  const parsed = parseDob(dobRaw);
  if (!parsed) return null;

  const birthdayDate = birthdayDateForCurrentYear(parsed.month, parsed.day);
  const name = displayName(row);

  return {
    id: `${sheet.gid}-${index + 1}`,
    name,
    position: sheet.name,
    dobRaw,
    birthdayDate,
    dateKey: makeDateKey(birthdayDate),
    searchText: key([name, sheet.name, dobRaw].join(" ")),
  };
}

function applySearch() {
  const term = key(state.search);
  state.filtered = term ? state.birthdays.filter((item) => item.searchText.includes(term)) : [...state.birthdays];
}

function birthdaysByDate() {
  return state.filtered.reduce((acc, item) => {
    if (!acc[item.dateKey]) acc[item.dateKey] = [];
    acc[item.dateKey].push(item);
    return acc;
  }, {});
}

function renderKpis() {
  const viewMonth = state.viewDate.getMonth();
  const viewYear = state.viewDate.getFullYear();
  $("kpiBirthdays").textContent = state.filtered.length.toLocaleString();
  $("kpiThisMonth").textContent = state.filtered.filter((item) => item.birthdayDate.getFullYear() === viewYear && item.birthdayDate.getMonth() === viewMonth).length.toLocaleString();
  $("kpiSheets").textContent = unique(state.filtered.map((item) => item.position)).length.toLocaleString();
}

function renderCalendar() {
  applySearch();
  renderKpis();

  const monthStart = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - monthStart.getDay());
  const monthTitle = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("calendarTitle").textContent = monthTitle;
  $("calendarYear").textContent = `${new Date().getFullYear()} birthday dates`;

  const todayKey = makeDateKey(new Date());
  const grouped = birthdaysByDate();
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const dateKey = makeDateKey(date);
    const people = grouped[dateKey] || [];
    const isMuted = date.getMonth() !== monthStart.getMonth();
    const isToday = dateKey === todayKey;
    const isSelected = dateKey === state.selectedDateKey;
    const chips = people.slice(0, 3).map((person) => `<span class="birthday-chip">${escapeHtml(person.name)}</span>`).join("");
    const more = people.length > 3 ? `<span class="more-chip">+${people.length - 3} more</span>` : "";
    const count = people.length ? `<span class="count-pill">${people.length} birthday${people.length === 1 ? "" : "s"}</span>` : "";

    cells.push(`<button class="calendar-day ${isMuted ? "is-muted" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}" type="button" data-date="${dateKey}" aria-label="${escapeHtml(formatDate(date))}, ${people.length} birthday records">
      <span class="day-number">${date.getDate()}</span>
      <span class="day-list">${chips}${more}</span>
      ${count}
    </button>`);
  }

  $("calendarGrid").innerHTML = cells.join("");
  document.querySelectorAll(".calendar-day").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDateKey = button.dataset.date;
      renderCalendar();
      renderDetails();
    });
  });

  if (!state.selectedDateKey) {
    const firstWithBirthday = Object.keys(grouped).find((dateKey) => {
      const date = new Date(`${dateKey}T00:00:00`);
      return date.getMonth() === monthStart.getMonth();
    });
    if (firstWithBirthday) {
      state.selectedDateKey = firstWithBirthday;
      renderCalendar();
      renderDetails();
      return;
    }
  }
  renderDetails();
}

function renderDetails() {
  const grouped = birthdaysByDate();
  const selected = state.selectedDateKey;
  if (!selected) {
    $("detailsTitle").textContent = "Select a day";
    $("detailsNote").textContent = "Click a date on the calendar to show the date, name, and position.";
    $("birthdayDetails").innerHTML = `<div class="empty-state">No day selected yet.</div>`;
    return;
  }

  const selectedDate = new Date(`${selected}T00:00:00`);
  const people = (grouped[selected] || []).sort((a, b) => a.name.localeCompare(b.name));
  $("detailsTitle").textContent = formatDate(selectedDate);
  $("detailsNote").textContent = people.length ? `${people.length} birthday record${people.length === 1 ? "" : "s"} on this day.` : "No birthdays found on this day in the current view.";

  if (!people.length) {
    $("birthdayDetails").innerHTML = `<div class="empty-state">No birthdays on ${escapeHtml(formatShortDate(selectedDate))}.</div>`;
    return;
  }

  $("birthdayDetails").innerHTML = people.map((person) => `
    <article class="person-card">
      <h3>${escapeHtml(person.name)}</h3>
      <div class="meta-grid">
        <div class="meta-row"><strong>Date</strong><span>${escapeHtml(formatDate(person.birthdayDate))}</span></div>
        <div class="meta-row"><strong>Position</strong><span>${escapeHtml(person.position)}</span></div>
        <div class="meta-row"><strong>Original DOB</strong><span>${escapeHtml(person.dobRaw)}</span></div>
      </div>
    </article>
  `).join("");
}

function bindEvents() {
  $("previousMonth").addEventListener("click", () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() - 1, 1);
    state.selectedDateKey = null;
    renderCalendar();
  });
  $("nextMonth").addEventListener("click", () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + 1, 1);
    state.selectedDateKey = null;
    renderCalendar();
  });
  $("todayButton").addEventListener("click", () => {
    const today = new Date();
    state.viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    state.selectedDateKey = makeDateKey(today);
    renderCalendar();
  });
  $("birthdaySearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    state.selectedDateKey = null;
    renderCalendar();
  });
  $("refreshData").addEventListener("click", loadBirthdays);
}

async function loadBirthdays() {
  const status = $("loadStatus");
  status.classList.add("is-visible");
  status.textContent = "Loading birthdays from published sheets...";
  try {
    const sheets = await discoverSheets();
    const settled = await Promise.allSettled(sheets.map(loadSheet));
    const birthdays = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);

    state.birthdays = birthdays.sort((a, b) => a.birthdayDate - b.birthdayDate || a.name.localeCompare(b.name));
    state.selectedDateKey = makeDateKey(new Date());
    renderCalendar();

    $("lastUpdated").textContent = `Last updated ${new Date().toLocaleString()}`;
    status.textContent = state.birthdays.length
      ? `Loaded ${state.birthdays.length.toLocaleString()} birthday records from ${sheets.length.toLocaleString()} sheets.`
      : "No DOB or Date of Birth records were found in the published sheets.";
    setTimeout(() => status.classList.remove("is-visible"), 3000);
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load birthdays. Please check that the Google Sheet is published to the web.";
    $("lastUpdated").textContent = "Loading failed";
  }
}

bindEvents();
loadBirthdays();
