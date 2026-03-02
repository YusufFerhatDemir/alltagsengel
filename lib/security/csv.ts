const FORMULA_PREFIX_RE = /^[=+\-@]/

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\r?\n/g, ' ').trim()
}

export function escapeCsvCell(value: unknown): string {
  let cell = normalizeCellValue(value)

  if (FORMULA_PREFIX_RE.test(cell)) {
    cell = `'${cell}`
  }

  return `"${cell.replace(/"/g, '""')}"`
}

export function buildCsvRow(values: unknown[]): string {
  return values.map(escapeCsvCell).join(';')
}
