import { useEffect, useState } from 'react'
import type { ManagerLevel } from '#/lib/admin-api'
import type { ManagerDashboardStats } from './manager-analytics'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '#/lib/utils'

const STORAGE_KEY = 'managers.otherAssessmentCompletedByLevel'

type OtherAssessmentCounts = {
  'n-2': number
  'n-3': number
}

function readStoredCounts(): OtherAssessmentCounts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { 'n-2': 0, 'n-3': 0 }
    const parsed = JSON.parse(raw) as Partial<OtherAssessmentCounts>
    return {
      'n-2': Number.isFinite(parsed['n-2']) ? Math.max(0, Number(parsed['n-2'])) : 0,
      'n-3': Number.isFinite(parsed['n-3']) ? Math.max(0, Number(parsed['n-3'])) : 0,
    }
  } catch {
    return { 'n-2': 0, 'n-3': 0 }
  }
}

type ManagersLevelCompletionKpiProps = {
  stats: ManagerDashboardStats
  className?: string
}

export function ManagersLevelCompletionKpi({
  stats,
  className,
}: ManagersLevelCompletionKpiProps) {
  const [level, setLevel] = useState<ManagerLevel>('n-2')
  const [otherCounts, setOtherCounts] = useState<OtherAssessmentCounts>({
    'n-2': 0,
    'n-3': 0,
  })

  useEffect(() => {
    setOtherCounts(readStoredCounts())
  }, [])

  const completed = stats.completedByLevel[level]
  const total = stats.totalByLevel[level]
  const otherCompleted = otherCounts[level]
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100)

  const handleOtherChange = (value: string) => {
    const parsed = Number.parseInt(value, 10)
    const nextValue = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
    const next = { ...otherCounts, [level]: nextValue }
    setOtherCounts(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CheckCircle2 className="size-4" />
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          {(['n-2', 'n-3'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                level === option
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setLevel(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {level} assessment completed
      </p>
      <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
        {completed}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        of {total} {level} managers ({completionRate}%)
      </p>

      <div className="mt-4 border-t border-border pt-4">
        <Label htmlFor={`other-assessment-${level}`} className="text-xs text-muted-foreground">
          Also completed other assessment (of those {completed})
        </Label>
        <div className="mt-2 flex items-end gap-3">
          <Input
            id={`other-assessment-${level}`}
            type="number"
            min={0}
            className="h-10 max-w-30 text-2xl font-semibold tabular-nums"
            value={otherCompleted}
            onChange={(event) => handleOtherChange(event.target.value)}
          />
          <p className="pb-2 text-sm text-muted-foreground">
            {completed > 0
              ? `${Math.min(100, Math.round((otherCompleted / completed) * 100))}% of completed`
              : 'no completed yet'}
          </p>
        </div>
      </div>
    </article>
  )
}
