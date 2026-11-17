import type { DataLaneInput } from '../types/domain'

export interface FieldHelp {
  what: string      // 何を表す指標か
  formula: string   // 計算式
  good: string      // 良い水準の目安
  bad: string       // 悪い水準の目安
  tip: string       // 実務的なポイント
}

export const FIELD_HELP_JA: Record<keyof DataLaneInput, FieldHelp> = {
  revenueGrowthYoy: {
    what: '売上高の前年比成長率。会社の成長スピードを示す。',
    formula: '(今期売上 − 前期売上) / 前期売上 × 100',
    good: '成長株: 20%以上 / 安定株: 5〜15%',
    bad: '0%以下は要注意',
    tip: '業界平均と比較することが重要',
  },
  revenueGrowth3y: {
    what: '過去3年間の売上成長率（年平均）。一時的な変動を除いたトレンドを見る。',
    formula: '(最新売上 / 3年前売上)^(1/3) − 1 × 100',
    good: '15%以上',
    bad: '5%以下',
    tip: '単年より3年平均の方が実力を反映する',
  },
  grossMargin: {
    what: '売上から原価を引いた粗利益の割合。ビジネスの基本的な稼ぐ力。',
    formula: '(売上 − 原価) / 売上 × 100',
    good: 'SaaS: 70%以上 / 製造業: 30%以上',
    bad: '20%以下は価格競争に巻き込まれている可能性',
    tip: '高いほど価格決定力がある証拠',
  },
  operatingMargin: {
    what: '本業での利益率。販管費まで含めた経営効率を示す。',
    formula: '営業利益 / 売上 × 100',
    good: '20%以上',
    bad: '5%以下',
    tip: '売上が伸びても営業利益率が下がっている場合は注意',
  },
  fcfMargin: {
    what: '実際に会社に残る現金の割合。利益より重要な「本物の稼ぎ」。',
    formula: 'フリーキャッシュフロー / 売上 × 100',
    good: '15%以上',
    bad: '0%以下（現金を消費している）',
    tip: '利益が出ていてもFCFがマイナスなら要注意',
  },
  roic: {
    what: '投資した資本に対して何%の利益を生んでいるか。資本の使い方の上手さ。',
    formula: '税後営業利益 / (有利子負債 + 自己資本) × 100',
    good: '15%以上',
    bad: '8%以下（資本コストを下回る可能性）',
    tip: 'ROICが資本コスト(WACC)を上回り続けることが価値創造の条件',
  },
  debtToEbitda: {
    what: '借金をEBITDA（税引前利益+償却費）で割った指標。借金の返済能力。',
    formula: '純有利子負債 / EBITDA',
    good: '2倍以下',
    bad: '4倍以上',
    tip: '景気後退時でも3倍以下を維持できているかが重要',
  },
  netDebtToEquity: {
    what: '純借金を自己資本で割った指標。財務レバレッジの大きさ。',
    formula: '(有利子負債 − 現金) / 自己資本 × 100',
    good: '0〜50%',
    bad: '100%以上',
    tip: 'マイナス（ネットキャッシュ）なら財務的に非常に安全',
  },
  shareDilutionAnnual: {
    what: '株式の希薄化率。既存株主の持分が毎年どれだけ薄まるか。',
    formula: '発行済株式数の前年比増加率',
    good: '1%以下',
    bad: '3%以上',
    tip: 'ストックオプション多用の会社は要注意',
  },
  reinvestmentRate: {
    what: '利益をどれだけ事業再投資に回しているか。成長への投資意欲。',
    formula: '設備投資 / 営業キャッシュフロー × 100',
    good: '成長フェーズ: 60〜80% / 成熟期: 30〜50%',
    bad: '10%以下（成長投資をしていない）',
    tip: '高すぎても低すぎても問題。フェーズに合った水準が重要',
  },
  currentRatio: {
    what: '短期的な支払い能力。1年以内の借金を現金等で払えるか。',
    formula: '流動資産 / 流動負債',
    good: '1.5以上',
    bad: '1.0以下（支払い危機の可能性）',
    tip: '業種によって適正水準が異なる（小売業は1.0前後でも正常）',
  },
  goodwillIntangiblesToAssets: {
    what: '総資産に占めるのれん＋無形資産の割合。買収で膨らんだ資産への依存度を示す。',
    formula: '(のれん + 無形資産) / 総資産 × 100',
    good: '30%以下',
    bad: '50%以上は買収依存が高く、70%以上は減損リスクが大きい',
    tip: 'リスク審査専用の項目（品質スコアには使わない）。有形資産ベースで見た実質的な財務耐性を測る',
  },
}

export const FIELD_HELP_EN: Record<keyof DataLaneInput, FieldHelp> = {
  revenueGrowthYoy: {
    what: 'Year-over-year revenue growth. Shows how fast the company is growing.',
    formula: '(This year rev − Last year rev) / Last year rev × 100',
    good: 'Growth stock: 20%+ / Stable: 5–15%',
    bad: 'Below 0% is a warning sign',
    tip: 'Compare against industry average for context',
  },
  revenueGrowth3y: {
    what: '3-year revenue CAGR. Reveals the underlying trend by smoothing out single-year noise.',
    formula: '(Latest rev / Rev 3y ago)^(1/3) − 1 × 100',
    good: '15%+',
    bad: 'Below 5%',
    tip: '3-year average is more reliable than single-year figures',
  },
  grossMargin: {
    what: 'Gross profit as % of revenue. Measures the fundamental earning power of the business.',
    formula: '(Revenue − COGS) / Revenue × 100',
    good: 'SaaS: 70%+ / Manufacturing: 30%+',
    bad: 'Below 20% may indicate severe price competition',
    tip: 'Higher margin = stronger pricing power',
  },
  operatingMargin: {
    what: 'Operating profit margin. Efficiency after all operating expenses including SG&A.',
    formula: 'Operating income / Revenue × 100',
    good: '20%+',
    bad: 'Below 5%',
    tip: 'Watch for margin compression even when revenue is growing',
  },
  fcfMargin: {
    what: 'Free cash flow as % of revenue. The "real" cash the business generates.',
    formula: 'Free Cash Flow / Revenue × 100',
    good: '15%+',
    bad: 'Below 0% (cash-burning)',
    tip: 'Negative FCF even with positive earnings is a red flag',
  },
  roic: {
    what: 'Return on invested capital. How efficiently the company deploys its capital.',
    formula: 'NOPAT / (Total Debt + Equity) × 100',
    good: '15%+',
    bad: 'Below 8% (potentially below cost of capital)',
    tip: 'ROIC consistently above WACC is the foundation of value creation',
  },
  debtToEbitda: {
    what: 'Net debt divided by EBITDA. How many years of earnings to repay debt.',
    formula: 'Net Debt / EBITDA',
    good: '2x or below',
    bad: '4x or above',
    tip: 'Check whether the company stays below 3x even in a downturn',
  },
  netDebtToEquity: {
    what: 'Net debt relative to equity. Indicates the degree of financial leverage.',
    formula: '(Total Debt − Cash) / Equity × 100',
    good: '0–50%',
    bad: '100%+',
    tip: 'Negative (net cash position) means a very strong balance sheet',
  },
  shareDilutionAnnual: {
    what: 'Annual share dilution. How much existing shareholders\' ownership shrinks each year.',
    formula: 'YoY increase in shares outstanding',
    good: '1% or below',
    bad: '3%+',
    tip: 'Watch companies that heavily use stock-based compensation',
  },
  reinvestmentRate: {
    what: 'How much of cash flow is reinvested back into the business.',
    formula: 'Capex / Operating Cash Flow × 100',
    good: 'Growth phase: 60–80% / Mature: 30–50%',
    bad: 'Below 10% (not investing for growth)',
    tip: 'Too high or too low can both be problems — match to lifecycle stage',
  },
  currentRatio: {
    what: 'Short-term liquidity. Can the company cover near-term obligations with current assets?',
    formula: 'Current Assets / Current Liabilities',
    good: '1.5+',
    bad: 'Below 1.0 (potential solvency risk)',
    tip: 'Acceptable level varies by industry (retail often runs near 1.0 normally)',
  },
  goodwillIntangiblesToAssets: {
    what: 'Share of total assets made up of goodwill and intangibles — how much of the balance sheet was bought rather than built.',
    formula: '(Goodwill + Intangible Assets) / Total Assets × 100',
    good: 'Below 30%',
    bad: 'Above 50% signals acquisition dependence; above 70% impairment can erase equity',
    tip: 'Risk-screen only (not used by the quality scores). Measures tangible balance-sheet resilience',
  },
}
