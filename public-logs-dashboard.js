const WORKBOOK_URLS = [
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0FssafaNQO506Gnup09T1Pb8qokb9s9yp62ZdFFYuxtsohYOdy409q1_q_cYl4vHZhZqe1tAUHF3Q/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYYBB5ZadA4Hhyc9nuFvfAwIQG_uolpXyk3ovhWHbwJEPk5IF8ht2eXo-0as1zvjK_R_tiPaCXmhSZ/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFHXifAA7qF5I0XTOV9aN3ATCuWQQFlCVrZlJomZsd8c-vWZT3xuq-f4z8-Qz8J0lcddgJsuTejKYa/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRNalcGSv5g3rtcaycU-7DWLrKSTuPqxLo_bdOUyJgtQLbHyPMkEi1itPWtutizdhpDCDZaUIgEuof9/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3Bhb3la7QjEHEPRSinb5mvAjr4hYh_5Sru71WtcWqqd1rkTG4dOGR9BQb5eXFQ11F77233Jh-106P/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZbhJsqbI7Wj2lcokI2drH1bh3RWSKd5CSMibYcOha9JRllh_BPsIGV7mKzy0s98mrEy0XvqykIjow/pubhtml",
];

const MODULES = [
  { name: "Morning Assembly", icon: "☀", words: ["morning assembly", "assembly", "morning"] },
  { name: "Values Class", icon: "❤", words: ["values class", "value class", "values", "value"] },
  { name: "Principals Visit", icon: "👣", words: ["principals visit", "principal visit", "visits", "visit"] },
  { name: "Follow Up", icon: "✚", words: ["follow up", "followup", "follow"] },
  { name: "Formation", icon: "✦", words: ["formation"] },
];

const state = {
  logs: [],
  filtered: [],
  filters: { period: "30", module: "All", school: "All", status: "All", detailsSearch: "" },
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


const METADATA_FIELDS = [
  "id", "key", "unique id", "date", "log date", "created date", "activity date", "timestamp", "time stamp",
  "country", "country name", "school", "school name", "assigned school", "class", "grade", "grade class",
  "module", "log", "log type", "activity type", "task", "activity", "description", "title", "values", "value",
  "notes", "note", "comment", "comments", "done", "completed", "status", "is done", "checked", "answer", "result",
  "responsible", "responsible person", "created by", "resident", "resident name", "principal", "principal name", "priest", "priest name", "teacher", "teacher name"
];

function boolFromValue(value) {
  const v = key(value);
  if (["yes", "true", "done", "completed", "complete", "1", "y", "present", "checked", "ok", "تم", "نعم"].includes(v)) return true;
  if (["no", "false", "pending", "not done", "0", "n", "absent", "unchecked", "لم يتم", "لا"].includes(v)) return false;
  return null;
}

function labelize(name) {
  return clean(name)
    .replace(/[_-]+/g, " ")
    .replace(/\w/g, (char) => char.toUpperCase());
}

function extractDetails(row, title, rowDone) {
  const details = [];
  Object.entries(row).forEach(([column, value]) => {
    const colKey = key(column);
    const val = clean(value);
    if (!val || METADATA_FIELDS.includes(colKey)) return;
    const bool = boolFromValue(val);
    if (bool === null) {
      if (val.length <= 80) details.push({ label: `${labelize(column)}: ${val}`, done: rowDone, source: "text" });
      return;
    }
    details.push({ label: labelize(column), done: bool, source: "column" });
  });
  if (!details.length && title) details.push({ label: title, done: rowDone, source: "row" });
  return details;
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
  const details = extractDetails(row, title, done);
  const completedDetails = details.filter((detail) => detail.done).length;
  const missingDetails = details.filter((detail) => !detail.done).length;
  return {
    id: `${key(sheet.name)}-${index + 1}`,
    module,
    school: school || "School not specified",
    country,
    title,
    date,
    done,
    doneRaw,
    details,
    completedDetails,
    missingDetails,
    row,
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
    const value = clean(item[prop]) || "Not specified";
    if (!acc[value]) acc[value] = [];
    acc[value].push(item);
    return acc;
  }, {});
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
  const moduleValues = ["All", ...unique(state.logs.map((log) => log.module))];
  const schoolSource = state.filters.module === "All" ? state.logs : state.logs.filter((log) => log.module === state.filters.module);
  const schoolValues = ["All", ...unique(schoolSource.map((log) => log.school))];
  $("filterModule").innerHTML = moduleValues.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  $("filterSchool").innerHTML = schoolValues.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  $("filterModule").value = moduleValues.includes(currentModule) ? currentModule : "All";
  $("filterSchool").value = schoolValues.includes(currentSchool) ? currentSchool : "All";
}

function renderKpis() {
  const logs = state.filtered;
  const completed = logs.filter((l) => l.done).length;
  const today = startOfToday();
  $("kpiLogs").textContent = logs.length.toLocaleString();
  $("kpiSchools").textContent = unique(logs.map((l) => l.school)).length.toLocaleString();
  $("kpiCompleted").textContent = `${percent(completed, logs.length)}%`;
  $("kpiToday").textContent = logs.filter((l) => l.date && l.date >= today).length.toLocaleString();
}

function renderModules() {
  const grouped = groupedBy(state.filtered, "module");
  const modules = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
  $("moduleGrid").innerHTML = modules.length ? modules.map(([name, items]) => {
    const completed = items.filter((i) => i.done).length;
    const rate = percent(completed, items.length);
    const schools = unique(items.map((i) => i.school)).length;
    const signal = rate >= 80 ? "Strong Progress" : rate >= 50 ? "Growing Progress" : "Needs More Movement";
    return `<article class="module-card">
      <span class="module-icon">${moduleIcon(name)}</span>
      <h3>${escapeHtml(name)}</h3>
      <div class="big-number">${items.length}</div>
      <div class="progress-track" aria-label="${rate}% completed"><div class="progress-fill" style="width:${rate}%"></div></div>
      <p class="card-note">${badge(signal)}<br>${completed} completed confirmations across ${schools} schools.</p>
    </article>`;
  }).join("") : emptyState("No log categories yet");
}

function renderSchools() {
  const grouped = groupedBy(state.filtered, "school");
  const rows = Object.entries(grouped).map(([school, items]) => {
    const completed = items.filter((i) => i.done).length;
    const rate = percent(completed, items.length);
    return { school, items, completed, rate, modules: unique(items.map((i) => i.module)).length, latest: items.map((i) => i.date).filter(Boolean).sort((a,b) => b - a)[0] || null };
  }).sort((a, b) => b.items.length - a.items.length).slice(0, 12);
  $("schoolGrid").innerHTML = rows.length ? rows.map((r) => {
    const signal = r.rate >= 80 ? "Strong" : r.rate >= 50 ? "Growing" : "Quiet";
    return `<article class="school-card">
      <div class="school-card-top"><h3>${escapeHtml(r.school)}</h3>${badge(signal)}</div>
      <div class="school-meta">
        <span><strong>${r.items.length}</strong><br>logs</span>
        <span><strong>${r.modules}</strong><br>types</span>
        <span><strong>${r.rate}%</strong><br>signal</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${r.rate}%"></div></div>
      <p class="card-note">Latest movement: ${formatDate(r.latest)}</p>
    </article>`;
  }).join("") : emptyState("No school movement yet");
}

function renderRecent() {
  const recent = [...state.filtered].sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 14);
  $("recentFeed").innerHTML = recent.length ? recent.map((item) => `<article class="feed-item">
    <span class="feed-dot"></span>
    <div>
      <strong>${escapeHtml(item.module)}</strong> ${badge(item.done ? "Completed" : "Pending")}
      <p>${escapeHtml(item.school)} · ${formatDate(item.date)} · ${item.completedDetails || 0} done / ${item.missingDetails || 0} missing</p>
    </div>
  </article>`).join("") : emptyState("No recent movement yet");
}


function detailChip(detail) {
  return `<span class="detail-chip ${detail.done ? "done" : "missing"}">${detail.done ? "✓" : "×"} ${escapeHtml(detail.label)}</span>`;
}

function summarizeDetails(items) {
  const all = items.flatMap((item) => item.details || []);
  const completed = all.filter((detail) => detail.done);
  const missing = all.filter((detail) => !detail.done);
  return { all, completed, missing };
}

function renderDetailsExplorer() {
  const q = key(state.filters.detailsSearch);
  const logs = q
    ? state.filtered.filter((log) => key([log.module, log.school, log.title, ...(log.details || []).map((d) => d.label)].join(" ")).includes(q))
    : state.filtered;
  const byModule = groupedBy(logs, "module");
  const sections = Object.entries(byModule).sort((a, b) => b[1].length - a[1].length).map(([module, moduleLogs]) => {
    const schoolRows = Object.entries(groupedBy(moduleLogs, "school"))
      .map(([school, items]) => {
        const summary = summarizeDetails(items);
        const latest = items.map((item) => item.date).filter(Boolean).sort((a, b) => b - a)[0] || null;
        const completedPreview = summary.completed.slice(0, 8);
        const missingPreview = summary.missing.slice(0, 8);
        return `<details class="school-detail" ${summary.missing.length ? "open" : ""}>
          <summary>
            <span><strong>${escapeHtml(school)}</strong><small>${items.length} log records · Latest ${formatDate(latest)}</small></span>
            <span class="summary-badges">${badge(`${summary.completed.length} done`)} ${badge(`${summary.missing.length} not done`)}</span>
          </summary>
          <div class="detail-columns">
            <div class="detail-column done-column">
              <h4>What happened</h4>
              <div class="chip-list">${completedPreview.length ? completedPreview.map(detailChip).join("") : `<span class="muted-line">No completed details in this view.</span>`}</div>
            </div>
            <div class="detail-column missing-column">
              <h4>What did not happen</h4>
              <div class="chip-list">${missingPreview.length ? missingPreview.map(detailChip).join("") : `<span class="muted-line">No missing items in this view.</span>`}</div>
            </div>
          </div>
          ${summary.all.length > 16 ? `<p class="detail-footnote">Showing the first key details only. Use the filters or search to focus the view.</p>` : ""}
        </details>`;
      })
      .join("");
    const summary = summarizeDetails(moduleLogs);
    return `<article class="module-detail-block">
      <div class="module-detail-head">
        <span class="module-icon">${moduleIcon(module)}</span>
        <div><h3>${escapeHtml(module)}</h3><p>${moduleLogs.length} records · ${summary.completed.length} done details · ${summary.missing.length} not done details</p></div>
      </div>
      <div class="school-detail-list">${schoolRows}</div>
    </article>`;
  });
  $("detailsExplorer").innerHTML = sections.length ? sections.join("") : emptyState("No details match this view", "Try changing the period, log type, school, status, or details search.");
}

function renderMatrix() {
  const schools = unique(state.filtered.map((l) => l.school)).slice(0, 25);
  const modules = unique(state.filtered.map((l) => l.module));
  if (!schools.length || !modules.length) {
    $("matrixWrap").innerHTML = emptyState("No matrix data yet");
    return;
  }
  $("matrixWrap").innerHTML = `<table>
    <thead><tr><th>School</th>${modules.map((m) => `<th>${escapeHtml(m)}</th>`).join("")}<th>Total</th><th>Completion</th></tr></thead>
    <tbody>${schools.map((school) => {
      const schoolLogs = state.filtered.filter((l) => l.school === school);
      const total = schoolLogs.length;
      const rate = percent(schoolLogs.filter((l) => l.done).length, total);
      return `<tr><td><strong>${escapeHtml(school)}</strong></td>${modules.map((m) => {
        const cellLogs = schoolLogs.filter((l) => l.module === m);
        const done = cellLogs.reduce((sum, l) => sum + (l.completedDetails || 0), 0);
        const missing = cellLogs.reduce((sum, l) => sum + (l.missingDetails || 0), 0);
        return `<td><strong>${cellLogs.length}</strong><br><small>${done} done / ${missing} not done</small></td>`;
      }).join("")}<td>${total}</td><td>${rate}%</td></tr>`;
    }).join("")}</tbody>
  </table>`;
}

function render() {
  applyFilters();
  renderKpis();
  renderModules();
  renderSchools();
  renderRecent();
  renderDetailsExplorer();
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
  $("detailSearch").addEventListener("input", (event) => { state.filters.detailsSearch = event.target.value; render(); });
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
    status.textContent = state.logs.length ? `Loaded ${state.logs.length.toLocaleString()} public log records.` : "No log records were found in the published sheets.";
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
