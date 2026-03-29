import {
  compareISODate,
  formatDate,
  formatDateTime,
  getCalendarLeadingBlanks,
  getMonthDates,
  getMonthKey,
  monthFirstDay,
  shiftMonth,
  todayISO
} from "./date-utils.js";

import {
  CATEGORY_LABEL_MAP,
  CATEGORY_OPTIONS,
  MODE_LABEL_MAP,
  MODE_OPTIONS,
  PRESET_COLORS,
  STATUS_LABEL_MAP,
  STATUS_OPTIONS,
  archiveTask,
  checkInTask,
  clearData,
  createTask,
  deleteRecord,
  deleteTask,
  exportData,
  getCategoryDistribution,
  getDataOverview,
  getDateDetail,
  getRecordById,
  getStatsOverview,
  getTaskById,
  getTaskCompletionRanking,
  getTaskList,
  getTaskRecords,
  getTodayOverview,
  getTrend,
  importData,
  subscribe,
  updateRecordDiary,
  updateTask,
  getCalendarSummary
} from "./store.js";

const root = document.getElementById("app");

const uiState = {
  route: getRoute(),
  currentMonth: getMonthKey(todayISO()),
  selectedDate: todayISO(),
  taskFilters: {
    category: "all",
    mode: "all",
    status: "all",
    color: "all"
  },
  modal: null,
  toast: null
};

let toastTimer = null;

const COLOR_LABEL_MAP = {
  "#3B82F6": "\u5929\u7a7a\u84dd",
  "#10B981": "\u677e\u77f3\u7eff",
  "#F97316": "\u6d3b\u529b\u6a59",
  "#EF4444": "\u756a\u8304\u7ea2",
  "#8B5CF6": "\u8461\u8404\u7d2b",
  "#EAB308": "\u7425\u73c0\u9ec4",
  "#14B8A6": "\u6e56\u6c34\u9752",
  "#6366F1": "\u7535\u5149\u975b"
};

const CATEGORY_CHART_COLORS = {
  study: "#4F7CF7",
  exercise: "#15A372",
  custom: "#EE9A32"
};

function getRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const route = hash.startsWith("/") ? hash : `/${hash}`;
  const valid = new Set(["/", "/tasks", "/stats", "/data"]);
  return valid.has(route) ? route : "/";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPercent(rate) {
  return `${Math.round((rate || 0) * 100)}%`;
}

function getColorLabel(color) {
  return COLOR_LABEL_MAP[color] || color;
}

function getCategoryLabel(category, customCategoryName = "") {
  if (category === "custom") {
    const text = String(customCategoryName || "").trim();
    return text || CATEGORY_LABEL_MAP.custom;
  }
  return CATEGORY_LABEL_MAP[category] || CATEGORY_LABEL_MAP.custom;
}

function showToast(message, type = "success") {
  uiState.toast = {
    id: Date.now(),
    message,
    type
  };
  render();

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    uiState.toast = null;
    render();
  }, 2200);
}

function safeRun(fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      result.catch((error) => {
        showToast(error.message || "\u64cd\u4f5c\u5931\u8d25", "error");
      });
    }
  } catch (error) {
    showToast(error.message || "\u64cd\u4f5c\u5931\u8d25", "error");
  }
}

function trendGeometry(data, width = 640, height = 220, padding = 24) {
  const max = Math.max(1, ...data.map((item) => item.count));
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;

  const points = data.map((item, index) => {
    const x = padding + step * index;
    const y = padding + innerHeight - (item.count / max) * innerHeight;
    return {
      ...item,
      x,
      y,
      dayLabel: Number(item.date.slice(-2))
    };
  });

  if (!points.length) {
    return {
      width,
      height,
      points: [],
      max,
      linePath: "",
      areaPath: "",
      baseline: height - padding
    };
  }

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const baseline = height - padding;
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} L ${points[0].x.toFixed(2)} ${baseline.toFixed(2)} Z`;

  return {
    width,
    height,
    points,
    max,
    linePath,
    areaPath,
    baseline
  };
}

function renderTrendChart(data, accentClass = "accent-a", windowLabel = "", selectedDate = todayISO()) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const geometry = trendGeometry(data);
  const peak = data.length ? Math.max(...data.map((item) => item.count)) : 0;
  const gradientId = `trend-${accentClass}-${data.length}`;
  const labelStep = Math.max(1, Math.floor(data.length / 6));
  const selectedPoint = geometry.points.find((point) => point.date === selectedDate) || null;

  return `
    <div class="trend-meta">
      <span>\u7d2f\u8ba1\u6253\u5361 ${total} \u6b21</span>
      <span>\u5cf0\u503c ${peak} \u6b21/\u5929</span>
    </div>

    <div class="trend-linked ${selectedPoint ? "is-hit" : "is-miss"}">
      <span>\u8054\u52a8\u65e5\u671f ${selectedDate}</span>
      <b>${selectedPoint ? `${selectedPoint.count} \u6b21` : "\u4e0d\u5728\u8be5\u65f6\u95f4\u7a97"}</b>
    </div>

    <div class="trend-chart ${accentClass}">
      <svg viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.3"></stop>
            <stop offset="100%" stop-color="currentColor" stop-opacity="0.02"></stop>
          </linearGradient>
        </defs>

        ${[0, 0.25, 0.5, 0.75, 1]
          .map((level) => {
            const y = 24 + (geometry.height - 48) * level;
            return `<line x1="24" y1="${y.toFixed(1)}" x2="${(geometry.width - 24).toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
          })
          .join("")}

        ${selectedPoint
          ? `<line class="trend-focus" x1="${selectedPoint.x.toFixed(2)}" y1="24" x2="${selectedPoint.x.toFixed(2)}" y2="${(geometry.height - 24).toFixed(2)}"></line>`
          : ""}

        <path class="trend-area" d="${geometry.areaPath}" fill="url(#${gradientId})"></path>
        <path class="trend-line" d="${geometry.linePath}"></path>

        ${geometry.points
          .map((point) => {
            const isSelected = point.date === selectedDate;
            return `
              <circle
                class="trend-point-hit ${isSelected ? "is-selected" : ""}"
                cx="${point.x.toFixed(2)}"
                cy="${point.y.toFixed(2)}"
                r="9"
                data-trend-point="1"
                data-window="${escapeHtml(windowLabel)}"
                data-date="${point.date}"
                data-count="${point.count}"
                data-action="select-date"
              ></circle>
              <circle class="trend-point ${isSelected ? "is-selected" : ""}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${isSelected ? "5.2" : "3.8"}"></circle>
            `;
          })
          .join("")}
      </svg>

      <div class="trend-axis">
        ${geometry.points
          .map((point, index) => {
            const shouldShow = index === 0 || index === geometry.points.length - 1 || index % labelStep === 0 || point.date === selectedDate;
            if (!shouldShow) {
              return "";
            }
            return `
              <span
                class="${point.date === selectedDate ? "is-selected" : ""}"
                data-action="select-date"
                data-date="${point.date}"
              >${point.dayLabel}</span>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderCategoryChart(category) {
  const total = category.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;

  const gradient = total
    ? `conic-gradient(${category
        .map((item) => {
          const sweep = (item.count / total) * 360;
          const start = cursor;
          cursor += sweep;
          const color = CATEGORY_CHART_COLORS[item.category] || "#94a3b8";
          return `${color} ${start.toFixed(2)}deg ${cursor.toFixed(2)}deg`;
        })
        .join(",")})`
    : "conic-gradient(#d8e1f0 0deg 360deg)";

  return `
    <div class="category-chart-wrap">
      <div class="category-donut" style="background:${gradient}">
        <div>
          <strong>${total}</strong>
          <span>\u4efb\u52a1\u603b\u6570</span>
        </div>
      </div>

      <div class="category-bars">
        ${category
          .map((item) => {
            const color = CATEGORY_CHART_COLORS[item.category] || "#94a3b8";
            return `
              <div class="cat-row">
                <span>${item.label}</span>
                <div class="cat-track">
                  <div class="cat-fill" style="width:${Math.round(item.percentage * 100)}%; background:${color}"></div>
                </div>
                <b>${item.count} (${formatPercent(item.percentage)})</b>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderRankingList(ranking) {
  if (!ranking.length) {
    return '<p class="empty">\u6682\u65e0\u7edf\u8ba1\u6570\u636e</p>';
  }

  return `
    <div class="ranking-list">
      ${ranking.slice(0, 12)
        .map((item, index) => {
          const normalized = item.rate === null ? (item.actual > 0 ? 1 : 0) : Math.max(0, Math.min(1, item.rate));
          const label = item.rate === null ? (item.actual > 0 ? "\u5df2\u5b8c\u6210" : "\u672a\u5b8c\u6210") : formatPercent(item.rate);
          const extra = item.expected > 0 ? `${item.actual}/${item.expected}` : `${item.actual} \u6b21`;

          return `
            <article class="ranking-item ${item.rate === null ? "is-goal" : ""}">
              <span class="rank-index">${index + 1}</span>
              <div class="rank-main">
                <strong>${escapeHtml(item.name)}</strong>
                <p>${MODE_LABEL_MAP[item.mode]} · ${extra}</p>
                <div class="rank-track">
                  <div class="rank-fill" style="width:${Math.round(normalized * 100)}%"></div>
                </div>
              </div>
              <b>${label}</b>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}
function openTaskForm(taskId = null) {
  const task = taskId ? getTaskById(taskId) : null;
  uiState.modal = {
    type: "task-form",
    taskId,
    formData: task
      ? {
          name: task.name,
          category: task.category,
          mode: task.mode,
          startDate: task.startDate,
          endDate: task.endDate || "",
          enableDiary: task.enableDiary,
          description: task.description,
          color: task.color,
          goalTargetText: task.goalTargetText || ""
        }
      : {
          name: "",
          category: "study",
          mode: "daily",
          startDate: todayISO(),
          endDate: "",
          enableDiary: false,
          description: "",
          color: PRESET_COLORS[0],
          goalTargetText: ""
        }
  };
  render();
}

function openCheckinModal(taskId, bizDate = null) {
  const task = getTaskById(taskId);
  if (!task) {
    showToast("\u4efb\u52a1\u4e0d\u5b58\u5728", "error");
    return;
  }

  const targetDate = bizDate || todayISO();
  const existingRecord = getTaskRecords(taskId).find((record) => record.bizDate === targetDate);

  uiState.modal = {
    type: "checkin",
    taskId,
    formData: {
      bizDate: targetDate,
      diary: existingRecord?.diary || ""
    }
  };
  render();
}

function openRecordModal(recordIds, index = 0) {
  if (!recordIds.length) {
    showToast("\u6682\u65e0\u8bb0\u5f55", "error");
    return;
  }

  uiState.modal = {
    type: "record-detail",
    recordIds,
    index,
    diaryDraft: null
  };
  render();
}

function closeModal() {
  uiState.modal = null;
  render();
}

function buildLayout(content) {
  return `
    <div class="app-shell">
      <header class="top-nav">
        <div class="brand">
          <div class="brand-mark">C</div>
          <div>
            <h1>Checkin Rhythm</h1>
            <p>\u4e2a\u4eba\u4efb\u52a1\u6253\u5361\u4e0e\u590d\u76d8</p>
          </div>
        </div>

        <nav class="main-nav">
          ${[
            { route: "/", label: "\u9996\u9875/\u65e5\u5386" },
            { route: "/tasks", label: "\u4efb\u52a1\u7ba1\u7406" },
            { route: "/stats", label: "\u7edf\u8ba1\u5206\u6790" },
            { route: "/data", label: "\u6570\u636e\u7ba1\u7406" }
          ]
            .map(
              (item) => `
                <a href="#${item.route}" class="${uiState.route === item.route ? "is-active" : ""}">${item.label}</a>
              `
            )
            .join("")}
        </nav>

        <button class="primary-btn" data-action="open-task-create">\u65b0\u5efa\u4efb\u52a1</button>
      </header>

      <main class="page-wrap">
        ${content}
      </main>

      ${renderModal()}
      ${renderToast()}
      <div id="chart-tooltip" class="chart-tooltip" hidden></div>
    </div>
  `;
}

function renderHomePage() {
  const month = uiState.currentMonth;
  const summary = getCalendarSummary(month);
  const overview = getTodayOverview();
  const detail = getDateDetail(uiState.selectedDate);
  const monthDates = getMonthDates(month);
  const leadingBlanks = getCalendarLeadingBlanks(month);

  const monthLabel = month.replace("-", "\u5e74") + "\u6708";

  return `
    <section class="home-layout">
      <aside class="overview-panel">
        <h2>\u4eca\u65e5\u6982\u89c8</h2>
        <div class="overview-grid">
          <article>
            <p>\u5f85\u6253\u5361</p>
            <strong>${overview.pendingCount}</strong>
          </article>
          <article>
            <p>\u5df2\u5b8c\u6210</p>
            <strong>${overview.doneToday}</strong>
          </article>
          <article>
            <p>\u8fde\u7eed\u6253\u5361</p>
            <strong>${overview.streakDays} \u5929</strong>
          </article>
          <article>
            <p>\u672c\u6708\u5b8c\u6210\u7387</p>
            <strong>${formatPercent(overview.monthCompletionRate)}</strong>
            <small>${overview.monthActual}/${overview.monthExpected || 0}</small>
          </article>
        </div>
      </aside>

      <section class="calendar-panel">
        <header class="panel-head">
          <h2>${monthLabel}</h2>
          <div class="month-switch">
            <button data-action="switch-month" data-direction="prev">\u4e0a\u6708</button>
            <button data-action="switch-month" data-direction="next">\u4e0b\u6708</button>
          </div>
        </header>

        <div class="calendar-week-head">
          ${["\u4e00", "\u4e8c", "\u4e09", "\u56db", "\u4e94", "\u516d", "\u65e5"].map((name) => `<span>${name}</span>`).join("")}
        </div>

        <div class="calendar-grid">
          ${Array.from({ length: leadingBlanks })
            .map(() => '<div class="calendar-blank"></div>')
            .join("")}

          ${monthDates
            .map((date) => {
              const daySummary = summary[date] || { total: 0, completed: 0, hasDiary: false, hasGoal: false };
              const dayNumber = Number(date.slice(-2));
              const isToday = date === todayISO();
              const isSelected = date === uiState.selectedDate;
              const ratioText = daySummary.total ? `${daySummary.completed}/${daySummary.total}` : "-";

              return `
                <button
                  class="calendar-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}"
                  data-action="select-date"
                  data-date="${date}"
                >
                  <span class="date-num">${dayNumber}</span>
                  <span class="cell-ratio">${ratioText}</span>
                  <span class="cell-marks">
                    ${daySummary.hasDiary ? '<i class="mark diary"></i>' : ""}
                    ${daySummary.hasGoal ? '<i class="mark goal"></i>' : ""}
                  </span>
                </button>
              `;
            })
            .join("")}
        </div>
      </section>

      <aside class="detail-panel">
        <h2>${formatDate(detail.date)} \u8be6\u60c5</h2>

        <div class="task-day-list">
          ${detail.items.length
            ? detail.items
                .map(
                  (item) => `
                    <article class="task-day-item" style="--task-color:${item.color}">
                      <div class="item-main">
                        <h3><i style="background:${item.color}"></i>${escapeHtml(item.taskName)}</h3>
                        <p>${getCategoryLabel(item.category, item.customCategoryName)} · ${MODE_LABEL_MAP[item.mode]} · ${item.statusText}</p>
                      </div>
                      <div class="item-actions">
                        ${item.canCheckin ? `<button data-action="open-checkin" data-task-id="${item.taskId}" data-biz-date="${detail.date}">\u6253\u5361</button>` : ""}
                        ${item.recordId || item.fallbackRecordId ? `<button data-action="open-record-single" data-record-id="${item.recordId || item.fallbackRecordId}">\u67e5\u770b\u8bb0\u5f55</button>` : ""}
                      </div>
                    </article>
                  `
                )
                .join("")
            : '<p class="empty">\u8fd9\u4e00\u5929\u6ca1\u6709\u6253\u5361\u8bb0\u5f55</p>'}
        </div>

        <div class="diary-snippets">
          <h3>\u65e5\u8bb0\u6458\u8981</h3>
          ${detail.diaryList.length
            ? detail.diaryList
                .map((record) => {
                  const task = getTaskById(record.taskId);
                  const color = task?.color || "#a3b2ce";
                  return `
                    <div class="diary-item" style="--task-color:${color}">
                      <strong>${escapeHtml(task?.name || "\u672a\u77e5\u4efb\u52a1")}</strong>
                      <p>${escapeHtml(record.diary)}</p>
                    </div>
                  `;
                })
                .join("")
            : '<p class="empty">\u6682\u65e0\u65e5\u8bb0\u5185\u5bb9</p>'}
        </div>
      </aside>
    </section>
  `;
}
function renderTasksPage() {
  const tasks = getTaskList(uiState.taskFilters);
  const filters = uiState.taskFilters;

  return `
    <section class="tasks-page">
      <header class="panel-head tasks-head">
        <div>
          <h2>\u4efb\u52a1\u7ba1\u7406</h2>
          <p class="panel-subtitle">\u70b9\u51fb\u989c\u8272\u6807\u7b7e\u53ef\u5feb\u901f\u6309\u8272\u7b5b\u9009\uff0c\u65b9\u4fbf\u805a\u7126\u540c\u7c7b\u4efb\u52a1\u3002</p>
        </div>

        <div class="filter-row">
          <label>
            \u5206\u7c7b
            <select data-filter-key="category">
              ${[
                { value: "all", label: "\u5168\u90e8" },
                ...CATEGORY_OPTIONS
              ]
                .map((option) => `<option value="${option.value}" ${filters.category === option.value ? "selected" : ""}>${option.label}</option>`)
                .join("")}
            </select>
          </label>

          <label>
            \u6a21\u5f0f
            <select data-filter-key="mode">
              ${[
                { value: "all", label: "\u5168\u90e8" },
                ...MODE_OPTIONS
              ]
                .map((option) => `<option value="${option.value}" ${filters.mode === option.value ? "selected" : ""}>${option.label}</option>`)
                .join("")}
            </select>
          </label>

          <label>
            \u72b6\u6001
            <select data-filter-key="status">
              ${[
                { value: "all", label: "\u5168\u90e8" },
                ...STATUS_OPTIONS
              ]
                .map((option) => `<option value="${option.value}" ${filters.status === option.value ? "selected" : ""}>${option.label}</option>`)
                .join("")}
            </select>
          </label>
        </div>
      </header>

      <div class="color-filter-row">
        <span>\u989c\u8272\u6807\u7b7e</span>
        <button class="${filters.color === "all" ? "is-active" : ""}" data-action="filter-color" data-color="all">\u5168\u90e8</button>
        ${PRESET_COLORS
          .map(
            (color) => `
              <button
                class="color-filter-btn ${filters.color === color ? "is-active" : ""}"
                style="--chip-color:${color}"
                data-action="filter-color"
                data-color="${color}"
                title="\u6309 ${getColorLabel(color)} \u7b5b\u9009"
              >
                <i></i>
                <span>${getColorLabel(color)}</span>
              </button>
            `
          )
          .join("")}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>\u4efb\u52a1\u540d\u79f0</th>
              <th>\u5206\u7c7b</th>
              <th>\u6a21\u5f0f</th>
              <th>\u5f00\u59cb\u65e5\u671f</th>
              <th>\u7ed3\u675f\u65e5\u671f</th>
              <th>\u72b6\u6001</th>
              <th>\u6700\u8fd1\u6253\u5361\u65e5\u671f</th>
              <th>\u521b\u5efa\u65f6\u95f4</th>
              <th>\u64cd\u4f5c</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.length
              ? tasks
                  .map((task) => {
                    const canCheckin = task.status === "active";
                    const canEdit = task.status === "active";
                    const canArchive = task.status !== "archived";
                    const canDelete = true;
                    const canView = task.recordCount > 0;

                    return `
                      <tr>
                        <td>
                          <div class="task-name-cell" style="--task-color:${task.color}">
                            <button
                              type="button"
                              class="task-color-dot"
                              data-action="filter-color"
                              data-color="${task.color}"
                              title="\u6309 ${getColorLabel(task.color)} \u7b5b\u9009"
                            ></button>
                            <div class="task-name-meta">
                              <span>${escapeHtml(task.name)}</span>
                              <small>${getColorLabel(task.color)}</small>
                            </div>
                          </div>
                        </td>
                        <td>${getCategoryLabel(task.category, task.customCategoryName)}</td>
                        <td>${MODE_LABEL_MAP[task.mode]}</td>
                        <td>${task.startDate}</td>
                        <td>${task.endDate || "-"}</td>
                        <td><span class="status-pill ${task.status}">${STATUS_LABEL_MAP[task.status]}</span></td>
                        <td>${task.latestBizDate || "-"}</td>
                        <td>${task.createdAt}</td>
                        <td>
                          <div class="action-group">
                            ${canCheckin ? `<button data-action="open-checkin" data-task-id="${task.id}">\u6253\u5361</button>` : ""}
                            ${canEdit ? `<button data-action="open-task-edit" data-task-id="${task.id}">\u7f16\u8f91</button>` : ""}
                            ${canView ? `<button data-action="open-task-records" data-task-id="${task.id}">\u67e5\u770b\u8bb0\u5f55</button>` : ""}
                            ${canArchive ? `<button data-action="archive-task" data-task-id="${task.id}">\u5f52\u6863</button>` : ""}
                            ${canDelete ? `<button class="danger" data-action="delete-task" data-task-id="${task.id}">\u5220\u9664</button>` : ""}
                          </div>
                        </td>
                      </tr>
                    `;
                  })
                  .join("")
              : '<tr><td colspan="9"><p class="empty">\u6682\u65e0\u4efb\u52a1\uff0c\u5148\u521b\u5efa\u4e00\u4e2a\u5f00\u59cb\u5427</p></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderStatsPage() {
  const overview = getStatsOverview();
  const trend7 = getTrend(7);
  const trend30 = getTrend(30);
  const category = getCategoryDistribution();
  const ranking = getTaskCompletionRanking();

  return `
    <section class="stats-page">
      <header class="panel-head">
        <h2>\u7edf\u8ba1\u5206\u6790</h2>
      </header>

      <div class="stats-cards">
        <article>
          <p>\u603b\u4efb\u52a1\u6570</p>
          <strong>${overview.totalTasks}</strong>
        </article>
        <article>
          <p>\u8fdb\u884c\u4e2d\u4efb\u52a1\u6570</p>
          <strong>${overview.activeTasks}</strong>
        </article>
        <article>
          <p>\u5df2\u5b8c\u6210\u4efb\u52a1\u6570</p>
          <strong>${overview.completedTasks}</strong>
        </article>
        <article>
          <p>\u8fde\u7eed\u6253\u5361\u5929\u6570</p>
          <strong>${overview.streakDays} \u5929</strong>
        </article>
        <article>
          <p>\u672c\u6708\u5b8c\u6210\u7387</p>
          <strong>${formatPercent(overview.monthCompletionRate)}</strong>
        </article>
      </div>

      <div class="chart-grid">
        <section class="chart-card">
          <div class="chart-headline">
            <h3>\u6700\u8fd1 7 \u5929\u6253\u5361\u8d8b\u52bf</h3>
            <p>\u77ed\u671f\u6267\u884c\u6ce2\u52a8</p>
          </div>
          ${renderTrendChart(trend7, "accent-a", "7天趋势", uiState.selectedDate)}
        </section>

        <section class="chart-card">
          <div class="chart-headline">
            <h3>\u6700\u8fd1 30 \u5929\u6253\u5361\u8d8b\u52bf</h3>
            <p>\u6708\u5ea6\u8282\u594f\u89c2\u5bdf</p>
          </div>
          ${renderTrendChart(trend30, "accent-b", "30天趋势", uiState.selectedDate)}
        </section>

        <section class="chart-card">
          <div class="chart-headline">
            <h3>\u5206\u7c7b\u4efb\u52a1\u5360\u6bd4</h3>
            <p>\u4efb\u52a1\u7ed3\u6784\u4e00\u76ee\u4e86\u7136</p>
          </div>
          ${renderCategoryChart(category)}
        </section>

        <section class="chart-card ranking">
          <div class="chart-headline">
            <h3>\u5404\u4efb\u52a1\u5b8c\u6210\u7387\u6392\u884c</h3>
            <p>\u4f18\u5148\u5173\u6ce8\u4f4e\u5b8c\u6210\u7387\u4efb\u52a1</p>
          </div>
          ${renderRankingList(ranking)}
        </section>
      </div>
    </section>
  `;
}

function renderDataPage() {
  const overview = getDataOverview();

  return `
    <section class="data-page">
      <header class="panel-head">
        <h2>\u6570\u636e\u7ba1\u7406</h2>
      </header>

      <div class="data-overview">
        <article>
          <p>\u4efb\u52a1\u603b\u6570</p>
          <strong>${overview.taskCount}</strong>
        </article>
        <article>
          <p>\u6253\u5361\u8bb0\u5f55\u603b\u6570</p>
          <strong>${overview.recordCount}</strong>
        </article>
        <article>
          <p>\u6700\u8fd1\u5bfc\u51fa\u65f6\u95f4</p>
          <strong>${overview.lastExportAt || "-"}</strong>
        </article>
        <article>
          <p>\u6570\u636e\u7248\u672c\u53f7</p>
          <strong>${overview.version}</strong>
        </article>
      </div>

      <div class="data-actions">
        <button class="primary-btn" data-action="export-data">\u5bfc\u51fa\u6570\u636e</button>
        <button data-action="trigger-import">\u5bfc\u5165\u6570\u636e</button>
        <button class="danger" data-action="clear-data">\u6e05\u7a7a\u672c\u5730\u6570\u636e</button>
        <input id="import-file" type="file" accept=".json,application/json" hidden>
      </div>

      <div class="tips">
        <p>\u5bfc\u5165\u4f1a\u8986\u76d6\u5f53\u524d\u4efb\u52a1\u3001\u8bb0\u5f55\u548c\u5143\u6570\u636e\u3002\u5efa\u8bae\u5148\u5bfc\u51fa\u5907\u4efd\u3002</p>
      </div>
    </section>
  `;
}
function renderTaskFormModal() {
  const modal = uiState.modal;
  const editing = Boolean(modal.taskId);
  const currentTask = editing ? getTaskById(modal.taskId) : null;
  const historyCount = editing ? getTaskRecords(modal.taskId).length : 0;
  const hasHistory = historyCount > 0;

  const data = modal.formData;
  const modeLocked = editing && hasHistory;
  const phaseDateLocked = editing && hasHistory && currentTask?.mode === "phase";

  return `
    <div class="modal-overlay" data-action="close-modal-bg">
      <section class="modal" data-stop-close="1">
        <header>
          <h3>${editing ? "\u7f16\u8f91\u4efb\u52a1" : "\u65b0\u5efa\u4efb\u52a1"}</h3>
          <button data-action="close-modal">\u5173\u95ed</button>
        </header>

        <form id="task-form">
          <label>\u4efb\u52a1\u540d\u79f0
            <input name="name" maxlength="30" value="${escapeHtml(data.name)}" data-modal-field="name" required>
          </label>

          <label>\u4efb\u52a1\u5206\u7c7b
            <select name="category" data-modal-field="category">
              ${CATEGORY_OPTIONS.map((option) => `<option value="${option.value}" ${data.category === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
            </select>
          </label>

          ${data.category === "custom"
            ? `
              <label>\u81ea\u5b9a\u4e49\u5206\u7c7b\u540d\u79f0
                <input
                  name="customCategoryName"
                  maxlength="20"
                  value="${escapeHtml(data.customCategoryName || "")}"
                  data-modal-field="customCategoryName"
                  placeholder="\u4f8b\u5982\uff1a\u526f\u4e1a / \u9605\u8bfb"
                  required
                >
              </label>
            `
            : ""}

          <label>\u6253\u5361\u6a21\u5f0f
            <select name="mode" data-modal-field="mode" ${modeLocked ? "disabled" : ""}>
              ${MODE_OPTIONS.map((option) => `<option value="${option.value}" ${data.mode === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
            </select>
          </label>

          <label>\u5f00\u59cb\u65e5\u671f
            <input type="date" name="startDate" value="${data.startDate}" data-modal-field="startDate" ${phaseDateLocked ? "disabled" : ""} required>
          </label>

          ${data.mode === "phase"
            ? `
              <label>\u7ed3\u675f\u65e5\u671f
                <input type="date" name="endDate" value="${data.endDate}" data-modal-field="endDate" ${phaseDateLocked ? "disabled" : ""} required>
              </label>
            `
            : ""}

          <label class="switch-row">
            <input type="checkbox" name="enableDiary" ${data.enableDiary ? "checked" : ""} data-modal-field="enableDiary">
            <span>\u5f00\u542f\u6253\u5361\u65e5\u8bb0</span>
          </label>

          <label>\u4efb\u52a1\u8bf4\u660e
            <textarea name="description" maxlength="200" data-modal-field="description">${escapeHtml(data.description)}</textarea>
          </label>

          ${data.mode === "goal"
            ? `
              <label>\u76ee\u6807\u63cf\u8ff0
                <input name="goalTargetText" maxlength="50" value="${escapeHtml(data.goalTargetText)}" data-modal-field="goalTargetText">
              </label>
            `
            : ""}

          <div class="color-section">
            <p>\u989c\u8272\u6807\u7b7e \u00b7 \u5f53\u524d\uff1a<strong>${getColorLabel(data.color)}</strong></p>
            <div class="selected-color-preview" style="--picked-color:${data.color}">
              <i></i>
              <div>
                <span>${getColorLabel(data.color)}</span>
                <small>${data.color}</small>
              </div>
            </div>

            <div class="color-palette">
              ${PRESET_COLORS
                .map(
                  (color) => `
                    <button
                      type="button"
                      class="color-chip ${data.color === color ? "is-active" : ""}"
                      style="--chip-color:${color}"
                      data-action="pick-color"
                      data-color="${color}"
                      title="${getColorLabel(color)}"
                    >
                      <i></i>
                      <span>${getColorLabel(color)}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>

          ${hasHistory ? '<p class="form-hint">\u5df2\u6709\u5386\u53f2\u8bb0\u5f55\u540e\u4e0d\u53ef\u4fee\u6539\u6253\u5361\u6a21\u5f0f\uff1b\u9636\u6bb5\u4efb\u52a1\u5386\u53f2\u5b58\u5728\u540e\u4e0d\u53ef\u6539\u8d77\u6b62\u65e5\u671f\u3002</p>' : ""}

          <footer>
            <button type="button" data-action="close-modal">\u53d6\u6d88</button>
            <button class="primary-btn" type="submit">\u4fdd\u5b58</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderCheckinModal() {
  const modal = uiState.modal;
  const task = getTaskById(modal.taskId);
  if (!task) {
    return "";
  }

  const data = modal.formData;
  const isMakeup = compareISODate(data.bizDate, todayISO()) < 0;
  const existingRecord = getTaskRecords(task.id).find((record) => record.bizDate === data.bizDate);

  return `
    <div class="modal-overlay" data-action="close-modal-bg">
      <section class="modal" data-stop-close="1">
        <header>
          <h3>${task.mode === "goal" ? "\u6807\u8bb0\u76ee\u6807\u5b8c\u6210" : "\u4efb\u52a1\u6253\u5361"}</h3>
          <button data-action="close-modal">\u5173\u95ed</button>
        </header>

        <form id="checkin-form">
          <div class="kv-row"><span>\u4efb\u52a1\u540d\u79f0</span><strong>${escapeHtml(task.name)}</strong></div>
          <div class="kv-row"><span>\u4efb\u52a1\u6a21\u5f0f</span><strong>${MODE_LABEL_MAP[task.mode]}</strong></div>

          <label>\u6253\u5361\u65e5\u671f
            <input type="date" name="bizDate" max="${todayISO()}" value="${data.bizDate}" data-modal-field="bizDate" required>
          </label>

          <div class="kv-row"><span>\u662f\u5426\u8865\u6253\u5361</span><strong>${isMakeup ? "\u662f" : "\u5426"}</strong></div>
          ${existingRecord ? '<p class="form-hint">\u8be5\u4efb\u52a1\u5728\u6b64\u65e5\u671f\u5df2\u6709\u8bb0\u5f55\uff0c\u63d0\u4ea4\u540e\u5c06\u66f4\u65b0\u65e5\u8bb0\u4e0e\u66f4\u65b0\u65f6\u95f4\u3002</p>' : ""}

          ${task.enableDiary
            ? `
              <label>\u6253\u5361\u65e5\u8bb0\uff08\u53ef\u9009\uff09
                <textarea name="diary" data-modal-field="diary">${escapeHtml(data.diary || "")}</textarea>
              </label>
            `
            : '<p class="form-hint">\u8be5\u4efb\u52a1\u672a\u5f00\u542f\u65e5\u8bb0\uff0c\u672c\u6b21\u4e0d\u8bb0\u5f55\u65e5\u8bb0\u5185\u5bb9\u3002</p>'}

          <footer>
            <button type="button" data-action="close-modal">\u53d6\u6d88</button>
            <button class="primary-btn" type="submit">${task.mode === "goal" ? "\u6807\u8bb0\u5b8c\u6210" : "\u786e\u8ba4\u6253\u5361"}</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderRecordModal() {
  const modal = uiState.modal;
  const recordIds = modal.recordIds;
  if (!recordIds.length) {
    return "";
  }

  const safeIndex = Math.min(Math.max(modal.index, 0), recordIds.length - 1);
  modal.index = safeIndex;

  const record = getRecordById(recordIds[safeIndex]);
  if (!record) {
    return "";
  }

  const task = getTaskById(record.taskId);
  const diaryText = modal.diaryDraft ?? record.diary;

  return `
    <div class="modal-overlay" data-action="close-modal-bg">
      <section class="modal" data-stop-close="1">
        <header>
          <h3>\u8bb0\u5f55\u8be6\u60c5</h3>
          <button data-action="close-modal">\u5173\u95ed</button>
        </header>

        <div class="record-nav">
          <button ${safeIndex === 0 ? "disabled" : ""} data-action="record-prev">\u4e0a\u4e00\u6761</button>
          <span>${safeIndex + 1} / ${recordIds.length}</span>
          <button ${safeIndex === recordIds.length - 1 ? "disabled" : ""} data-action="record-next">\u4e0b\u4e00\u6761</button>
        </div>

        <div class="record-detail">
          <div class="kv-row"><span>\u4efb\u52a1\u540d\u79f0</span><strong>${escapeHtml(task?.name || "\u672a\u77e5\u4efb\u52a1")}</strong></div>
          <div class="kv-row"><span>\u4e1a\u52a1\u65e5\u671f</span><strong>${record.bizDate}</strong></div>
          <div class="kv-row"><span>\u8bb0\u5f55\u7c7b\u578b</span><strong>${record.recordType === "makeup" ? "\u8865\u6253\u5361" : "\u6b63\u5e38"}</strong></div>
          <div class="kv-row"><span>\u521b\u5efa\u65f6\u95f4</span><strong>${formatDateTime(record.createdAt)}</strong></div>
          <div class="kv-row"><span>\u66f4\u65b0\u65f6\u95f4</span><strong>${formatDateTime(record.updatedAt)}</strong></div>

          <form id="record-diary-form">
            <label>\u65e5\u8bb0\u5185\u5bb9
              <textarea name="diary" data-modal-field="record-diary" ${task?.enableDiary ? "" : "disabled"}>${escapeHtml(diaryText)}</textarea>
            </label>

            <footer>
              <button type="submit" class="primary-btn" ${task?.enableDiary ? "" : "disabled"}>\u7f16\u8f91\u65e5\u8bb0</button>
              <button type="button" class="danger" data-action="delete-record" data-record-id="${record.id}">\u5220\u9664\u8bb0\u5f55</button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  `;
}

function renderModal() {
  if (!uiState.modal) {
    return "";
  }
  if (uiState.modal.type === "task-form") {
    return renderTaskFormModal();
  }
  if (uiState.modal.type === "checkin") {
    return renderCheckinModal();
  }
  if (uiState.modal.type === "record-detail") {
    return renderRecordModal();
  }
  return "";
}

function renderToast() {
  if (!uiState.toast) {
    return "";
  }

  return `
    <div class="toast ${uiState.toast.type}">
      <p>${escapeHtml(uiState.toast.message)}</p>
      <button data-action="dismiss-toast">\u5173\u95ed</button>
    </div>
  `;
}

function getChartTooltipElement() {
  return document.getElementById("chart-tooltip");
}

function hideChartTooltip() {
  const tooltip = getChartTooltipElement();
  if (!tooltip) {
    return;
  }
  tooltip.hidden = true;
  tooltip.classList.remove("is-visible");
}

function showChartTooltip(pointElement, mouseEvent) {
  const tooltip = getChartTooltipElement();
  if (!tooltip) {
    return;
  }

  const date = pointElement.dataset.date || "";
  const count = Number(pointElement.dataset.count || 0);
  const windowLabel = pointElement.dataset.window || "";
  const isSelected = date === uiState.selectedDate;

  tooltip.innerHTML = `
    <strong>${escapeHtml(windowLabel)}</strong>
    <span>${escapeHtml(date)}</span>
    <b>${count} \u6b21</b>
    ${isSelected ? '<em>\u5f53\u524d\u9009\u4e2d\u65e5\u671f</em>' : ""}
  `;

  tooltip.hidden = false;
  tooltip.classList.add("is-visible");

  const offset = 14;
  let left = mouseEvent.clientX + offset;
  let top = mouseEvent.clientY + offset;

  const rect = tooltip.getBoundingClientRect();
  const boundary = 10;

  if (left + rect.width > window.innerWidth - boundary) {
    left = mouseEvent.clientX - rect.width - offset;
  }

  if (top + rect.height > window.innerHeight - boundary) {
    top = mouseEvent.clientY - rect.height - offset;
  }

  left = Math.max(boundary, left);
  top = Math.max(boundary, top);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function onMouseMove(event) {
  const pointElement = event.target.closest("[data-trend-point='1']");
  if (!pointElement) {
    hideChartTooltip();
    return;
  }

  showChartTooltip(pointElement, event);
}

function render() {
  if (!root) {
    return;
  }

  let content = "";
  if (uiState.route === "/") {
    content = renderHomePage();
  }
  if (uiState.route === "/tasks") {
    content = renderTasksPage();
  }
  if (uiState.route === "/stats") {
    content = renderStatsPage();
  }
  if (uiState.route === "/data") {
    content = renderDataPage();
  }

  root.innerHTML = buildLayout(content);
}
function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;

  if (action === "close-modal-bg" && event.target !== button) {
    return;
  }

  safeRun(() => {
    if (action === "open-task-create") {
      openTaskForm();
      return;
    }

    if (action === "open-task-edit") {
      openTaskForm(button.dataset.taskId);
      return;
    }

    if (action === "pick-color" && uiState.modal?.type === "task-form") {
      uiState.modal.formData.color = button.dataset.color;
      render();
      return;
    }

    if (action === "filter-color") {
      uiState.taskFilters.color = button.dataset.color;
      if (uiState.route !== "/tasks") {
        window.location.hash = "#/tasks";
      }
      render();
      return;
    }

    if (action === "switch-month") {
      uiState.currentMonth = shiftMonth(uiState.currentMonth, button.dataset.direction === "prev" ? -1 : 1);
      if (!uiState.selectedDate.startsWith(uiState.currentMonth)) {
        uiState.selectedDate = monthFirstDay(uiState.currentMonth);
      }
      render();
      return;
    }

    if (action === "select-date") {
      uiState.selectedDate = button.dataset.date;
      render();
      return;
    }

    if (action === "open-checkin") {
      openCheckinModal(button.dataset.taskId, button.dataset.bizDate || null);
      return;
    }

    if (action === "open-record-single") {
      openRecordModal([button.dataset.recordId], 0);
      return;
    }

    if (action === "open-task-records") {
      const records = getTaskRecords(button.dataset.taskId);
      openRecordModal(records.map((record) => record.id), 0);
      return;
    }

    if (action === "archive-task") {
      if (window.confirm("\u5f52\u6863\u540e\u4e0d\u53ef\u7ee7\u7eed\u6253\u5361\uff0c\u662f\u5426\u7ee7\u7eed\uff1f")) {
        archiveTask(button.dataset.taskId);
        showToast("\u4efb\u52a1\u5df2\u5f52\u6863");
      }
      return;
    }

    if (action === "delete-task") {
      if (window.confirm("\u5220\u9664\u4efb\u52a1\u540e\uff0c\u5176\u5168\u90e8\u6253\u5361\u8bb0\u5f55\u4e5f\u5c06\u88ab\u5220\u9664\uff0c\u662f\u5426\u7ee7\u7eed\uff1f")) {
        deleteTask(button.dataset.taskId);
        showToast("\u4efb\u52a1\u5df2\u5220\u9664");
      }
      return;
    }

    if (action === "close-modal" || action === "close-modal-bg") {
      closeModal();
      return;
    }

    if (action === "record-prev" && uiState.modal?.type === "record-detail") {
      uiState.modal.index = Math.max(0, uiState.modal.index - 1);
      uiState.modal.diaryDraft = null;
      render();
      return;
    }

    if (action === "record-next" && uiState.modal?.type === "record-detail") {
      uiState.modal.index = Math.min(uiState.modal.recordIds.length - 1, uiState.modal.index + 1);
      uiState.modal.diaryDraft = null;
      render();
      return;
    }

    if (action === "delete-record" && uiState.modal?.type === "record-detail") {
      if (window.confirm("\u5220\u9664\u540e\u4e0d\u53ef\u6062\u590d\uff0c\u662f\u5426\u7ee7\u7eed\uff1f")) {
        const targetId = button.dataset.recordId;
        const currentModal = uiState.modal;
        const removeIndex = currentModal.recordIds.findIndex((id) => id === targetId);
        deleteRecord(targetId);

        currentModal.recordIds = currentModal.recordIds.filter((id) => id !== targetId);
        if (!currentModal.recordIds.length) {
          uiState.modal = null;
        } else {
          currentModal.index = Math.max(0, Math.min(removeIndex, currentModal.recordIds.length - 1));
          currentModal.diaryDraft = null;
        }

        showToast("\u8bb0\u5f55\u5df2\u5220\u9664");
      }
      return;
    }

    if (action === "export-data") {
      const data = exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `checkin-backup-${todayISO()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("\u5bfc\u51fa\u6210\u529f");
      return;
    }

    if (action === "trigger-import") {
      const input = document.getElementById("import-file");
      input?.click();
      return;
    }

    if (action === "clear-data") {
      if (!window.confirm("\u6e05\u7a7a\u672c\u5730\u6570\u636e\u540e\u4e0d\u53ef\u6062\u590d\uff0c\u5efa\u8bae\u5148\u5bfc\u51fa\u5907\u4efd\u3002\u662f\u5426\u7ee7\u7eed\uff1f")) {
        return;
      }
      if (!window.confirm("\u8bf7\u518d\u6b21\u786e\u8ba4\uff1a\u662f\u5426\u6e05\u7a7a\u6240\u6709\u4efb\u52a1\u548c\u8bb0\u5f55\uff1f")) {
        return;
      }
      clearData();
      showToast("\u672c\u5730\u6570\u636e\u5df2\u6e05\u7a7a");
      return;
    }

    if (action === "dismiss-toast") {
      uiState.toast = null;
      render();
    }
  });
}

function onChange(event) {
  const target = event.target;

  if (target.matches("select[data-filter-key]")) {
    uiState.taskFilters[target.dataset.filterKey] = target.value;
    render();
    return;
  }

  if (target.id === "import-file") {
    const file = target.files?.[0];
    if (!file) {
      return;
    }

    safeRun(async () => {
      if (!window.confirm("\u5bfc\u5165\u4f1a\u8986\u76d6\u5f53\u524d\u672c\u5730\u6570\u636e\uff0c\u662f\u5426\u7ee7\u7eed\uff1f")) {
        target.value = "";
        return;
      }

      const text = await file.text();
      importData(text);
      showToast("\u5bfc\u5165\u6210\u529f");
      target.value = "";
      window.location.hash = "#/";
    });
    return;
  }

  if (!uiState.modal) {
    return;
  }

  if (uiState.modal.type === "task-form" && target.dataset.modalField) {
    const key = target.dataset.modalField;
    uiState.modal.formData[key] = target.type === "checkbox" ? target.checked : target.value;

    if (key === "mode") {
      if (target.value !== "phase") {
        uiState.modal.formData.endDate = "";
      }
      if (target.value !== "goal") {
        uiState.modal.formData.goalTargetText = "";
      }
    }

    if (key === "category" && target.value !== "custom") {
      uiState.modal.formData.customCategoryName = "";
    }

    render();
    return;
  }

  if (uiState.modal.type === "checkin" && target.dataset.modalField) {
    const key = target.dataset.modalField;
    uiState.modal.formData[key] = target.type === "checkbox" ? target.checked : target.value;

    if (key === "bizDate") {
      const existingRecord = getTaskRecords(uiState.modal.taskId).find((record) => record.bizDate === uiState.modal.formData.bizDate);
      uiState.modal.formData.diary = existingRecord?.diary || "";
    }

    render();
    return;
  }

  if (uiState.modal.type === "record-detail" && target.dataset.modalField === "record-diary") {
    uiState.modal.diaryDraft = target.value;
  }
}

function onSubmit(event) {
  const form = event.target;

  if (form.id === "task-form") {
    event.preventDefault();
    safeRun(() => {
      const modal = uiState.modal;
      const data = modal.formData;
      if (modal.taskId) {
        updateTask(modal.taskId, data);
        showToast("\u4efb\u52a1\u5df2\u66f4\u65b0");
      } else {
        createTask(data);
        showToast("\u4efb\u52a1\u521b\u5efa\u6210\u529f");
      }
      uiState.modal = null;
      render();
    });
    return;
  }

  if (form.id === "checkin-form") {
    event.preventDefault();
    safeRun(() => {
      const modal = uiState.modal;
      const taskId = modal.taskId;
      const payload = modal.formData;
      const result = checkInTask(taskId, payload.bizDate, payload.diary || "");
      uiState.modal = null;
      render();
      showToast(result.message);
    });
    return;
  }

  if (form.id === "record-diary-form") {
    event.preventDefault();
    safeRun(() => {
      const modal = uiState.modal;
      const recordId = modal.recordIds[modal.index];
      updateRecordDiary(recordId, modal.diaryDraft ?? "");
      modal.diaryDraft = null;
      render();
      showToast("\u8bb0\u5f55\u5df2\u66f4\u65b0");
    });
  }
}

function init() {
  subscribe(() => {
    render();
  });

  window.addEventListener("hashchange", () => {
    uiState.route = getRoute();
    render();
  });

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("scroll", hideChartTooltip, true);

  render();
}

init();











