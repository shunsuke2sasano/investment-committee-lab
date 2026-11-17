# Investment Committee vNext

個人資産形成のための株式投資判断支援システム。プロジェクト全体の設計・規約は
リポジトリルートの `../CLAUDE.md` を参照。

## 概要

- **3レーン設計**: Thesis Lane → Data Lane → Market Lane（互いに計算上独立）
- **AI Review Engine**: 3レーンを突き合わせる structured reviewer（BUY/SELL判断はしない）
- **Valuation Engine**: FCFベース、Bear ×0.65 / Base ×1.0 / Bull ×1.4
- **Verdict Dashboard**: 8軸ルールベース判定（期待CAGRが最低基準未満なら BUY は自動的に WATCH へダウングレード）
- **データ保存**: 完全ローカル（IndexedDB / Dexie）。外部送信は AI 機能（Anthropic API）と
  財務データ取得（FMP API）を使う場合のみ

## 開発

```bash
npm ci
npm run dev        # http://localhost:5173/
npm test           # Vitest（純粋計算関数の単体テスト）
npm run lint       # ESLint（エラー・警告ゼロを維持）
npm run build      # tsc -b && vite build
```

## APIキー（任意）

未設定でも、AI機能とFMP連携以外はすべて動作する。

| キー | 設定場所 |
|---|---|
| Anthropic | Settings画面（IndexedDB保存、優先）または `.env.local` の `VITE_ANTHROPIC_API_KEY` |
| FMP | Settings画面 |

## 技術スタック

React 19 + TypeScript + Vite / IndexedDB (Dexie) / Zustand / react-router-dom
