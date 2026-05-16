import type {
  ThesisAnalysis, DataAnalysis, MarketAnalysis,
  ValuationReport, ReviewReport, VerdictAxes, AxisScore,
} from '../../types/domain'
import { settingsRepository } from '../../db/repositories'
import { CLAUDE_MODEL, ANTHROPIC_API_VERSION } from '../../lib/constants'

// ── Payload ───────────────────────────────────────────────────────────────
export interface VerdictEnginePayload {
  company: { ticker: string; name: string; sector: string | null; horizonMonths: number }
  thesis: ThesisAnalysis | null
  dataLane: DataAnalysis | null
  marketLane: MarketAnalysis | null
  valuation: ValuationReport | null
  review: ReviewReport | null
}

// ── Output ────────────────────────────────────────────────────────────────
interface AxisDraft { score: 1|2|3|4|5; comment: string; veto: boolean }

export interface VerdictEngineOutput {
  axes: {
    businessQuality:         AxisDraft
    growthQuality:           AxisDraft
    capitalEfficiency:       AxisDraft
    balanceSheetSafety:      AxisDraft
    valuationAttractiveness: AxisDraft
    marketExpectationGap:    AxisDraft
    executionRisk:           AxisDraft
    governance:              AxisDraft
  }
  rationale: string
}

// ── System prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `あなたは投資判断の採点者です。
提供されたデータをもとに8軸を1-5点で採点し、各軸の根拠を1〜2行で記述してください。
VETOは「致命的な欠陥がある場合のみ」trueにしてください。

必ず以下のJSON形式のみで回答してください（前置き・後置き・マークダウン不要）:
{
  "axes": {
    "businessQuality":         { "score": 1〜5, "comment": "根拠1〜2行", "veto": false },
    "growthQuality":           { "score": 1〜5, "comment": "根拠1〜2行", "veto": false },
    "capitalEfficiency":       { "score": 1〜5, "comment": "根拠1〜2行", "veto": false },
    "balanceSheetSafety":      { "score": 1〜5, "comment": "根拠1〜2行", "veto": false },
    "valuationAttractiveness": { "score": 1〜5, "comment": "根拠1〜2行", "veto": false },
    "marketExpectationGap":    { "score": 1〜5, "comment": "根拠1〜2行", "veto": false },
    "executionRisk":           { "score": 1〜5, "comment": "根拠1〜2行", "veto": false },
    "governance":              { "score": 1〜5, "comment": "根拠1〜2行", "veto": false }
  },
  "rationale": "総合評価文（3〜5行）"
}`

// ── Prompt builder ────────────────────────────────────────────────────────
function buildPrompt(p: VerdictEnginePayload): string {
  const parts: string[] = []

  parts.push(`=== 銘柄情報 ===
Ticker: ${p.company.ticker}
Company: ${p.company.name}
Sector: ${p.company.sector ?? '未入力'}
投資期間: ${p.company.horizonMonths}ヶ月`)

  if (p.thesis) {
    const t = p.thesis
    parts.push(`=== Thesis Lane ===
Investment Thesis: ${t.thesisText}
Drivers: ${t.drivers.join(' / ')}
崩壊条件: ${t.collapseConditions.map(c => `${c.label}（${c.operator} ${c.threshold ?? 'manual'}）`).join(' / ')}`)
  } else {
    parts.push('=== Thesis Lane ===\n未入力')
  }

  if (p.dataLane) {
    const d = p.dataLane
    const i = d.input
    parts.push(`=== Data Lane ===
Revenue Growth YoY: ${i.revenueGrowthYoy ?? '未入力'}%
Gross Margin: ${i.grossMargin ?? '未入力'}%
Operating Margin: ${i.operatingMargin ?? '未入力'}%
FCF Margin: ${i.fcfMargin ?? '未入力'}%
ROIC: ${i.roic ?? '未入力'}%
Net Debt/EBITDA: ${i.debtToEbitda ?? '未入力'}x
スコア: BQ=${d.scores.businessQuality} CE=${d.scores.capitalEfficiency} BS=${d.scores.balanceSheetSafety} CG=${d.scores.cashGeneration}`)
  } else {
    parts.push('=== Data Lane ===\n未入力')
  }

  if (p.marketLane) {
    const m = p.marketLane
    const i = m.input
    const o = m.outputs
    parts.push(`=== Market Lane ===
アナリストコンセンサス成長: ${i.analystRevenueConsensusGrowth ?? '未入力'}%
ユーザー成長予測: ${i.userRevenueGrowthForecast ?? '未入力'}%
期待ギャップ: ${o.marketExpectationGap != null ? `${o.marketExpectationGap > 0 ? '+' : ''}${o.marketExpectationGap.toFixed(1)}%` : '未計算'}
バリュエーション圧力: ${o.valuationPressure}`)
  } else {
    parts.push('=== Market Lane ===\n未入力')
  }

  if (p.valuation) {
    const v = p.valuation
    parts.push(`=== Valuation ===
期待CAGR（ベース）: ${v.expectedCagr != null ? `${v.expectedCagr.toFixed(1)}%` : '未計算'}
CAGRゲート: ${v.cagrGate}`)
  } else {
    parts.push('=== Valuation ===\n未入力')
  }

  if (p.review) {
    const r = p.review
    const topRisks = r.risks.slice(0, 3).map(x => `${x.title}(SEV${x.severity})`).join(' / ')
    parts.push(`=== AI Review ===
主要リスク: ${topRisks || 'なし'}
矛盾数: ${r.mismatches.length}
欠損項目数: ${r.missingItems.length}`)
  }

  return parts.join('\n\n')
}

// ── API call ──────────────────────────────────────────────────────────────
async function resolveApiKey(): Promise<string> {
  const settings = await settingsRepository.get()
  const dbKey = (settings.anthropicApiKey ?? '').trim()
  if (dbKey) return dbKey
  return (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? ''
}

async function callClaude(system: string, user: string): Promise<string> {
  const apiKey = await resolveApiKey()
  if (!apiKey) throw new Error('APIキーが未設定です。Settings画面で設定してください。')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.[0]?.text ?? ''
}

// ── Parse (3-stage fallback) ──────────────────────────────────────────────
function clampScore(v: any): 1|2|3|4|5 {
  const n = Number(v)
  if (!isFinite(n)) return 3
  return Math.max(1, Math.min(5, Math.round(n))) as 1|2|3|4|5
}

const AXIS_KEYS = [
  'businessQuality', 'growthQuality', 'capitalEfficiency', 'balanceSheetSafety',
  'valuationAttractiveness', 'marketExpectationGap', 'executionRisk', 'governance',
] as const

function normalizeOutput(raw: any): VerdictEngineOutput {
  const axesRaw = raw.axes ?? {}
  const axes = {} as VerdictEngineOutput['axes']
  for (const key of AXIS_KEYS) {
    const a = axesRaw[key] ?? {}
    axes[key] = {
      score:   clampScore(a.score ?? 3),
      comment: typeof a.comment === 'string' ? a.comment : '',
      veto:    !!a.veto,
    }
  }
  return { axes, rationale: typeof raw.rationale === 'string' ? raw.rationale : '' }
}

function parseResponse(raw: string): VerdictEngineOutput {
  try { return normalizeOutput(JSON.parse(raw.trim())) } catch {}
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return normalizeOutput(JSON.parse(cleaned))
  } catch {}
  const start = raw.indexOf('{')
  const end   = raw.lastIndexOf('}')
  if (start !== -1 && end > start) return normalizeOutput(JSON.parse(raw.slice(start, end + 1)))
  throw new Error('JSON parse failed')
}

// ── Style scoring hints ───────────────────────────────────────────────────
const STYLE_SCORING_HINTS: Record<string, string> = {
  oracle:     '採点基準: Valuation(安全域)とBalance Sheet Safetyを重視。割高なら厳しく減点。',
  navigator:  '採点基準: Growth QualityとMarket Expectation Gapのバランスを重視。',
  visionary:  '採点基準: Business QualityとGrowth Qualityを重視。Valuationは甘め。',
  compounder: '採点基準: Capital EfficiencyとGovernanceを重視。安定した複利成長に着目。',
}

// ── Public API ────────────────────────────────────────────────────────────
export async function generateVerdictDraft(
  payload: VerdictEnginePayload,
  style?: 'oracle' | 'navigator' | 'visionary' | 'compounder',
): Promise<VerdictEngineOutput> {
  const systemPrompt = style
    ? `${STYLE_SCORING_HINTS[style]}\n\n${SYSTEM_PROMPT}`
    : SYSTEM_PROMPT
  const prompt = buildPrompt(payload)
  const raw = await callClaude(systemPrompt, prompt)
  return parseResponse(raw)
}

// ── Convert to VerdictAxes (merges with existing to preserve evidenceMetrics) ──
export function applyDraftToAxes(
  draft: VerdictEngineOutput['axes'],
  current: VerdictAxes,
): VerdictAxes {
  const result = { ...current }
  for (const key of AXIS_KEYS) {
    result[key] = {
      ...current[key],
      score:   draft[key].score,
      comment: draft[key].comment,
      veto:    draft[key].veto,
    } as AxisScore
  }
  return result
}
