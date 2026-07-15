import type { ReactNode } from 'react'
import type { ManagerDashboardStats } from './manager-analytics'
import { HorizontalBarChart } from '#/components/admin/AdminChartPrimitives'
import { BarChart3, Building2, Briefcase, GraduationCap } from 'lucide-react'

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
        <HorizontalBarChart items={stats.ratingBreakdown} maxItems={6} />
      </ChartCard>

      <ChartCard
        title="By level"
        subtitle="n-2 vs n-3 headcount"
        icon={<BarChart3 className="size-4" />}
      >
        <HorizontalBarChart items={stats.levelBreakdown} maxItems={4} />
      </ChartCard>

      <ChartCard
        title="By entity"
        subtitle="Top entities in the roster"
        icon={<Building2 className="size-4" />}
      >
        <HorizontalBarChart items={stats.entityBreakdown} maxItems={8} />
      </ChartCard>

      <ChartCard
        title="By function"
        subtitle="Top functions in the roster"
        icon={<Briefcase className="size-4" />}
      >
        <HorizontalBarChart items={stats.functionBreakdown} maxItems={8} />
      </ChartCard>
    </div>
  )
}
