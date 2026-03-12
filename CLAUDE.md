# INVESTMENT COMMITTEE vNext — Claude Code Context

## プロジェクト概要
個人資産形成のための株式投資判断支援システム。
完全ローカル動作（IndexedDB）。外部送信なし。

## ディレクトリ
```
investment-committee/   ← Vite + React + TypeScript プロジェクト
  src/
    types/domain.ts       全ドメイン型定義
    db/schema.ts          Dexie DBスキーマ
    db/repositories.ts    全Repository
    lib/calculators.ts    純粋計算関数
    lib/i18n.ts           EN/JA翻訳
    lib/horizonCalculator.ts  Horizon推論計算
    features/reviewEngine/service.ts   AI Review
    features/horizonEngine/service.ts  AI Horizon推定
    state/store.ts        Zustand store
    components/common/ui.tsx  デザイントークン + UIコンポーネント
    App.tsx               ルーティング
    pages/                各ページ
docs/
  investment_committee_design_v4.docx  設計仕様書
  ic-progress.docx                     現在の進捗・TODO一覧
```

## 技術スタック
- React 19 + TypeScript + Vite
- IndexedDB (Dexie)
- Zustand（状態管理）
- react-router-dom
- AI: claude-sonnet-4-20250514（Anthropic API直呼び）
- APIキー: `VITE_ANTHROPIC_API_KEY`（.env.local）

## 3レーン設計（重要）
```
Thesis Lane → Data Lane → Market Lane
              ↓
         AI Review Engine（structured reviewer、BUY/SELL判断しない）
              ↓
         Valuation Engine（FCFベース、Bear×0.65/Base×1.0/Bull×1.4）
              ↓
         Verdict Dashboard（8軸ルールベース判定）
```

**レーン独立性**: 3レーンは互いに計算上独立。ReviewでのみThesis×Data×Marketを突き合わせる。

## Verdict 8軸
```
businessQuality / growthQuality / capitalEfficiency / balanceSheetSafety
/ valuationAttractiveness / marketExpectationGap / executionRisk / governance
各軸: score(1-5) / veto(boolean) / comment / evidenceMetrics
```

## Verdict閾値（3プロファイル）
| Profile      | BUY  | WATCH | MaxVeto |
|-------------|------|-------|---------|
| Conservative | ≥32  | ≥24   | 1       |
| Standard     | ≥30  | ≥22   | 1       |
| Aggressive   | ≥28  | ≥20   | 2       |

## Valuationゲート
期待CAGR < 12% → BUY自動ブロック（Verdictで強制）

## Horizon推論（Thesis → Valuation連携）
崩壊条件の `timeToValidate.months` から推奨投資期間を算出。
優先順位: Primary条件 → 全条件中央値 → Valuation逆算 → fallback(36ヶ月)
保存時にCompanyの`investmentHorizonMonths`を自動更新。

## 現在の進捗（2026-03-12時点）
詳細は `docs/ic-progress.docx` を参照。

**完了**: 全ページUI・IndexedDB・3レーン計算・CAGRゲート・i18n(EN/JA)・Export/Import・Horizon自動算出

**P0 TODO（最優先）**:
1. Thesis Horizon → Valuation years 自動引き継ぎ（ValuationPage.tsx）
2. Data Lane → Verdict 軸スコア候補フィード（VerdictPage.tsx）
3. Market Lane → Verdict 軸スコア候補フィード（VerdictPage.tsx）

**P1 TODO**:
4. CompanyDetail パイプライン完了バッジ
5. Monitoring breach → CompanyDetail赤バッジ
6. Settings画面でAPIキー直接入力UI

**P2 TODO（Phase 2）**:
- WebCrypto AES-GCM暗号化
- System Metrics集計（buyHitRate / passMissRate）

**Phase 3**:
- Financial API連携（FMP等）

## コーディング規約
- スタイルは全てinline style（Tailwind不使用）
- デザイントークンは `T.xxx` を使う（ui.tsx参照）
- 色は `hexRgb(T.xxx)` でrgba変換
- 翻訳は `t('key', lang)` を使う（i18n.ts参照）
- 新しい文言を追加したら必ずi18n.tsにEN/JAを追加する
- AIを呼ぶときは `claude-sonnet-4-20250514` を使う
- DB操作は必ずrepositories.ts経由
- 純粋計算関数はcalculators.tsに置く

## 注意事項
- `src/src/` の二重ネストは削除済み（過去の残骸）
- `.env.local` はgit管理外（APIキーを含む）
- localStorage使用不可（IndexedDBのみ）
- Zustand storeのlangはlocalStorageに保存（例外）
