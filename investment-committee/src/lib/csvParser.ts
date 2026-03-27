// ═══════════════════════════════════════════════════════════════════════════
// CSV Parser — DataLane import/export
// ═══════════════════════════════════════════════════════════════════════════
import type { DataLaneInput, FiscalPeriodData } from '../types/domain'

// Column header → DataLaneInput key mapping (supports alias names)
const COLUMN_MAP: Record<string, keyof DataLaneInput> = {
  revenueGrowthYoy:    'revenueGrowthYoy',
  revenueGrowth3y:     'revenueGrowth3y',
  grossMargin:         'grossMargin',
  operatingMargin:     'operatingMargin',
  fcfMargin:           'fcfMargin',
  roic:                'roic',
  debtToEbitda:        'debtToEbitda',
  netDebtEbitda:       'debtToEbitda',  // alias for spec compatibility
  netDebtToEquity:     'netDebtToEquity',
  shareDilutionAnnual: 'shareDilutionAnnual',
  reinvestmentRate:    'reinvestmentRate',
  currentRatio:        'currentRatio',
}

// Ordered list of columns for export (canonical names)
export const CSV_COLUMNS: Array<{ header: string; field: keyof DataLaneInput }> = [
  { header: 'revenueGrowthYoy',    field: 'revenueGrowthYoy' },
  { header: 'revenueGrowth3y',     field: 'revenueGrowth3y' },
  { header: 'grossMargin',         field: 'grossMargin' },
  { header: 'operatingMargin',     field: 'operatingMargin' },
  { header: 'fcfMargin',           field: 'fcfMargin' },
  { header: 'roic',                field: 'roic' },
  { header: 'debtToEbitda',        field: 'debtToEbitda' },
  { header: 'netDebtToEquity',     field: 'netDebtToEquity' },
  { header: 'shareDilutionAnnual', field: 'shareDilutionAnnual' },
  { header: 'reinvestmentRate',    field: 'reinvestmentRate' },
  { header: 'currentRatio',        field: 'currentRatio' },
]

export interface SkippedRow {
  rowNum: number
  reason: string
}

export interface ParseResult {
  rows: FiscalPeriodData[]
  skipped: SkippedRow[]
  error: string | null
}

const EMPTY_INPUT: DataLaneInput = {
  revenueGrowthYoy: null, revenueGrowth3y: null,
  grossMargin: null, operatingMargin: null, fcfMargin: null,
  roic: null, debtToEbitda: null, netDebtToEquity: null,
  shareDilutionAnnual: null, reinvestmentRate: null, currentRatio: null,
}

export function parseCSV(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)

  if (lines.length < 1) {
    return { rows: [], skipped: [], error: 'Empty file' }
  }

  const headers = lines[0].split(',').map(h => h.trim())
  const fyIdx = headers.findIndex(h => h === 'fiscalYear')
  if (fyIdx === -1) {
    return { rows: [], skipped: [], error: 'Missing required column: fiscalYear' }
  }

  const colMappings: Array<keyof DataLaneInput | null> = headers.map((h, i) => {
    if (i === fyIdx) return null
    return COLUMN_MAP[h] ?? null
  })

  const rows: FiscalPeriodData[] = []
  const skipped: SkippedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim())
    const fyVal = cells[fyIdx]?.trim()

    if (!fyVal) {
      skipped.push({ rowNum: i + 1, reason: 'Missing fiscalYear' })
      continue
    }

    const input: DataLaneInput = { ...EMPTY_INPUT }
    let hasError = false

    for (let j = 0; j < headers.length; j++) {
      if (j === fyIdx) continue
      const field = colMappings[j]
      if (!field) continue

      const raw = cells[j]
      if (raw === undefined || raw === '') continue  // empty → stays null

      const num = parseFloat(raw)
      if (isNaN(num)) {
        skipped.push({ rowNum: i + 1, reason: `Column "${headers[j]}" is not a number: "${raw}"` })
        hasError = true
        break  // skip entire row on first non-numeric value
      }

      input[field] = num
    }

    if (hasError) continue
    rows.push({ fiscalYear: fyVal, input })
  }

  return { rows, skipped, error: null }
}

// Merge incoming periods into existing. Same fiscalYear → overwrite.
// Returns sorted descending by fiscalYear.
export function mergePeriodsCSV(
  existing: FiscalPeriodData[],
  incoming: FiscalPeriodData[],
): FiscalPeriodData[] {
  const map = new Map<string, FiscalPeriodData>()
  for (const p of existing) map.set(p.fiscalYear, p)
  for (const p of incoming) map.set(p.fiscalYear, p)
  return Array.from(map.values()).sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear))
}

export function exportToCSV(periods: FiscalPeriodData[]): string {
  const headers = ['fiscalYear', ...CSV_COLUMNS.map(c => c.header)]
  const lines: string[] = [headers.join(',')]

  for (const period of periods) {
    const cells = [
      period.fiscalYear,
      ...CSV_COLUMNS.map(({ field }) => {
        const v = period.input[field]
        return v !== null ? String(v) : ''
      }),
    ]
    lines.push(cells.join(','))
  }

  return lines.join('\n')
}

export function generateTemplate(): string {
  const headers = ['fiscalYear', ...CSV_COLUMNS.map(c => c.header)]
  return headers.join(',') + '\n'
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
