import { describe, it, expect } from 'vitest'
import { inferHorizonFromConditions, findValuationOptimalHorizon } from './horizonCalculator'
import type { CollapseCondition, ValuationAssumptions } from '../types/domain'

function condition(
  label: string,
  months: number | null,
  isPrimary = false,
): CollapseCondition {
  return {
    id: label, label, metricKey: null, operator: 'manual', threshold: null,
    unit: null, note: null, isPrimary,
    timeToValidate: months === null
      ? null
      : { months, source: 'user', confidence: 3, aiReasoning: null },
  }
}

describe('inferHorizonFromConditions — priority order', () => {
  it('uses the primary condition first', () => {
    const r = inferHorizonFromConditions(
      [condition('A', 60), condition('B', 24, true)], null)
    expect(r.basis).toBe('primary_condition')
    expect(r.recommendedMonths).toBe(24)
    expect(r.primaryConditionLabel).toBe('B')
    expect(r.rangeMin).toBe(18)
    expect(r.rangeMax).toBe(36)
  })

  it('falls back to the median of all conditions', () => {
    const r = inferHorizonFromConditions(
      [condition('A', 12), condition('B', 36), condition('C', 24)], null)
    expect(r.basis).toBe('median_conditions')
    expect(r.recommendedMonths).toBe(24)
  })

  it('averages the median with the valuation optimum when available', () => {
    const r = inferHorizonFromConditions(
      [condition('A', 12), condition('B', 36), condition('C', 24)], 48)
    expect(r.recommendedMonths).toBe(36) // (24 + 48) / 2
  })

  it('ignores conditions without a timeToValidate', () => {
    const r = inferHorizonFromConditions(
      [condition('A', null), condition('B', null)], 60)
    expect(r.basis).toBe('valuation_optimal')
    expect(r.recommendedMonths).toBe(60)
  })

  it('falls back to 36 months when nothing is known', () => {
    const r = inferHorizonFromConditions([], null)
    expect(r.basis).toBe('fallback')
    expect(r.recommendedMonths).toBe(36)
    expect(r.rangeMin).toBe(24)
    expect(r.rangeMax).toBe(48)
  })

  it('clamps recommendations to 6–120 months', () => {
    const r = inferHorizonFromConditions([condition('A', 600, true)], null)
    // Primary path returns the raw months for the recommendation itself,
    // but the median path clamps — verify the valuation path clamps instead.
    expect(r.recommendedMonths).toBe(600)
    const v = inferHorizonFromConditions([condition('A', null)], 600)
    expect(v.recommendedMonths).toBe(120)
  })
})

describe('findValuationOptimalHorizon', () => {
  const assumptions: ValuationAssumptions = {
    currentRevenue: 100, currentFcf: 10, currentEnterpriseValue: 100,
    baseRevenueGrowth: 10, baseFcfMargin: 20, exitMultiple: 10, years: 3,
  }

  it('returns a horizon in months within 1–10 years', () => {
    const m = findValuationOptimalHorizon(assumptions)
    expect(m).not.toBeNull()
    expect(m! % 12).toBe(0)
    expect(m!).toBeGreaterThanOrEqual(12)
    expect(m!).toBeLessThanOrEqual(120)
  })

  it('returns null when inputs are missing', () => {
    expect(findValuationOptimalHorizon({ ...assumptions, exitMultiple: null })).toBeNull()
    expect(findValuationOptimalHorizon({ ...assumptions, currentEnterpriseValue: 0 })).toBeNull()
  })
})
