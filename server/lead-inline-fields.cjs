"use strict";
const columns = require("../shared/lead-inline-columns.json");
const editable = new Map(columns.filter((column) => column.editable).map((column) => [column.key, column]));
const byKey = new Map(columns.map((column) => [column.key, column]));
module.exports = { columns, editable, byKey };
