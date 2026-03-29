const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toTimestamp(date = new Date()) {
  return DATETIME_FORMATTER.format(date).replace(/\//g, "-");
}

export function compareISODate(a, b) {
  if (a === b) {
    return 0;
  }
  return a > b ? 1 : -1;
}

export function addDays(isoDate, offset) {
  const date = parseISODate(isoDate);
  date.setDate(date.getDate() + offset);
  return toISODate(date);
}

export function daysBetweenInclusive(startDate, endDate) {
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end - start) / dayMs) + 1;
}

export function getMonthKey(isoDate) {
  return isoDate.slice(0, 7);
}

export function monthFirstDay(monthKey) {
  return `${monthKey}-01`;
}

export function monthLastDay(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month, 0);
  return toISODate(date);
}

export function shiftMonth(monthKey, offset) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${m}`;
}

export function getMonthDates(monthKey) {
  const first = parseISODate(monthFirstDay(monthKey));
  const last = parseISODate(monthLastDay(monthKey));
  const dates = [];
  for (let cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(toISODate(cursor));
  }
  return dates;
}

export function getCalendarLeadingBlanks(monthKey) {
  const firstDay = parseISODate(monthFirstDay(monthKey)).getDay();
  return (firstDay + 6) % 7;
}

export function formatDate(isoDate) {
  return DATE_FORMATTER.format(parseISODate(isoDate)).replace(/\//g, "-");
}

export function formatDateTime(dateTimeText) {
  if (!dateTimeText) {
    return "-";
  }
  return dateTimeText;
}

export function isDateInRange(date, startDate, endDate) {
  const afterStart = compareISODate(date, startDate) >= 0;
  const beforeEnd = endDate ? compareISODate(date, endDate) <= 0 : true;
  return afterStart && beforeEnd;
}

export function clampDateToToday(isoDate) {
  const today = todayISO();
  return compareISODate(isoDate, today) > 0 ? today : isoDate;
}

export function getLastNDates(days) {
  const end = todayISO();
  const result = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    result.push(addDays(end, -i));
  }
  return result;
}
