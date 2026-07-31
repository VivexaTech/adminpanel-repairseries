/** Configurable technician score rewards / penalties (settings/ranking). */

export const DEFAULT_SCORE_REWARDS = Object.freeze({
  completedBooking: 25,
  completedRevisit: 40,
  cancellationPenalty: 30,
  scoreDeductionPerLeave: 2,
})

export function normalizeScoreRewards(raw = {}) {
  const positive = (v, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback
  }
  return {
    completedBooking: positive(raw.completedBooking, DEFAULT_SCORE_REWARDS.completedBooking),
    completedRevisit: positive(raw.completedRevisit, DEFAULT_SCORE_REWARDS.completedRevisit),
    cancellationPenalty: positive(
      raw.cancellationPenalty,
      DEFAULT_SCORE_REWARDS.cancellationPenalty,
    ),
    scoreDeductionPerLeave: positive(
      raw.scoreDeductionPerLeave,
      DEFAULT_SCORE_REWARDS.scoreDeductionPerLeave,
    ),
  }
}
