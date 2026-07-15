/**
 * Minimal CSV parser (no packages).
 * Supports comma-separated values and basic double-quoted fields.
 */
function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(csvText) {
  if (typeof csvText !== "string" || !csvText.trim()) {
    const error = new Error("CSV text is required.");
    error.statusCode = 400;
    throw error;
  }

  const normalized = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    const error = new Error("CSV file is empty.");
    error.statusCode = 400;
    throw error;
  }

  const headers = parseCsvLine(lines[0]);
  if (headers.length === 0 || headers.every((h) => !h)) {
    const error = new Error("CSV header row is missing.");
    error.statusCode = 400;
    throw error;
  }

  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headers, rows };
}

module.exports = {
  parseCsv,
  parseCsvLine
};
