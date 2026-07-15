import type { ReactNode } from 'react'
import type { ManagerDashboardStats } from './manager-analytics'
import { ChartLegend, DonutChart } from '#/components/admin/AdminChartPrimitives'
import { BarChart3, GraduationCap } from 'lucide-react'

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string
  subtitle?: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </article>
  )
}

type ManagersInsightsPanelProps = {
  stats: ManagerDashboardStats
}

export function ManagersInsightsPanel({ stats }: ManagersInsightsPanelProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="Letter grade distribution"
        subtitle="A / B / C / - across managers"
        icon={<GraduationCap className="size-4" />}
      >
        <div className="flex flex-wrap items-center gap-6">
          <DonutChart
            slices={stats.ratingBreakdown}
            size={140}
            centerLabel={stats.total}
            centerHint="managers"
          />
          <ChartLegend slices={stats.ratingBreakdown} />
        </div>
      </ChartCard>

      <ChartCard
        title="By level"
        subtitle="n-2 vs n-3 headcount"
        icon={<BarChart3 className="size-4" />}
      >
        <div className="flex flex-wrap items-center gap-6">
          <DonutChart
            slices={stats.levelBreakdown}
            size={140}
            centerLabel={stats.total}
            centerHint="managers"
          />
          <ChartLegend slices={stats.levelBreakdown} />
        </div>
      </ChartCard>
    </div>
  )
}
