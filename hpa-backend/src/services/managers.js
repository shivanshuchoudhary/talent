const Manager = require("../models/Manager");
const { parseCsv } = require("../utils/parseCsv");
const {
  MANAGER_IMPORT_FIELDS,
  MANAGER_STATUS_VALUES,
  MANAGER_STATUSES,
  MANAGER_RATING_VALUES,
  MANAGER_LEVEL_VALUES
} = require("../constants/managerFields");

function normalizeKey(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeStatus(raw) {
  const value = normalizeKey(raw);
  if (!value) return null;

  if (
    value === "in progress" ||
    value === "in_progress" ||
    value === "inprogress" ||
    value === "progress"
  ) {
    return MANAGER_STATUSES.IN_PROGRESS;
  }

  if (
    value === "not completed" ||
    value === "not_completed" ||
    value === "notcompleted" ||
    value === "incomplete" ||
    value === "not complete" ||
    value === "no" ||
    value === "false" ||
    value === "0"
  ) {
    return MANAGER_STATUSES.NOT_COMPLETED;
  }

  if (
    value === "completed" ||
    value === "complete" ||
    value === "yes" ||
    value === "true" ||
    value === "1"
  ) {
    return MANAGER_STATUSES.COMPLETED;
  }

  return null;
}

function normalizeRating(raw) {
  const value = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toUpperCase();
  if (value === "A" || value === "B" || value === "-") {
    return value;
  }
  if (
    value === "–" ||
    value === "—" ||
    value === "N/A" ||
    value === "NA" ||
    value === "" ||
    value === "."
  ) {
    return "-";
  }
  return null;
}

function normalizeAverageRating(raw) {
  const text = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (
    text === "" ||
    text === "-" ||
    text === "–" ||
    text === "—" ||
    text.toUpperCase() === "N/A" ||
    text.toUpperCase() === "NA"
  ) {
    return 0;
  }
  const num = Number.parseFloat(text.replace(",", "."));
  if (!Number.isFinite(num) || num < 0 || num > 5) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

function serializeManager(doc) {
  return {
    id: String(doc._id),
    employeeCode: doc.employeeCode,
    name: doc.name,
    status: doc.status,
    averageRating: doc.averageRating,
    rating: doc.rating,
    entity: doc.entity,
    level: doc.level,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

async function listManagers(level) {
  const filter = {};
  if (level && MANAGER_LEVEL_VALUES.includes(level)) {
    filter.level = level;
  }
  const docs = await Manager.find(filter).sort({ name: 1 }).lean();
  return docs.map((doc) => serializeManager(doc));
}

function validateCreatePayload(payload) {
  const employeeCode = String(payload?.employeeCode ?? "").trim();
  const name = String(payload?.name ?? "").trim();
  const entity = String(payload?.entity ?? "").trim();
  const status = String(payload?.status ?? "").trim();
  const rating = normalizeRating(payload?.rating);
  const level = String(payload?.level ?? "").trim();
  const averageRating = normalizeAverageRating(payload?.averageRating);

  if (!employeeCode) {
    const error = new Error("employeeCode is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!name) {
    const error = new Error("name is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!entity) {
    const error = new Error("entity is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!MANAGER_STATUS_VALUES.includes(status)) {
    const error = new Error(
      "status must be completed, not_completed, or in_progress."
    );
    error.statusCode = 400;
    throw error;
  }
  if (averageRating === null) {
    const error = new Error("averageRating must be a number between 0 and 5.");
    error.statusCode = 400;
    throw error;
  }
  if (!rating || !MANAGER_RATING_VALUES.includes(rating)) {
    const error = new Error('rating must be "A", "B", or "-".');
    error.statusCode = 400;
    throw error;
  }
  if (!MANAGER_LEVEL_VALUES.includes(level)) {
    const error = new Error('level must be "n-2" or "n-3".');
    error.statusCode = 400;
    throw error;
  }

  return {
    employeeCode,
    name,
    entity,
    status,
    averageRating,
    rating,
    level
  };
}

async function createManager(payload) {
  const data = validateCreatePayload(payload);
  try {
    const doc = await Manager.create(data);
    return serializeManager(doc);
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error(
        `Manager with employeeCode "${data.employeeCode}" already exists.`
      );
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function updateManagerMetrics(id, payload) {
  if (!id || typeof id !== "string") {
    const error = new Error("Manager id is required.");
    error.statusCode = 400;
    throw error;
  }

  const updates = {};

  if (payload?.status !== undefined) {
    const status = String(payload.status).trim();
    if (!MANAGER_STATUS_VALUES.includes(status)) {
      const error = new Error(
        "status must be completed, not_completed, or in_progress."
      );
      error.statusCode = 400;
      throw error;
    }
    updates.status = status;
  }

  if (payload?.averageRating !== undefined) {
    const averageRating = normalizeAverageRating(payload.averageRating);
    if (averageRating === null) {
      const error = new Error("averageRating must be a number between 0 and 5.");
      error.statusCode = 400;
      throw error;
    }
    updates.averageRating = averageRating;
  }

  if (payload?.rating !== undefined) {
    const rating = normalizeRating(payload.rating);
    if (!rating || !MANAGER_RATING_VALUES.includes(rating)) {
      const error = new Error('rating must be "A", "B", or "-".');
      error.statusCode = 400;
      throw error;
    }
    updates.rating = rating;
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error(
      "Provide at least one of status, averageRating, or rating."
    );
    error.statusCode = 400;
    throw error;
  }

  const doc = await Manager.findByIdAndUpdate(id, { $set: updates }, { new: true });
  if (!doc) {
    const error = new Error("Manager not found.");
    error.statusCode = 404;
    throw error;
  }
  return serializeManager(doc);
}

async function deleteManager(id) {
  if (!id || typeof id !== "string") {
    const error = new Error("Manager id is required.");
    error.statusCode = 400;
    throw error;
  }
  const doc = await Manager.findByIdAndDelete(id);
  if (!doc) {
    const error = new Error("Manager not found.");
    error.statusCode = 404;
    throw error;
  }
  return { id: String(doc._id), employeeCode: doc.employeeCode };
}

function resolveColumnIndexes(headers, columnMap) {
  const headerIndex = new Map();
  headers.forEach((header, index) => {
    headerIndex.set(normalizeKey(header), index);
  });

  const indexes = {};
  for (const field of MANAGER_IMPORT_FIELDS) {
    const csvHeader = columnMap?.[field];
    if (csvHeader === undefined || csvHeader === null || csvHeader === "") {
      continue;
    }
    const idx = headerIndex.get(normalizeKey(csvHeader));
    if (idx === undefined) {
      const error = new Error(
        `CSV column "${csvHeader}" mapped to ${field} was not found in the header row.`
      );
      error.statusCode = 400;
      throw error;
    }
    indexes[field] = idx;
  }

  if (indexes.employeeCode === undefined) {
    const error = new Error("columnMap.employeeCode is required.");
    error.statusCode = 400;
    throw error;
  }

  return indexes;
}

function cellAt(row, index) {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

async function importManagersFromCsv({ csvText, columnMap, level }) {
  if (!MANAGER_LEVEL_VALUES.includes(level)) {
    const error = new Error('level must be "n-2" or "n-3".');
    error.statusCode = 400;
    throw error;
  }

  const { headers, rows } = parseCsv(csvText);
  const indexes = resolveColumnIndexes(headers, columnMap);

  const ops = [];
  const errors = [];
  let skipped = 0;

  rows.forEach((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const employeeCode = cellAt(row, indexes.employeeCode);
    if (!employeeCode) {
      skipped += 1;
      errors.push({ line: lineNumber, message: "Missing employeeCode." });
      return;
    }

    const name = cellAt(row, indexes.name);
    const entity = cellAt(row, indexes.entity);
    const statusRaw = cellAt(row, indexes.status);
    const ratingRaw = cellAt(row, indexes.rating);
    const averageRaw = cellAt(row, indexes.averageRating);

    const status =
      indexes.status !== undefined
        ? normalizeStatus(statusRaw)
        : MANAGER_STATUSES.NOT_COMPLETED;
    const rating =
      indexes.rating !== undefined ? normalizeRating(ratingRaw) : "-";
    const averageRating =
      indexes.averageRating !== undefined
        ? normalizeAverageRating(averageRaw)
        : 0;

    if (indexes.status !== undefined && !status) {
      skipped += 1;
      errors.push({
        line: lineNumber,
        message: `Invalid status "${statusRaw}".`
      });
      return;
    }
    if (indexes.rating !== undefined && !rating) {
      skipped += 1;
      errors.push({
        line: lineNumber,
        message: `Invalid rating "${ratingRaw}".`
      });
      return;
    }
    if (indexes.averageRating !== undefined && averageRating === null) {
      skipped += 1;
      errors.push({
        line: lineNumber,
        message: `Invalid averageRating "${averageRaw}".`
      });
      return;
    }
    if (indexes.name !== undefined && !name) {
      skipped += 1;
      errors.push({ line: lineNumber, message: "Missing name." });
      return;
    }
    if (indexes.entity !== undefined && !entity) {
      skipped += 1;
      errors.push({ line: lineNumber, message: "Missing entity." });
      return;
    }

    const setDoc = {
      employeeCode,
      level,
      status: status || MANAGER_STATUSES.NOT_COMPLETED,
      averageRating: averageRating ?? 0,
      rating: rating || "-"
    };
    if (indexes.name !== undefined) setDoc.name = name;
    if (indexes.entity !== undefined) setDoc.entity = entity;

    const setOnInsert = {};
    if (indexes.name === undefined) setOnInsert.name = employeeCode;
    if (indexes.entity === undefined) setOnInsert.entity = "Unknown";

    ops.push({
      updateOne: {
        filter: { employeeCode },
        update: {
          $set: setDoc,
          ...(Object.keys(setOnInsert).length > 0
            ? { $setOnInsert: setOnInsert }
            : {})
        },
        upsert: true
      }
    });
  });

  let imported = 0;
  let updated = 0;

  if (ops.length > 0) {
    const result = await Manager.bulkWrite(ops, { ordered: false });
    imported = result.upsertedCount ?? 0;
    updated = result.modifiedCount ?? 0;
  }

  return {
    level,
    totalRows: rows.length,
    imported,
    updated,
    skipped,
    errors: errors.slice(0, 50)
  };
}

module.exports = {
  listManagers,
  createManager,
  updateManagerMetrics,
  deleteManager,
  importManagersFromCsv,
  serializeManager,
  normalizeStatus,
  normalizeRating,
  normalizeAverageRating
};
