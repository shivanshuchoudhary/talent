import type { ReactNode } from 'react'
import type { ManagerDashboardStats } from './manager-analytics'
import { ChartLegend, DonutChart } from '#/components/admin/AdminChartPrimitives'
import { Layers, Star, Users } from 'lucide-react'
import { cn } from '#/lib/utils'

function OverviewCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm',
        className,
      )}
    >
      {children}
    </article>
  )
}

type ManagersStatsOverviewProps = {
  stats: ManagerDashboardStats
}

export function ManagersStatsOverview({ stats }: ManagersStatsOverviewProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <OverviewCard>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="size-4" />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Total managers
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {stats.total}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {stats.levelBreakdown.map((s) => `${s.label}: ${s.count}`).join(' · ') ||
            'No levels yet'}
        </p>
      </OverviewCard>

      <OverviewCard>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Star className="size-4" />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Average rating
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {stats.avgRating.toFixed(2)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Scale 0–5 · {stats.gradedCount} with letter grade
        </p>
      </OverviewCard>

      <OverviewCard>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Layers className="size-4" />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Status mix
        </p>
        <div className="mt-3 flex items-center gap-4">
          <DonutChart
            slices={stats.statusBreakdown}
            size={96}
            centerLabel={stats.total}
            centerHint="total"
          />
          <ChartLegend slices={stats.statusBreakdown} />
        </div>
      </OverviewCard>
    </section>
  )
}
