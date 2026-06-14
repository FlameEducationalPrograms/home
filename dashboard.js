const WORKBOOK_URLS = [
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSRXJ-jhwIECRf7DMDJQpCSDN6PAR0e0hN3UINjqsuZUvOnfApgN2wGRmzjC3XyqJ1boQJrfDTB4ie2/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0FssafaNQO506Gnup09T1Pb8qokb9s9yp62ZdFFYuxtsohYOdy409q1_q_cYl4vHZhZqe1tAUHF3Q/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYYBB5ZadA4Hhyc9nuFvfAwIQG_uolpXyk3ovhWHbwJEPk5IF8ht2eXo-0as1zvjK_R_tiPaCXmhSZ/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7OE6IrI6mRhSuWFmEQel_cjsrZefWBRJpGMESvFt7ivgyIjvmMwu3vAsEzALqNUrPm5Ve4jczbSSu/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFHXifAA7qF5I0XTOV9aN3ATCuWQQFlCVrZlJomZsd8c-vWZT3xuq-f4z8-Qz8J0lcddgJsuTejKYa/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRNalcGSv5g3rtcaycU-7DWLrKSTuPqxLo_bdOUyJgtQLbHyPMkEi1itPWtutizdhpDCDZaUIgEuof9/pubhtml",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3Bhb3la7QjEHEPRSinb5mvAjr4hYh_5Sru71WtcWqqd1rkTG4dOGR9BQb5eXFQ11F77233Jh-106P/pubhtml",
];

const TABLE_ALIASES = {
  countries: ["countries", "country"],
  schools: ["schools", "school"],
  classes: ["classes", "class"],
  priests: ["priests", "priest"],
  principals: ["principals", "principal"],
  residents: ["residents", "resident"],
  teachers: ["teachers", "teacher"],
  students: ["students", "student", "students2"],
  team: ["team", "team members"],
  curriculum: ["curriculum"],
  leadership: ["leadership"],
  formation: ["formation"],
  projects: ["projects", "project"],
  buildings: ["building status", "buildings"],
  news: ["last news", "news"],
};

const ACTIVITY_MODULES = [
  { key: "morning", labels: ["morning assembly", "morning assembly log"] },
  { key: "values", labels: ["values class", "values class log"] },
  { key: "visits", labels: ["principals visit", "principal visits", "principals visit log"] },
  { key: "follow", labels: ["follow up", "follow up log"] },
  { key: "formationLog", labels: ["formation log", "formation"] },
];

const state = {
  tables: {},
  sheets: [],
  activities: [],
  schools: [],
  countries: [],
  filters: {
    country: "All",
    school: "All",
    module: "All",
    status: "All",
    priority: "All",
    search: "",
  },
};

const byId = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const unique = (items) => [...new Set(items.map(clean).filter(Boolean))];

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

function parseDoneStatus(value) {
  const normalized = key(value);
  if (["yes", "true", "done", "completed", "complete", "1", "y"].includes(normalized)) return true;
  if (["no", "false", "pending", "not done", "0", "n"].includes(normalized)) return false;
  return false;
}

function parseDateSafe(value) {
  const raw = clean(value);
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
  const dmy = new Date(Number(year), Number(mm) - 1, Number(dd));
  return Number.isNaN(dmy.getTime()) ? null : dmy;
}

function formatDate(date) {
  return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "No date";
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
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
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    return row;
  });
}

function discoverSheetsFromHtml(html, workbookUrl) {
  const sheets = [];
  const regex = /items\.push\(\{name: "([^"]+)", pageUrl: "([^"]+)", gid: "([^"]+)"/g;
  let match = regex.exec(html);
  while (match) {
    sheets.push({
      name: match[1],
      gid: match[3],
      base: workbookUrl.replace(/\/pubhtml.*$/, ""),
    });
    match = regex.exec(html);
  }
  return sheets;
}

async function discoverSheets() {
  const discovered = [];
  await Promise.all(
    WORKBOOK_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        const html = await response.text();
        const sheets = discoverSheetsFromHtml(html, url);
        if (sheets.length) discovered.push(...sheets);
      } catch (error) {
        console.warn("Could not inspect workbook", url, error);
      }
    })
  );
  return discovered.filter((sheet, index, all) => all.findIndex((item) => item.base === sheet.base && item.gid === sheet.gid) === index);
}

async function loadSheet(sheet) {
  const url = `${sheet.base}/pub?gid=${sheet.gid}&single=true&output=csv`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheet.name} failed with ${response.status}`);
  return rowsFromCsv(await response.text());
}

function addTable(name, rows) {
  const normalized = key(name);
  if (!state.tables[normalized]) state.tables[normalized] = [];
  state.tables[normalized].push(...rows);
}

function table(canonical) {
  const aliases = TABLE_ALIASES[canonical] || [canonical];
  return aliases.flatMap((alias) => state.tables[key(alias)] || []);
}

function matchTableByLabels(labels) {
  return labels.flatMap((label) => state.tables[key(label)] || []);
}

function deriveCountryFromSchool(schoolName) {
  const school = state.schools.find((item) => key(item.name) === key(schoolName));
  return school?.country || "";
}

function normalizeEntity(row, type) {
  return {
    raw: row,
    name: get(row, [`${type} Name`, "Name", type, "Full Name", "School Name", "Country Name"]),
    country: get(row, ["Country", "Country Name"]),
    school: get(row, ["School", "School Name", "Assigned School"]),
    status: get(row, ["Status", "School Status", "Active"]),
    type: get(row, ["Type", "School Type"]),
    className: get(row, ["Class", "Grade", "Grade/Class"]),
    phone: get(row, ["Phone", "Mobile", "Contact", "Guardian Phone"]),
  };
}

function normalizeActivities() {
  const activities = [];
  ACTIVITY_MODULES.forEach((module) => {
    const rows = matchTableByLabels(module.labels);
    rows.forEach((row, index) => {
      const school = get(row, ["School", "School Name"]);
      const date = parseDateSafe(get(row, ["Date", "Activity Date", "News Date", "Created Date"]));
      const dueDate = parseDateSafe(get(row, ["Due Date", "Deadline", "Target Date"]));
      const doneValue = get(row, ["Done", "Completed", "Status", "Is Done", "ShowOnWebsite"]);
      const done = parseDoneStatus(doneValue);
      activities.push({
        id: get(row, ["ID", "Activity ID"], `${module.key}-${index + 1}`),
        module: module.labels[0].replace(/\b\w/g, (char) => char.toUpperCase()),
        date,
        dueDate,
        country: get(row, ["Country", "Country Name"]) || deriveCountryFromSchool(school),
        school,
        className: get(row, ["Class", "Grade", "Grade/Class"]),
        teacher: get(row, ["Teacher", "Teacher Name"]),
        principal: get(row, ["Principal", "Principal Name"]),
        priest: get(row, ["Priest", "Priest Name"]),
        resident: get(row, ["Resident", "Resident Name"]),
        responsible: get(row, ["Responsible", "Responsible Person", "Created By", "Priest", "Resident", "Principal", "Teacher"]),
        title: get(row, ["Task", "Activity", "Title", "Description", "Notes"], module.labels[0]),
        done,
        doneRaw: doneValue,
        priority: get(row, ["Priority"], done ? "Low" : "Medium"),
        notes: get(row, ["Notes", "Action Required", "Description"]),
        row,
      });
    });
  });
  return activities;
}

function isActive(row) {
  const status = key(get(row.raw || row, ["Status", "Active", "ShowOnWebsite"]));
  return !["inactive", "false", "no", "hidden", "archived"].includes(status);
}


function schoolCountry(schoolName) {
  const school = state.schools.find((item) => key(item.name) === key(schoolName));
  return school?.country || "";
}

function withDerivedCountry(item) {
  return {
    ...item,
    country: item.country || schoolCountry(item.school),
  };
}

function searchText(item) {
  const rawValues = item.raw ? Object.values(item.raw) : [];
  return key(Object.values(item).concat(rawValues).join(" "));
}

function matchesCountrySchool(item) {
  const country = item.country || schoolCountry(item.school || item.name);
  const school = item.school || (state.schools.some((s) => key(s.name) === key(item.name)) ? item.name : "");
  return (
    (state.filters.country === "All" || country === state.filters.country) &&
    (state.filters.school === "All" || school === state.filters.school || item.name === state.filters.school)
  );
}

function matchesSearch(item) {
  const search = key(state.filters.search);
  return !search || searchText(item).includes(search);
}

function scopeFilter(items) {
  return items.map(withDerivedCountry).filter((item) => matchesCountrySchool(item) && matchesSearch(item));
}

function getPeople(canonical, type) {
  return table(canonical).map((row) => withDerivedCountry(normalizeEntity(row, type)));
}

function normalizeSchool(row) {
  return {
    raw: row,
    name: get(row, ["School Name", "Name", "School"]),
    country: get(row, ["Country", "Country Name"]),
    type: get(row, ["School Type", "Type"]),
    status: get(row, ["Status", "Active"]),
    priest: get(row, ["Priest", "Priest Name"]),
    resident: get(row, ["Resident", "Resident Name"]),
    principal: get(row, ["Principal", "Principal Name"]),
  };
}

function normalizeProjectLike(row, type) {
  return withDerivedCountry({
    raw: row,
    name: get(row, [`${type} Name`, "Name", type, "Title", "Project Name", "Building Name"], "Unnamed record"),
    country: get(row, ["Country", "Country Name"]),
    school: get(row, ["School", "School Name", "Assigned School"]),
    status: get(row, ["Status", "Phase", "Active"]),
    priority: get(row, ["Priority"], "Medium"),
  });
}

function getAllData() {
  const countryRows = table("countries").map((row) => normalizeEntity(row, "Country")).filter((item) => item.name);
  const countryNames = unique(countryRows.map((item) => item.name).concat(state.schools.map((item) => item.country), state.activities.map((item) => item.country)));
  const countries = countryNames.map((name) => countryRows.find((item) => item.name === name) || { raw: { Name: name, Status: "Active" }, name, country: name, status: "Active" });
  const schools = state.schools;
  const students = getPeople("students", "Student");
  const teachers = getPeople("teachers", "Teacher");
  const priests = getPeople("priests", "Priest");
  const residents = getPeople("residents", "Resident");
  const principals = getPeople("principals", "Principal");
  const team = getPeople("team", "Team");
  const projects = table("projects").map((row) => normalizeProjectLike(row, "Project"));
  const buildings = table("buildings").map((row) => normalizeProjectLike(row, "Building"));
  const news = getNews();
  return { countries, schools, students, teachers, priests, residents, principals, team, projects, buildings, news, activities: state.activities };
}

function getFilteredData() {
  const all = getAllData();
  const selectedSchoolCountry = state.filters.school === "All" ? "" : schoolCountry(state.filters.school);
  const filteredCountries = all.countries.filter((country) => {
    const countryName = country.name;
    return (
      (state.filters.country === "All" || countryName === state.filters.country) &&
      (state.filters.school === "All" || countryName === selectedSchoolCountry) &&
      matchesSearch(country)
    );
  });
  const filteredActivities = applyActivityFilters(all.activities);
  return {
    countries: filteredCountries,
    schools: scopeFilter(all.schools),
    students: scopeFilter(all.students),
    teachers: scopeFilter(all.teachers),
    priests: scopeFilter(all.priests),
    residents: scopeFilter(all.residents),
    principals: scopeFilter(all.principals),
    team: scopeFilter(all.team),
    projects: scopeFilter(all.projects),
    buildings: scopeFilter(all.buildings),
    news: scopeFilter(all.news),
    activities: filteredActivities,
  };
}

function applyActivityFilters(activities = state.activities) {
  return activities.map(withDerivedCountry).filter((item) => {
    const status = item.done ? "Completed" : "Pending";
    return (
      matchesCountrySchool(item) &&
      matchesSearch(item) &&
      (state.filters.module === "All" || item.module === state.filters.module) &&
      (state.filters.status === "All" || status === state.filters.status) &&
      (state.filters.priority === "All" || item.priority === state.filters.priority)
    );
  });
}

function calculateKPIs(data) {
  const completed = data.activities.filter((item) => item.done).length;
  const pending = data.activities.filter((item) => !item.done).length;
  const overdue = data.activities.filter((item) => item.dueDate && item.dueDate < new Date() && !item.done).length;
  const total = completed + pending;
  return [
    ["Filtered Countries", data.countries.length, "Countries matching current filters", "CO"],
    ["Active Countries", data.countries.filter(isActive).length, "Active countries in current view", "AC"],
    ["Filtered Schools", data.schools.length, "Schools matching current filters", "SC"],
    ["Active Schools", data.schools.filter(isActive).length, "Active schools in current view", "AS"],
    ["Filtered Students", data.students.length, "Students in current view", "ST"],
    ["Filtered Teachers", data.teachers.length, "Teachers in current view", "TE"],
    ["Filtered Priests", data.priests.length, "Priests in current view", "PR"],
    ["Filtered Residents", data.residents.length, "Residents in current view", "RE"],
    ["Filtered Principals", data.principals.length, "Principals in current view", "PI"],
    ["Filtered Team Members", data.team.length, "Team members in current view", "TM"],
    ["Completed Tasks", completed, "Done activity records in current view", "DN", "good"],
    ["Pending Tasks", pending, "Open activity records in current view", "PN", pending ? "warning" : "good"],
    ["Overdue Tasks", overdue, "Past due and not done in current view", "OD", overdue ? "critical" : "good"],
    ["Completion Rate", total ? `${Math.round((completed / total) * 100)}%` : "No records", "Completed tasks / filtered tasks", "CR"],
    ["Published News", data.news.filter((item) => item.published).length, "Visible news records in current view", "NW"],
    ["Active Projects", data.projects.filter(isActive).length, "Open project records in current view", "PJ"],
    ["Buildings In Progress", data.buildings.filter((row) => key(row.status).includes("progress")).length, "Building records in progress in current view", "BD"],
  ];
}

function completionRate(items) {
  return items.length ? items.filter((item) => item.done).length / items.length : 0;
}

function calculateSchoolHealth(data) {
  return data.schools
    .map((school) => {
      const schoolActivities = data.activities.filter((item) => key(item.school) === key(school.name));
      const schoolStudents = data.students.filter((item) => key(item.school) === key(school.name));
      const schoolTeachers = data.teachers.filter((item) => key(item.school) === key(school.name));
      const overdue = schoolActivities.filter((item) => item.dueDate && item.dueDate < new Date() && !item.done).length;
      const lastActivity = schoolActivities.map((item) => item.date).filter(Boolean).sort((a, b) => b - a)[0] || null;
      const recent = lastActivity ? (new Date() - lastActivity) / 86400000 <= 30 : false;
      const responsibleCount = [school.priest, school.resident, school.principal].filter(Boolean).length;
      const dataFields = [school.name, school.country, school.type, school.status, ...schoolStudents.map((s) => s.name), ...schoolTeachers.map((t) => t.name)];
      const completeness = dataFields.length ? dataFields.filter(Boolean).length / dataFields.length : 0;
      const hasBuilding = data.buildings.some((row) => key(row.school) === key(school.name));
      const hasNews = data.news.some((item) => key(item.school) === key(school.name) || (item.date && lastActivity && Math.abs(item.date - lastActivity) < 86400000 * 31));
      const score =
        completionRate(schoolActivities) * 30 +
        (overdue ? 0 : 20) +
        (recent ? 15 : 0) +
        completeness * 15 +
        (responsibleCount / 3) * 10 +
        (hasBuilding ? 5 : 0) +
        (hasNews ? 5 : 0);
      const rounded = Math.round(Math.max(0, Math.min(100, score)));
      return {
        ...school,
        students: schoolStudents.length,
        teachers: schoolTeachers.length,
        totalActivities: schoolActivities.length,
        completed: schoolActivities.filter((item) => item.done).length,
        pending: schoolActivities.filter((item) => !item.done).length,
        overdue,
        lastActivity,
        completeness: Math.round(completeness * 100),
        score: rounded,
        health: rounded >= 80 ? "Good" : rounded >= 60 ? "Watch" : rounded >= 40 ? "Needs Attention" : "Critical",
      };
    })
    .sort((a, b) => a.score - b.score);
}

function calculateCountrySummary(data, schoolHealth) {
  const countries = unique([...data.countries.map((item) => item.name), ...schoolHealth.map((item) => item.country)]);
  return countries.map((country) => {
    const schools = schoolHealth.filter((item) => item.country === country);
    const countryActivities = data.activities.filter((item) => item.country === country);
    const lastActivity = countryActivities.map((item) => item.date).filter(Boolean).sort((a, b) => b - a)[0] || null;
    const avgHealth = schools.length ? Math.round(schools.reduce((sum, item) => sum + item.score, 0) / schools.length) : 0;
    return {
      country,
      schools: schools.length,
      students: data.students.filter((item) => item.country === country).length,
      teachers: data.teachers.filter((item) => item.country === country).length,
      activities: countryActivities.length,
      pending: countryActivities.filter((item) => !item.done).length,
      completion: countryActivities.length ? Math.round(completionRate(countryActivities) * 100) : 0,
      avgHealth,
      lastActivity,
    };
  });
}

function getNews() {
  const explicitNews = table("news");
  const discoveredNews = Object.values(state.tables)
    .flat()
    .filter((row) => get(row, ["PublicImageURL", "Public Image URL", "News Date", "ShowOnWebsite"]));
  const rows = explicitNews.length ? explicitNews : discoveredNews;
  return rows.map((row) => {
    const description = get(row, ["Description", "Title", "News", "Message"]);
    const visible = get(row, ["ShowOnWebsite", "Published", "Visible"]);
    const school = get(row, ["School", "School Name"]);
    return withDerivedCountry({
      raw: row,
      date: parseDateSafe(get(row, ["News Date", "Date"])),
      description,
      image: get(row, ["PublicImageURL", "Public Image URL", "Image", "News Image"]),
      country: get(row, ["Country", "Country Name"]),
      school,
      published: visible ? parseDoneStatus(visible) : true,
    });
  }).filter((item) => item.description || item.image || item.date);
}

function detectDataQualityIssues(data) {
  const issues = [];
  const push = (priority, type, entity, recommendation, country = "", school = "") => issues.push({ priority, type, entity, recommendation, country, school });
  data.schools.forEach((school) => {
    if (!school.country) push("High", "School missing country", school.name, "Assign the school country.", school.country, school.name);
    if (!school.type) push("Medium", "School missing type", school.name, "Set Formal, Non-Formal, or Informal.", school.country, school.name);
  });
  data.students.forEach((student) => {
    if (!student.name) push("High", "Student missing name", student.school, "Add the student name.", student.country, student.school);
    if (!student.school) push("High", "Student without school", student.name, "Assign the student to a school.", student.country, student.school);
    if (!student.className) push("Medium", "Student missing grade/class", student.name, "Add grade or class.", student.country, student.school);
    if (!student.phone) push("Low", "Student missing contact info", student.name, "Add guardian or contact data.", student.country, student.school);
  });
  data.teachers.forEach((teacher) => {
    if (!teacher.school) push("High", "Teacher without school", teacher.name, "Assign the teacher to a school.", teacher.country, teacher.school);
    if (!teacher.phone) push("Low", "Teacher missing phone", teacher.name, "Add phone/contact info.", teacher.country, teacher.school);
  });
  data.activities.forEach((activity) => {
    if (!activity.date) push("Medium", "Activity without date", activity.title, "Add a valid activity date.", activity.country, activity.school);
    if (!activity.doneRaw) push("Medium", "Activity without Done status", activity.title, "Set Done/Pending status.", activity.country, activity.school);
    if (activity.school && !state.schools.some((school) => key(school.name) === key(activity.school))) {
      push("High", "Log connected to unknown school", activity.school, "Match the log school name with the Schools table.", activity.country, activity.school);
    }
  });
  data.news.forEach((news) => {
    if (!news.image) push("Low", "News without image", news.description, "Add a public image URL.", news.country, news.school);
  });
  return issues.filter((issue) => matchesCountrySchool(issue) && matchesSearch(issue));
}

function detectAlerts(schoolHealth, activities, news = []) {
  const alerts = [];
  const add = (priority, title, description, item, action) => alerts.push({ priority, title, description, country: item.country || "", school: item.school || item.name || "", responsible: item.responsible || item.priest || item.resident || "", action });
  activities.filter((item) => !item.done).slice(0, 30).forEach((item) => {
    const overdue = item.dueDate && item.dueDate < new Date();
    add(overdue ? "High" : "Medium", `${item.module} pending`, item.title, item, overdue ? "Complete or reschedule this overdue task." : "Follow up with the responsible person.");
  });
  schoolHealth.forEach((school) => {
    if (!school.lastActivity || (new Date() - school.lastActivity) / 86400000 > 30) add("High", "No recent school activity", "No activity recorded in the last 30 days.", school, "Schedule and record a follow-up activity.");
    if (school.health === "Critical" || school.health === "Needs Attention") add("High", "Weak school health", `${school.health} score: ${school.score}%`, school, "Review pending tasks, data completeness, and assigned leaders.");
  });
  news.filter((item) => !item.published).forEach((item) => add("Medium", "News hidden", item.description, item, "Review whether this news should be published."));
  return alerts.sort((a, b) => ["High", "Medium", "Low"].indexOf(a.priority) - ["High", "Medium", "Low"].indexOf(b.priority));
}

function badge(label) {
  const type = key(label).includes("critical") || key(label).includes("high") ? "critical" : key(label).includes("watch") || key(label).includes("medium") ? "watch" : key(label).includes("need") ? "warning" : key(label).includes("good") || key(label).includes("completed") ? "good" : "info";
  return `<span class="badge ${type}">${escapeHtml(label)}</span>`;
}

function emptyState(title, message = "No records yet") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
}

function renderKpis(kpis) {
  byId("kpiGrid").innerHTML = kpis.map(([title, value, helper, icon, status = "info"]) => `
    <article class="kpi-card">
      <div class="kpi-top"><h3>${escapeHtml(title)}</h3><span class="kpi-icon">${icon}</span></div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <p>${escapeHtml(helper)}</p>
      <p>${badge(status)}</p>
    </article>
  `).join("");
}

function renderAlerts(alerts) {
  byId("alertCount").textContent = `${alerts.length} alerts`;
  byId("alertList").innerHTML = alerts.length ? alerts.slice(0, 12).map((alert) => `
    <article class="alert-card">
      ${badge(alert.priority)}
      <h3>${escapeHtml(alert.title)}</h3>
      <p>${escapeHtml(alert.description)}</p>
      <div class="meta-grid">
        <span>Country: ${escapeHtml(alert.country || "Not specified")}</span>
        <span>School: ${escapeHtml(alert.school || "Not specified")}</span>
        <span>Responsible: ${escapeHtml(alert.responsible || "Not assigned")}</span>
        <strong>${escapeHtml(alert.action)}</strong>
      </div>
    </article>
  `).join("") : emptyState("No urgent alerts", "No critical items need attention right now.");
}

function countsBy(items, field) {
  return items.reduce((acc, item) => {
    const value = clean(item[field]) || "Not specified";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function chartCard(title, data, helper = "") {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return `<article class="chart-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(helper)}</p><div class="bar-chart">${
    entries.length ? entries.map(([label, value]) => `
      <div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((value / max) * 100)}%"></div></div><strong>${value}</strong></div>
    `).join("") : emptyState("No chart data", "No records available for this chart.")
  }</div></article>`;
}

function renderCharts(activities, schoolHealth) {
  const donePending = { Done: activities.filter((item) => item.done).length, Pending: activities.filter((item) => !item.done).length };
  const byMonth = activities.reduce((acc, item) => {
    const label = item.date ? item.date.toLocaleDateString(undefined, { year: "numeric", month: "short" }) : "No date";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const health = countsBy(schoolHealth, "health");
  byId("chartGrid").innerHTML = [
    chartCard("Done vs Pending", donePending, "Completion status across the filtered activity modules."),
    chartCard("Activities by Module", countsBy(activities, "module"), "Filtered unified logs by service module."),
    chartCard("Activities by Country", countsBy(activities, "country"), "Filtered activity volume by country."),
    chartCard("Schools Health Distribution", health, "Filtered school status based on the calculated health score."),
    chartCard("Activities by Month", byMonth, "Filtered monthly service movement."),
    chartCard("Pending by Responsible Person", countsBy(activities.filter((item) => !item.done), "responsible"), "Filtered open tasks grouped by responsible person."),
  ].join("");
}

function progress(value) {
  return `<div class="progress"><strong>${value}%</strong><div class="progress-track"><div class="progress-fill" style="width:${value}%"></div></div></div>`;
}

function dataTable(id, rows, columns) {
  if (!rows.length) return emptyState("No records yet", "This section will update when records match the current filters.");
  return `<div class="table-tools"><input type="search" data-table-search="${id}" placeholder="Search this table" /><button data-export="${id}" type="button">Export CSV</button></div>
    <div class="table-wrap"><table id="${id}"><thead><tr>${columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr></thead><tbody>${
      rows.map((row) => `<tr>${columns.map((col) => `<td>${col.render ? col.render(row) : escapeHtml(row[col.key])}</td>`).join("")}</tr>`).join("")
    }</tbody></table></div>`;
}

function renderTables(schoolHealth, countrySummary, activities, issues) {
  byId("schoolHealthTable").innerHTML = dataTable("schoolsTable", schoolHealth, [
    { label: "School", render: (r) => `<strong>${escapeHtml(r.name || "Unnamed school")}</strong><br>${escapeHtml(r.type || "No type")}` },
    { label: "Country", key: "country" },
    { label: "Leaders", render: (r) => `Priest: ${escapeHtml(r.priest || "-")}<br>Resident: ${escapeHtml(r.resident || "-")}<br>Principal: ${escapeHtml(r.principal || "-")}` },
    { label: "People", render: (r) => `${r.students} students<br>${r.teachers} teachers` },
    { label: "Activities", render: (r) => `${r.totalActivities} total<br>${r.pending} pending<br>${r.overdue} overdue` },
    { label: "Last Activity", render: (r) => formatDate(r.lastActivity) },
    { label: "Health", render: (r) => `${badge(r.health)}${progress(r.score)}` },
  ]);
  byId("countryOverview").innerHTML = dataTable("countryTable", countrySummary.sort((a, b) => a.avgHealth - b.avgHealth), [
    { label: "Country", key: "country" },
    { label: "Schools", key: "schools" },
    { label: "People", render: (r) => `${r.students} students<br>${r.teachers} teachers` },
    { label: "Activities", render: (r) => `${r.activities} total<br>${r.pending} pending` },
    { label: "Completion", render: (r) => progress(r.completion) },
    { label: "Avg Health", render: (r) => progress(r.avgHealth) },
  ]);
  byId("activityMonitor").innerHTML = dataTable("activitiesTable", activities.slice(0, 150), [
    { label: "Module", key: "module" },
    { label: "Date", render: (r) => formatDate(r.date) },
    { label: "Country", key: "country" },
    { label: "School", key: "school" },
    { label: "Responsible", key: "responsible" },
    { label: "Task", key: "title" },
    { label: "Priority", render: (r) => badge(r.priority || "Medium") },
    { label: "Status", render: (r) => badge(r.done ? "Completed" : "Pending") },
  ]);
  byId("qualityDashboard").innerHTML = `<div class="mini-grid">
    <div class="mini-card"><span>${issues.length}</span><strong>Filtered data issues</strong></div>
    <div class="mini-card"><span>${issues.filter((i) => i.priority === "High").length}</span><strong>High priority issues</strong></div>
    <div class="mini-card"><span>${issues.length ? Math.max(0, 100 - issues.length) : 100}%</span><strong>Data completeness signal</strong></div>
  </div>${dataTable("issuesTable", issues, [
    { label: "Priority", render: (r) => badge(r.priority) },
    { label: "Issue", key: "type" },
    { label: "Entity", key: "entity" },
    { label: "Country", key: "country" },
    { label: "School", key: "school" },
    { label: "Recommended Correction", key: "recommendation" },
  ])}`;
}

function renderPeople(data) {
  const cards = [
    ["Students", data.students.length],
    ["Teachers", data.teachers.length],
    ["Priests", data.priests.length],
    ["Principals", data.principals.length],
    ["Residents", data.residents.length],
    ["Team Members", data.team.length],
  ];
  byId("peopleMonitor").innerHTML = `<div class="mini-grid">${cards.map(([label, value]) => `<div class="mini-card"><span>${value}</span><strong>${label}</strong></div>`).join("")}</div>`;
}

function renderFormation(activities) {
  const formation = activities.filter((item) => key(item.module).includes("formation"));
  byId("formationDashboard").innerHTML = formation.length ? `<div class="mini-grid">
    <div class="mini-card"><span>${formation.length}</span><strong>Filtered formation logs</strong></div>
    <div class="mini-card"><span>${formation.filter((item) => item.done).length}</span><strong>Completed Formation</strong></div>
    <div class="mini-card"><span>${formation.filter((item) => !item.done).length}</span><strong>Pending Formation</strong></div>
  </div>${chartCard("Formation by School", countsBy(formation, "school"), "Filtered formation coverage by school.")}` : emptyState("No formation activity in current view", "Formation progress will appear when logs match the current filters.");
}

function renderProjects(data) {
  byId("projectsDashboard").innerHTML = data.projects.length || data.buildings.length ? `<div class="mini-grid">
    <div class="mini-card"><span>${data.projects.length}</span><strong>Filtered Projects</strong></div>
    <div class="mini-card"><span>${data.projects.filter(isActive).length}</span><strong>Active Projects</strong></div>
    <div class="mini-card"><span>${data.buildings.length}</span><strong>Filtered Building Records</strong></div>
  </div>` : emptyState("No building or project records in current view.", "Projects and building status cards will appear when records match the current filters.");
}

function renderNews(newsItems) {
  const news = [...newsItems].sort((a, b) => (b.date || 0) - (a.date || 0));
  byId("newsDashboard").innerHTML = news.length ? `<div class="mini-grid">
    <div class="mini-card"><span>${news.length}</span><strong>Filtered News</strong></div>
    <div class="mini-card"><span>${news.filter((item) => item.published).length}</span><strong>Published News</strong></div>
    <div class="mini-card"><span>${formatDate(news[0]?.date)}</span><strong>Latest News Date</strong></div>
  </div><div class="news-grid">${news.slice(0, 6).map((item) => `
    <article class="news-card">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.description)}" />` : `<div class="news-placeholder"></div>`}
      <div>${badge(item.published ? "Published" : "Hidden")}<h3>${escapeHtml(item.description || "News update")}</h3><p>${formatDate(item.date)}</p></div>
    </article>
  `).join("")}</div>` : emptyState("No news records in current view", "Latest published service updates will appear when records match the current filters.");
}

function setSelectOptions(id, values) {
  const select = byId(id);
  const current = state.filters[id.replace("filter", "").toLowerCase()] || select.value || "All";
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  const nextValue = values.includes(current) ? current : "All";
  select.value = nextValue;
  state.filters[id.replace("filter", "").toLowerCase()] = nextValue;
}

function populateFilters(activities = state.activities) {
  const selectedCountry = state.filters.country;
  const schoolsForCountry = state.schools.filter((school) => selectedCountry === "All" || school.country === selectedCountry);
  setSelectOptions("filterCountry", ["All", ...unique(activities.map((item) => item.country).concat(state.schools.map((item) => item.country), state.countries.map((item) => item.name)))]);
  setSelectOptions("filterSchool", ["All", ...unique(activities.filter((item) => selectedCountry === "All" || item.country === selectedCountry).map((item) => item.school).concat(schoolsForCountry.map((item) => item.name)))]);
  setSelectOptions("filterModule", ["All", ...unique(activities.map((item) => item.module))]);
  setSelectOptions("filterStatus", ["All", "Completed", "Pending"]);
  setSelectOptions("filterPriority", ["All", ...unique(activities.map((item) => item.priority))]);
}

function bindTableTools() {
  document.querySelectorAll("[data-table-search]").forEach((input) => {
    input.addEventListener("input", () => {
      const tableEl = byId(input.dataset.tableSearch);
      const q = key(input.value);
      tableEl.querySelectorAll("tbody tr").forEach((row) => {
        row.style.display = key(row.textContent).includes(q) ? "" : "none";
      });
    });
  });
  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      const tableEl = byId(button.dataset.export);
      const csv = [...tableEl.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => `"${cell.textContent.replaceAll('"', '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${button.dataset.export}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  });
}

function render() {
  populateFilters(state.activities);
  const filteredData = getFilteredData();
  const schoolHealth = calculateSchoolHealth(filteredData);
  const countrySummary = calculateCountrySummary(filteredData, schoolHealth);
  const issues = detectDataQualityIssues(filteredData);
  const alerts = detectAlerts(schoolHealth, filteredData.activities, filteredData.news);
  renderKpis(calculateKPIs(filteredData));
  renderAlerts(alerts);
  renderCharts(filteredData.activities, schoolHealth);
  renderTables(schoolHealth, countrySummary, filteredData.activities, issues);
  renderPeople(filteredData);
  renderFormation(filteredData.activities);
  renderProjects(filteredData);
  renderNews(filteredData.news);
  bindTableTools();
}

async function loadDashboard() {
  byId("loadStatus").classList.add("is-visible");
  byId("loadStatus").textContent = "Loading published Flame data...";
  state.tables = {};
  try {
    state.sheets = await discoverSheets();
    await Promise.all(state.sheets.map(async (sheet) => {
      try {
        addTable(sheet.name, await loadSheet(sheet));
      } catch (error) {
        console.warn("Could not load sheet", sheet.name, error);
      }
    }));
    state.schools = table("schools").map(normalizeSchool).filter((item) => item.name);
    state.countries = table("countries").map((row) => normalizeEntity(row, "Country")).filter((item) => item.name);
    state.activities = normalizeActivities().map(withDerivedCountry);
    populateFilters(state.activities);
    render();
    byId("lastUpdated").textContent = `Last refreshed ${new Date().toLocaleString()}`;
    byId("loadStatus").classList.remove("is-visible");
  } catch (error) {
    console.error(error);
    byId("loadStatus").textContent = "Could not load the published dashboard data. Please check the published Google Sheet links.";
  }
}

["filterCountry", "filterSchool", "filterModule", "filterStatus", "filterPriority"].forEach((id) => {
  byId(id).addEventListener("change", (event) => {
    state.filters[id.replace("filter", "").toLowerCase()] = event.target.value;
    render();
  });
});

byId("globalSearch").addEventListener("input", (event) => {
  state.filters.search = event.target.value;
  render();
});

byId("refreshData").addEventListener("click", loadDashboard);
byId("printDashboard").addEventListener("click", () => window.print());
loadDashboard();
