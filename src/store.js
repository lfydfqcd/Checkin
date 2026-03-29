import {
  addDays,
  compareISODate,
  daysBetweenInclusive,
  getLastNDates,
  getMonthDates,
  getMonthKey,
  isDateInRange,
  toTimestamp,
  todayISO
} from "./date-utils.js";

const STORAGE_KEY = "checkin_app_data_v1";
const APP_VERSION = "1.0.0";

export const CATEGORY_OPTIONS = [
  { value: "study", label: "学习" },
  { value: "exercise", label: "运动" },
  { value: "custom", label: "自定义" }
];

export const MODE_OPTIONS = [
  { value: "daily", label: "每日打卡" },
  { value: "phase", label: "阶段打卡" },
  { value: "goal", label: "目标完成" }
];

export const STATUS_OPTIONS = [
  { value: "active", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "archived", label: "已归档" }
];

export const CATEGORY_LABEL_MAP = Object.fromEntries(CATEGORY_OPTIONS.map((item) => [item.value, item.label]));
export const MODE_LABEL_MAP = Object.fromEntries(MODE_OPTIONS.map((item) => [item.value, item.label]));
export const STATUS_LABEL_MAP = Object.fromEntries(STATUS_OPTIONS.map((item) => [item.value, item.label]));

export const PRESET_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F97316",
  "#EF4444",
  "#8B5CF6",
  "#EAB308",
  "#14B8A6",
  "#6366F1"
];

const listeners = new Set();
let db = loadDatabase();

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function baseMeta(meta) {
  return {
    version: APP_VERSION,
    lastExportAt: meta?.lastExportAt || null
  };
}

function normalizeTask(task) {
  const category = CATEGORY_LABEL_MAP[task.category] ? task.category : "custom";
  const customCategoryName = category === "custom"
    ? String(task.customCategoryName || "").trim().slice(0, 20)
    : "";

  return {
    id: task.id,
    name: String(task.name || "").trim(),
    category,
    customCategoryName,
    mode: MODE_LABEL_MAP[task.mode] ? task.mode : "daily",
    startDate: task.startDate,
    endDate: task.endDate || null,
    enableDiary: Boolean(task.enableDiary),
    description: String(task.description || "").slice(0, 200),
    color: PRESET_COLORS.includes(task.color) ? task.color : PRESET_COLORS[0],
    status: STATUS_LABEL_MAP[task.status] ? task.status : "active",
    goalTargetText: String(task.goalTargetText || "").slice(0, 50),
    createdAt: task.createdAt || toTimestamp(),
    updatedAt: task.updatedAt || toTimestamp()
  };
}

function normalizeRecord(record) {
  return {
    id: record.id,
    taskId: record.taskId,
    bizDate: record.bizDate,
    recordType: record.recordType === "makeup" ? "makeup" : "normal",
    result: "completed",
    diary: String(record.diary || ""),
    createdAt: record.createdAt || toTimestamp(),
    updatedAt: record.updatedAt || toTimestamp()
  };
}

function validateTaskPayload(payload) {
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("请输入任务名称");
  }
  if (name.length > 30) {
    throw new Error("任务名称不能超过30个字");
  }

  const category = CATEGORY_LABEL_MAP[payload.category] ? payload.category : "custom";
  const customCategoryName = category === "custom" ? String(payload.customCategoryName || "").trim() : "";
  if (category === "custom" && !customCategoryName) {
    throw new Error("请输入自定义分类名称");
  }
  if (customCategoryName.length > 20) {
    throw new Error("自定义分类名称不能超过20个字");
  }

  const mode = MODE_LABEL_MAP[payload.mode] ? payload.mode : "daily";
  const startDate = payload.startDate;
  const endDate = payload.endDate || null;

  if (!startDate) {
    throw new Error("请选择开始日期");
  }

  if (mode === "phase" && !endDate) {
    throw new Error("阶段任务必须设置结束日期");
  }

  if (endDate && compareISODate(endDate, startDate) < 0) {
    throw new Error("结束日期不能早于开始日期");
  }

  return {
    name,
    category,
    customCategoryName,
    mode,
    startDate,
    endDate,
    enableDiary: Boolean(payload.enableDiary),
    description: String(payload.description || "").slice(0, 200),
    color: PRESET_COLORS.includes(payload.color) ? payload.color : PRESET_COLORS[0],
    goalTargetText: String(payload.goalTargetText || "").slice(0, 50)
  };
}

function serialize() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function notify() {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function applyAndSync(mutator) {
  const result = mutator();
  serialize();
  notify();
  return result;
}

function loadDatabase() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      tasks: [],
      checkin_records: [],
      app_meta: baseMeta()
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [];
    const taskIds = new Set(tasks.map((task) => task.id));
    const checkin_records = Array.isArray(parsed.checkin_records)
      ? parsed.checkin_records
          .map(normalizeRecord)
          .filter((record) => taskIds.has(record.taskId))
      : [];

    return {
      tasks,
      checkin_records,
      app_meta: baseMeta(parsed.app_meta)
    };
  } catch {
    return {
      tasks: [],
      checkin_records: [],
      app_meta: baseMeta()
    };
  }
}

function findTask(taskId) {
  return db.tasks.find((task) => task.id === taskId) || null;
}

function findRecord(recordId) {
  return db.checkin_records.find((record) => record.id === recordId) || null;
}

function taskRecords(taskId) {
  return db.checkin_records.filter((record) => record.taskId === taskId);
}

function latestRecordDate(taskId) {
  const records = taskRecords(taskId);
  if (!records.length) {
    return null;
  }

  return records.reduce((latest, current) =>
    compareISODate(current.bizDate, latest) > 0 ? current.bizDate : latest, records[0].bizDate);
}

function phaseRecord(taskId) {
  return db.checkin_records
    .filter((record) => record.taskId === taskId)
    .sort((a, b) => compareISODate(a.bizDate, b.bizDate))[0] || null;
}

function isTaskStarted(task, date = todayISO()) {
  return compareISODate(date, task.startDate) >= 0;
}

function ensureTaskExists(taskId) {
  const task = findTask(taskId);
  if (!task) {
    throw new Error("任务不存在");
  }
  return task;
}

function ensureCheckinAllowed(task, bizDate) {
  const today = todayISO();
  if (compareISODate(bizDate, today) > 0) {
    throw new Error("暂不支持未来日期打卡");
  }

  if (task.status === "archived") {
    throw new Error("归档任务不可打卡");
  }

  if (task.mode === "daily" && !isDateInRange(bizDate, task.startDate, task.endDate)) {
    throw new Error("当前日期不在任务执行范围内");
  }

  if (task.mode === "phase" && !isDateInRange(bizDate, task.startDate, task.endDate)) {
    throw new Error("当前日期不在阶段范围内");
  }
}
function computeGlobalCompletionRate() {
  const today = todayISO();
  let expected = 0;
  let actual = 0;

  db.tasks.forEach((task) => {
    if (task.mode === "goal") {
      return;
    }

    if (task.mode === "daily") {
      const end = task.endDate && compareISODate(task.endDate, today) < 0 ? task.endDate : today;
      if (compareISODate(end, task.startDate) < 0) {
        return;
      }
      expected += daysBetweenInclusive(task.startDate, end);
      actual += db.checkin_records.filter((record) =>
        record.taskId === task.id
        && compareISODate(record.bizDate, task.startDate) >= 0
        && compareISODate(record.bizDate, end) <= 0
      ).length;
      return;
    }

    if (task.mode === "phase" && isTaskStarted(task, today)) {
      expected += 1;
      if (phaseRecord(task.id)) {
        actual += 1;
      }
    }
  });

  return {
    expected,
    actual,
    rate: expected ? actual / expected : 0
  };
}

function computeMonthCompletionRate(monthKey) {
  const today = todayISO();
  const monthDates = getMonthDates(monthKey).filter((date) => compareISODate(date, today) <= 0);
  const monthSet = new Set(monthDates);

  let expected = 0;
  let actual = 0;

  db.tasks.forEach((task) => {
    if (task.mode === "goal") {
      return;
    }

    if (task.mode === "daily") {
      monthDates.forEach((date) => {
        if (isDateInRange(date, task.startDate, task.endDate)) {
          expected += 1;
          if (db.checkin_records.some((record) => record.taskId === task.id && record.bizDate === date)) {
            actual += 1;
          }
        }
      });
      return;
    }

    if (task.mode === "phase") {
      const intersectsMonth = monthDates.some((date) => isDateInRange(date, task.startDate, task.endDate));
      if (intersectsMonth) {
        expected += 1;
        const record = phaseRecord(task.id);
        if (record && monthSet.has(record.bizDate)) {
          actual += 1;
        }
      }
    }
  });

  return {
    expected,
    actual,
    rate: expected ? actual / expected : 0
  };
}

function computeStreak() {
  const recordDates = new Set(db.checkin_records.map((record) => record.bizDate));
  if (!recordDates.size) {
    return 0;
  }

  let streak = 0;
  let cursor = todayISO();
  while (recordDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return clone(db);
}

export function getTaskById(taskId) {
  const task = findTask(taskId);
  return task ? clone(task) : null;
}

export function getRecordById(recordId) {
  const record = findRecord(recordId);
  return record ? clone(record) : null;
}

export function getTaskRecords(taskId) {
  return clone(taskRecords(taskId)).sort((a, b) => {
    if (a.bizDate !== b.bizDate) {
      return compareISODate(b.bizDate, a.bizDate);
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function createTask(payload) {
  const validated = validateTaskPayload(payload);
  return applyAndSync(() => {
    const now = toTimestamp();
    const task = {
      id: makeId("task"),
      ...validated,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    db.tasks.unshift(task);
    return clone(task);
  });
}

export function updateTask(taskId, payload) {
  return applyAndSync(() => {
    const index = db.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) {
      throw new Error("任务不存在");
    }

    const current = db.tasks[index];
    const records = taskRecords(taskId);
    const hasHistory = records.length > 0;

    const nextMode = payload.mode || current.mode;
    const nextStartDate = payload.startDate || current.startDate;
    const nextEndDate = payload.endDate === undefined ? current.endDate : payload.endDate;

    if (hasHistory && nextMode !== current.mode) {
      throw new Error("已有历史记录的任务不可修改打卡模式");
    }

    if (hasHistory && current.mode === "phase" && (
      nextStartDate !== current.startDate
      || (nextEndDate || null) !== (current.endDate || null)
    )) {
      throw new Error("阶段任务有历史记录后不可修改起止日期");
    }

    const validated = validateTaskPayload({
      ...current,
      ...payload,
      mode: nextMode,
      startDate: nextStartDate,
      endDate: nextEndDate
    });

    let status = current.status;
    if (validated.mode === "goal" && current.status !== "archived") {
      status = records.length ? "completed" : "active";
    }
    if (validated.mode !== "goal" && current.status === "completed") {
      status = "active";
    }

    const updated = {
      ...current,
      ...validated,
      status,
      updatedAt: toTimestamp()
    };

    db.tasks[index] = updated;
    return clone(updated);
  });
}

export function archiveTask(taskId) {
  return applyAndSync(() => {
    const task = ensureTaskExists(taskId);
    task.status = "archived";
    task.updatedAt = toTimestamp();
    return clone(task);
  });
}

export function deleteTask(taskId) {
  return applyAndSync(() => {
    const before = db.tasks.length;
    db.tasks = db.tasks.filter((task) => task.id !== taskId);
    if (db.tasks.length === before) {
      throw new Error("任务不存在");
    }
    db.checkin_records = db.checkin_records.filter((record) => record.taskId !== taskId);
  });
}

export function checkInTask(taskId, bizDate, diary = "") {
  return applyAndSync(() => {
    const task = ensureTaskExists(taskId);
    const date = bizDate || todayISO();
    ensureCheckinAllowed(task, date);

    const now = toTimestamp();
    const currentDiary = task.enableDiary ? String(diary || "") : "";

    const sameDayRecord = db.checkin_records.find((record) => record.taskId === taskId && record.bizDate === date);
    if (sameDayRecord) {
      sameDayRecord.diary = currentDiary;
      sameDayRecord.updatedAt = now;
      task.updatedAt = now;
      return {
        message: "记录已更新",
        record: clone(sameDayRecord)
      };
    }

    if (task.mode === "phase" && phaseRecord(taskId)) {
      throw new Error("该阶段任务已完成打卡");
    }

    if (task.mode === "goal" && db.checkin_records.some((record) => record.taskId === taskId)) {
      throw new Error("目标任务已完成");
    }

    const today = todayISO();
    const record = {
      id: makeId("record"),
      taskId,
      bizDate: date,
      recordType: compareISODate(date, today) < 0 ? "makeup" : "normal",
      result: "completed",
      diary: currentDiary,
      createdAt: now,
      updatedAt: now
    };

    db.checkin_records.unshift(record);
    task.updatedAt = now;

    let message = "打卡成功";
    if (task.mode === "goal") {
      task.status = "completed";
      message = "目标已完成";
    } else if (compareISODate(date, today) < 0) {
      message = "补打卡成功";
    }

    return {
      message,
      record: clone(record)
    };
  });
}
export function updateRecordDiary(recordId, diary = "") {
  return applyAndSync(() => {
    const record = findRecord(recordId);
    if (!record) {
      throw new Error("记录不存在");
    }

    const task = ensureTaskExists(record.taskId);
    record.diary = task.enableDiary ? String(diary || "") : "";
    record.updatedAt = toTimestamp();
    task.updatedAt = toTimestamp();
    return clone(record);
  });
}

export function deleteRecord(recordId) {
  return applyAndSync(() => {
    const index = db.checkin_records.findIndex((record) => record.id === recordId);
    if (index < 0) {
      throw new Error("记录不存在");
    }

    const [deleted] = db.checkin_records.splice(index, 1);
    const task = findTask(deleted.taskId);
    if (task) {
      if (task.mode === "goal" && task.status !== "archived") {
        const hasAnyRecord = db.checkin_records.some((record) => record.taskId === task.id);
        task.status = hasAnyRecord ? "completed" : "active";
      }
      task.updatedAt = toTimestamp();
    }

    return clone(deleted);
  });
}

export function getTaskList(filters = {}) {
  const list = db.tasks.map((task) => {
    const records = taskRecords(task.id);
    return {
      ...task,
      recordCount: records.length,
      latestBizDate: latestRecordDate(task.id)
    };
  });

  const filtered = list.filter((task) => {
    if (filters.category && filters.category !== "all" && task.category !== filters.category) {
      return false;
    }
    if (filters.mode && filters.mode !== "all" && task.mode !== filters.mode) {
      return false;
    }
    if (filters.status && filters.status !== "all" && task.status !== filters.status) {
      return false;
    }
    if (filters.color && filters.color !== "all" && task.color !== filters.color) {
      return false;
    }
    return true;
  });

  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTodayOverview() {
  const today = todayISO();
  let pendingCount = 0;

  db.tasks.forEach((task) => {
    if (task.status === "archived") {
      return;
    }

    if (task.mode === "daily" && task.status === "active" && isDateInRange(today, task.startDate, task.endDate)) {
      const hasTodayRecord = db.checkin_records.some((record) => record.taskId === task.id && record.bizDate === today);
      if (!hasTodayRecord) {
        pendingCount += 1;
      }
      return;
    }

    if (task.mode === "phase" && task.status === "active" && isDateInRange(today, task.startDate, task.endDate)) {
      if (!phaseRecord(task.id)) {
        pendingCount += 1;
      }
      return;
    }

    if (task.mode === "goal" && task.status === "active") {
      pendingCount += 1;
    }
  });

  const doneToday = new Set(
    db.checkin_records
      .filter((record) => record.bizDate === today)
      .map((record) => record.taskId)
  ).size;

  const monthRate = computeMonthCompletionRate(getMonthKey(today));

  return {
    pendingCount,
    doneToday,
    streakDays: computeStreak(),
    monthCompletionRate: monthRate.rate,
    monthExpected: monthRate.expected,
    monthActual: monthRate.actual
  };
}

export function getCalendarSummary(monthKey) {
  const monthDates = getMonthDates(monthKey);
  const summary = {};

  monthDates.forEach((date) => {
    let total = 0;
    let completed = 0;

    db.tasks.forEach((task) => {
      if (task.mode === "goal") {
        return;
      }

      if (!isDateInRange(date, task.startDate, task.endDate)) {
        return;
      }

      if (task.mode === "daily") {
        total += 1;
        if (db.checkin_records.some((record) => record.taskId === task.id && record.bizDate === date)) {
          completed += 1;
        }
      }

      if (task.mode === "phase") {
        total += 1;
        const record = phaseRecord(task.id);
        if (record && compareISODate(record.bizDate, date) <= 0) {
          completed += 1;
        }
      }
    });

    const recordsOfDay = db.checkin_records.filter((record) => record.bizDate === date);

    summary[date] = {
      total,
      completed,
      hasDiary: recordsOfDay.some((record) => record.diary.trim()),
      hasGoal: recordsOfDay.some((record) => {
        const task = findTask(record.taskId);
        return task?.mode === "goal";
      })
    };
  });

  return summary;
}

export function getDateDetail(date) {
  const today = todayISO();
  const recordsOfDay = db.checkin_records
    .filter((record) => record.bizDate === date)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const rows = [];

  db.tasks.forEach((task) => {
    const recordForDate = recordsOfDay.find((record) => record.taskId === task.id) || null;
    const phaseDoneRecord = task.mode === "phase" ? phaseRecord(task.id) : null;
    const goalRecord = task.mode === "goal" ? phaseRecord(task.id) : null;

    let include = false;
    let canCheckin = false;
    let statusText = "";

    if (task.mode === "daily" && isDateInRange(date, task.startDate, task.endDate)) {
      include = true;
      canCheckin = task.status === "active" && !recordForDate && compareISODate(date, today) <= 0;
      statusText = recordForDate ? "已打卡" : "待打卡";
    }

    if (task.mode === "phase" && isDateInRange(date, task.startDate, task.endDate)) {
      include = true;
      const done = phaseDoneRecord && compareISODate(phaseDoneRecord.bizDate, date) <= 0;
      canCheckin = task.status === "active" && !phaseDoneRecord && compareISODate(date, today) <= 0;
      statusText = done ? `阶段已完成（${phaseDoneRecord.bizDate}）` : "待打卡";
    }

    if (task.mode === "goal") {
      const goalDoneOnDate = goalRecord && goalRecord.bizDate === date;
      if ((date === today && task.status === "active") || goalDoneOnDate || recordForDate) {
        include = true;
      }
      canCheckin = task.status === "active" && date === today;
      statusText = task.status === "completed" ? "目标已完成" : "待完成";
      if (goalDoneOnDate) {
        statusText = "目标完成日";
      }
    }

    if (!include) {
      return;
    }

    rows.push({
      taskId: task.id,
      taskName: task.name,
      mode: task.mode,
      category: task.category,
      customCategoryName: task.customCategoryName || "",
      color: task.color,
      taskStatus: task.status,
      canCheckin,
      statusText,
      recordId: recordForDate?.id || null,
      fallbackRecordId: phaseDoneRecord?.id || goalRecord?.id || null
    });
  });

  rows.sort((a, b) => {
    if (a.canCheckin !== b.canCheckin) {
      return a.canCheckin ? -1 : 1;
    }
    return a.taskName.localeCompare(b.taskName, "zh-CN");
  });

  return {
    date,
    items: rows,
    records: clone(recordsOfDay),
    diaryList: recordsOfDay.filter((record) => record.diary.trim())
  };
}
export function getStatsOverview() {
  const totalTasks = db.tasks.length;
  const activeTasks = db.tasks.filter((task) => task.status === "active").length;
  const completedTasks = db.tasks.filter((task) => task.status === "completed").length;

  const monthRate = computeMonthCompletionRate(getMonthKey(todayISO()));
  const globalRate = computeGlobalCompletionRate();

  return {
    totalTasks,
    activeTasks,
    completedTasks,
    streakDays: computeStreak(),
    monthCompletionRate: monthRate.rate,
    completionRate: globalRate.rate,
    expectedCount: globalRate.expected,
    actualCount: globalRate.actual
  };
}

export function getTrend(days = 7) {
  const dates = getLastNDates(days);
  return dates.map((date) => ({
    date,
    count: db.checkin_records.filter((record) => record.bizDate === date).length
  }));
}

export function getCategoryDistribution() {
  const total = db.tasks.length;
  return CATEGORY_OPTIONS.map((option) => {
    const count = db.tasks.filter((task) => task.category === option.value).length;
    return {
      category: option.value,
      label: option.label,
      count,
      percentage: total ? count / total : 0
    };
  });
}

export function getTaskCompletionRanking() {
  const today = todayISO();
  const ranking = db.tasks
    .map((task) => {
      if (task.mode === "goal") {
        return {
          taskId: task.id,
          name: task.name,
          mode: task.mode,
          expected: 0,
          actual: db.checkin_records.some((record) => record.taskId === task.id) ? 1 : 0,
          rate: null
        };
      }

      if (task.mode === "daily") {
        const end = task.endDate && compareISODate(task.endDate, today) < 0 ? task.endDate : today;
        if (compareISODate(end, task.startDate) < 0) {
          return {
            taskId: task.id,
            name: task.name,
            mode: task.mode,
            expected: 0,
            actual: 0,
            rate: 0
          };
        }

        const expected = daysBetweenInclusive(task.startDate, end);
        const actual = db.checkin_records.filter((record) =>
          record.taskId === task.id
          && compareISODate(record.bizDate, task.startDate) >= 0
          && compareISODate(record.bizDate, end) <= 0
        ).length;

        return {
          taskId: task.id,
          name: task.name,
          mode: task.mode,
          expected,
          actual,
          rate: expected ? actual / expected : 0
        };
      }

      const expected = isTaskStarted(task, today) ? 1 : 0;
      const actual = phaseRecord(task.id) ? 1 : 0;
      return {
        taskId: task.id,
        name: task.name,
        mode: task.mode,
        expected,
        actual,
        rate: expected ? actual / expected : 0
      };
    })
    .sort((a, b) => {
      const aRate = a.rate ?? -1;
      const bRate = b.rate ?? -1;
      if (aRate !== bRate) {
        return bRate - aRate;
      }
      return b.actual - a.actual;
    });

  return ranking;
}

export function getDataOverview() {
  return {
    taskCount: db.tasks.length,
    recordCount: db.checkin_records.length,
    lastExportAt: db.app_meta.lastExportAt,
    version: db.app_meta.version || APP_VERSION
  };
}

export function exportData() {
  return applyAndSync(() => {
    db.app_meta.lastExportAt = toTimestamp();
    return clone(db);
  });
}

export function importData(raw) {
  return applyAndSync(() => {
    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      throw new Error("文件格式不正确，导入失败");
    }

    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.checkin_records) || typeof parsed.app_meta !== "object") {
      throw new Error("文件格式不正确，导入失败");
    }

    const tasks = parsed.tasks.map((task) => {
      const validated = validateTaskPayload(task);
      return normalizeTask({
        ...task,
        ...validated,
        id: task.id || makeId("task")
      });
    });

    const taskIds = new Set(tasks.map((task) => task.id));
    const records = parsed.checkin_records
      .filter((record) => taskIds.has(record.taskId))
      .map((record) => normalizeRecord({
        ...record,
        id: record.id || makeId("record")
      }));

    db = {
      tasks,
      checkin_records: records,
      app_meta: baseMeta(parsed.app_meta)
    };

    return {
      taskCount: tasks.length,
      recordCount: records.length
    };
  });
}

export function clearData() {
  return applyAndSync(() => {
    db = {
      tasks: [],
      checkin_records: [],
      app_meta: baseMeta()
    };
  });
}
