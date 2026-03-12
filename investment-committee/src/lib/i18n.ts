// ═══════════════════════════════════════════════════════════════════════════
// i18n — EN / JA
// ═══════════════════════════════════════════════════════════════════════════

export type Lang = 'en' | 'ja'

export const translations = {
  // ── Global ──────────────────────────────────────────────────────────────
  appTitle: {
    en: 'INVESTMENT COMMITTEE',
    ja: 'インベストメント委員会',
  },
  localOnly: {
    en: 'LOCAL ONLY',
    ja: 'ローカル保存',
  },

  // ── Nav ─────────────────────────────────────────────────────────────────
  nav_cases: { en: 'CASES', ja: 'ケース' },
  nav_lessons: { en: 'LESSONS', ja: 'レッスン' },
  nav_settings: { en: 'SETTINGS', ja: '設定' },

  // ── Company List ─────────────────────────────────────────────────────────
  companiesTitle: { en: 'INVESTMENT CASES', ja: '投資ケース一覧' },
  companiesSubtitle: { en: 'COMPANY LIST', ja: 'ケース管理' },
  newCase: { en: '+ NEW CASE', ja: '+ 新規ケース' },
  export: { en: 'EXPORT', ja: 'エクスポート' },
  import: { en: 'IMPORT', ja: 'インポート' },
  searchPlaceholder: { en: 'Search ticker or company...', ja: 'Ticker・会社名で検索...' },
  noResults: { en: 'NO RESULTS', ja: '結果なし' },
  noCasesYet: { en: 'NO CASES YET — CREATE YOUR FIRST CASE', ja: 'ケースなし — 最初のケースを作成してください' },
  col_ticker: { en: 'TICKER', ja: 'TICKER' },
  col_company: { en: 'COMPANY', ja: '会社名' },
  col_sector: { en: 'SECTOR', ja: 'セクター' },
  col_status: { en: 'STATUS', ja: 'ステータス' },
  col_verdict: { en: 'VERDICT', ja: '判定' },
  confirmDelete: { en: 'Delete {ticker}? All related data will be deleted.', ja: '{ticker} を削除しますか？関連する全データが削除されます。' },
  deleted: { en: '{ticker} deleted', ja: '{ticker} を削除しました' },
  exportDone: { en: 'Export complete', ja: 'エクスポート完了' },
  importDone: { en: 'Import complete', ja: 'インポート完了' },

  // ── Company New ──────────────────────────────────────────────────────────
  newCaseTitle: { en: 'NEW CASE', ja: '新規ケース' },
  newCaseSubtitle: { en: 'COMPANY INTAKE', ja: '銘柄登録' },
  identification: { en: 'IDENTIFICATION', ja: '基本情報' },
  marketDataOptional: { en: 'MARKET DATA (Optional)', ja: '市場データ（任意）' },
  parameters: { en: 'PARAMETERS', ja: 'パラメータ' },
  tickerLabel: { en: 'Ticker *', ja: 'Ticker *' },
  companyNameLabel: { en: 'Company Name *', ja: '会社名 *' },
  sectorLabel: { en: 'Sector', ja: 'セクター' },
  currentPriceLabel: { en: 'Current Price', ja: '現在株価' },
  marketCapLabel: { en: 'Market Cap', ja: '時価総額' },
  evLabel: { en: 'Enterprise Value', ja: 'エンタープライズバリュー' },
  horizonLabel: { en: 'Investment Horizon *', ja: '投資期間 *' },
  createBtn: { en: 'CREATE → THESIS', ja: '作成 → Thesis' },
  cancelBtn: { en: 'CANCEL', ja: 'キャンセル' },
  err_ticker: { en: 'Ticker is required', ja: 'Tickerは必須です' },
  err_company: { en: 'Company name is required', ja: '会社名は必須です' },
  err_horizon: { en: 'Horizon must be 6–120 months', ja: '投資期間は6〜120ヶ月で設定してください' },
  created: { en: '{ticker} created', ja: '{ticker} を作成しました' },
  saveFailed: { en: 'Save failed', ja: '保存に失敗しました' },
  sectorSelect: { en: '— Select —', ja: '— 選択 —' },

  // ── Company Detail ───────────────────────────────────────────────────────
  overview: { en: 'Overview', ja: 'オーバービュー' },
  overviewSubtitle: { en: 'OVERVIEW', ja: '概要' },
  companyInfo: { en: 'COMPANY INFO', ja: '銘柄情報' },
  verdictLabel: { en: 'VERDICT', ja: '判定' },
  totalScore: { en: 'Total Score', ja: '合計スコア' },
  vetoCount: { en: 'Veto Count', ja: 'VETOカウント' },
  profile: { en: 'Profile', ja: 'プロファイル' },
  verdictNotCreated: { en: 'No verdict yet', ja: 'Verdict未作成' },
  investmentThesis: { en: 'INVESTMENT THESIS', ja: '投資仮説' },
  thesisNotCreated: { en: 'No thesis yet — ', ja: 'Thesis未作成 — ' },
  createThesis: { en: 'Create →', ja: '作成する →' },
  analysisPipeline: { en: 'ANALYSIS PIPELINE', ja: '分析パイプライン' },
  pipelineProgress: { en: '{done}/{total} lanes complete', ja: '{done}/{total} レーン完了' },
  backToCases: { en: '← CASES', ja: '← ケース一覧' },
  caseNotFound: { en: 'CASE NOT FOUND', ja: 'ケースが見つかりません' },

  // ── Tabs ─────────────────────────────────────────────────────────────────
  tab_thesis: { en: 'Thesis Lane', ja: 'Thesis レーン' },
  tab_data: { en: 'Data Lane', ja: 'データレーン' },
  tab_market: { en: 'Market Lane', ja: 'マーケットレーン' },
  tab_review: { en: 'AI Review', ja: 'AIレビュー' },
  tab_valuation: { en: 'Valuation', ja: 'バリュエーション' },
  tab_verdict: { en: 'Verdict', ja: 'バーディクト' },
  tab_monitoring: { en: 'Monitoring', ja: 'モニタリング' },
  tab_lessons: { en: 'Lessons', ja: 'レッスン' },

  // ── Thesis ───────────────────────────────────────────────────────────────
  thesisTitle: { en: 'THESIS LANE', ja: 'THESIS レーン' },
  thesisLaneNote: { en: 'LANE INDEPENDENCE', ja: 'レーン独立性' },
  thesisLaneNoteBody: {
    en: 'Thesis does not affect Data Lane calculations. The 3 lanes analyze independently and reconcile at Review.',
    ja: 'ThesisはData Laneの計算に直接影響しません。3レーンは独立して分析し、Review段階で突き合わせます。',
  },
  thesisSectionLabel: { en: 'INVESTMENT THESIS', ja: '投資仮説' },
  thesisInputLabel: { en: 'Investment Thesis (one line — why this company wins vs the market)', ja: '投資仮説（1行で。なぜこの会社が市場に勝つか）' },
  thesisPlaceholder: {
    en: 'Nvidia owns the OS of AI infrastructure through CUDA, giving it software-level pricing power and a 10+ year moat',
    ja: 'NvidiaはCUDAというAIインフラのOSを通じて、ソフトウェアレベルの価格決定権と10年以上のモートを持つ',
  },
  driversLabel: { en: 'DRIVERS (3 supporting reasons)', ja: 'ドライバー（仮説を支える3つの根拠）' },
  collapseLabel: { en: 'COLLAPSE CONDITIONS', ja: 'Thesis崩壊条件' },
  collapseNote: {
    en: 'Define specific conditions that would invalidate this thesis. Numbers preferred over qualitative.',
    ja: 'この仮説が崩れる条件を具体的に定義する。曖昧な表現は禁止。数値トリガーを優先する。',
  },
  conditionLabel: { en: 'CONDITION', ja: '条件' },
  conditionLabelField: { en: 'Condition Label', ja: '条件ラベル' },
  operator: { en: 'Operator', ja: '演算子' },
  threshold: { en: 'Threshold', ja: '閾値（数値）' },
  unit: { en: 'Unit', ja: '単位' },
  addCondition: { en: '+ ADD CONDITION', ja: '+ 条件を追加' },
  removeBtn: { en: 'REMOVE', ja: '削除' },
  confidenceNote: { en: 'CONFIDENCE NOTE', ja: '確信度メモ' },
  confidenceLabel: { en: 'Why do you believe this thesis?', ja: '確信度メモ（なぜこのThesisを信じるか）' },
  saveThesis: { en: 'SAVE THESIS', ja: 'Thesisを保存' },
  lastSaved: { en: 'Last saved:', ja: '最終保存:' },
  version: { en: 'Version:', ja: 'バージョン:' },

  // ── Data Lane ────────────────────────────────────────────────────────────
  dataTitle: { en: 'DATA LANE', ja: 'データレーン' },
  dataLaneNoteTitle: { en: 'LANE INDEPENDENCE', ja: 'レーン独立性' },
  dataLaneNoteBody: {
    en: 'Scores are calculated from financial data independently. Thesis content does not influence scores. Input: {n}/11 — missing values are excluded from scoring.',
    ja: '財務データから独立してスコアを算出します。Thesisの内容はスコア計算に影響しません。入力値 {n}/11 — 欠損値はスコアに反映されません。',
  },
  growth: { en: 'GROWTH', ja: '成長性' },
  cashFlow: { en: 'CASH FLOW', ja: 'キャッシュフロー' },
  capitalEfficiency: { en: 'CAPITAL EFFICIENCY', ja: '資本効率' },
  balanceSheet: { en: 'BALANCE SHEET', ja: 'バランスシート' },
  saveDataLane: { en: 'SAVE DATA LANE', ja: 'データレーンを保存' },

  // ── Market Lane ──────────────────────────────────────────────────────────
  marketTitle: { en: 'MARKET LANE', ja: 'マーケットレーン' },
  marketNoteTitle: { en: 'EXPECTATION GAP', ja: '期待ギャップ' },
  marketNoteBody: {
    en: 'Edge = User Forecast − Market Consensus. Enter consensus from Bloomberg/FactSet manually.',
    ja: 'Edge = ユーザー予測 − 市場コンセンサス。コンセンサスはBloomberg/FactSet等から手動入力。',
  },
  consensus: { en: 'CONSENSUS (analyst estimates)', ja: 'コンセンサス（アナリスト予測）' },
  userForecast: { en: 'USER FORECAST', ja: 'ユーザー予測' },
  gapNote: {
    en: 'Gap = your forecast − consensus. Positive = bullish vs street.',
    ja: 'Gap = 自分の予測 − コンセンサス。正値＝強気、負値＝弱気',
  },
  valuation: { en: 'VALUATION', ja: 'バリュエーション水準' },
  sentiment: { en: 'SENTIMENT', ja: 'センチメント' },
  saveMarketLane: { en: 'SAVE MARKET LANE', ja: 'マーケットレーンを保存' },

  // ── Review ───────────────────────────────────────────────────────────────
  reviewTitle: { en: 'AI REVIEW', ja: 'AIレビュー' },
  reviewNoteTitle: { en: 'STRUCTURED REVIEWER — NOT A RECOMMENDER', ja: '構造的査読者 — 推奨者ではない' },
  reviewNoteBody: {
    en: 'AI reviews the 3 lanes (Thesis/Data/Market) independently. No BUY/SELL recommendations. Only: missing items, lane mismatches, overlooked risks.',
    ja: 'AIは3レーン（Thesis/Data/Market）を独立して査読します。BUY/SELL判断はしません。欠損情報の特定・レーン間の矛盾検出・見落としリスクの抽出のみを行います。',
  },
  runReview: { en: 'RUN REVIEW', ja: 'レビュー実行' },
  reRunReview: { en: 'RE-RUN REVIEW', ja: '再実行' },
  reviewNoData: { en: 'Enter Thesis / Data / Market Lane first, then run review', ja: 'Thesis / Data / Market Laneを入力後、レビューを実行してください' },
  missingItems: { en: 'MISSING ITEMS', ja: '不足情報' },
  laneMismatches: { en: 'LANE MISMATCHES', ja: 'レーン間の矛盾' },
  mismatchNote: {
    en: 'Check which lane is suspect and revise inputs.',
    ja: 'どちらのレーンが疑わしいかを確認し、入力値を見直してください。',
  },
  suspectSide: { en: 'Suspect:', ja: '疑わしい側:' },
  riskRegister: { en: 'RISK REGISTER', ja: 'リスク登録' },
  scenarioNotes: { en: 'SCENARIO NOTES', ja: 'シナリオノート' },
  apiKeyMissing: {
    en: 'API key not set. Add VITE_ANTHROPIC_API_KEY to .env.local',
    ja: 'APIキー未設定。.env.localにVITE_ANTHROPIC_API_KEYを追加してください',
  },

  // ── Valuation ────────────────────────────────────────────────────────────
  valuationTitle: { en: 'VALUATION ENGINE', ja: 'バリュエーションエンジン' },
  valuationGateTitle: { en: 'VALUATION GATE — Investment = Company × Price', ja: 'バリュエーションゲート — 投資 = 会社 × 価格' },
  valuationGateBody: {
    en: 'Expected CAGR < 12% → BUY blocked (enforced in Verdict). FCF-based scenario calculation.',
    ja: '期待CAGR < 12% → BUY禁止（Verdict画面でブロック）。FCFベースのシナリオ計算。',
  },
  expectedCagrLabel: { en: 'EXPECTED CAGR (BASE)', ja: '期待CAGR（ベース）' },
  buyCandidate: { en: 'BUY CANDIDATE', ja: 'BUY候補' },
  watchLabel: { en: 'WATCH', ja: 'WATCH' },
  buyBlocked: { en: 'BUY BLOCKED', ja: 'BUY禁止' },
  verdictBlocked: { en: '🚫 BUY BLOCKED IN VERDICT', ja: '🚫 Verdict BUY禁止' },
  verdictOk: { en: '✓ Can proceed to Verdict', ja: '✓ Verdictへ進める' },
  currentData: { en: 'CURRENT DATA', ja: '現在データ' },
  assumptions: { en: 'ASSUMPTIONS (BASE CASE)', ja: '前提条件（ベースケース）' },
  saveValuation: { en: 'SAVE VALUATION', ja: 'バリュエーションを保存' },
  sensitivityTitle: { en: 'SENSITIVITY — CAGR vs Growth × Multiple', ja: '感応度分析 — CAGR vs 成長率 × マルチプル' },
  sensitivityNoData: { en: 'Enter base assumptions to see sensitivity analysis', ja: '前提条件を入力すると感応度分析が表示されます' },
  horizonAutoFilled: {
    en: '← Thesis Horizon ({months}mo → {years}yr)',
    ja: '← Thesis Horizonから自動入力（{months}ヶ月 → {years}年）',
  },

  // ── Verdict ──────────────────────────────────────────────────────────────
  verdictTitle: { en: 'VERDICT DASHBOARD', ja: 'バーディクト' },
  valuationGateWarningTitle: { en: '🚫 VALUATION GATE — Expected CAGR < 12%', ja: '🚫 バリュエーションゲート — 期待CAGR < 12%' },
  valuationGateWarningBody: {
    en: 'Valuation page shows CAGR below 12%. BUY is automatically downgraded to WATCH.',
    ja: 'Valuationページで期待CAGRが12%を下回っています。BUYは自動的にWATCHにダウングレードされます。',
  },
  finalVerdict: { en: 'FINAL VERDICT', ja: '最終判定' },
  profileLabel: { en: 'PROFILE', ja: 'プロファイル' },
  axisEvaluation: { en: '8-AXIS EVALUATION', ja: '8軸評価' },
  axisNote: {
    en: 'Score each axis 1–5. Veto = immediate PASS (Conservative/Standard). Evidence required.',
    ja: '各軸 1-5点。Vetoはチェックすると即PASS（Conservative/Standard）。根拠を必ず記入。',
  },
  rationaleLabel: { en: 'RATIONALE', ja: '判断根拠' },
  rationaleInputLabel: { en: 'Why this verdict?', ja: '最終判断の根拠（なぜこのVerdictか）' },
  saveVerdict: { en: 'SAVE VERDICT', ja: 'バーディクトを保存' },
  feedApplyAll: { en: 'APPLY ALL SUGGESTIONS', ja: '候補を一括適用' },
  feedApply: { en: 'Apply', ja: '適用' },
  feedFromDataLane: { en: '← Data Lane', ja: '← Data Lane' },
  feedFromMarketLane: { en: '← Market Lane', ja: '← Market Lane' },
  feedSuggested: { en: 'suggested {score}/5', ja: '提案 {score}/5' },
  vetoLabel: { en: 'VETO — ', ja: 'VETO — ' },

  // ── Axis labels ───────────────────────────────────────────────────────────
  axis_businessQuality:        { en: 'Business Quality',        ja: 'ビジネス品質' },
  axis_growthQuality:          { en: 'Growth Quality',          ja: '成長品質' },
  axis_capitalEfficiency:      { en: 'Capital Efficiency',      ja: '資本効率' },
  axis_balanceSheetSafety:     { en: 'Balance Sheet Safety',    ja: 'バランスシート安全性' },
  axis_valuationAttractiveness:{ en: 'Valuation',               ja: 'バリュエーション' },
  axis_marketExpectationGap:   { en: 'Market Expectation Gap',  ja: '市場期待ギャップ' },
  axis_executionRisk:          { en: 'Execution Risk',          ja: '実行リスク' },
  axis_governance:             { en: 'Governance',              ja: 'ガバナンス' },

  thesisBroken: { en: '⚠ BROKEN', ja: '⚠ BROKEN' },
  thesisAtRisk: { en: '⚠ AT RISK', ja: '⚠ AT RISK' },

  // ── Monitoring ────────────────────────────────────────────────────────────
  monitoringTitle: { en: 'MONITORING', ja: 'モニタリング' },
  thesisStatus: { en: 'THESIS STATUS', ja: 'Thesisステータス' },
  nextReviewDate: { en: 'NEXT REVIEW DATE', ja: '次回レビュー日' },
  monitorItems: { en: 'MONITOR ITEMS', ja: 'モニター項目' },
  addItem: { en: '+ ADD ITEM', ja: '+ 項目追加' },
  conditionLabelMonitor: { en: 'CONDITION LABEL', ja: '条件ラベル' },
  currentValue: { en: 'CURRENT VALUE', ja: '現在値' },
  saveMonitoring: { en: 'SAVE', ja: '保存' },

  // ── Lessons ───────────────────────────────────────────────────────────────
  lessonsTitle: { en: 'LESSONS', ja: 'レッスン' },
  lessonLibraryTitle: { en: 'LESSON LIBRARY', ja: 'レッスンライブラリ' },
  newLesson: { en: '+ NEW LESSON', ja: '+ 新規レッスン' },
  tabAllLessons: { en: 'ALL LESSONS', ja: '全レッスン' },
  tabRuleLibrary: { en: 'RULE LIBRARY', ja: 'ルールライブラリ' },
  noRules: { en: 'No validated rules yet — promote lessons to validated_rule', ja: '検証済みルールなし — Lessonをvalidated_ruleに昇格してください' },
  ruleLabel: { en: 'RULE', ja: 'ルール' },
  processSeparation: { en: 'PROCESS / OUTCOME SEPARATION', ja: 'プロセス / 結果の分離' },
  processSeparationBody: {
    en: 'Record process and outcome separately. Avoid converting good-process-bad-outcome (unlucky) into a permanent rule.',
    ja: 'プロセスと結果を切り離して記録する。良いプロセスで悪い結果（unlucky）を誤ってルール化しない。',
  },
  entryThesisLabel: { en: 'Entry Thesis', ja: 'エントリー時の投資仮説' },
  decisionQualityLabel: { en: 'Decision Quality', ja: '判断品質' },
  rootCauseLabel: { en: 'Root Cause *', ja: 'Root Cause *（必須）' },
  rootCausePlaceholder: {
    en: 'Underestimated valuation risk. The CAGR calc in IC-06.5 was contaminated by optimism bias.',
    ja: 'バリュエーションリスクを過小評価。IC-06.5で計算したCAGRが楽観バイアスに汚染されていた',
  },
  missedSignalLabel: { en: 'Missed Signal', ja: '見落としたシグナル' },
  ruleCandidateLabel: { en: 'Rule Candidate', ja: 'ルール候補' },
  counterfactualLabel: { en: 'Counterfactual', ja: '反事実（もし〜していたら）' },
  confidenceScoreLabel: { en: 'CONFIDENCE (1-5)', ja: '確信度 (1-5)' },
  saveLesson: { en: 'SAVE LESSON', ja: 'レッスンを保存' },
  promoteBtn: { en: '→ PROMOTE', ja: '→ 昇格' },
  noLessons: { en: 'NO LESSONS YET', ja: 'レッスンなし' },
  returnLabel: { en: 'Return:', ja: 'リターン:' },
  vsLabel: { en: 'vs', ja: 'vs' },
  rootCauseRequired: { en: 'Root Cause is required', ja: 'Root Causeは必須です' },
  lessonSaved: { en: 'Lesson recorded', ja: 'Lessonを記録しました' },

  // ── API Key ───────────────────────────────────────────────────────────────
  apiKeySection: { en: 'AI — ANTHROPIC API KEY', ja: 'AI — ANTHROPIC APIキー' },
  apiKeyLabel: { en: 'API Key', ja: 'APIキー' },
  apiKeyShow: { en: 'SHOW', ja: '表示' },
  apiKeyHide: { en: 'HIDE', ja: '非表示' },
  apiKeySetStatus: { en: '✓ API key configured', ja: '✓ APIキーが設定されています' },
  apiKeyEnvNote: { en: '⚠ No DB key — using env.local as fallback', ja: '⚠ DBキー未設定 — .env.localをフォールバックとして使用中' },
  apiKeyNotSetNote: { en: '✗ No API key — AI features unavailable', ja: '✗ APIキー未設定 — AI機能を使うにはAPIキーが必要です' },
  apiKeyPlaceholder: { en: 'sk-ant-api03-...', ja: 'sk-ant-api03-...' },

  // ── Settings ──────────────────────────────────────────────────────────────
  settingsTitle: { en: 'SETTINGS', ja: '設定' },
  settingsSubtitle: { en: 'CONFIGURATION', ja: 'コンフィグレーション' },
  verdictProfileSection: { en: 'VERDICT PROFILE', ja: 'バーディクトプロファイル' },
  defaultProfile: { en: 'Default Profile', ja: 'デフォルトプロファイル' },
  valuationGateSection: { en: 'VALUATION GATE', ja: 'バリュエーションゲート' },
  minCagrLabel: { en: 'Minimum CAGR for BUY (%)', ja: 'BUYのための最低CAGR (%)' },
  defaultsSection: { en: 'DEFAULTS', ja: 'デフォルト設定' },
  defaultHorizonLabel: { en: 'Default Investment Horizon', ja: 'デフォルト投資期間' },
  benchmarkLabel_: { en: 'Benchmark Label', ja: 'ベンチマーク名' },
  saveSettings: { en: 'SAVE SETTINGS', ja: '設定を保存' },
  backupData: { en: 'BACKUP ALL DATA', ja: '全データバックアップ' },
  systemInfo: { en: 'SYSTEM INFO', ja: 'システム情報' },
  storageInfo: { en: 'Storage: IndexedDB (local)', ja: 'ストレージ: IndexedDB（ローカル）' },
  encryptionDisabled: { en: 'Encryption: Disabled (Phase 2)', ja: '暗号化: 無効（フェーズ2）' },
  encryptionEnabled_: { en: 'Encryption: Enabled', ja: '暗号化: 有効' },
  lastBackup: { en: 'Last Backup:', ja: '最終バックアップ:' },
  neverBackup: { en: 'Never', ja: '未実施' },
  langSection: { en: 'LANGUAGE', ja: '言語設定' },
  langLabel: { en: 'Display Language', ja: '表示言語' },
  settingsSaved: { en: 'Settings saved', ja: '設定を保存しました' },
  backupDone: { en: 'Backup complete', ja: 'バックアップ完了' },
} as const

export type TranslationKey = keyof typeof translations

export function t(key: TranslationKey, lang: Lang, vars?: Record<string, string | number>): string {
  const entry = translations[key]
  if (!entry) return key
  let str = entry[lang] ?? entry['en']
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, String(v))
    })
  }
  return str
}
