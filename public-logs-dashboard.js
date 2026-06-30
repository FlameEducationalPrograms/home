const VALUES_WORKBOOK_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3Bhb3la7QjEHEPRSinb5mvAjr4hYh_5Sru71WtcWqqd1rkTG4dOGR9BQb5eXFQ11F77233Jh-106P/pubhtml";
const VALUES_WORKBOOK_BASE = VALUES_WORKBOOK_URL.replace(/\/pubhtml.*$/, "");
const ACTIVITIES_WORKBOOK_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQTTaWrIhTwTpW3GWaeKMULfeC4Qeoh-JrLjBves7ZRvW-z2yX0tVcOB2ytIZ1JJo3lXlBO6ahvb46g/pubhtml";
const ACTIVITIES_WORKBOOK_BASE = ACTIVITIES_WORKBOOK_URL.replace(/\/pubhtml.*$/, "");

const WORKBOOK_URLS = [
  ACTIVITIES_WORKBOOK_URL,
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0FssafaNQO506Gnup09T1Pb8qokb9s9yp62ZdFFYuxtsohYOdy409q1_q_cYl4vHZhZqe1tAUHF3Q/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYYBB5ZadA4Hhyc9nuFvfAwIQG_uolpXyk3ovhWHbwJEPk5IF8ht2eXo-0as1zvjK_R_tiPaCXmhSZ/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFHXifAA7qF5I0XTOV9aN3ATCuWQQFlCVrZlJomZsd8c-vWZT3xuq-f4z8-Qz8J0lcddgJsuTejKYa/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRNalcGSv5g3rtcaycU-7DWLrKSTuPqxLo_bdOUyJgtQLbHyPMkEi1itPWtutizdhpDCDZaUIgEuof9/pubhtml",
  VALUES_WORKBOOK_URL,
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZbhJsqbI7Wj2lcokI2drH1bh3RWSKd5CSMibYcOha9JRllh_BPsIGV7mKzy0s98mrEy0XvqykIjow/pubhtml",
];

const MODULES = [
  { name: "Morning Assembly", icon: "☀", words: ["morning assembly", "assembly", "morning"] },
  { name: "Values Class", icon: "❤", words: ["values class", "value class", "values", "value"] },
  { name: "Principals Visit", icon: "👣", words: ["principals visit", "principal visit", "visits", "visit"] },
  { name: "Medical Log", icon: "✚", words: ["medical log", "medical", "medical visit", "medical visits", "clinic", "doctor", "health"] },
  { name: "Follow Up", icon: "✚", words: ["follow up", "followup", "follow"] },
  { name: "Formation", icon: "✦", words: ["formation"] },
  { name: "Activities", icon: "★", words: ["activities", "activity", "event", "events"] },
];

const state = {
  logs: [],
  filtered: [],
  filters: { period: "30", module: "All", school: "All", status: "All" },
};

const $ = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const unique = (items) => [...new Set(items.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const startOfToday = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

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

function parseDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
  const date = new Date(Number(year), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return date ? date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "No date";
}

function logDateRange(items) {
  const dates = items.map((item) => item.date).filter(Boolean).sort((a, b) => a - b);
  return { from: dates[0] || null, to: dates[dates.length - 1] || null };
}

function renderStoryRange() {
  const range = logDateRange(state.logs.filter((log) => !isActivitiesSheetLog(log)));
  if ($("storyFrom")) $("storyFrom").textContent = formatDate(range.from);
  if ($("storyTo")) $("storyTo").textContent = formatDate(range.to);
}

function parseDone(value) {
  const v = key(value);
  if (["yes", "true", "done", "completed", "complete", "1", "y", "present", "checked"].includes(v)) return true;
  if (["no", "false", "pending", "not done", "0", "n", "absent", "unchecked"].includes(v)) return false;
  return false;
}

function moduleFromSheet(sheetName) {
  const sheetKey = key(sheetName);
  return MODULES.find((m) => m.words.some((word) => sheetKey.includes(key(word))))?.name || clean(sheetName) || "Service Log";
}

function moduleIcon(name) {
  return MODULES.find((m) => m.name === name)?.icon || "•";
}

function discoverSheetsFromHtml(html, workbookUrl) {
  const sheets = [];
  const regex = /items\.push\(\{name: "([^"]+)", pageUrl: "([^"]+)", gid: "([^"]+)"/g;
  let match = regex.exec(html);
  while (match) {
    const name = match[1];
    const lower = key(name);
    const isLog = lower.includes("log") || MODULES.some((m) => m.words.some((word) => lower.includes(key(word))));
    if (isLog) sheets.push({ name, gid: match[3], base: workbookUrl.replace(/\/pubhtml.*$/, "") });
    match = regex.exec(html);
  }
  return sheets;
}

async function discoverSheets() {
  const discovered = [];
  await Promise.all(WORKBOOK_URLS.map(async (url) => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const html = await response.text();
      discovered.push(...discoverSheetsFromHtml(html, url));
    } catch (error) {
      console.warn("Could not inspect workbook", url, error);
    }
  }));
  return discovered.filter((sheet, index, all) => all.findIndex((item) => item.base === sheet.base && item.gid === sheet.gid) === index);
}

async function loadSheet(sheet) {
  const url = `${sheet.base}/pub?gid=${sheet.gid}&single=true&output=csv`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheet.name} failed with ${response.status}`);
  return rowsFromCsv(await response.text()).map((row, index) => normalizeLog(row, sheet, index));
}

function normalizeLog(row, sheet, index) {
  const fallbackModule = moduleFromSheet(sheet.name);
  const date = parseDate(get(row, ["Date", "Log Date", "Created Date", "Activity Date", "Timestamp", "Time Stamp"]));
  const school = get(row, ["School", "School Name", "Assigned School"]);
  const country = get(row, ["Country", "Country Name"]);
  const title = get(row, ["Task", "Activity", "Description", "Title", "Values", "Value", "Notes"], fallbackModule);
  const doneRaw = get(row, ["Done", "Completed", "Status", "Is Done", "Checked", "Answer", "Result"]);
  const done = parseDone(doneRaw);
  const module = get(row, ["Module", "Log", "Log Type", "Activity Type"], fallbackModule) || fallbackModule;
  const responsibleName = get(row, [
    "Responsible Name", "Responsible", "Responsible Person", "Visit Responsible", "Person Responsible",
    "Resident", "Resident Name", "Principal", "Principal Name", "Visitor", "Visitor Name", "Servant", "Servant Name",
    "Entered By", "Created By", "Submitted By", "Submitter", "User", "User Name", "User Email", "Email",
    "اسم المسئول", "المسئول", "اسم المسؤول", "المسؤول", "اسم الخادم", "الخادم", "اسم الزائر", "الزائر"
  ], "");
  const teacherName = get(row, [
    "Teacher Name", "Teacher", "Class Teacher", "Class Teacher Name", "Visited Teacher", "Teacher Visited",
    "Teacher / Class", "Teacher/Class", "اسم المدرس", "المدرس", "اسم المعلم", "المعلم", "مدرس الفصل"
  ], "");
  const className = get(row, [
    "Class", "Class Name", "Grade", "Grade/Class", "Grade / Class", "Class/Grade", "Stage", "Year", "Room",
    "Year Group", "Level", "الفصل", "الصف", "المرحلة", "السنة", "فصل"
  ], "");
  const followUpTask = get(row, [
    "Follow-Up", "Follow Up", "FollowUp", "Follow-up", "Follow up", "Followup",
    "Follow-Up Task", "Follow Up Task", "Follow-up Task", "Task Follow-Up",
    "متابعة", "المتابعة", "بند المتابعة", "مهمة المتابعة"
  ], "");
  const priestName = get(row, [
    "Priest Name", "Priest", "Father Name", "Abouna", "Abona", "Fr", "Fr.", "Rev",
    "اسم الأب الكاهن", "الأب الكاهن", "الكاهن", "أبونا", "ابونا", "اسم الكاهن"
  ], "");
  const enteredBy = responsibleName || get(row, [
    "Entered By", "Created By", "Submitted By", "Submitter", "User", "User Name", "User Email", "Email"
  ], "");
  return {
    id: `${key(sheet.name)}-${index + 1}`,
    module,
    school: school || "School not specified",
    country,
    title,
    enteredBy,
    responsibleName,
    teacherName,
    className,
    followUpTask,
    priestName,
    date,
    done,
    doneRaw,
    sourceKey: sheet.base || sheet.name,
    sourceSheet: sheet.name,
  };
}

function applyFilters() {
  const today = startOfToday();
  const period = state.filters.period;
  state.filtered = state.logs.filter((log) => {
    let inPeriod = true;
    if (period === "today") inPeriod = log.date && log.date >= today;
    else if (["7", "30", "90"].includes(period)) {
      const start = new Date(today);
      start.setDate(start.getDate() - Number(period) + 1);
      inPeriod = log.date && log.date >= start;
    }
    const status = log.done ? "Completed" : "Pending";
    return inPeriod &&
      (state.filters.module === "All" || log.module === state.filters.module) &&
      (state.filters.school === "All" || log.school === state.filters.school) &&
      (state.filters.status === "All" || status === state.filters.status);
  });
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function groupedBy(items, prop) {
  return items.reduce((acc, item) => {
    const value = clean(item[prop]) || "";
    if (!acc[value]) acc[value] = [];
    acc[value].push(item);
    return acc;
  }, {});
}


function visitDateKey(date) {
  if (!date) return "no-date";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function makeVisitKey(log) {
  return [
    key(log.sourceKey || "unknown-source"),
    key(log.module || "unknown-module"),
    key(log.school || "unknown-school"),
    key(log.enteredBy || "unknown-person"),
    visitDateKey(log.date)
  ].join("|");
}

function uniqueVisitKeys(items) {
  return [...new Set(items.map(makeVisitKey))];
}

function uniqueVisitCount(items) {
  return uniqueVisitKeys(items).length;
}

function visitGroups(items) {
  return Object.values(items.reduce((acc, item) => {
    const visitKey = makeVisitKey(item);
    if (!acc[visitKey]) {
      acc[visitKey] = {
        visitKey,
        module: item.module,
        school: item.school,
        enteredBy: item.enteredBy,
        date: item.date,
        items: [],
      };
    }
    acc[visitKey].items.push(item);
    return acc;
  }, {}));
}

function completedVisitCount(items) {
  return visitGroups(items).filter((visit) => visit.items.length && visit.items.every((item) => item.done)).length;
}

function taskCount(items) {
  return items.length;
}

function badge(label) {
  const cls = key(label).includes("completed") || key(label).includes("strong") ? "good" : key(label).includes("pending") || key(label).includes("growing") ? "watch" : key(label).includes("quiet") ? "danger" : "info";
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function emptyState(title, detail = "No records are available for this view yet.") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function updateFilterOptions() {
  const currentModule = $("filterModule").value || "All";
  const currentSchool = $("filterSchool").value || "All";
  const filterSource = state.logs.filter((log) => !isActivitiesSheetLog(log));
  const moduleValues = ["All", ...unique(filterSource.map((log) => log.module))];
  const schoolSource = state.filters.module === "All" ? filterSource : filterSource.filter((log) => log.module === state.filters.module);
  const schoolValues = ["All", ...unique(schoolSource.map((log) => log.school))];
  $("filterModule").innerHTML = moduleValues.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  $("filterSchool").innerHTML = schoolValues.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  $("filterModule").value = moduleValues.includes(currentModule) ? currentModule : "All";
  $("filterSchool").value = schoolValues.includes(currentSchool) ? currentSchool : "All";
}

function renderKpis() {
  const logs = dashboardLogs();
  const totalVisits = uniqueVisitCount(logs);
  const completedVisits = completedVisitCount(logs);
  $("kpiLogs").textContent = totalVisits.toLocaleString();
  $("kpiSchools").textContent = unique(logs.map((l) => l.school)).length.toLocaleString();
  $("kpiCompleted").textContent = `${percent(completedVisits, totalVisits)}%`;
}

function renderModules() {
  const grouped = groupedBy(dashboardLogs(), "module");
  const modules = Object.entries(grouped).sort((a, b) => uniqueVisitCount(b[1]) - uniqueVisitCount(a[1]));
  $("moduleGrid").innerHTML = modules.length ? modules.map(([name, items]) => {
    const visits = uniqueVisitCount(items);
    const completed = completedVisitCount(items);
    const rate = percent(completed, visits);
    const schools = unique(items.map((i) => i.school)).length;
    const signal = rate >= 80 ? "Strong Progress" : rate >= 50 ? "Growing Progress" : "Needs More Movement";
    return `<article class="module-card">
      <span class="module-icon">${moduleIcon(name)}</span>
      <h3>${escapeHtml(name)}</h3>
      <div class="big-number">${visits}</div>
      <div class="progress-track" aria-label="${rate}% completed"><div class="progress-fill" style="width:${rate}%"></div></div>
      <p class="card-note">${badge(signal)}<br>${completed} completed missions across ${schools} schools.<br><small>${taskCount(items)} checked task records.</small></p>
    </article>`;
  }).join("") : emptyState("No log categories yet");
}

function renderSchools() {
  const grouped = groupedBy(dashboardLogs(), "school");
  const rows = Object.entries(grouped).map(([school, items]) => {
    const visits = uniqueVisitCount(items);
    const completed = completedVisitCount(items);
    const rate = percent(completed, visits);
    return { school, items, visits, completed, rate, modules: unique(items.map((i) => i.module)).length, latest: items.map((i) => i.date).filter(Boolean).sort((a,b) => b - a)[0] || null };
  }).sort((a, b) => b.visits - a.visits).slice(0, 12);
  $("schoolGrid").innerHTML = rows.length ? rows.map((r) => {
    const signal = r.rate >= 80 ? "Strong" : r.rate >= 50 ? "Growing" : "Quiet";
    return `<article class="school-card">
      <div class="school-card-top"><h3>${escapeHtml(r.school)}</h3>${badge(signal)}</div>
      <div class="school-meta">
        <span><strong>${r.visits}</strong><br>missions</span>
        <span><strong>${r.modules}</strong><br>types</span>
        <span><strong>${r.rate}%</strong><br>signal</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${r.rate}%"></div></div>
      <p class="card-note">Latest movement: ${formatDate(r.latest)}</p>
    </article>`;
  }).join("") : emptyState("No school movement yet");
}

function renderRecent() {
  const recent = visitGroups(state.filtered)
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 14);
  $("recentFeed").innerHTML = recent.length ? recent.map((visit) => {
    const completed = visit.items.every((item) => item.done);
    return `<article class="feed-item">
      <span class="feed-dot"></span>
      <div>
        <strong>${escapeHtml(visit.module)}</strong> ${badge(completed ? "Completed" : "Pending")}
        <p>${escapeHtml(visit.school)} · ${formatDate(visit.date)} · ${escapeHtml(visit.enteredBy)} · ${visit.items.length} checked task records</p>
      </div>
    </article>`;
  }).join("") : emptyState("No recent movement yet");
}


function isPrincipalsVisit(item) {
  const value = key(`${item.module || ""} ${item.sourceSheet || ""}`);
  return value.includes("principal") || value.includes("principals visit");
}

function isFollowUp(item) {
  const value = key(`${item.module || ""} ${item.sourceSheet || ""}`);
  return value.includes("follow up") || value.includes("followup") || value === "follow";
}

function taskLine(item) {
  const who = clean(item.enteredBy || item.responsibleName || "");
  const principalsDetails = [
    clean(item.responsibleName || who) ? `Responsible: ${clean(item.responsibleName || who)}` : "",
    clean(item.teacherName) ? `Teacher: ${clean(item.teacherName)}` : "",
    clean(item.className) ? `Class: ${clean(item.className)}` : ""
  ].filter(Boolean).join(", ");

  let taskLabel = item.title || item.module;
  let bracketText = who;

  if (isPrincipalsVisit(item)) {
    bracketText = principalsDetails;
  }

  if (isFollowUp(item)) {
    taskLabel = clean(item.followUpTask) || item.title || item.module;
    bracketText = clean(item.priestName);
  }

  const bracketHtml = bracketText ? ` <em>(${escapeHtml(bracketText)})</em>` : "";
  return `<li class="task-line ${item.done ? "done" : "pending"}">
    <span class="task-status">${item.done ? "✓" : "×"}</span>
    <span class="task-text"><strong>${escapeHtml(taskLabel)}</strong>${bracketHtml}</span>
    <small>${escapeHtml(item.module)} · ${formatDate(item.date)}</small>
  </li>`;
}

function renderDetails() {
  const grouped = groupedBy(dashboardLogs(), "school");
  const schools = Object.entries(grouped)
    .map(([school, items]) => {
      const visits = uniqueVisitCount(items);
      const completed = completedVisitCount(items);
      const pending = visits - completed;
      const latest = items.map((i) => i.date).filter(Boolean).sort((a, b) => b - a)[0] || null;
      return { school, items, visits, completed, pending, latest, rate: percent(completed, visits) };
    })
    .sort((a, b) => b.visits - a.visits || a.school.localeCompare(b.school));

  if (!$('detailsExplorer')) return;

  $('detailsExplorer').innerHTML = schools.length ? schools.map((schoolRow, index) => {
    const modules = Object.entries(groupedBy(schoolRow.items, "module"))
      .sort((a, b) => a[0].localeCompare(b[0]));
    return `<details class="school-detail" ${index === 0 ? "open" : ""}>
      <summary>
        <span class="plus-icon" aria-hidden="true"></span>
        <span class="summary-main">
          <strong>${escapeHtml(schoolRow.school)}</strong>
          <small>${schoolRow.visits} missions · ${schoolRow.items.length} checked task records · ${schoolRow.completed} completed missions · ${schoolRow.pending} pending missions · latest ${formatDate(schoolRow.latest)}</small>
        </span>
        <span class="summary-rate">${schoolRow.rate}%</span>
      </summary>
      <div class="school-detail-body">
        ${modules.map(([moduleName, items], moduleIndex) => {
          const completedItems = items.filter((i) => i.done);
          const pendingItems = items.filter((i) => !i.done);
          return `<details class="module-detail-block" ${index === 0 && moduleIndex === 0 ? "open" : ""}>
            <summary class="module-detail-summary">
              <span class="plus-icon module-plus-icon" aria-hidden="true"></span>
              <span class="module-icon-small">${moduleIcon(moduleName)}</span>
              <span class="module-summary-main">
                <strong>${escapeHtml(moduleName)}</strong>
                <small>${uniqueVisitCount(items)} missions · ${items.length} task records</small>
              </span>
            </summary>
            <div class="module-detail-content">
              <div class="happened-grid">
                <div class="happened-column">
                  <h4>${items.some(isFollowUp) ? "Tasks performed" : "What happened"}</h4>
                  <ul>${completedItems.length ? completedItems.map(taskLine).join("") : `<li class="muted-line">No completed records in this view.</li>`}</ul>
                </div>
                <div class="happened-column">
                  <h4>${items.some(isFollowUp) ? "Tasks not performed" : "What did not happen"}</h4>
                  <ul>${pendingItems.length ? pendingItems.map(taskLine).join("") : `<li class="muted-line">No pending records in this view.</li>`}</ul>
                </div>
              </div>
            </div>
          </details>`;
        }).join("")}
      </div>
    </details>`;
  }).join("") : emptyState("No detailed story yet", "Change the filters or refresh the published logs.");
}

function moduleMatches(log, words) {
  const combined = key(`${log.module || ""} ${log.sourceSheet || ""} ${log.title || ""}`);
  return words.some((word) => combined.includes(key(word)));
}

function isActivitiesSheetLog(log) {
  const sameWorkbook = key(log.sourceKey || "") === key(ACTIVITIES_WORKBOOK_BASE);
  return sameWorkbook && key(log.sourceSheet || "").includes("activities");
}

function isValuesClassLog(log) {
  const sameWorkbook = key(log.sourceKey || "") === key(VALUES_WORKBOOK_BASE);
  return sameWorkbook && key(log.sourceSheet || "") === key("Values Class Log");
}

function dashboardLogs() {
  // Activities must appear only in the Public Summary Activities table, not in KPIs, filters, details, modules, or school cards.
  return state.filtered.filter((log) => !isActivitiesSheetLog(log));
}

function followUpLabel(item) {
  // Public Summary Follow-Up columns must come ONLY from the actual "Follow-Up" sheet column.
  // Do not fall back to title/question text here, because unrelated questions can appear as wrong columns.
  return clean(item.followUpTask);
}

function countUniqueMissions(items) {
  return uniqueVisitCount(items);
}

function summaryTableHtml({ title, subtitle, rows, columns, open = false }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (!rows.length || !columns.length) {
    return `<details class="summary-table-block" ${open ? "open" : ""}>
      <summary>
        <span class="plus-icon" aria-hidden="true"></span>
        <span class="summary-table-main"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
        <span class="summary-table-count">0</span>
      </summary>
      <div class="summary-table-body">${emptyState("No summary data yet", "No matching records are available in the current filters.")}</div>
    </details>`;
  }

  return `<details class="summary-table-block" ${open ? "open" : ""}>
    <summary>
      <span class="plus-icon" aria-hidden="true"></span>
      <span class="summary-table-main"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
      <span class="summary-table-count">${total}</span>
    </summary>
    <div class="summary-table-body table-wrap">
      <table>
        <thead><tr><th>School</th>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.school)}</strong></td>${columns.map((column) => `<td>${row.counts[column.key] || 0}</td>`).join("")}<td><strong>${row.total}</strong></td></tr>`).join("")}</tbody>
      </table>
    </div>
  </details>`;
}

function buildFixedModuleRows(columns) {
  const source = dashboardLogs();
  const schools = unique(source.map((log) => log.school));
  return schools.map((school) => {
    const schoolLogs = source.filter((log) => log.school === school);
    const counts = Object.fromEntries(columns.map((column) => [
      column.key,
      countUniqueMissions(schoolLogs.filter((log) => moduleMatches(log, column.words)))
    ]));
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { school, counts, total };
  }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total || a.school.localeCompare(b.school));
}

function buildFollowUpRows() {
  const followLogs = dashboardLogs().filter((log) =>
    moduleMatches(log, ["follow up", "followup", "follow-up", "follow"]) && followUpLabel(log)
  );
  const labels = unique(followLogs.map(followUpLabel));
  const columns = labels.map((label) => ({ key: label, label }));
  const schools = unique(followLogs.map((log) => log.school));
  const rows = schools.map((school) => {
    const schoolLogs = followLogs.filter((log) => log.school === school);
    const counts = Object.fromEntries(columns.map((column) => [
      column.key,
      countUniqueMissions(schoolLogs.filter((log) => followUpLabel(log) === column.key))
    ]));
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { school, counts, total };
  }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total || a.school.localeCompare(b.school));
  return { columns, rows };
}


function buildValuesRows() {
  const columns = [{ key: "Values", label: "Values" }];
  const valuesLogs = state.filtered.filter(isValuesClassLog);
  const schools = unique(valuesLogs.map((log) => log.school));
  const rows = schools.map((school) => {
    const schoolLogs = valuesLogs.filter((log) => log.school === school);
    const counts = { Values: countUniqueMissions(schoolLogs) };
    return { school, counts, total: counts.Values };
  }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total || a.school.localeCompare(b.school));
  return { columns, rows };
}

function buildActivitiesRows() {
  const columns = [{ key: "Activities", label: "Activities" }];
  const activityLogs = state.filtered.filter(isActivitiesSheetLog);
  const schools = unique(activityLogs.map((log) => log.school));
  const rows = schools.map((school) => {
    const schoolLogs = activityLogs.filter((log) => log.school === school);
    const counts = { Activities: countUniqueMissions(schoolLogs) };
    return { school, counts, total: counts.Activities };
  }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total || a.school.localeCompare(b.school));
  return { columns, rows };
}

function renderMatrix() {
  const missionColumns = [
    { key: "Morning Assembly", label: "Morning Assembly", words: ["morning assembly", "assembly", "morning"] },
    { key: "Principals Visit", label: "Principals Visit", words: ["principals visit", "principal visit", "visits", "visit"] },
  ];

  const follow = buildFollowUpRows();
  const values = buildValuesRows();
  const activities = buildActivitiesRows();

  const summaryBlocks = [
    summaryTableHtml({
      title: "Morning Assembly & Principals Visit",
      subtitle: "Counts per school for Morning Assembly and Principals Visit only.",
      columns: missionColumns,
      rows: buildFixedModuleRows(missionColumns),
      open: true,
    }),
    summaryTableHtml({
      title: "Follow-Up Missions",
      subtitle: "Counts per school using only the actual values found in the Follow-Up column.",
      columns: follow.columns,
      rows: follow.rows,
    }),
    summaryTableHtml({
      title: "Values Missions",
      subtitle: "Values counts per school from the Values Class Log sheet only.",
      columns: values.columns,
      rows: values.rows,
    }),
    summaryTableHtml({
      title: "Medical Missions",
      subtitle: "Medical counts per school.",
      columns: [{ key: "Medical", label: "Medical", words: ["medical log", "medical", "medical visit", "medical visits", "clinic", "doctor", "health"] }],
      rows: buildFixedModuleRows([{ key: "Medical", label: "Medical", words: ["medical log", "medical", "medical visit", "medical visits", "clinic", "doctor", "health"] }]),
    }),
    summaryTableHtml({
      title: "Activities Missions",
      subtitle: "Activities counts per school from the Activities sheet only.",
      columns: activities.columns,
      rows: activities.rows,
    }),
  ];

  $("matrixWrap").innerHTML = summaryBlocks.join("");
}

function render() {
  applyFilters();
  renderKpis();
  renderDetails();
  renderModules();
  renderSchools();
  renderStoryRange();
  renderMatrix();
}

function bindEvents() {
  $("filterPeriod").addEventListener("change", (event) => { state.filters.period = event.target.value; render(); });
  $("filterModule").addEventListener("change", (event) => {
    state.filters.module = event.target.value;
    updateFilterOptions();
    state.filters.school = $("filterSchool").value;
    render();
  });
  $("filterSchool").addEventListener("change", (event) => { state.filters.school = event.target.value; render(); });
  $("filterStatus").addEventListener("change", (event) => { state.filters.status = event.target.value; render(); });
  $("refreshData").addEventListener("click", loadDashboard);
  $("printPage").addEventListener("click", () => window.print());
}

async function loadDashboard() {
  const status = $("loadStatus");
  status.classList.add("is-visible");
  status.textContent = "Loading published service logs...";
  try {
    const sheets = await discoverSheets();
    const settled = await Promise.allSettled(sheets.map(loadSheet));
    state.logs = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    updateFilterOptions();
    state.filters.period = $("filterPeriod").value;
    state.filters.module = $("filterModule").value || "All";
    state.filters.school = $("filterSchool").value || "All";
    state.filters.status = $("filterStatus").value || "All";
    render();
    $("lastUpdated").textContent = `Last updated ${new Date().toLocaleString()}`;
    status.textContent = state.logs.length ? `Loaded ${uniqueVisitCount(state.logs).toLocaleString()} missions from ${state.logs.length.toLocaleString()} checked task records.` : "No log records were found in the published sheets.";
    setTimeout(() => status.classList.remove("is-visible"), 2600);
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load the published logs. Please check that the Google Sheets are published to the web.";
    $("lastUpdated").textContent = "Loading failed";
  }
}

bindEvents();
loadDashboard();
setInterval(loadDashboard, 5 * 60 * 1000);


/* ===== Homepage intro video controls applied to dashboard ===== */
const introVideo = document.querySelector("#introVideo");
const videoControl = document.querySelector("#videoControl");
const soundControl = document.querySelector("#soundControl");

function updateVideoButton() {
  if (!introVideo || !videoControl || !soundControl) return;
  videoControl.textContent = introVideo.paused ? "Play Intro" : "Pause Intro";
  soundControl.textContent = introVideo.muted ? "Sound On" : "Sound Off";
}

if (introVideo && videoControl && soundControl) {
  videoControl.addEventListener("click", async () => {
    if (introVideo.paused) {
      await introVideo.play().catch(() => {});
    } else {
      introVideo.pause();
    }

    updateVideoButton();
  });

  soundControl.addEventListener("click", async () => {
    introVideo.muted = !introVideo.muted;

    if (!introVideo.muted && introVideo.paused) {
      await introVideo.play().catch(() => {});
    }

    updateVideoButton();
  });

  introVideo.addEventListener("play", updateVideoButton);
  introVideo.addEventListener("pause", updateVideoButton);
  introVideo.addEventListener("volumechange", updateVideoButton);
  updateVideoButton();
}
