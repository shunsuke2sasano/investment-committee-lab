import { CLAUDE_MODEL, ANTHROPIC_API_VERSION } from '../../lib/constants'
import { settingsRepository } from '../../db/repositories'

export type StyleReviewStyle = 'oracle' | 'navigator' | 'visionary' | 'compounder'

export interface StyleReviewResult {
  style: StyleReviewStyle
  signal: 'bullish' | 'neutral' | 'bearish'
  summary: string
  strongPoints: string[]
  concerns: string[]
  recommendation: string
}

interface ReviewPayload {
  company: { ticker: string; name?: string | null; sector?: string | null; horizonMonths?: number | null }
  thesis: any
  dataLane: any
  marketLane: any
  valuation: any
  review: any
}

const PERSONA_PROMPTS: Record<StyleReviewStyle, string> = {
  oracle: `あなたはウォーレン・バフェット流の価値投資家（THE ORACLE）です。
割安な優良企業を見極め、長期保有で複利を積み上げるスタイルです。
以下の観点で評価してください:
- バリュエーションの安全余白（Margin of Safety）
- ビジネスの耐久性・経済的な堀（モート）
- バランスシートの健全性と負債水準
- 理解可能なビジネスモデル（Circle of Competence）
- キャッシュフロー創出能力の安定性`,

  navigator: `あなたはGARP（Growth At Reasonable Price）投資家（THE NAVIGATOR）です。
成長性と割安性のバランスを見極め、過剰なリスクを取らず着実なリターンを目指します。
以下の観点で評価してください:
- 成長率とバリュエーション倍率の整合性（PEG的観点）
- アナリストコンセンサスとの乖離（自分だけのEdge）
- 成長の質・持続可能性の裏付け
- 市場期待値とのギャップとタイミング
- リスク対リターンのバランス`,

  visionary: `あなたは将来の成長テーマに賭けるグロース投資家（THE VISIONARY）です。
短期利益より長期的な市場拡大・破壊的イノベーションを重視します。
以下の観点で評価してください:
- TAM（総アドレス可能市場）の規模と拡大速度
- テクノロジー・ビジネスモデルの破壊的ポテンシャル
- 市場シェア獲得トレンドとモメンタム
- 将来の収益性・スケールメリットへの道筋
- 競合参入障壁の高さと持続性`,

  compounder: `あなたは優良企業の長期複利投資家（THE COMPOUNDER）です。
高ROIC・強固なモート・安定した配当成長を持つ企業を長期保有します。
以下の観点で評価してください:
- ROIC vs WACCのスプレッドと持続性
- 収益の安定性・予測可能性・季節変動
- 株主還元の質（配当成長率・自社株買いの規律）
- 資本配分の優秀さ・M&Aの規律
- 20年後も競争優位を保てる確信度`,
}

async function resolveApiKey(): Promise<string> {
  const settings = await settingsRepository.get()
  const dbKey = (settings.anthropicApiKey ?? '').trim()
  if (dbKey) return dbKey
  return (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? ''
}

function buildPrompt(payload: ReviewPayload, lang: 'en' | 'ja'): string {
  const lines: string[] = []

  lines.push(`銘柄: ${payload.company.ticker}${payload.company.name ? ` (${payload.company.name})` : ''}`)
  if (payload.company.sector)       lines.push(`セクター: ${payload.company.sector}`)
  if (payload.company.horizonMonths) lines.push(`投資期間: ${payload.company.horizonMonths}ヶ月`)

  if (payload.thesis) {
    lines.push('\n【投資仮説】')
    if (payload.thesis.summary)       lines.push(`サマリー: ${payload.thesis.summary}`)
    if (payload.thesis.drivers?.length)
      lines.push(`ドライバー: ${payload.thesis.drivers.join(' / ')}`)
  }

  if (payload.dataLane) {
    lines.push('\n【財務データ スコア】')
    const s = payload.dataLane.scores
    if (s) lines.push(`BQ:${s.businessQuality} CE:${s.capitalEfficiency} BS:${s.balanceSheetSafety} CG:${s.cashGeneration}`)
    const i = payload.dataLane.input
    if (i) {
      if (i.revenueGrowthYoy != null) lines.push(`売上成長YoY: ${i.revenueGrowthYoy}%`)
      if (i.grossMargin      != null) lines.push(`粗利率: ${i.grossMargin}%`)
      if (i.roic             != null) lines.push(`ROIC: ${i.roic}%`)
      if (i.fcfMargin        != null) lines.push(`FCFマージン: ${i.fcfMargin}%`)
      if (i.debtToEbitda     != null) lines.push(`Net Debt/EBITDA: ${i.debtToEbitda}x`)
      if (i.operatingMargin  != null) lines.push(`営業利益率: ${i.operatingMargin}%`)
    }
  }

  if (payload.marketLane) {
    lines.push('\n【マーケットコンテキスト】')
    const o = payload.marketLane.outputs
    if (o) {
      if (o.marketExpectationGap != null)
        lines.push(`期待値ギャップ: ${o.marketExpectationGap >= 0 ? '+' : ''}${o.marketExpectationGap.toFixed(1)}%`)
      if (o.valuationPressure) lines.push(`バリュエーション圧力: ${o.valuationPressure}`)
      if (o.sentimentRisk)     lines.push(`センチメントリスク: ${o.sentimentRisk}`)
    }
    const m = payload.marketLane.input
    if (m?.currentEvEbitda != null) lines.push(`EV/EBITDA: ${m.currentEvEbitda}x`)
  }

  if (payload.valuation) {
    lines.push('\n【バリュエーション】')
    if (payload.valuation.expectedCagr != null)
      lines.push(`期待CAGR（Base）: ${payload.valuation.expectedCagr.toFixed(1)}%`)
    if (payload.valuation.cagrGate)
      lines.push(`CAGRゲート: ${payload.valuation.cagrGate}`)
    const base = payload.valuation.base
    if (base?.impliedEnterpriseValue != null)
      lines.push(`想定EV（Base）: $${(base.impliedEnterpriseValue / 1000).toFixed(1)}B`)
  }

  if (payload.review) {
    lines.push('\n【AIレビュー概要】')
    if (payload.review.overallSignal) lines.push(`シグナル: ${payload.review.overallSignal}`)
    const risks = payload.review.risks?.slice(0, 3)
    if (risks?.length) lines.push(`主要リスク: ${risks.map((r: any) => r.title).join(' / ')}`)
  }

  const outputLang = lang === 'ja' ? '日本語' : 'English'
  lines.push(`\n出力言語: ${outputLang}`)
  lines.push(`\n上記データを踏まえ、あなたの投資スタイルの視点から評価してください。`)
  lines.push(`必ず以下のJSON形式のみで回答してください（前置き・後置き不要）:
{
  "signal": "bullish" | "neutral" | "bearish",
  "summary": "2〜3文の総評",
  "strongPoints": ["強み1", "強み2", "強み3"],
  "concerns": ["懸念1", "懸念2"],
  "recommendation": "このスタイルとしての具体的な行動提案（1〜2文）"
}`)

  return lines.join('\n')
}

export async function generateStyleReview(
  style: StyleReviewStyle,
  payload: ReviewPayload,
  lang: 'en' | 'ja' = 'ja',
): Promise<StyleReviewResult> {
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
      max_tokens: 700,
      system: PERSONA_PROMPTS[style],
      messages: [{ role: 'user', content: buildPrompt(payload, lang) }],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  const raw = data.content?.[0]?.text ?? ''
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)

  return {
    style,
    signal:         parsed.signal         ?? 'neutral',
    summary:        parsed.summary        ?? '',
    strongPoints:   parsed.strongPoints   ?? [],
    concerns:       parsed.concerns       ?? [],
    recommendation: parsed.recommendation ?? '',
  }
}
