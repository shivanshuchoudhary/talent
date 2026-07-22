import { useState } from 'react'
import type { ManagerLevel } from '#/lib/admin-api'
import type { ManagerDashboardStats } from './manager-analytics'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '#/lib/utils'


type ManagersLevelCompletionKpiProps = {
  stats: ManagerDashboardStats
  className?: string
}

export function ManagersLevelCompletionKpi({
  stats,
  className,
}: ManagersLevelCompletionKpiProps) {
  const [level, setLevel] = useState<ManagerLevel>('n-2')


  const completed = stats.completedByLevel[level]
  const total = stats.totalByLevel[level]
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100)



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

    </article>
  )
}
