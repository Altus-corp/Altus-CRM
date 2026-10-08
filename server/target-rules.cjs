"use strict";

function effectiveTarget(row, fallback = 0) {
  if (row?.absent === true) return { target: 0, excluded: true, source: "absent" };
  if (row?.day_override != null) return { target: Number(row.day_override), excluded: false, source: "day" };
  if (row?.week_override != null) return { target: Number(row.week_override), excluded: false, source: "week" };
  if (row?.quarter_override != null) return { target: Number(row.quarter_override), excluded: false, source: "quarter" };
  return { target: Number(row?.total_target ?? fallback), excluded: false, source: "default" };
}

function actualCounts(rows) { return rows.filter((row) => row?.absent !== true).reduce((total, row) => total + Number(row?.actual || 0), 0); }

module.exports = { effectiveTarget, actualCounts };
