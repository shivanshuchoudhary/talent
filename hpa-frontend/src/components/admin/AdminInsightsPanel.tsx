import { useMemo, type ReactNode } from 'react'
import type { AdminDashboardStats } from '#/lib/admin-analytics'
import {
  ChartLegend,
  DonutChart,
  HorizontalBarChart,
  VerticalBarChart,
} from '#/components/admin/AdminChartPrimitives'
import { BarChart3, Layers, PieChart } from 'lucide-react'

function ChartCard({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string
  subtitle?: string
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <article
      className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className ?? ''}`}
    >
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

type AdminInsightsPanelProps = {
  stats: AdminDashboardStats
}

export function AdminInsightsPanel({ stats }: AdminInsightsPanelProps) {
  const completionRingStyle = useMemo(
    () => ({
      background: `conic-gradient(
        oklch(0.55 0.14 155) 0 ${stats.completionRate}%,
        var(--muted) ${stats.completionRate}% 100%
      )`,
    }),
    [stats.completionRate],
  )

  return (
    <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <ChartCard
        title="Assessment status"
        subtitle="How participants are distributed across the pipeline"
        icon={<PieChart className="size-4" />}
        className="lg:col-span-1"
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
          <DonutChart slices={stats.statusBreakdown} size={160} />
          <div className="w-full min-w-0 sm:max-w-[220px]">
            <ChartLegend slices={stats.statusBreakdown} />
          </div>
        </div>
      </ChartCard>

      <ChartCard
        title="Letter grade distribution"
        subtitle="Among participants who received a grade"
        icon={<BarChart3 className="size-4" />}
      >
        <HorizontalBarChart items={stats.gradeBreakdown} maxItems={6} />
      </ChartCard>

      <ChartCard
        title="Completion rate"
        subtitle="Share of all registered participants who finished"
        icon={<PieChart className="size-4" />}
      >
        <div className="flex flex-col items-center gap-4 py-2 sm:flex-row sm:justify-center sm:gap-10">
          <div
            className="relative flex size-36 items-center justify-center rounded-full"
            style={completionRingStyle}
          >
            <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card">
              <span className="text-3xl font-semibold tabular-nums">
                {stats.completionRate}%
              </span>
              <span className="text-xs text-muted-foreground">completed</span>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-6">
              <span className="text-muted-foreground">Finished</span>
              <span className="font-medium tabular-nums">{stats.completed}</span>
            </li>
            <li className="flex justify-between gap-6">
              <span className="text-muted-foreground">With submission</span>
              <span className="font-medium tabular-nums">{stats.withSubmission}</span>
            </li>
            <li className="flex justify-between gap-6">
              <span className="text-muted-foreground">Not started</span>
              <span className="font-medium tabular-nums">{stats.registeredOnly}</span>
            </li>
          </ul>
        </div>
      </ChartCard>

      <ChartCard
        title="Progress depth"
        subtitle="% of questions answered before submit or timeout"
        icon={<Layers className="size-4" />}
        className="lg:col-span-1 2xl:col-span-1"
      >
        <HorizontalBarChart items={stats.progressBuckets} maxItems={6} />
      </ChartCard>

      {stats.submissionsByDay.length > 0 ? (
        <ChartCard
          title="Submission activity"
          subtitle="Submissions per day (last 14 days with data)"
          icon={<BarChart3 className="size-4" />}
          className="lg:col-span-2 2xl:col-span-3"
        >
          <VerticalBarChart items={stats.submissionsByDay} />
        </ChartCard>
      ) : null}
    </section>
  )
}
