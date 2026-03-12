import type { ThesisAnalysis, DataAnalysis, MarketAnalysis, ValuationReport, ReviewReport, ReviewRisk, ReviewMismatch } from '../types/domain'

// ── Payload ───────────────────────────────────────────────────────────────
interface ReviewPayload {
  company: { ticker: string; name: string; sector: string | null; horizonMonths: number }
  thesis: ThesisAnalysis | null
  dataLane: DataAnalysis | null
  marketLane: MarketAnalysis | null
  valuation: ValuationReport | null
}

// ── Expected AI output ────────────────────────────────────────────────────
interface ReviewEngineOutput {
  missingItems: string[]
  mismatches: { type: 'thesis_data' | 'data_market' | 'thesis_market'; title: string; detail: string; likelySource: 'thesis' | 'data' | 'market' | 'unclear' }[]
  risks: { category: string; severity: 1 | 2 | 3 | 4 | 5; title: string; detail: string }[]
  scenarioNotes: string[]
}

// ── System prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `あなたは投資分析の構造的査読者（Structured Reviewer）です。

役割:
- 投資仮説・財務データ・市場データを独立して査読する
- 欠損情報の特定
- レーン間の矛盾検出（Thesis vs Data / Data vs Market / Thesis vs Market）
- 見落とされているリスクの特定
- シナリオ展開

禁止:
- 投資推奨・BUY/SELL判断
- 楽観的な励まし
- 人格・投資家ロールプレイ
- 曖昧な表現（「〜かもしれない」より「〜の可能性がある。根拠: ...」）

必ず以下のJSON形式のみで回答してください（前置き・後置き・マークダウン不要）:
{
  "missingItems": ["不足している情報を列挙"],
  "mismatches": [
    {
      "type": "thesis_data | data_market | thesis_market",
      "title": "矛盾の見出し",
      "detail": "具体的な矛盾の説明",
      "likelySource": "thesis | data | market | unclear"
    }
  ],
  "risks": [
    {
      "category": "demand_risk | competition_risk | margin_risk | balance_sheet_risk | execution_risk | regulation_risk | multiple_compression | narrative_risk",
      "severity": 1〜5,
      "title": "リスクの見出し",
      "detail": "具体的な説明（数字・事例を含む）"
    }
  ],
  "scenarioNotes": ["シナリオ展開のコメント"]
}`

// ── Prompt builder ────────────────────────────────────────────────────────
function buildPrompt(payload: ReviewPayload): string {
  const sections: string[] = []

  sections.push(`=== 銘柄情報 ===
Ticker: ${payload.company.ticker}
Company: ${payload.company.name}
Sector: ${payload.company.sector ?? '未入力'}
投資期間: ${payload.company.horizonMonths}ヶ月`)

  if (payload.thesis) {
    const t = payload.thesis
    sections.push(`=== Thesis Lane ===
Investment Thesis: ${t.thesisText}
Drivers: ${t.drivers.join(' / ')}
崩壊条件: ${t.collapseConditions.map(c => `${c.label}（${c.operator} ${c.threshold ?? 'manual'}）`).join(' / ')}`)
  } else {
    sections.push('=== Thesis Lane ===\n未入力')
  }

  if (payload.dataLane) {
    const d = payload.dataLane
    const i = d.input
    sections.push(`=== Data Lane ===
Revenue Growth YoY: ${i.revenueGrowthYoy ?? '未入力'}%
Gross Margin: ${i.grossMargin ?? '未入力'}%
Operating Margin: ${i.operatingMargin ?? '未入力'}%
FCF Margin: ${i.fcfMargin ?? '未入力'}%
ROIC: ${i.roic ?? '未入力'}%
Net Debt/EBITDA: ${i.debtToEbitda ?? '未入力'}x
Share Dilution: ${i.shareDilutionAnnual ?? '未入力'}%/yr
スコア: BusinessQuality=${d.scores.businessQuality} CapitalEfficiency=${d.scores.capitalEfficiency} BalanceSheet=${d.scores.balanceSheetSafety} CashGen=${d.scores.cashGeneration}`)
  } else {
    sections.push('=== Data Lane ===\n未入力')
  }

  if (payload.marketLane) {
    const m = payload.marketLane
    const i = m.input
    const o = m.outputs
    sections.push(`=== Market Lane ===
アナリスト売上成長コンセンサス: ${i.analystRevenueConsensusGrowth ?? '未入力'}%
ユーザー売上成長予測: ${i.userRevenueGrowthForecast ?? '未入力'}%
期待ギャップ: ${o.marketExpectationGap !== null ? `${o.marketExpectationGap > 0 ? '+' : ''}${o.marketExpectationGap.toFixed(1)}%` : '未計算'}
現在EV/EBITDA: ${i.currentEvEbitda ?? '未入力'}x
ヒストリカルEV/EBITDA: ${i.historicalEvEbitdaMin ?? '?'}〜${i.historicalEvEbitdaMax ?? '?'}x
空売り比率: ${i.shortInterestPct ?? '未入力'}%
バリュエーション圧力: ${o.valuationPressure}`)
  } else {
    sections.push('=== Market Lane ===\n未入力')
  }

  if (payload.valuation) {
    const v = payload.valuation
    sections.push(`=== Valuation ===
期待CAGR（ベース）: ${v.expectedCagr !== null ? `${v.expectedCagr.toFixed(1)}%` : '未計算'}
ベアケースCAGR: ${v.scenarios.bear.expectedCagr !== null ? `${v.scenarios.bear.expectedCagr.toFixed(1)}%` : '未計算'}
ブルケースCAGR: ${v.scenarios.bull.expectedCagr !== null ? `${v.scenarios.bull.expectedCagr.toFixed(1)}%` : '未計算'}
CAGRゲート: ${v.cagrGate}`)
  } else {
    sections.push('=== Valuation ===\n未入力')
  }

  return sections.join('\n\n')
}

// ── API call ──────────────────────────────────────────────────────────────
async function callClaude(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.[0]?.text ?? ''
}

// ── Parse ─────────────────────────────────────────────────────────────────
function parseResponse(raw: string): ReviewEngineOutput {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned) as ReviewEngineOutput
  // Validate minimal structure
  if (!Array.isArray(parsed.missingItems)) parsed.missingItems = []
  if (!Array.isArray(parsed.mismatches))   parsed.mismatches = []
  if (!Array.isArray(parsed.risks))        parsed.risks = []
  if (!Array.isArray(parsed.scenarioNotes)) parsed.scenarioNotes = []
  return parsed
}

// ── Main ──────────────────────────────────────────────────────────────────
export async function runReviewEngine(payload: ReviewPayload): Promise<Omit<ReviewReport, 'id'>> {
  const prompt = buildPrompt(payload)
  const raw = await callClaude(SYSTEM_PROMPT, prompt)

  let output: ReviewEngineOutput
  try {
    output = parseResponse(raw)
  } catch {
    // Parse failure: save raw and return empty structure
    return {
      companyId: payload.company.ticker,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      missingItems: ['AIレスポンスのパースに失敗しました。再実行してください。'],
      mismatches: [],
      risks: [],
      scenarioNotes: [],
      rawResponse: raw,
      createdAt: new Date().toISOString(),
    }
  }

  return {
    companyId: payload.company.ticker,
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    missingItems: output.missingItems,
    mismatches: output.mismatches as ReviewMismatch[],
    risks: output.risks as ReviewRisk[],
    scenarioNotes: output.scenarioNotes,
    rawResponse: raw,
    createdAt: new Date().toISOString(),
  }
}
