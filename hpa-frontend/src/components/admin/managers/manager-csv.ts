import type { ManagerColumnMap, ManagerRecord } from '#/lib/admin-api'

export function parseCsv(csvText: string): { headers: string[]; rows: string[][] } {
  const normalized = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseLine = (line: string) => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      const next = line[i + 1]
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (char === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    cells.push(current.trim())
    return cells
  }

  return {
    headers: parseLine(lines[0] ?? ''),
    rows: lines.slice(1).map(parseLine),
  }
}

export function parseCsvHeaders(csvText: string): string[] {
  return parseCsv(csvText).headers
}

export function isBlankCell(raw: string) {
  const value = raw.replace(/\u00a0/g, ' ').trim()
  if (!value) return true
  const upper = value.toUpperCase()
  return (
    value === '-' ||
    value === '–' ||
    value === '—' ||
    upper === 'N/A' ||
    upper === 'NA' ||
    upper === '.'
  )
}

/** Stable placeholder so blank emp ids still import and re-import by CSV line. */
export function resolveEmployeeCode(raw: string, lineNumber: number) {
  if (isBlankCell(raw)) return `NO-ID-LINE-${lineNumber}`
  return raw.replace(/\u00a0/g, ' ').trim()
}

export type ImportPreview = {
  toAdd: Array<{ line: number; employeeCode: string; name: string; generatedCode: boolean }>
  toUpdate: Array<{
    line: number
    employeeCode: string
    name: string
    existingName: string
    generatedCode: boolean
  }>
}

export function buildImportPreview(
  csvText: string,
  columnMap: ManagerColumnMap,
  existing: ManagerRecord[],
): ImportPreview {
  const { headers, rows } = parseCsv(csvText)
  const headerIndex = new Map(
    headers.map((header, index) => [header.trim().toLowerCase(), index]),
  )
  const codeIdx = columnMap.employeeCode
    ? headerIndex.get(columnMap.employeeCode.trim().toLowerCase())
    : undefined
  const nameIdx = columnMap.name
    ? headerIndex.get(columnMap.name.trim().toLowerCase())
    : undefined

  const existingByCode = new Map(
    existing.map((row) => [row.employeeCode.trim().toLowerCase(), row]),
  )

  const toAdd: ImportPreview['toAdd'] = []
  const toUpdate: ImportPreview['toUpdate'] = []

  rows.forEach((row, rowIndex) => {
    const line = rowIndex + 2
    const rawCode = codeIdx !== undefined ? String(row[codeIdx] ?? '').trim() : ''
    const generatedCode = codeIdx === undefined || isBlankCell(rawCode)
    const employeeCode = resolveEmployeeCode(rawCode, line)
    const nameRaw =
      nameIdx !== undefined ? String(row[nameIdx] ?? '').trim() : ''
    const name = isBlankCell(nameRaw) ? employeeCode : nameRaw
    const existingRow = existingByCode.get(employeeCode.toLowerCase())

    if (existingRow) {
      toUpdate.push({
        line,
        employeeCode,
        name,
        existingName: existingRow.name,
        generatedCode,
      })
    } else {
      toAdd.push({ line, employeeCode, name, generatedCode })
    }
  })

  return { toAdd, toUpdate }
}

export function buildCleanedColumnMap(
  columnMap: ManagerColumnMap,
  fields: Array<{ key: keyof ManagerColumnMap }>,
): ManagerColumnMap {
  const cleaned: ManagerColumnMap = {
    employeeCode: columnMap.employeeCode || '',
  }
  for (const field of fields) {
    if (field.key === 'employeeCode') continue
    const value = columnMap[field.key]
    if (value) cleaned[field.key] = value
  }
  return cleaned
}
