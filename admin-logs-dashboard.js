const WORKBOOK_URLS = [
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0FssafaNQO506Gnup09T1Pb8qokb9s9yp62ZdFFYuxtsohYOdy409q1_q_cYl4vHZhZqe1tAUHF3Q/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYYBB5ZadA4Hhyc9nuFvfAwIQG_uolpXyk3ovhWHbwJEPk5IF8ht2eXo-0as1zvjK_R_tiPaCXmhSZ/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFHXifAA7qF5I0XTOV9aN3ATCuWQQFlCVrZlJomZsd8c-vWZT3xuq-f4z8-Qz8J0lcddgJsuTejKYa/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRNalcGSv5g3rtcaycU-7DWLrKSTuPqxLo_bdOUyJgtQLbHyPMkEi1itPWtutizdhpDCDZaUIgEuof9/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3Bhb3la7QjEHEPRSinb5mvAjr4hYh_5Sru71WtcWqqd1rkTG4dOGR9BQb5eXFQ11F77233Jh-106P/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZbhJsqbI7Wj2lcokI2drH1bh3RWSKd5CSMibYcOha9JRllh_BPsIGV7mKzy0s98mrEy0XvqykIjow/pubhtml",
];

const MODULE_HINTS = [
  { module: "Morning Assembly", words: ["morning assembly", "assembly", "morning"] },
  { module: "Values Class", words: ["values class", "value class", "values", "value"] },
  { module: "Principals Visit", words: ["principals visit", "principal visit", "visits", "visit"] },
  { module: "Follow Up", words: ["follow up", "followup", "follow"] },
  { module: "Formation", words: ["formation"] },
];

const state = {
  rawSheets: [],
  logs: [],
  filtered: [],
  filters: {
    period: "today",
    from: "",
    to: "",
    country: "All",
    school: "All",
    module: "All",
    status: "All",
    responsible: "All",
    search: "",
  },
};

const $ = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const unique = (items) => [...new Set(items.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const todayDate = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function get(row, names, fallback = "") {
  const wanted = names.map(key);
  const found = Object.keys(row).find((name) => wanted.includes(key(name)));
  return found ? clean(row[found]) : fallback;
}

function findLoose(row, names, fallback = "") {
  const wanted = names.map(key);
  const found = Object.keys(row).find((name) => wanted.some((w) => key(name).includes(w)));
  return found ? clean(row[found]) : fallback;
}

function parseDoneStatus(value) {
  const normalized = key(value);
  if (["yes", "true", "done", "completed", "complete", "1", "y", "ok", "checked", "right"].includes(normalized)) return true;
  if (["no", "false", "pending", "not done", "not completed", "0", "n", "x", "wrong"].includes(normalized)) return false;
  if (normalized.includes("not") || normalized.includes("pending") || normalized.includes("false")) return false;
  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("yes")) return true;
  return false;
}

function parseDateSafe(value) {
  const raw = clean(value);
  if (!raw) return null;

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 90000) {
    return new Date(Math.round((serial - 25569) * 86400 * 1000));
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", min = "0"] = dmy;
    const year = yyyy.length === 2 ? Number(`20${yyyy}`) : Number(yyyy);
    const date = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dateOnly(date) {
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
}

function dateInputValue(date) {
  if (!date) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
}

function formatDate(date) {
  return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "No date";
}

function formatTime(date) {
  return date ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

function rowsFromCsv(csv) {
  const rows = parseCsv(csv).filter((cells) => cells.some(Boolean));
  const headers = (rows.shift() || []).map((header, index) => clean(header) || `Column ${index + 1}`);
  return rows.map((cells) => {
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] || ""; });
    return row;
  });
}

function discoverSheetsFromHtml(html, workbookUrl) {
  const sheets = [];
  const base = workbookUrl.replace(/\/pubhtml.*$/, "");
  const regex = /items\.push\(\{name: "([^"]+)", pageUrl: "([^"]+)", gid: "([^"]+)"/g;
  let match = regex.exec(html);
  while (match) {
    sheets.push({ name: match[1], gid: match[3], base });
    match = regex.exec(html);
  }
  return sheets;
}

async function discoverSheets() {
  const discovered = [];
  const errors = [];
  await Promise.all(WORKBOOK_URLS.map(async (url) => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const html = await response.text();
      const sheets = discoverSheetsFromHtml(html, url);
      if (sheets.length) {
        discovered.push(...sheets);
      } else {
        discovered.push({ name: "Published Sheet", gid: "0", base: url.replace(/\/pubhtml.*$/, "") });
      }
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
      console.warn("Could not inspect published workbook", url, error);
    }
  }));
  if (errors.length) console.warn("Workbook discovery warnings", errors);
  return discovered.filter((sheet, index, all) => all.findIndex((item) => item.base === sheet.base && item.gid === sheet.gid) === index);
}

async function loadSheet(sheet) {
  const url = `${sheet.base}/pub?gid=${encodeURIComponent(sheet.gid)}&single=true&output=csv`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheet.name} failed with ${response.status}`);
  return rowsFromCsv(await response.text());
}

function inferModule(sheetName, row) {
  const source = key([sheetName, get(row, ["Module", "Log Type", "Type"]), Object.keys(row).join(" ")].join(" "));
  const match = MODULE_HINTS.find((item) => item.words.some((word) => source.includes(key(word))));
  return match ? match.module : clean(sheetName).replace(/\s*log\s*$/i, "") || "General Log";
}

function normalizeLog(row, sheetName, index) {
  const school = get(row, ["School Name", "School", "SchoolName"]);
  const country = get(row, ["Country Name", "Country"]);
  const dateValue = get(row, ["Date", "Log Date", "Activity Date", "Created Date", "Timestamp", "Time Stamp"]);
  const parsedDate = parseDateSafe(dateValue);
  const statusRaw = get(row, ["Done", "Completed", "Status", "Is Done", "Checked", "Result", "Value", "Answer"], "");
  const responsible = get(row, ["Responsible", "Responsible Person", "Resident Name", "Resident", "Created By", "User", "Email", "Teacher", "Principal", "Priest"]);
  const task = get(row, ["Task", "Task Description", "Description", "Activity", "Title", "Notes", "Value", "Values"], "Log entry");

  return {
    id: get(row, ["ID", "Log ID", "Key"], `${sheetName}-${index + 1}`),
    sourceSheet: sheetName,
    module: inferModule(sheetName, row),
    date: parsedDate,
    dateOnly: dateOnly(parsedDate),
    country,
    school,
    className: get(row, ["Class Name", "Class", "Grade", "Grade/Class"]),
    responsible,
    task,
    done: parseDoneStatus(statusRaw),
    statusRaw: statusRaw || "No status",
    notes: findLoose(row, ["note", "comment", "action", "remark"], ""),
    row,
  };
}

function shouldKeepSheet(sheetName, rows) {
  const name = key(sheetName);
  if (name.includes("log")) return true;
  if (rows.length === 0) return false;
  const headers = key(Object.keys(rows[0]).join(" "));
  return headers.includes("date") && (headers.includes("done") || headers.includes("status") || headers.includes("school") || headers.includes("resident"));
}

async function loadData() {
  setStatus("Loading published log sheets...");
  state.rawSheets = [];
  state.logs = [];

  const sheets = await discoverSheets();
  const loaded = await Promise.allSettled(sheets.map(async (sheet) => {
    const rows = await loadSheet(sheet);
    return { ...sheet, rows };
  }));

  loaded.forEach((result) => {
    if (result.status === "fulfilled") {
      const sheet = result.value;
      if (shouldKeepSheet(sheet.name, sheet.rows)) state.rawSheets.push(sheet);
    } else {
      console.warn("Sheet load warning", result.reason);
    }
  });

  state.logs = state.rawSheets.flatMap((sheet) => sheet.rows.map((row, index) => normalizeLog(row, sheet.name, index)));
  setStatus(`Loaded ${state.logs.length} logs`);
  $("loadState").title = `Last refreshed: ${new Date().toLocaleString()}`;
  populateFilters();
  render();
}

function periodRange() {
  const today = todayDate();
  const end = new Date(today.getTime() + 86400000 - 1);
  const filter = state.filters.period;
  if (filter === "all") return { from: null, to: null };
  if (filter === "custom") {
    return {
      from: state.filters.from ? new Date(state.filters.from) : null,
      to: state.filters.to ? new Date(`${state.filters.to}T23:59:59`) : null,
    };
  }
  if (filter === "yesterday") {
    const y = new Date(today.getTime() - 86400000);
    return { from: y, to: new Date(y.getTime() + 86400000 - 1) };
  }
  if (filter === "last7") return { from: new Date(today.getTime() - 6 * 86400000), to: end };
  if (filter === "last30") return { from: new Date(today.getTime() - 29 * 86400000), to: end };
  if (filter === "thisMonth") return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: end };
  return { from: today, to: end };
}

function applyFilters() {
  const { from, to } = periodRange();
  const q = key(state.filters.search);
  state.filtered = state.logs.filter((log) => {
    const haystack = key([log.module, log.country, log.school, log.className, log.responsible, log.task, log.statusRaw, log.notes, log.sourceSheet].join(" "));
    const status = log.done ? "Done" : "Not Done";
    const date = log.date;
    return (
      (!from || (date && date >= from)) &&
      (!to || (date && date <= to)) &&
      (state.filters.country === "All" || log.country === state.filters.country) &&
      (state.filters.school === "All" || log.school === state.filters.school) &&
      (state.filters.module === "All" || log.module === state.filters.module) &&
      (state.filters.status === "All" || status === state.filters.status) &&
      (state.filters.responsible === "All" || log.responsible === state.filters.responsible) &&
      (!q || haystack.includes(q))
    );
  });
}

function populateSelect(id, values, current = "All") {
  const select = $(id);
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(current) ? current : "All";
}

function populateFilters() {
  const periodOptions = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["last7", "Last 7 days"],
    ["last30", "Last 30 days"],
    ["thisMonth", "This month"],
    ["all", "All dates"],
    ["custom", "Custom range"],
  ];
  $("periodFilter").innerHTML = periodOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  $("periodFilter").value = state.filters.period;

  const base = state.logs.filter((log) => state.filters.country === "All" || log.country === state.filters.country);
  populateSelect("countryFilter", ["All", ...unique(state.logs.map((log) => log.country))], state.filters.country);
  populateSelect("schoolFilter", ["All", ...unique(base.map((log) => log.school))], state.filters.school);
  populateSelect("moduleFilter", ["All", ...unique(state.logs.map((log) => log.module))], state.filters.module);
  populateSelect("statusFilter", ["All", "Done", "Not Done"], state.filters.status);
  populateSelect("responsibleFilter", ["All", ...unique(base.map((log) => log.responsible))], state.filters.responsible);
}

function badge(label) {
  const k = key(label);
  const type = k.includes("not") || k.includes("missing") || k.includes("high") ? "danger" : k.includes("watch") || k.includes("pending") ? "watch" : k.includes("done") || k.includes("good") ? "good" : "info";
  return `<span class="badge ${type}">${escapeHtml(label)}</span>`;
}

function emptyState(title, message = "No records match the current filters.") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
}

function countBy(items, selector) {
  return items.reduce((acc, item) => {
    const value = clean(typeof selector === "function" ? selector(item) : item[selector]) || "Not specified";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function renderKpis(logs) {
  const today = todayDate();
  const todayLogs = logs.filter((log) => log.dateOnly && log.dateOnly.getTime() === today.getTime());
  const done = logs.filter((log) => log.done).length;
  const notDone = logs.length - done;
  const rate = logs.length ? Math.round((done / logs.length) * 100) : 0;
  const schools = unique(logs.map((log) => log.school)).length;
  const modules = unique(logs.map((log) => log.module)).length;
  const latest = logs.map((log) => log.date).filter(Boolean).sort((a, b) => b - a)[0];

  const cards = [
    ["Filtered Logs", logs.length, "Records in current view"],
    ["Today Logs", todayLogs.length, "Records created today"],
    ["Done", done, "Completed confirmations"],
    ["Not Done", notDone, "Negative or pending confirmations"],
    ["Completion Rate", `${rate}%`, "Done / all filtered logs"],
    ["Schools Covered", schools, "Schools with filtered records"],
    ["Modules Active", modules, "Log modules in current view"],
    ["Latest Record", latest ? `${formatDate(latest)} ${formatTime(latest)}` : "No date", "Newest timestamp found"],
  ];

  $("kpiGrid").innerHTML = cards.map(([title, value, helper]) => `
    <article class="kpi-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <p>${escapeHtml(helper)}</p>
    </article>
  `).join("");
}

function renderTodayWatch(logs) {
  const today = todayDate();
  const todayLogs = logs.filter((log) => log.dateOnly && log.dateOnly.getTime() === today.getTime());
  $("todayCount").textContent = `${todayLogs.length} records`;
  if (!todayLogs.length) {
    $("todayWatch").innerHTML = emptyState("No logs recorded today", "As soon as residents submit logs, they will appear here.");
    return;
  }

  const rows = Object.entries(countBy(todayLogs, (log) => `${log.school || "Not specified"}||${log.module}`))
    .map(([label, total]) => {
      const [school, module] = label.split("||");
      const related = todayLogs.filter((log) => (log.school || "Not specified") === school && log.module === module);
      const done = related.filter((log) => log.done).length;
      return { school, module, total, done, notDone: total - done };
    })
    .sort((a, b) => b.notDone - a.notDone || b.total - a.total);

  $("todayWatch").innerHTML = `<div class="table-wrap"><table><thead><tr><th>School</th><th>Module</th><th>Total</th><th>Done</th><th>Not Done</th><th>Signal</th></tr></thead><tbody>${rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.school)}</strong></td>
      <td>${escapeHtml(row.module)}</td>
      <td>${row.total}</td>
      <td>${row.done}</td>
      <td>${row.notDone}</td>
      <td>${badge(row.notDone ? "Needs follow-up" : "Good")}</td>
    </tr>
  `).join("")}</tbody></table></div>`;
}

function renderAttention(logs) {
  const notDone = logs.filter((log) => !log.done).sort((a, b) => (b.date || 0) - (a.date || 0));
  $("attentionCount").textContent = `${notDone.length} items`;
  $("attentionList").innerHTML = notDone.length ? `<div class="alert-stack">${notDone.slice(0, 10).map((log) => `
    <article class="alert-item">
      ${badge("Not Done")}
      <h3>${escapeHtml(log.task || log.module)}</h3>
      <p>${escapeHtml(log.notes || log.statusRaw || "Needs admin review.")}</p>
      <div class="alert-meta">
        <span>${escapeHtml(log.module)} • ${formatDate(log.date)} ${formatTime(log.date)}</span>
        <span>School: ${escapeHtml(log.school || "Not specified")}</span>
        <span>Responsible: ${escapeHtml(log.responsible || "Not specified")}</span>
      </div>
    </article>
  `).join("")}</div>` : emptyState("No not-done items", "Everything in the current view is marked as done.");
}

function chartCard(title, data, helper = "") {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return `<article class="chart-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(helper)}</p><div class="bar-chart">${entries.length ? entries.map(([label, value]) => `
    <div class="bar-row"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((value / max) * 100)}%"></div></div><strong>${value}</strong></div>
  `).join("") : emptyState("No chart data")}</div></article>`;
}

function renderCharts(logs) {
  const byDate = Object.entries(countBy(logs, (log) => log.date ? formatDate(log.date) : "No date"))
    .slice(-12)
    .reduce((acc, [label, value]) => ({ ...acc, [label]: value }), {});
  $("chartsGrid").innerHTML = [
    chartCard("Done vs Not Done", { Done: logs.filter((l) => l.done).length, "Not Done": logs.filter((l) => !l.done).length }, "Quick completion signal."),
    chartCard("Logs by Module", countBy(logs, "module"), "Which modules are moving most."),
    chartCard("Logs by School", countBy(logs, "school"), "Top schools by records."),
    chartCard("Logs by Responsible", countBy(logs, "responsible"), "Who is recording the logs."),
    chartCard("Logs by Country", countBy(logs, "country"), "Country coverage."),
    chartCard("Daily Movement", byDate, "Records by date in the current view."),
  ].join("");
}

function renderSchoolMatrix(logs) {
  const schools = unique(logs.map((log) => log.school));
  if (!schools.length) {
    $("schoolMatrix").innerHTML = emptyState("No school data", "No school names were found in the filtered logs.");
    return;
  }
  $("schoolMatrix").innerHTML = `<div class="matrix-grid">${schools.slice(0, 18).map((school) => {
    const schoolLogs = logs.filter((log) => log.school === school);
    const modules = Object.entries(countBy(schoolLogs, "module")).sort((a, b) => b[1] - a[1]);
    const done = schoolLogs.filter((log) => log.done).length;
    const rate = schoolLogs.length ? Math.round((done / schoolLogs.length) * 100) : 0;
    return `<article class="matrix-card">
      <h3>${escapeHtml(school)}</h3>
      ${badge(`${rate}% Done`)}
      ${modules.map(([module, total]) => {
        const relevant = schoolLogs.filter((log) => log.module === module);
        const notDone = relevant.filter((log) => !log.done).length;
        return `<div class="module-line"><span>${escapeHtml(module)}</span><strong>${total} / ${notDone} not done</strong></div>`;
      }).join("")}
    </article>`;
  }).join("")}</div>`;
}

function renderLogsTable(logs) {
  if (!logs.length) {
    $("logsTable").innerHTML = emptyState("No logs found", "Try widening the date range or removing some filters.");
    return;
  }
  const latest = [...logs].sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 250);
  $("logsTable").innerHTML = `<div class="table-wrap"><table id="recordsTable"><thead><tr>
    <th>Date</th><th>Time</th><th>Module</th><th>Country</th><th>School</th><th>Class</th><th>Responsible</th><th>Task / Description</th><th>Status</th><th>Notes</th>
  </tr></thead><tbody>${latest.map((log) => `
    <tr>
      <td>${formatDate(log.date)}</td>
      <td>${formatTime(log.date)}</td>
      <td>${escapeHtml(log.module)}</td>
      <td>${escapeHtml(log.country || "-")}</td>
      <td><strong>${escapeHtml(log.school || "-")}</strong></td>
      <td>${escapeHtml(log.className || "-")}</td>
      <td>${escapeHtml(log.responsible || "-")}</td>
      <td>${escapeHtml(log.task || "-")}</td>
      <td>${badge(log.done ? "Done" : "Not Done")}</td>
      <td>${escapeHtml(log.notes || log.statusRaw || "-")}</td>
    </tr>
  `).join("")}</tbody></table></div>`;
}

function render() {
  applyFilters();
  renderKpis(state.filtered);
  renderTodayWatch(state.filtered);
  renderAttention(state.filtered);
  renderCharts(state.filtered);
  renderSchoolMatrix(state.filtered);
  renderLogsTable(state.filtered);
}

function setStatus(message) {
  $("loadState").textContent = message;
}

function bindFilters() {
  const map = {
    periodFilter: "period",
    fromDate: "from",
    toDate: "to",
    countryFilter: "country",
    schoolFilter: "school",
    moduleFilter: "module",
    statusFilter: "status",
    responsibleFilter: "responsible",
    searchFilter: "search",
  };
  Object.entries(map).forEach(([id, prop]) => {
    $(id).addEventListener(id === "searchFilter" ? "input" : "change", () => {
      state.filters[prop] = $(id).value;
      if (prop === "country") state.filters.school = "All";
      if (["country", "school", "responsible"].includes(prop)) populateFilters();
      render();
    });
  });
}

function exportCsv() {
  const headers = ["Date", "Time", "Module", "Country", "School", "Class", "Responsible", "Task", "Status", "Notes", "Source Sheet"];
  const lines = [headers, ...state.filtered.map((log) => [
    formatDate(log.date), formatTime(log.date), log.module, log.country, log.school, log.className, log.responsible, log.task, log.done ? "Done" : "Not Done", log.notes || log.statusRaw, log.sourceSheet,
  ])].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flame-admin-logs-${dateInputValue(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function init() {
  bindFilters();
  $("refreshBtn").addEventListener("click", loadData);
  $("printBtn").addEventListener("click", () => window.print());
  $("exportBtn").addEventListener("click", exportCsv);
  await loadData();
  setInterval(loadData, 5 * 60 * 1000);
}

init().catch((error) => {
  console.error(error);
  setStatus("Could not load logs");
  $("logsTable").innerHTML = emptyState("Could not load the published Google Sheets", "Check that all links are published to the web and accessible without login.");
});
