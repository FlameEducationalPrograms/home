const SHEET_PUBHTML_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSRXJ-jhwIECRf7DMDJQpCSDN6PAR0e0hN3UINjqsuZUvOnfApgN2wGRmzjC3XyqJ1boQJrfDTB4ie2/pubhtml";
const TARGET_SHEET_NAME = "curriculum";

const state = {
  records: [],
  filtered: [],
  search: "",
  folder: "All",
};

const $ = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
const unique = (items) => [...new Set(items.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/*
  IMPORTANT FOR PDF FILES
  The Google Sheet PDF File column usually stores AppSheet/Drive file paths such as:
  curriculum_Files/deecf966.PDF File.222400.pdf

  These are NOT public URLs by themselves. To make Open/Download work, either:
  1) Upload the full curriculum_Files folder beside curriculum.html on GitHub Pages, or
  2) Put real public https:// PDF URLs in the sheet, or
  3) Set PDF_BASE_URL below to the public folder URL that contains curriculum_Files.

  Example:
  const PDF_BASE_URL = "https://flameeducationalprograms.github.io/home/";
*/
const PDF_BASE_URL = "";
const DRIVE_FOLDER_ID = "1hr9OR4MvaK3hXzVQ1P4A3zRVTXRfOMTP";
const DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`;

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(clean(value));
}

function fileNameFromPath(path) {
  const raw = clean(path);
  if (!raw) return "curriculum.pdf";
  const name = raw.split(/[\\/]/).pop() || "curriculum.pdf";
  return name.endsWith(".pdf") ? name : `${name}.pdf`;
}

function makeDriveFolderSearchUrl(path) {
  const fileName = fileNameFromPath(path);
  return `${DRIVE_FOLDER_URL}?q=${encodeURIComponent(fileName)}`;
}

function joinPdfBase(path) {
  const raw = clean(path);
  if (!raw) return "";
  if (isAbsoluteUrl(raw)) return raw;

  const encodedPath = raw
    .replace(/^curriculum_Files\//i, "curriculum_Files_/")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  if (PDF_BASE_URL) {
    return `${PDF_BASE_URL.replace(/\/$/, "")}/${encodedPath}`;
  }

  // Google Drive folder links do not expose a stable public file URL from the filename alone.
  // For relative AppSheet paths, open the shared Drive folder filtered by the detected filename.
  return makeDriveFolderSearchUrl(raw);
}

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
    if (introVideo.paused) await introVideo.play().catch(() => {});
    else introVideo.pause();
    updateVideoButton();
  });

  soundControl.addEventListener("click", async () => {
    introVideo.muted = !introVideo.muted;
    if (!introVideo.muted && introVideo.paused) await introVideo.play().catch(() => {});
    updateVideoButton();
  });

  introVideo.addEventListener("play", updateVideoButton);
  introVideo.addEventListener("pause", updateVideoButton);
  introVideo.addEventListener("volumechange", updateVideoButton);
  updateVideoButton();
}

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
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
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
    sheets.push({ name: match[1], gid: match[3], base: workbookUrl.replace(/\/pubhtml.*$/, "") });
    match = regex.exec(html);
  }
  return sheets;
}

async function discoverCurriculumSheet() {
  const response = await fetch(SHEET_PUBHTML_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not inspect workbook: ${response.status}`);
  const html = await response.text();
  const sheets = discoverSheetsFromHtml(html, SHEET_PUBHTML_URL);
  const target = sheets.find((sheet) => key(sheet.name) === key(TARGET_SHEET_NAME)) || sheets[0];
  if (!target) throw new Error("No published sheets were detected.");
  return target;
}

async function loadCurriculumRows() {
  const sheet = await discoverCurriculumSheet();
  const url = `${sheet.base}/pub?gid=${sheet.gid}&single=true&output=csv`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load curriculum CSV: ${response.status}`);
  return rowsFromCsv(await response.text()).map(normalizeRecord).filter((record) => record.description || record.pdfFile);
}

function normalizeRecord(row) {
  const pdfFile = get(row, ["PDF File", "PDF", "File", "Attachment", "Document", "Link"]);
  return {
    id: get(row, ["ID", "Key", "Row ID"]),
    pdfFile,
    description: get(row, ["Description", "Lesson", "Title", "Topic"], "Untitled curriculum file"),
    folderName: get(row, ["Folder Name", "Folder", "Category"]),
    notes: get(row, ["Notes", "Note", "Comment", "Comments"]),
    raw: row,
  };
}

function makePdfUrl(value) {
  return joinPdfBase(value);
}

function isRelativePdfPath(value) {
  const raw = clean(value);
  return Boolean(raw) && !isAbsoluteUrl(raw);
}

async function openPdfSafely(event, url, rawPath) {
  event.preventDefault();

  if (!url) return;

  // Direct https:// PDF links open directly. Relative AppSheet paths open as a Drive folder search by filename.
  window.open(url, "_blank", "noopener");
}

function downloadPdfSafely(event, url, rawPath, fileName) {
  event.preventDefault();

  if (!url) return;

  if (isRelativePdfPath(rawPath)) {
    window.open(url, "_blank", "noopener");
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "curriculum.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function highlightDescription(text) {
  const value = escapeHtml(text);
  const query = clean(state.search);
  if (!query) return value;
  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`(${safeQuery})`, "gi"), "<mark>$1</mark>");
}

function applyFilters() {
  const searchKey = key(state.search);
  state.filtered = state.records.filter((record) => {
    const matchesSearch = !searchKey || key(record.description).includes(searchKey);
    const matchesFolder = state.folder === "All" || record.folderName === state.folder;
    return matchesSearch && matchesFolder;
  });
}

function updateFolderOptions() {
  const current = $("folderFilter").value || "All";
  const folders = ["All", ...unique(state.records.map((record) => record.folderName))];
  $("folderFilter").innerHTML = folders.map((folder) => `<option value="${escapeHtml(folder)}">${folder === "All" ? "All folders" : escapeHtml(folder)}</option>`).join("");
  $("folderFilter").value = folders.includes(current) ? current : "All";
}

function emptyState(title, detail = "No curriculum files match this view.") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function renderKpis() {
  $("kpiFiles").textContent = state.filtered.length.toLocaleString();
  $("kpiFolders").textContent = unique(state.records.map((record) => record.folderName)).length.toLocaleString();
  $("kpiSearch").textContent = state.search || state.folder !== "All" ? "Filtered" : "All";
}

function renderLibrary() {
  $("libraryGrid").innerHTML = state.filtered.length ? state.filtered.map((record) => {
    const pdfUrl = makePdfUrl(record.pdfFile);
    const fileName = fileNameFromPath(record.pdfFile || record.description);
    const hasPdf = Boolean(pdfUrl);
    return `<article class="curriculum-card">
      <div class="card-top">
        <span class="pdf-icon">PDF</span>
        <div>
          <p class="eyebrow">Curriculum File</p>
          <h3 class="description">${highlightDescription(record.description)}</h3>
        </div>
      </div>
      <div class="meta-grid">
        ${record.folderName ? `<span><strong>Folder:</strong> ${escapeHtml(record.folderName)}</span>` : ""}
        ${record.notes ? `<span><strong>Notes:</strong> ${escapeHtml(record.notes)}</span>` : ""}
        ${record.id ? `<span><strong>ID:</strong> ${escapeHtml(record.id)}</span>` : ""}
        ${record.pdfFile ? `<span><strong>PDF file:</strong> ${escapeHtml(record.pdfFile)}</span>` : ""}
      </div>
      <div class="card-actions">
        ${hasPdf ? `<a href="${escapeHtml(pdfUrl)}" data-open-pdf data-url="${escapeHtml(pdfUrl)}" data-raw-path="${escapeHtml(record.pdfFile)}">${isRelativePdfPath(record.pdfFile) ? "Open in Drive" : "Open PDF"}</a>` : ""}
      </div>
    </article>`;
  }).join("") : emptyState("No curriculum files found", "Try another description search or clear the filters.");
}

function render() {
  applyFilters();
  renderKpis();
  renderLibrary();
}

function bindEvents() {
  $("descriptionSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  $("folderFilter").addEventListener("change", (event) => {
    state.folder = event.target.value;
    render();
  });
  $("clearSearch").addEventListener("click", () => {
    state.search = "";
    state.folder = "All";
    $("descriptionSearch").value = "";
    $("folderFilter").value = "All";
    render();
  });
  $("refreshData").addEventListener("click", loadCurriculum);

  $("libraryGrid").addEventListener("click", (event) => {
    const openLink = event.target.closest("[data-open-pdf]");
    if (openLink) {
      openPdfSafely(event, openLink.dataset.url, openLink.dataset.rawPath);
      return;
    }

  });
}

async function loadCurriculum() {
  const status = $("loadStatus");
  status.classList.add("is-visible");
  status.textContent = "Loading curriculum records...";
  try {
    state.records = await loadCurriculumRows();
    updateFolderOptions();
    state.folder = $("folderFilter").value || "All";
    render();
    $("lastUpdated").textContent = `Last updated ${new Date().toLocaleString()}`;
    status.textContent = state.records.length ? `Loaded ${state.records.length.toLocaleString()} curriculum files.` : "No curriculum records were found.";
    setTimeout(() => status.classList.remove("is-visible"), 2600);
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load the curriculum sheet. Please check that the Google Sheet is published to the web.";
    $("lastUpdated").textContent = "Loading failed";
  }
}

bindEvents();
loadCurriculum();
