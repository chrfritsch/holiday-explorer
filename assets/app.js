/* global window, document, location, history, ResizeObserver, fetch */

// ── Constants ──────────────────────────────────────────────────────────────

const LABEL_WIDTH = 164;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AVAILABLE_YEARS = [window.BUILD_YEAR - 1, window.BUILD_YEAR, window.BUILD_YEAR + 1];

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  year: window.BUILD_YEAR,
  holidayType: "school",
  showNationwideOnly: false,
  dayWidth: 3,
  holidays: null,
  selectedItems: null,   // null = show all countries; Array<RowItem> = custom selection
  filterOpen: false,
  filterQuery: "",
  expandedCountries: new Set(),
};

// ── Date utilities ─────────────────────────────────────────────────────────

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInYear(y) {
  return isLeapYear(y) ? 366 : 365;
}

function daysInMonth(m, y) {
  return new Date(y, m, 0).getDate();
}

function parseParts(str) {
  const [y, m, d] = str.split("-").map(Number);
  return [y, m, d];
}

function dayOffset(dateStr, year) {
  const [y, m, d] = parseParts(dateStr);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(year, 0, 1)) / 86400000);
}

function spanDays(startStr, endStr) {
  const [y1, m1, d1] = parseParts(startStr);
  const [y2, m2, d2] = parseParts(endStr);
  return Math.max(1, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1);
}

function formatDate(str) {
  const [y, m, d] = parseParts(str);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(start, end) {
  if (start === end) return formatDate(start);
  const [y1] = parseParts(start);
  const [y2] = parseParts(end);
  const fmtShort = (s) => { const [y,m,d] = parseParts(s); return new Date(y,m-1,d).toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
  return y1 === y2
    ? `${fmtShort(start)} – ${formatDate(end)}`
    : `${formatDate(start)} – ${formatDate(end)}`;
}

function flagEmoji(iso) {
  return String.fromCodePoint(
    0x1f1e6 + iso.charCodeAt(0) - 65,
    0x1f1e6 + iso.charCodeAt(1) - 65
  );
}

// ── Row helpers ────────────────────────────────────────────────────────────

function getRowsToRender() {
  if (!state.selectedItems) {
    return window.COUNTRIES.map((c) => ({
      id: c.isoCode,
      type: "country",
      isoCode: c.isoCode,
      name: c.name,
    }));
  }
  return state.selectedItems;
}

function getHolidaysForRow(row) {
  if (!state.holidays) return null;
  const types = state.holidayType === "both" ? ["public", "school"] : [state.holidayType];
  const result = [];
  for (const t of types) {
    const key = `${row.isoCode}-${t}-${state.year}`;
    for (const h of state.holidays[key] || []) {
      if (row.type === "country") {
        if (!state.showNationwideOnly || h.nationwide) result.push(h);
      } else {
        // Subdivision row: show nationwide + holidays that include this subdivision
        const applies = h.nationwide || h.subdivisions.some((s) => s.code === row.code);
        if (applies) result.push(h);
      }
    }
  }
  return result;
}

// ── Tooltip ────────────────────────────────────────────────────────────────

let tooltipTimer;
const $tooltip = () => document.getElementById("tooltip");

function showTooltip(e, holiday) {
  clearTimeout(tooltipTimer);
  const el = $tooltip();
  const days = spanDays(holiday.startDate, holiday.endDate);
  const typeLabel = holiday.type === "public" ? "Public" : "School";
  const subNames = holiday.subdivisions.map((s) => s.name).filter(Boolean);
  const scope = holiday.nationwide
    ? "Nationwide"
    : subNames.length > 0
    ? subNames.slice(0, 5).join(", ") + (subNames.length > 5 ? ` +${subNames.length - 5}` : "")
    : "Regional";

  el.innerHTML = `
    <div class="tooltip-name">${holiday.name || "Holiday"}</div>
    <div class="tooltip-dates">${formatDateRange(holiday.startDate, holiday.endDate)}</div>
    <div class="tooltip-meta">
      <span class="tooltip-badge tooltip-badge--${holiday.type}">${typeLabel}</span>
      <span class="tooltip-duration">${days} day${days !== 1 ? "s" : ""}</span>
    </div>
    <div class="tooltip-scope">${scope}</div>
  `;
  el.classList.add("visible");
  positionTooltip(e);
}

function positionTooltip(e) {
  const el = $tooltip();
  const tw = el.offsetWidth || 220;
  const th = el.offsetHeight || 100;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = e.clientX + 16;
  let top = e.clientY - th / 2;
  if (left + tw > vw - 12) left = e.clientX - tw - 16;
  if (top < 8) top = 8;
  if (top + th > vh - 8) top = vh - th - 8;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function hideTooltip() {
  tooltipTimer = setTimeout(() => $tooltip().classList.remove("visible"), 80);
}

// ── Bar rendering ──────────────────────────────────────────────────────────

function renderBar(holiday, container) {
  const yearDays = daysInYear(state.year);
  const startOff = dayOffset(holiday.startDate, state.year);
  const endOff = dayOffset(holiday.endDate, state.year);
  const clampedStart = Math.max(0, startOff);
  const clampedEnd = Math.min(yearDays - 1, endOff);
  if (clampedStart > clampedEnd) return;

  const left = clampedStart * state.dayWidth;
  const width = Math.max(3, (clampedEnd - clampedStart + 1) * state.dayWidth);

  const bar = document.createElement("div");
  bar.className = `holiday-bar holiday-bar--${holiday.type}${holiday.nationwide ? "" : " holiday-bar--regional"}`;
  bar.style.cssText = `left:${left}px;width:${width}px`;
  bar.setAttribute("aria-label", `${holiday.name}: ${formatDateRange(holiday.startDate, holiday.endDate)}`);
  bar.addEventListener("mouseenter", (e) => showTooltip(e, holiday));
  bar.addEventListener("mousemove", positionTooltip);
  bar.addEventListener("mouseleave", hideTooltip);
  container.appendChild(bar);
}

function renderRow(row) {
  const holidays = getHolidaysForRow(row);
  const isSubdivision = row.type === "subdivision";

  const rowEl = document.createElement("div");
  rowEl.className = `country-row${isSubdivision ? " country-row--subdivision" : ""}`;
  rowEl.dataset.id = row.id;

  const label = document.createElement("div");
  label.className = "row-label";

  if (isSubdivision) {
    const country = window.COUNTRIES.find((c) => c.isoCode === row.isoCode);
    label.innerHTML = `
      <span class="row-flag">${flagEmoji(row.isoCode)}</span>
      <span class="row-name">${row.name}</span>
      <span class="row-sub-tag">${row.isoCode}</span>
    `;
    label.title = `${row.name} (${country?.name ?? row.isoCode})`;
  } else {
    label.innerHTML = `
      <span class="row-flag">${flagEmoji(row.isoCode)}</span>
      <span class="row-name">${row.name}</span>
    `;
  }

  const bars = document.createElement("div");
  bars.className = "row-bars";
  bars.style.width = `${daysInYear(state.year) * state.dayWidth}px`;

  if (holidays === null) {
    const positions = [{ l: "8%", w: "12%" }, { l: "30%", w: "8%" }, { l: "55%", w: "15%" }, { l: "82%", w: "10%" }];
    for (const pos of positions) {
      const sk = document.createElement("div");
      sk.className = "row-skeleton";
      sk.style.left = pos.l;
      sk.style.width = pos.w;
      bars.appendChild(sk);
    }
  } else if (holidays.length === 0) {
    const empty = document.createElement("div");
    empty.className = "row-empty";
    empty.textContent = "–";
    bars.appendChild(empty);
  } else {
    for (const h of holidays) renderBar(h, bars);
  }

  rowEl.appendChild(label);
  rowEl.appendChild(bars);
  return rowEl;
}

// ── Timeline ───────────────────────────────────────────────────────────────

function renderMonthHeader() {
  const header = document.getElementById("month-header");
  header.innerHTML = "";
  const spacer = document.createElement("div");
  spacer.className = "month-header-spacer";
  header.appendChild(spacer);
  const monthsEl = document.createElement("div");
  monthsEl.className = "month-header-months";
  for (let m = 1; m <= 12; m++) {
    const days = daysInMonth(m, state.year);
    const el = document.createElement("div");
    el.className = "month-label";
    el.style.width = `${days * state.dayWidth}px`;
    el.textContent = days * state.dayWidth > 28 ? MONTHS[m - 1] : days * state.dayWidth > 14 ? MONTHS[m - 1][0] : "";
    monthsEl.appendChild(el);
  }
  header.appendChild(monthsEl);
}

function renderTodayMarker(container) {
  const existing = document.getElementById("today-marker");
  if (existing) existing.remove();
  const today = new Date();
  if (today.getFullYear() !== state.year) return;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const offset = dayOffset(todayStr, state.year);
  if (offset < 0 || offset >= daysInYear(state.year)) return;
  const marker = document.createElement("div");
  marker.id = "today-marker";
  marker.style.left = `${LABEL_WIDTH + offset * state.dayWidth}px`;
  container.prepend(marker);
}

function renderTimeline() {
  const container = document.getElementById("timeline-container");
  const rowsContainer = document.getElementById("rows-container");
  const availableWidth = container.clientWidth - LABEL_WIDTH - 1;
  state.dayWidth = Math.max(2, availableWidth / daysInYear(state.year));
  renderMonthHeader();
  rowsContainer.innerHTML = "";
  renderTodayMarker(rowsContainer);
  for (const row of getRowsToRender()) {
    rowsContainer.appendChild(renderRow(row));
  }
}

// ── Filter dropdown ────────────────────────────────────────────────────────

function isItemSelected(id) {
  if (!state.selectedItems) return false;
  return state.selectedItems.some((item) => item.id === id);
}

function toggleItem(newItem) {
  if (!state.selectedItems) {
    // First selection: start a new custom set with just this item
    state.selectedItems = [newItem];
  } else {
    const idx = state.selectedItems.findIndex((i) => i.id === newItem.id);
    if (idx >= 0) {
      state.selectedItems.splice(idx, 1);
      if (state.selectedItems.length === 0) state.selectedItems = null;
    } else {
      state.selectedItems.push(newItem);
    }
  }
  renderChipBar();
  renderFilterList();
  renderTimeline();
  updateFilterBtn();
}

function clearSelection() {
  state.selectedItems = null;
  renderChipBar();
  renderFilterList();
  renderTimeline();
  updateFilterBtn();
}

function updateFilterBtn() {
  const btn = document.getElementById("filter-btn");
  const label = document.getElementById("filter-btn-label");
  const count = state.selectedItems ? state.selectedItems.length : null;
  btn.classList.toggle("active", !!state.selectedItems);
  label.textContent = state.selectedItems
    ? `${count} selected`
    : "All countries";
}

function renderChipBar() {
  const bar = document.getElementById("chip-bar");
  const container = document.getElementById("chips-container");
  if (!state.selectedItems || state.selectedItems.length === 0) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  container.innerHTML = "";
  for (const item of state.selectedItems) {
    const chip = document.createElement("div");
    chip.className = "chip";
    const isSub = item.type === "subdivision";
    chip.innerHTML = `
      <span class="chip-flag">${flagEmoji(item.isoCode)}</span>
      <span class="chip-name">${item.name}${isSub ? `<span class="chip-sub-tag"> · ${item.isoCode}</span>` : ""}</span>
      <button class="chip-remove" data-id="${item.id}" title="Remove ${item.name}">✕</button>
    `;
    container.appendChild(chip);
  }

  // Wire remove buttons
  container.querySelectorAll(".chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const item = state.selectedItems.find((i) => i.id === id);
      if (item) toggleItem(item);
    });
  });
}

function renderFilterList() {
  const listEl = document.getElementById("filter-list");
  const q = state.filterQuery.toLowerCase();
  listEl.innerHTML = "";

  let hasResults = false;

  for (const country of window.COUNTRIES) {
    const subs = (window.SUBDIVISIONS?.[country.isoCode] || []);
    const countryMatches = !q || country.name.toLowerCase().includes(q);
    const matchingSubs = subs.filter((s) => !q ||
      s.name.toLowerCase().includes(q) ||
      s.shortName.toLowerCase().includes(q) ||
      (s.allNames || []).some((n) => n.toLowerCase().includes(q)));

    if (!countryMatches && matchingSubs.length === 0) continue;
    hasResults = true;

    // Country item
    const countryId = country.isoCode;
    const countrySelected = isItemSelected(countryId);
    const isExpanded = state.expandedCountries.has(countryId) || (q && matchingSubs.length > 0);

    const countryEl = document.createElement("div");
    countryEl.className = `filter-item filter-item--country${countrySelected ? " selected" : ""}`;
    countryEl.dataset.id = countryId;
    countryEl.innerHTML = `
      <div class="filter-item-check">${countrySelected ? "✓" : ""}</div>
      <span class="filter-item-flag">${flagEmoji(country.isoCode)}</span>
      <span class="filter-item-name">${country.name}</span>
      ${subs.length > 0 ? `<button class="filter-item-expand${isExpanded ? " open" : ""}" data-iso="${country.isoCode}" title="Show regions">▸</button>` : ""}
    `;

    // Click on row (not the expand button) toggles the country
    countryEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("filter-item-expand")) return;
      toggleItem({ id: countryId, type: "country", isoCode: country.isoCode, name: country.name });
    });

    // Expand button
    const expandBtn = countryEl.querySelector(".filter-item-expand");
    if (expandBtn) {
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.expandedCountries.has(country.isoCode)) {
          state.expandedCountries.delete(country.isoCode);
        } else {
          state.expandedCountries.add(country.isoCode);
        }
        renderFilterList();
      });
    }

    listEl.appendChild(countryEl);

    // Subdivision items
    if ((isExpanded || q) && matchingSubs.length > 0) {
      const subsContainer = document.createElement("div");
      subsContainer.className = `filter-subitems${isExpanded ? " open" : ""}`;

      for (const sub of matchingSubs) {
        const subSelected = isItemSelected(sub.code);
        const subEl = document.createElement("div");
        subEl.className = `filter-item filter-item--sub${subSelected ? " selected" : ""}`;
        subEl.dataset.id = sub.code;
        subEl.innerHTML = `
          <div class="filter-item-check">${subSelected ? "✓" : ""}</div>
          <span class="filter-item-name">${sub.name} <small>${sub.shortName}</small></span>
        `;
        subEl.addEventListener("click", () => {
          toggleItem({
            id: sub.code,
            type: "subdivision",
            isoCode: country.isoCode,
            code: sub.code,
            name: sub.name,
          });
        });
        subsContainer.appendChild(subEl);
      }
      listEl.appendChild(subsContainer);
    }
  }

  if (!hasResults) {
    const empty = document.createElement("div");
    empty.className = "filter-empty";
    empty.textContent = "No results found";
    listEl.appendChild(empty);
  }
}

function openFilter() {
  state.filterOpen = true;
  const dropdown = document.getElementById("filter-dropdown");
  const btn = document.getElementById("filter-btn");
  const rect = btn.getBoundingClientRect();
  dropdown.classList.remove("hidden");
  btn.setAttribute("aria-expanded", "true");
  // Position below the button
  dropdown.style.top = `${rect.bottom + 6}px`;
  dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 296)}px`;
  renderFilterList();
  document.getElementById("filter-search").focus();
}

function closeFilter() {
  state.filterOpen = false;
  document.getElementById("filter-dropdown").classList.add("hidden");
  document.getElementById("filter-btn").setAttribute("aria-expanded", "false");
}

function setupFilterUI() {
  const btn = document.getElementById("filter-btn");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.filterOpen ? closeFilter() : openFilter();
  });

  document.getElementById("filter-search").addEventListener("input", (e) => {
    state.filterQuery = e.target.value;
    renderFilterList();
  });

  document.getElementById("chip-clear-all").addEventListener("click", clearSelection);

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (state.filterOpen && !document.getElementById("filter-dropdown").contains(e.target)) {
      closeFilter();
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.filterOpen) closeFilter();
  });
}

// ── Controls ───────────────────────────────────────────────────────────────

function updateYearDisplay() {
  document.getElementById("year-display").textContent = state.year;
  document.getElementById("year-prev").disabled = state.year <= AVAILABLE_YEARS[0];
  document.getElementById("year-next").disabled = state.year >= AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1];
}

function setYear(year) {
  state.year = year;
  updateYearDisplay();
  renderTimeline();
  updateHash();
}

function setType(type) {
  state.holidayType = type;
  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  renderTimeline();
  updateHash();
}

function setupControls() {
  document.getElementById("year-prev").addEventListener("click", () => {
    if (state.year > AVAILABLE_YEARS[0]) setYear(state.year - 1);
  });
  document.getElementById("year-next").addEventListener("click", () => {
    if (state.year < AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]) setYear(state.year + 1);
  });

  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.addEventListener("click", () => setType(btn.dataset.type));
  });

  document.getElementById("nationwide-only").addEventListener("change", (e) => {
    state.showNationwideOnly = e.target.checked;
    renderTimeline();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || state.filterOpen) return;
    if (e.key === "ArrowLeft") document.getElementById("year-prev").click();
    if (e.key === "ArrowRight") document.getElementById("year-next").click();
  });
}

// ── URL hash ───────────────────────────────────────────────────────────────

function parseHash() {
  const hash = location.hash.replace("#", "");
  const [yearStr, typeStr] = hash.split("/");
  const year = parseInt(yearStr, 10);
  return {
    year: AVAILABLE_YEARS.includes(year) ? year : window.BUILD_YEAR,
    type: ["public", "school", "both"].includes(typeStr) ? typeStr : "school",
  };
}

function updateHash() {
  history.replaceState(null, "", `#${state.year}/${state.holidayType}`);
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadHolidays() {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error-banner");
  loadingEl.classList.remove("hidden");
  try {
    const res = await fetch("/data/holidays.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.holidays = await res.json();
  } catch (e) {
    errorEl.textContent = "Failed to load holiday data. Please refresh the page.";
    errorEl.classList.remove("hidden");
  }
  loadingEl.classList.add("hidden");
  renderTimeline();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

let resizeDebounce;

function init() {
  const { year, type } = parseHash();
  state.year = year;
  state.holidayType = type;

  setupControls();
  setupFilterUI();
  updateYearDisplay();
  setType(type);
  renderTimeline();
  loadHolidays();

  const observer = new ResizeObserver(() => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(renderTimeline, 200);
  });
  observer.observe(document.getElementById("timeline-container"));

  window.addEventListener("hashchange", () => {
    const parsed = parseHash();
    state.year = parsed.year;
    updateYearDisplay();
    setType(parsed.type);
    renderTimeline();
  });
}

document.addEventListener("DOMContentLoaded", init);
