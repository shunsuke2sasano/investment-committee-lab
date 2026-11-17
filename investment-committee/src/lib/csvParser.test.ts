import { describe, it, expect } from 'vitest'
import { parseCSV, mergePeriodsCSV, exportToCSV, generateTemplate } from './csvParser'
import type { FiscalPeriodData, DataLaneInput } from '../types/domain'

const emptyInput = (): DataLaneInput => ({
  revenueGrowthYoy: null, revenueGrowth3y: null, grossMargin: null,
  operatingMargin: null, fcfMargin: null, roic: null, debtToEbitda: null,
  netDebtToEquity: null, shareDilutionAnnual: null, reinvestmentRate: null,
  currentRatio: null,
})

describe('parseCSV', () => {
  it('parses fiscal years and numeric columns', () => {
    const r = parseCSV('fiscalYear,revenueGrowthYoy,roic\nFY2024,12.5,14\nFY2023,10,12')
    expect(r.error).toBeNull()
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].fiscalYear).toBe('FY2024')
    expect(r.rows[0].input.revenueGrowthYoy).toBe(12.5)
    expect(r.rows[0].input.roic).toBe(14)
    expect(r.rows[0].input.grossMargin).toBeNull()
  })

  it('supports the netDebtEbitda alias for debtToEbitda', () => {
    const r = parseCSV('fiscalYear,netDebtEbitda\nFY2024,1.5')
    expect(r.rows[0].input.debtToEbitda).toBe(1.5)
  })

  it('errors when the fiscalYear column is missing', () => {
    const r = parseCSV('roic\n14')
    expect(r.error).toContain('fiscalYear')
    expect(r.rows).toHaveLength(0)
  })

  it('errors on an empty file', () => {
    expect(parseCSV('').error).toBe('Empty file')
  })

  it('skips rows without a fiscal year and caps at 5 periods', () => {
    const lines = ['fiscalYear,roic', ',9']
    for (let i = 0; i < 7; i++) lines.push(`FY202${i},${i}`)
    const r = parseCSV(lines.join('\n'))
    expect(r.rows).toHaveLength(5)
    expect(r.skipped.some(s => s.reason === 'Missing fiscalYear')).toBe(true)
    expect(r.skipped.some(s => s.reason.includes('maximum of 5'))).toBe(true)
  })

  it('leaves non-numeric cells as null without skipping the row', () => {
    const r = parseCSV('fiscalYear,roic\nFY2024,abc')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].input.roic).toBeNull()
  })
})

describe('mergePeriodsCSV', () => {
  it('overwrites the same fiscal year and sorts descending', () => {
    const existing: FiscalPeriodData[] = [
      { fiscalYear: 'FY2023', input: { ...emptyInput(), roic: 10 } },
      { fiscalYear: 'FY2024', input: { ...emptyInput(), roic: 11 } },
    ]
    const incoming: FiscalPeriodData[] = [
      { fiscalYear: 'FY2024', input: { ...emptyInput(), roic: 99 } },
      { fiscalYear: 'FY2025', input: { ...emptyInput(), roic: 12 } },
    ]
    const merged = mergePeriodsCSV(existing, incoming)
    expect(merged.map(p => p.fiscalYear)).toEqual(['FY2025', 'FY2024', 'FY2023'])
    expect(merged[1].input.roic).toBe(99)
  })
})

describe('exportToCSV / generateTemplate', () => {
  it('round-trips through parseCSV', () => {
    const periods: FiscalPeriodData[] = [
      { fiscalYear: 'FY2024', input: { ...emptyInput(), roic: 14, grossMargin: 55 } },
    ]
    const r = parseCSV(exportToCSV(periods))
    expect(r.error).toBeNull()
    expect(r.rows[0].input.roic).toBe(14)
    expect(r.rows[0].input.grossMargin).toBe(55)
    expect(r.rows[0].input.fcfMargin).toBeNull()
  })

  it('template parses into 3 sample periods', () => {
    const r = parseCSV(generateTemplate())
    expect(r.error).toBeNull()
    expect(r.rows).toHaveLength(3)
  })
})
