import type {
  CollapseCondition, HorizonInference, HorizonBasis, ValuationAssumptions
} from '../types/domain'

// ═══════════════════════════════════════════════════════════════════════════
// HORIZON CALCULATOR — pure functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 崩壊条件群から推奨Horizonを算出する
 *
 * 優先順位:
 *   1. isPrimary=true の条件が存在する → その timeToValidate.months を使用
 *   2. isPrimaryなし → 全条件の timeToValidate.months の中央値
 *   3. timeToValidate が一つもない → valuation逆算 or fallback(36)
 */
export function inferHorizonFromConditions(
  conditions: CollapseCondition[],
  valuationOptimalMonths: number | null,
): HorizonInference {
  const now = new Date().toISOString()

  // ① primaryがある
  const primaryConditions = conditions.filter(
    c => c.isPrimary && c.timeToValidate !== null
  )
  if (primaryConditions.length > 0) {
    const months = primaryConditions[0].timeToValidate!.months
    const allMonths = conditions
      .filter(c => c.timeToValidate !== null)
      .map(c => c.timeToValidate!.months)

    return {
      recommendedMonths: months,
      rangeMin: Math.max(6, months - 6),
      rangeMax: months + 12,
      basis: 'primary_condition',
      primaryConditionLabel: primaryConditions[0].label,
      valuationOptimalMonths,
      aiExplanation: null,
      computedAt: now,
    }
  }

  // ② 複数条件の中央値
  const allWithTime = conditions.filter(c => c.timeToValidate !== null)
  if (allWithTime.length > 0) {
    const sorted = [...allWithTime]
      .map(c => c.timeToValidate!.months)
      .sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const minMonths = sorted[0]
    const maxMonths = sorted[sorted.length - 1]

    // Valuationと調整
    const adjusted = valuationOptimalMonths
      ? Math.round((median + valuationOptimalMonths) / 2)
      : median

    return {
      recommendedMonths: clampHorizon(adjusted),
      rangeMin: clampHorizon(minMonths),
      rangeMax: maxMonths + 12,
      basis: 'median_conditions',
      primaryConditionLabel: null,
      valuationOptimalMonths,
      aiExplanation: null,
      computedAt: now,
    }
  }

  // ③ timeToValidateが全くない → Valuation逆算
  if (valuationOptimalMonths !== null) {
    return {
      recommendedMonths: clampHorizon(valuationOptimalMonths),
      rangeMin: Math.max(6, valuationOptimalMonths - 12),
      rangeMax: valuationOptimalMonths + 12,
      basis: 'valuation_optimal',
      primaryConditionLabel: null,
      valuationOptimalMonths,
      aiExplanation: null,
      computedAt: now,
    }
  }

  // ④ fallback
  return {
    recommendedMonths: 36,
    rangeMin: 24,
    rangeMax: 48,
    basis: 'fallback',
    primaryConditionLabel: null,
    valuationOptimalMonths: null,
    aiExplanation: null,
    computedAt: now,
  }
}

/**
 * Valuationの前提でCAGRが最大になる期間を探す
 * years: 1〜10年の範囲でスキャン
 */
export function findValuationOptimalHorizon(
  assumptions: ValuationAssumptions
): number | null {
  const {
    currentRevenue, currentEnterpriseValue,
    baseRevenueGrowth, baseFcfMargin, exitMultiple
  } = assumptions

  if (
    currentRevenue === null || currentEnterpriseValue === null ||
    baseRevenueGrowth === null || baseFcfMargin === null ||
    exitMultiple === null || currentEnterpriseValue <= 0
  ) return null

  const g = baseRevenueGrowth / 100
  const m = baseFcfMargin / 100

  let bestCagr = -Infinity
  let bestYears = 3

  for (let years = 1; years <= 10; years++) {
    const futureRev = currentRevenue * Math.pow(1 + g, years)
    const futureFcf = futureRev * m
    const futureEV  = futureFcf * exitMultiple
    if (futureEV <= 0) continue
    const cagr = Math.pow(futureEV / currentEnterpriseValue, 1 / years) - 1
    if (cagr > bestCagr) {
      bestCagr = cagr
      bestYears = years
    }
  }

  return bestYears * 12  // months
}

function clampHorizon(months: number): number {
  return Math.max(6, Math.min(120, Math.round(months)))
}

/**
 * Horizon信頼度スコア（表示用）
 * 崩壊条件のtimeToValidateのconfidence平均
 */
export function calcHorizonConfidence(conditions: CollapseCondition[]): number | null {
  const withTime = conditions.filter(c => c.timeToValidate !== null)
  if (withTime.length === 0) return null
  const avg = withTime.reduce((s, c) => s + c.timeToValidate!.confidence, 0) / withTime.length
  return Math.round(avg * 10) / 10
}
