// ── Decision log CSV export ──────────────────────────────────────────────
// One row per decision; standard-horizon evaluations (12/36/60 months) are
// spread into columns when present. Pure function — unit-tested.

import type { DecisionLogEvaluation, DecisionLogRecord } from '../types/domain'

const HORIZONS = [12, 36, 60] as const

function cell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function decisionLogsToCsv(
  logs: readonly DecisionLogRecord[],
  evaluations: readonly DecisionLogEvaluation[],
): string {
  const header = [
    'decidedAt', 'ticker', 'companyName', 'humanFinalDecision', 'verdictResult',
    'priceAtDecision', 'priceCurrency', 'priceType', 'expectedCagr', 'cagrGate',
    'riskLevel', 'totalScore', 'vetoCount', 'engineRank', 'retrospective',
    'comparisonStatus', 'contentHash',
    ...HORIZONS.flatMap(h => [`ret${h}m_stockPct`, `ret${h}m_benchmarkPct`, `ret${h}m_excessPct`]),
  ]
  const byLog = new Map<string, DecisionLogEvaluation[]>()
  for (const e of evaluations) {
    const arr = byLog.get(e.logId) ?? []
    arr.push(e)
    byLog.set(e.logId, arr)
  }
  const latestAtHorizon = (logId: string, h: number) => {
    const cands = (byLog.get(logId) ?? []).filter(e => e.horizonMonths === h)
    cands.sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt))
    return cands[cands.length - 1]
  }
  const rows = logs.map(l => {
    const base = [
      l.decidedAt, l.ticker, l.companyName, l.humanFinalDecision, l.verdictResult,
      l.priceAtDecision.price, l.priceAtDecision.currency, l.priceAtDecision.priceType,
      l.expectedCagr, l.cagrGate, l.riskLevel, l.totalScore, l.vetoCount,
      l.engineRank, l.retrospective, l.comparisonStatus, l.contentHash,
    ]
    const evalCells = HORIZONS.flatMap(h => {
      const e = latestAtHorizon(l.id, h)
      return [e?.stockReturnPct, e?.benchmarkReturnPct, e?.excessReturnPct]
    })
    return [...base, ...evalCells].map(cell).join(',')
  })
  return [header.join(','), ...rows].join('\n') + '\n'
}
