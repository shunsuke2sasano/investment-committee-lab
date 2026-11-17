import { describe, it, expect } from 'vitest'
import {
  calculateVerdict, calculateValuation, cagrGateFor,
} from './calculators'
import { VERDICT_PROFILES } from '../types/domain'
import type { VerdictAxes, AxisScore, ValuationAssumptions } from '../types/domain'

const axis = (score: AxisScore['score'], veto = false): AxisScore => ({
  score, veto, comment: '', evidenceMetrics: [],
})

function allAxes(score: AxisScore['score']): VerdictAxes {
  return {
    businessQuality: axis(score), growthQuality: axis(score),
    capitalEfficiency: axis(score), balanceSheetSafety: axis(score),
    valuationAttractiveness: axis(score), marketExpectationGap: axis(score),
    executionRisk: axis(score), governance: axis(score),
  }
}

const std = VERDICT_PROFILES['standard']
const conservative = VERDICT_PROFILES['conservative']
const aggressive = VERDICT_PROFILES['aggressive']

describe('calculateVerdict — profile thresholds', () => {
  it('score 40/40 is BUY for every profile', () => {
    expect(calculateVerdict(allAxes(5), std).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), conservative).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), aggressive).verdict).toBe('BUY')
  })

  it('respects the BUY threshold boundary (standard: 30)', () => {
    const axes = allAxes(3) // 24 points, valuation 3 → no valScore rule
    axes.businessQuality = axis(5); axes.growthQuality = axis(5); axes.capitalEfficiency = axis(5) // +6 → 30
    expect(calculateVerdict(axes, std).totalScore).toBe(30)
    expect(calculateVerdict(axes, std).verdict).toBe('BUY')
    expect(calculateVerdict(axes, conservative).verdict).toBe('WATCH') // needs 32
  })

  it('falls to WATCH at the watch threshold and PASS below it', () => {
    const watch = allAxes(2); watch.valuationAttractiveness = axis(3)
    watch.businessQuality = axis(5); watch.growthQuality = axis(4) // 17 - 2 + 5 + 2 = 22
    expect(calculateVerdict(watch, std).totalScore).toBe(22)
    expect(calculateVerdict(watch, std).verdict).toBe('WATCH')

    const pass = allAxes(2); pass.valuationAttractiveness = axis(3) // 17 points
    expect(calculateVerdict(pass, std).verdict).toBe('PASS')
  })

  it('veto count above the profile max forces PASS', () => {
    const axes = allAxes(5)
    axes.governance = axis(5, true); axes.executionRisk = axis(5, true) // 2 vetos > max 1
    expect(calculateVerdict(axes, std).vetoCount).toBe(2)
    expect(calculateVerdict(axes, std).verdict).toBe('PASS')
    // Aggressive allows 2 vetos for BUY
    expect(calculateVerdict(axes, aggressive).verdict).toBe('BUY')
  })

  it('valuation axis below 3 caps at WATCH for standard/conservative only', () => {
    const axes = allAxes(5); axes.valuationAttractiveness = axis(2)
    expect(calculateVerdict(axes, std).verdict).toBe('WATCH')
    expect(calculateVerdict(axes, aggressive).verdict).toBe('BUY')
  })
})

describe('calculateVerdict — CAGR gate enforcement', () => {
  it('downgrades BUY to WATCH when the gate is block', () => {
    const r = calculateVerdict(allAxes(5), std, undefined, { cagrGate: 'block' })
    expect(r.verdict).toBe('WATCH')
    expect(r.cagrBlocked).toBe(true)
  })

  it('keeps BUY for pass / watch / unknown gates', () => {
    expect(calculateVerdict(allAxes(5), std, undefined, { cagrGate: 'pass' }).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std, undefined, { cagrGate: 'watch' }).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std, undefined, { cagrGate: null }).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std).cagrBlocked).toBe(false)
  })

  it('never upgrades or further downgrades WATCH / PASS', () => {
    const pass = allAxes(2); pass.valuationAttractiveness = axis(3)
    expect(calculateVerdict(pass, std, undefined, { cagrGate: 'block' }).verdict).toBe('PASS')
    const veto = allAxes(5); veto.governance = axis(5, true); veto.executionRisk = axis(5, true)
    expect(calculateVerdict(veto, std, undefined, { cagrGate: 'block' }).verdict).toBe('PASS')
  })
})

describe('cagrGateFor', () => {
  it('classifies against the default minimum of 12%', () => {
    expect(cagrGateFor(11.9)).toBe('block')
    expect(cagrGateFor(12)).toBe('watch')
    expect(cagrGateFor(19.9)).toBe('watch')
    expect(cagrGateFor(20)).toBe('pass')
    expect(cagrGateFor(35)).toBe('pass')
  })

  it('returns null for an unknown CAGR (no valuation yet)', () => {
    expect(cagrGateFor(null)).toBeNull()
    expect(cagrGateFor(NaN)).toBeNull()
  })

  it('honours a custom minimum from Settings', () => {
    expect(cagrGateFor(14.9, 15)).toBe('block')
    expect(cagrGateFor(15, 15)).toBe('watch')
    expect(cagrGateFor(24.9, 25)).toBe('block')
    expect(cagrGateFor(25, 25)).toBe('pass')
    expect(cagrGateFor(11, NaN)).toBe('block') // invalid min falls back to 12
  })
})

describe('calculateValuation', () => {
  const assumptions: ValuationAssumptions = {
    currentRevenue: 100, currentFcf: 10, currentEnterpriseValue: 100,
    baseRevenueGrowth: 10, baseFcfMargin: 20, exitMultiple: 10, years: 3,
  }

  it('computes the base expected CAGR and a pass gate by default', () => {
    const v = calculateValuation(assumptions)
    expect(v.expectedCagr).toBeCloseTo(38.6, 0)
    expect(v.cagrGate).toBe('pass')
    expect(v.bear.expectedCagr).toBeLessThan(v.base.expectedCagr!)
    expect(v.bull.expectedCagr).toBeGreaterThan(v.base.expectedCagr!)
  })

  it('applies the Settings minimum to the gate', () => {
    expect(calculateValuation(assumptions, 50).cagrGate).toBe('block')
    // A ~14% CAGR is 'watch' at the default minimum but 'block' at 15%.
    const modest = { ...assumptions, baseFcfMargin: 14, exitMultiple: 8 }
    expect(calculateValuation(modest).expectedCagr).toBeCloseTo(14.2, 0)
    expect(calculateValuation(modest).cagrGate).toBe('watch')
    expect(calculateValuation(modest, 15).cagrGate).toBe('block')
  })

  it('blocks when inputs are insufficient', () => {
    const v = calculateValuation({ ...assumptions, currentRevenue: null })
    expect(v.expectedCagr).toBeNull()
    expect(v.cagrGate).toBe('block')
  })

  it('uses Bear x0.65 / Base x1.0 / Bull x1.4 revenue growth adjustments', () => {
    const v = calculateValuation(assumptions)
    expect(v.bear.revenueGrowthAdj).toBe(0.65)
    expect(v.base.revenueGrowthAdj).toBe(1.0)
    expect(v.bull.revenueGrowthAdj).toBe(1.4)
  })
})
