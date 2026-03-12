import type { CollapseCondition, TimeToValidate } from '../types/domain'

// ═══════════════════════════════════════════════════════════════════════════
// AI HORIZON ESTIMATOR
// 崩壊条件ラベルからtimeToValidateを推定する
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `あなたは投資リスク分析の専門家です。
投資仮説の「崩壊条件」が市場または業績データ上で観測可能・判定可能になるまでの推定期間を算出します。

ルール:
- 期間は「何ヶ月後に判明するか」で回答する
- 楽観バイアスを避け、現実的な観測可能性で考える
- 規制・訴訟などの不確実性が高いものはconfidenceを低くする
- 四半期決算で確認できるものは3〜12ヶ月が多い
- 構造変化（競合の台頭、市場シェア移動）は12〜36ヶ月が多い
- 技術的な優位性の陳腐化は24〜60ヶ月が多い

必ず以下のJSON形式のみで回答してください（前置き・後置き不要）:
{
  "conditions": [
    {
      "id": "条件のid",
      "months": 推定月数（整数）,
      "confidence": 1〜5（1=非常に不確か, 5=高確度）,
      "reasoning": "推定根拠（1〜2文）"
    }
  ]
}`

interface EstimateInput {
  id: string
  label: string
  operator: string
  threshold: number | null
  unit: string | null
}

interface EstimateOutput {
  id: string
  months: number
  confidence: 1 | 2 | 3 | 4 | 5
  reasoning: string
}

export async function estimateTimeToValidate(
  conditions: CollapseCondition[],
  thesisText: string
): Promise<Map<string, TimeToValidate>> {
  // 未推定の条件のみ対象
  const targets = conditions.filter(c => c.timeToValidate === null && c.label.trim())
  if (targets.length === 0) return new Map()

  const payload: EstimateInput[] = targets.map(c => ({
    id: c.id,
    label: c.label,
    operator: c.operator,
    threshold: c.threshold,
    unit: c.unit,
  }))

  const userPrompt = `
投資仮説: ${thesisText}

以下の崩壊条件それぞれについて、判明期間を推定してください:
${JSON.stringify(payload, null, 2)}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  const raw = data.content?.[0]?.text ?? ''
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned) as { conditions: EstimateOutput[] }

  const result = new Map<string, TimeToValidate>()
  for (const item of parsed.conditions) {
    result.set(item.id, {
      months: item.months,
      source: 'ai',
      confidence: item.confidence as 1|2|3|4|5,
      aiReasoning: item.reasoning,
    })
  }
  return result
}

/**
 * AI説明文生成
 * HorizonInferenceの結果を自然言語で説明する
 */
export async function generateHorizonExplanation(params: {
  thesisText: string
  conditions: CollapseCondition[]
  recommendedMonths: number
  valuationOptimalMonths: number | null
  basis: string
  lang: 'en' | 'ja'
}): Promise<string> {
  const systemPrompt = params.lang === 'ja'
    ? `投資期間の推奨根拠を2〜3文で簡潔に説明してください。専門的かつ明確に。前置き不要。`
    : `Explain the recommended investment horizon in 2-3 sentences. Be professional and concise. No preamble.`

  const condSummary = params.conditions
    .filter(c => c.timeToValidate !== null)
    .map(c => `- ${c.label}: ${c.timeToValidate!.months}ヶ月 (confidence: ${c.timeToValidate!.confidence}/5)`)
    .join('\n')

  const userPrompt = params.lang === 'ja'
    ? `
投資仮説: ${params.thesisText}

崩壊条件の判明期間:
${condSummary || '（未入力）'}

推奨投資期間: ${params.recommendedMonths}ヶ月
算出根拠: ${params.basis}
Valuation最適期間: ${params.valuationOptimalMonths ? `${params.valuationOptimalMonths}ヶ月` : '未計算'}
`
    : `
Thesis: ${params.thesisText}

Collapse condition timelines:
${condSummary || '(not entered)'}

Recommended horizon: ${params.recommendedMonths} months
Basis: ${params.basis}
Valuation optimal: ${params.valuationOptimalMonths ? `${params.valuationOptimalMonths} months` : 'not calculated'}
`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}
