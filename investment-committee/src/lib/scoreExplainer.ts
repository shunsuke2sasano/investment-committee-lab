import type { DataLaneInput } from '../types/domain'

export interface ScoreReason {
  label: string
  value: string
  contribution: 'positive' | 'negative' | 'neutral'
  note: string
}

export interface ScoreExplanation {
  score: number
  summary: string
  reasons: ScoreReason[]
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(v: number, unit = '%'): string {
  return `${v.toFixed(1)}${unit}`
}

function summaryByScore(
  score: number,
  summaries: { 5: string; 4: string; 3: string; 2: string; 1: string },
): string {
  return summaries[score as 1 | 2 | 3 | 4 | 5] ?? summaries[3]
}

// ── Business Quality ───────────────────────────────────────────────────────
// Fields: revenueGrowthYoy, grossMargin

export function explainBusinessQuality(
  input: DataLaneInput,
  score: number,
  lang: 'en' | 'ja',
): ScoreExplanation {
  const reasons: ScoreReason[] = []

  if (input.revenueGrowthYoy !== null) {
    const v = input.revenueGrowthYoy
    let contribution: ScoreReason['contribution']
    let note: string
    if (v >= 25)     { contribution = 'positive'; note = lang === 'ja' ? '≥25%: 非常に優秀な成長率' : '≥25%: exceptional growth' }
    else if (v >= 15){ contribution = 'positive'; note = lang === 'ja' ? '≥15%: 良好な成長率' : '≥15%: solid growth' }
    else if (v >= 5) { contribution = 'neutral';  note = lang === 'ja' ? '5–15%: 安定的な水準' : '5–15%: stable range' }
    else if (v >= 0) { contribution = 'negative'; note = lang === 'ja' ? '<5%: 成長が鈍化' : '<5%: slowing growth' }
    else             { contribution = 'negative'; note = lang === 'ja' ? 'マイナス成長' : 'negative growth' }
    reasons.push({ label: lang === 'ja' ? '売上成長率 YoY' : 'Revenue Growth YoY', value: fmt(v), contribution, note })
  }

  if (input.grossMargin !== null) {
    const v = input.grossMargin
    let contribution: ScoreReason['contribution']
    let note: string
    if (v >= 60)     { contribution = 'positive'; note = lang === 'ja' ? '≥60%: 高収益ビジネス' : '≥60%: high-margin business' }
    else if (v >= 40){ contribution = 'positive'; note = lang === 'ja' ? '≥40%: 良好な粗利率' : '≥40%: solid gross margin' }
    else if (v >= 20){ contribution = 'neutral';  note = lang === 'ja' ? '20–40%: 標準的な水準' : '20–40%: average range' }
    else if (v >= 10){ contribution = 'negative'; note = lang === 'ja' ? '<20%: 価格競争の可能性' : '<20%: possible price competition' }
    else             { contribution = 'negative'; note = lang === 'ja' ? '<10%: 非常に低い粗利率' : '<10%: very low margin' }
    reasons.push({ label: lang === 'ja' ? '粗利率' : 'Gross Margin', value: fmt(v), contribution, note })
  }

  const summary = summaryByScore(score, {
    5: lang === 'ja' ? '成長性・収益性ともに非常に優秀' : 'Excellent growth and profitability',
    4: lang === 'ja' ? '成長性・収益性は高水準' : 'Strong growth and margins',
    3: lang === 'ja' ? '成長性または収益性に改善余地あり' : 'Average — some room to improve',
    2: lang === 'ja' ? '成長または収益性に課題あり' : 'Growth or margin weakness',
    1: lang === 'ja' ? '成長性・収益性ともに要注意' : 'Significant concern on growth and margins',
  })

  return { score, summary, reasons }
}

// ── Capital Efficiency ─────────────────────────────────────────────────────
// Fields: roic, shareDilutionAnnual

export function explainCapitalEfficiency(
  input: DataLaneInput,
  score: number,
  lang: 'en' | 'ja',
): ScoreExplanation {
  const reasons: ScoreReason[] = []

  if (input.roic !== null) {
    const v = input.roic
    let contribution: ScoreReason['contribution']
    let note: string
    if (v >= 25)     { contribution = 'positive'; note = lang === 'ja' ? '≥25%: 資本効率が非常に高い' : '≥25%: highly efficient capital use' }
    else if (v >= 15){ contribution = 'positive'; note = lang === 'ja' ? '≥15%: 資本コストを十分上回る' : '≥15%: well above cost of capital' }
    else if (v >= 8) { contribution = 'neutral';  note = lang === 'ja' ? '8–15%: 資本コスト付近' : '8–15%: near cost of capital' }
    else if (v >= 0) { contribution = 'negative'; note = lang === 'ja' ? '<8%: 資本コストを下回る可能性' : '<8%: may be below WACC' }
    else             { contribution = 'negative'; note = lang === 'ja' ? 'マイナスROIC' : 'negative ROIC' }
    reasons.push({ label: 'ROIC', value: fmt(v), contribution, note })
  }

  if (input.shareDilutionAnnual !== null) {
    const v = input.shareDilutionAnnual
    let contribution: ScoreReason['contribution']
    let note: string
    if (v <= 0)      { contribution = 'positive'; note = lang === 'ja' ? '自社株買い実施中' : 'share buyback in progress' }
    else if (v <= 2) { contribution = 'neutral';  note = lang === 'ja' ? '≤2%: 許容範囲内の希薄化' : '≤2%: acceptable dilution' }
    else if (v <= 5) { contribution = 'negative'; note = lang === 'ja' ? '2–5%: 希薄化高め' : '2–5%: elevated dilution' }
    else             { contribution = 'negative'; note = lang === 'ja' ? '>5%: 株主価値を毀損' : '>5%: significantly dilutive' }
    reasons.push({ label: lang === 'ja' ? '希薄化率' : 'Share Dilution', value: fmt(v, '% /yr'), contribution, note })
  }

  const summary = summaryByScore(score, {
    5: lang === 'ja' ? '資本効率が非常に高く株主還元も良好' : 'Excellent capital efficiency with good shareholder returns',
    4: lang === 'ja' ? '資本を効率的に活用できている' : 'Capital deployed efficiently',
    3: lang === 'ja' ? '資本効率に改善余地あり' : 'Average capital efficiency',
    2: lang === 'ja' ? '資本コストを下回るか希薄化が懸念' : 'Below-average efficiency or dilution concern',
    1: lang === 'ja' ? '資本が毀損されている可能性' : 'Capital destruction risk',
  })

  return { score, summary, reasons }
}

// ── Balance Sheet Safety ───────────────────────────────────────────────────
// Fields: debtToEbitda, currentRatio

export function explainBalanceSheetSafety(
  input: DataLaneInput,
  score: number,
  lang: 'en' | 'ja',
): ScoreExplanation {
  const reasons: ScoreReason[] = []

  if (input.debtToEbitda !== null) {
    const v = input.debtToEbitda
    let contribution: ScoreReason['contribution']
    let note: string
    if (v <= 0)      { contribution = 'positive'; note = lang === 'ja' ? 'ネットキャッシュポジション' : 'net cash position' }
    else if (v <= 1) { contribution = 'positive'; note = lang === 'ja' ? '≤1x: 非常に低い負債' : '≤1x: very low leverage' }
    else if (v <= 2) { contribution = 'neutral';  note = lang === 'ja' ? '1–2x: 適切な水準' : '1–2x: manageable leverage' }
    else if (v <= 4) { contribution = 'negative'; note = lang === 'ja' ? '2–4x: やや高い負債' : '2–4x: elevated leverage' }
    else             { contribution = 'negative'; note = lang === 'ja' ? '>4x: 高負債リスク' : '>4x: high leverage risk' }
    reasons.push({ label: lang === 'ja' ? '純負債 / EBITDA' : 'Net Debt / EBITDA', value: fmt(v, 'x'), contribution, note })
  }

  if (input.currentRatio !== null) {
    const v = input.currentRatio
    let contribution: ScoreReason['contribution']
    let note: string
    if (v >= 2)      { contribution = 'positive'; note = lang === 'ja' ? '≥2x: 流動性が高い' : '≥2x: strong liquidity' }
    else if (v >= 1) { contribution = 'neutral';  note = lang === 'ja' ? '1–2x: 正常な水準' : '1–2x: adequate liquidity' }
    else             { contribution = 'negative'; note = lang === 'ja' ? '<1x: 短期支払い能力に懸念' : '<1x: near-term liquidity risk' }
    reasons.push({ label: lang === 'ja' ? '流動比率' : 'Current Ratio', value: fmt(v, 'x'), contribution, note })
  }

  const summary = summaryByScore(score, {
    5: lang === 'ja' ? 'バランスシートが非常に健全' : 'Exceptionally strong balance sheet',
    4: lang === 'ja' ? '財務基盤は安定している' : 'Solid balance sheet',
    3: lang === 'ja' ? '財務リスクは標準的な水準' : 'Average balance sheet strength',
    2: lang === 'ja' ? '負債水準または流動性に注意が必要' : 'Elevated debt or liquidity concern',
    1: lang === 'ja' ? '財務リスクが高い' : 'High financial risk',
  })

  return { score, summary, reasons }
}

// ── Cash Generation ────────────────────────────────────────────────────────
// Fields: fcfMargin, operatingMargin

export function explainCashGeneration(
  input: DataLaneInput,
  score: number,
  lang: 'en' | 'ja',
): ScoreExplanation {
  const reasons: ScoreReason[] = []

  if (input.fcfMargin !== null) {
    const v = input.fcfMargin
    let contribution: ScoreReason['contribution']
    let note: string
    if (v >= 20)     { contribution = 'positive'; note = lang === 'ja' ? '≥20%: 非常に高いFCF創出力' : '≥20%: exceptional FCF generation' }
    else if (v >= 10){ contribution = 'positive'; note = lang === 'ja' ? '≥10%: 良好なFCFマージン' : '≥10%: solid FCF margin' }
    else if (v >= 0) { contribution = 'neutral';  note = lang === 'ja' ? '0–10%: FCF創出はプラス' : '0–10%: positive but modest FCF' }
    else             { contribution = 'negative'; note = lang === 'ja' ? '<0%: 現金を消費している' : '<0%: burning cash' }
    reasons.push({ label: lang === 'ja' ? 'FCFマージン' : 'FCF Margin', value: fmt(v), contribution, note })
  }

  if (input.operatingMargin !== null) {
    const v = input.operatingMargin
    let contribution: ScoreReason['contribution']
    let note: string
    if (v >= 25)     { contribution = 'positive'; note = lang === 'ja' ? '≥25%: 非常に高い営業利益率' : '≥25%: excellent operating leverage' }
    else if (v >= 0) { contribution = 'neutral';  note = lang === 'ja' ? '0–25%: 黒字営業利益' : '0–25%: positive operating margin' }
    else             { contribution = 'negative'; note = lang === 'ja' ? '<0%: 営業赤字' : '<0%: operating at a loss' }
    reasons.push({ label: lang === 'ja' ? '営業利益率' : 'Operating Margin', value: fmt(v), contribution, note })
  }

  const summary = summaryByScore(score, {
    5: lang === 'ja' ? '非常に高いFCF創出力を持つ' : 'Exceptional free cash flow generation',
    4: lang === 'ja' ? 'FCF創出力は高水準' : 'Strong cash generation',
    3: lang === 'ja' ? '現金創出はプラスだが改善余地あり' : 'Modest but positive cash generation',
    2: lang === 'ja' ? 'FCFまたは収益性に改善が必要' : 'Weak cash generation',
    1: lang === 'ja' ? '現金を消費しており要注意' : 'Cash-burning — needs attention',
  })

  return { score, summary, reasons }
}
