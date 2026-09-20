import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { DEFAULT_PEAK_WINDOWS, DEFAULT_RANKING_PENALTIES } from '../constants/catalog'
import { DEFAULT_SCORE_REWARDS, normalizeScoreRewards } from '../constants/rankingScores'
import { useApp } from '../context/useApp'

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h)

function formatHour(h) {
  const n = Number(h)
  if (!Number.isFinite(n)) return '—'
  const suffix = n >= 12 ? 'PM' : 'AM'
  const hr = n % 12 === 0 ? 12 : n % 12
  return `${hr}:00 ${suffix}`
}

export function PeakHoursPage() {
  const { rankingSettings, loading, mutating, updateRankingSettings } = useApp()
  const [windows, setWindows] = useState(DEFAULT_PEAK_WINDOWS.map((w) => ({ ...w })))
  const [normalLeave, setNormalLeave] = useState(String(DEFAULT_RANKING_PENALTIES.normalLeave))
  const [peakLeave, setPeakLeave] = useState(String(DEFAULT_RANKING_PENALTIES.peakHourLeave))
  const [emergencyApproval, setEmergencyApproval] = useState(true)
  const [silver, setSilver] = useState('401')
  const [gold, setGold] = useState('781')
  const [blockOffline, setBlockOffline] = useState(true)
  const [completedBookingScore, setCompletedBookingScore] = useState(
    String(DEFAULT_SCORE_REWARDS.completedBooking),
  )
  const [completedRevisitScore, setCompletedRevisitScore] = useState(
    String(DEFAULT_SCORE_REWARDS.completedRevisit),
  )
  const [cancellationPenaltyScore, setCancellationPenaltyScore] = useState(
    String(DEFAULT_SCORE_REWARDS.cancellationPenalty),
  )
  const [revisitFreeJobs, setRevisitFreeJobs] = useState('20')
  const [revisitGold, setRevisitGold] = useState('6')
  const [revisitSilver, setRevisitSilver] = useState('8')
  const [revisitBronze, setRevisitBronze] = useState('10')
  const [jobsGold, setJobsGold] = useState('20')
  const [jobsSilver, setJobsSilver] = useState('24')
  const [jobsBronze, setJobsBronze] = useState('30')
  const [peakGold, setPeakGold] = useState('30')
  const [peakSilver, setPeakSilver] = useState('34')
  const [peakBronze, setPeakBronze] = useState('38')

  useEffect(() => {
    const rs = rankingSettings || {}
    const pw = Array.isArray(rs.peakWindows) && rs.peakWindows.length
      ? rs.peakWindows.map((w, i) => ({
          startHour: Number(w.startHour),
          endHour: Number(w.endHour),
          label: String(w.label || `Peak ${i + 1}`),
          enabled: w.enabled !== false,
        }))
      : DEFAULT_PEAK_WINDOWS.map((w) => ({ ...w }))
    setWindows(pw)
    const penalties = rs.penalties || {}
    setNormalLeave(String(penalties.normalLeave ?? DEFAULT_RANKING_PENALTIES.normalLeave))
    setPeakLeave(String(penalties.peakHourLeave ?? DEFAULT_RANKING_PENALTIES.peakHourLeave))
    setEmergencyApproval(
      penalties.emergencyLeaveRequiresApproval ?? DEFAULT_RANKING_PENALTIES.emergencyLeaveRequiresApproval,
    )
    setSilver(String(rs.silverThreshold ?? 401))
    setGold(String(rs.goldThreshold ?? 781))
    setBlockOffline(rs.blockOfflineDuringPeak !== false)
    const rewards = normalizeScoreRewards(rs.scoreRewards || {})
    setCompletedBookingScore(String(rewards.completedBooking))
    setCompletedRevisitScore(String(rewards.completedRevisit))
    setCancellationPenaltyScore(String(rewards.cancellationPenalty))
    setRevisitFreeJobs(String(rs.revisitFreeLimit ?? 20))
    setRevisitGold(String(rs.revisitPctTargets?.gold ?? 6))
    setRevisitSilver(String(rs.revisitPctTargets?.silver ?? 8))
    setRevisitBronze(String(rs.revisitPctTargets?.bronze ?? 10))
    setJobsGold(String(rs.jobsTargets?.gold ?? 20))
    setJobsSilver(String(rs.jobsTargets?.silver ?? 24))
    setJobsBronze(String(rs.jobsTargets?.bronze ?? 30))
    setPeakGold(String(rs.peakHoursTargets?.gold ?? 30))
    setPeakSilver(String(rs.peakHoursTargets?.silver ?? 34))
    setPeakBronze(String(rs.peakHoursTargets?.bronze ?? 38))
  }, [rankingSettings])

  const onSave = async (e) => {
    e.preventDefault()
    const nl = Number(normalLeave)
    const pl = Number(peakLeave)
    const s = Number(silver)
    const g = Number(gold)
    if (!Number.isFinite(nl) || nl < 0) {
      toast.error('Normal leave penalty must be 0 or more.')
      return
    }
    if (!Number.isFinite(pl) || pl < 0) {
      toast.error('Peak hour leave penalty must be 0 or more.')
      return
    }
    if (!Number.isFinite(s) || !Number.isFinite(g) || s < 0 || g <= s) {
      toast.error('Gold threshold must be greater than silver threshold.')
      return
    }
    for (const w of windows) {
      if (w.enabled === false) continue
      if (!Number.isFinite(w.startHour) || !Number.isFinite(w.endHour) || w.endHour <= w.startHour) {
        toast.error('Each enabled peak window needs end hour after start hour.')
        return
      }
    }
    const cb = Number(completedBookingScore)
    const cr = Number(completedRevisitScore)
    const cp = Number(cancellationPenaltyScore)
    if (![cb, cr, cp].every((n) => Number.isFinite(n) && n >= 0)) {
      toast.error('Score rewards must be 0 or more.')
      return
    }
    const rf = Number(revisitFreeJobs)
    const rp = {
      gold: Number(revisitGold),
      silver: Number(revisitSilver),
      bronze: Number(revisitBronze),
    }
    const jt = {
      gold: Number(jobsGold),
      silver: Number(jobsSilver),
      bronze: Number(jobsBronze),
    }
    const pt = {
      gold: Number(peakGold),
      silver: Number(peakSilver),
      bronze: Number(peakBronze),
    }
    if (![rf, ...Object.values(rp), ...Object.values(jt), ...Object.values(pt)].every((n) => Number.isFinite(n) && n >= 0)) {
      toast.error('Rank metric targets must be 0 or more.')
      return
    }
    try {
      await updateRankingSettings({
        peakWindows: windows,
        penalties: {
          normalLeave: nl,
          peakHourLeave: pl,
          emergencyLeaveRequiresApproval: Boolean(emergencyApproval),
        },
        scoreRewards: normalizeScoreRewards({
          completedBooking: cb,
          completedRevisit: cr,
          cancellationPenalty: cp,
        }),
        silverThreshold: s,
        goldThreshold: g,
        blockOfflineDuringPeak: Boolean(blockOffline),
        // Keep legacy slot fields in sync with first enabled window for older clients
        peakHourSlotStart: Math.max(
          0,
          Number((windows.find((w) => w.enabled !== false) || windows[0])?.startHour ?? 9) - 8,
        ),
        peakHourSlotEnd: Math.max(
          0,
          Number((windows.find((w) => w.enabled !== false) || windows[0])?.endHour ?? 11) - 8,
        ),
        revisitFreeLimit: rf,
        revisitPctTargets: rp,
        jobsTargets: jt,
        peakHoursTargets: pt,
        peakHoursTarget: pt.silver,
      })
    } catch (err) {
      toast.error(err?.message || 'Could not save peak hour settings.')
    }
  }

  const busy = Boolean(mutating.rankingSettings)
  const settingsLoading = loading.rankingSettings

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Peak Hours & Scoring"
        description="Configure peak windows, leave penalties, and rank thresholds. Technician app blocks going offline during peak when enabled."
      />

      <Card className="space-y-6 p-5 sm:p-6">
        <form className="space-y-6" onSubmit={onSave}>
          <div>
            <h3 className="text-base font-semibold text-[var(--on-surface)]">Peak windows</h3>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Any number of local hour ranges (end exclusive). Example: 8:00–10:00 groups two 1-hour partner slots visually; bookings stay per hour.
            </p>
            <div className="mt-4 space-y-3">
              {windows.map((w, idx) => (
                <div key={idx} className="grid gap-3 rounded-2xl border border-[var(--outline-variant)]/50 p-4 sm:grid-cols-[1fr_120px_120px_auto_auto]">
                  <Field label="Label">
                    <Input
                      value={w.label}
                      onChange={(e) =>
                        setWindows((rows) => rows.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))
                      }
                      disabled={busy || settingsLoading}
                    />
                  </Field>
                  <Field label="Start">
                    <Select
                      value={String(w.startHour)}
                      onChange={(e) =>
                        setWindows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, startHour: Number(e.target.value) } : r)),
                        )
                      }
                      disabled={busy || settingsLoading}
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {formatHour(h)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="End">
                    <Select
                      value={String(w.endHour)}
                      onChange={(e) =>
                        setWindows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, endHour: Number(e.target.value) } : r)),
                        )
                      }
                      disabled={busy || settingsLoading}
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {formatHour(h)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 pb-2 text-sm text-[var(--on-surface)]">
                      <input
                        type="checkbox"
                        checked={w.enabled !== false}
                        onChange={(e) =>
                          setWindows((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, enabled: e.target.checked } : r)),
                          )
                        }
                        disabled={busy || settingsLoading}
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setWindows((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-3"
              disabled={busy}
              onClick={() =>
                setWindows((rows) => [
                  ...rows,
                  { startHour: 9, endHour: 11, label: `Peak ${rows.length + 1}`, enabled: true },
                ])
              }
            >
              Add window
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Normal leave penalty (points)">
              <Input type="number" min="0" value={normalLeave} onChange={(e) => setNormalLeave(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Peak hour leave penalty (points)">
              <Input type="number" min="0" value={peakLeave} onChange={(e) => setPeakLeave(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Silver threshold">
              <Input type="number" min="0" value={silver} onChange={(e) => setSilver(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Gold threshold">
              <Input type="number" min="0" value={gold} onChange={(e) => setGold(e.target.value)} disabled={busy} />
            </Field>
          </div>

          <div>
            <h3 className="text-base font-semibold text-[var(--on-surface)]">Rank metric targets</h3>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Technician Target tab detail screens (UC-style): revisit %, jobs, and peak unavailable hours per tier.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <Field label="Revisit free jobs">
                <Input type="number" min="0" value={revisitFreeJobs} onChange={(e) => setRevisitFreeJobs(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Revisit % Gold">
                <Input type="number" min="0" value={revisitGold} onChange={(e) => setRevisitGold(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Revisit % Silver">
                <Input type="number" min="0" value={revisitSilver} onChange={(e) => setRevisitSilver(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Revisit % Bronze">
                <Input type="number" min="0" value={revisitBronze} onChange={(e) => setRevisitBronze(e.target.value)} disabled={busy} />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Jobs Gold">
                <Input type="number" min="0" value={jobsGold} onChange={(e) => setJobsGold(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Jobs Silver">
                <Input type="number" min="0" value={jobsSilver} onChange={(e) => setJobsSilver(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Jobs Bronze">
                <Input type="number" min="0" value={jobsBronze} onChange={(e) => setJobsBronze(e.target.value)} disabled={busy} />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Peak hours Gold">
                <Input type="number" min="0" value={peakGold} onChange={(e) => setPeakGold(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Peak hours Silver">
                <Input type="number" min="0" value={peakSilver} onChange={(e) => setPeakSilver(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Peak hours Bronze">
                <Input type="number" min="0" value={peakBronze} onChange={(e) => setPeakBronze(e.target.value)} disabled={busy} />
              </Field>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-[var(--on-surface)]">Score rewards</h3>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Points awarded or deducted when jobs complete or cancel. Scores are calculated per calendar month, so every technician starts fresh on the 1st.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Completed booking">
                <Input
                  type="number"
                  min="0"
                  value={completedBookingScore}
                  onChange={(e) => setCompletedBookingScore(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Completed revisit">
                <Input
                  type="number"
                  min="0"
                  value={completedRevisitScore}
                  onChange={(e) => setCompletedRevisitScore(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label="Cancellation penalty">
                <Input
                  type="number"
                  min="0"
                  value={cancellationPenaltyScore}
                  onChange={(e) => setCancellationPenaltyScore(e.target.value)}
                  disabled={busy}
                />
              </Field>
            </div>
          </div>

          <Field label="Emergency leave">
            <Select
              value={emergencyApproval ? 'true' : 'false'}
              onChange={(e) => setEmergencyApproval(e.target.value === 'true')}
              disabled={busy}
            >
              <option value="true">Requires admin approval</option>
              <option value="false">No approval required</option>
            </Select>
          </Field>

          <Field label="Block offline during peak">
            <Select
              value={blockOffline ? 'true' : 'false'}
              onChange={(e) => setBlockOffline(e.target.value === 'true')}
              disabled={busy}
            >
              <option value="true">Yes — technicians cannot mark peak slots offline</option>
              <option value="false">No — allow with higher penalty only</option>
            </Select>
          </Field>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy || settingsLoading}>
              {busy ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
