import { settingsRepository } from '../../db/repositories'
import { CLAUDE_MODEL, ANTHROPIC_API_VERSION } from '../../lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────
export interface ThesisGuideDraft {
  thesisText: string
  drivers: string[]
  collapseConditions: { label: string; note: string }[]
}

// ── API helpers (same pattern as reviewEngine/service.ts) ──────────────────
async function resolveApiKey(): Promise<string> {
  const settings = await settingsRepository.get()
  const dbKey = (settings.anthropicApiKey ?? '').trim()
  if (dbKey) return dbKey
  return (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? ''
}

const SYSTEM_PROMPT = `あなたは株式投資のThesis作成を助けるアシスタントです。
初心者でも理解できる平易な日本語で、具体的かつ簡潔に記述してください。

以下のJSON形式のみで回答してください（前置き・後置き・マークダウン不要）:
{
  "thesisText": "1行の投資仮説（なぜこの会社が市場に勝つか）",
  "drivers": ["仮説を支える根拠1（3〜5個）", "根拠2", "根拠3"],
  "collapseConditions": [
    { "label": "崩壊条件の短いラベル（3〜5個）", "note": "具体的な説明" },
    { "label": "崩壊条件の短いラベル", "note": "具体的な説明" },
    { "label": "崩壊条件の短いラベル", "note": "具体的な説明" }
  ]
}

driversとcollapseConditionsはそれぞれ3〜5個生成してください。重要なものほど上に配置してください。`

// ── Main ──────────────────────────────────────────────────────────────────
export async function generateThesisDraft(
  ticker: string,
  companyName: string,
  sector: string | null,
  userMemo: string,
): Promise<ThesisGuideDraft> {
  const apiKey = await resolveApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')

  const userPrompt = `以下の情報をもとに、この銘柄の投資仮説の叩き台を作成してください。

Ticker: ${ticker}
会社名: ${companyName}
セクター: ${sector ?? '不明'}
ユーザーメモ: ${userMemo.trim() || '（特になし）'}

ユーザーが「知らない」「わからない」と入力した場合や空欄の場合は、
ticker・会社名・セクターの情報だけで推測して生成してください。`

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
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message ?? 'API_ERROR')

  const raw: string = data.content?.[0]?.text ?? ''
  const cleaned = raw.replace(/```json|```/g, '').trim()

  let parsed: ThesisGuideDraft
  try {
    parsed = JSON.parse(cleaned) as ThesisGuideDraft
  } catch {
    throw new Error('PARSE_ERROR')
  }

  // 最低限の構造保証
  if (typeof parsed.thesisText !== 'string') parsed.thesisText = ''
  if (!Array.isArray(parsed.drivers)) parsed.drivers = []
  if (!Array.isArray(parsed.collapseConditions)) parsed.collapseConditions = []

  return parsed
}
