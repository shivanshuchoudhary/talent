import type { ReactNode } from 'react'
import type { AdminDashboardStats } from '#/lib/admin-analytics'
import {
  HorizontalBarChart,
  VerticalBarChart,
} from '#/components/admin/AdminChartPrimitives'
import { BarChart3, Layers } from 'lucide-react'

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

export function AdminInsightsSidebar({ stats }: AdminInsightsPanelProps) {
  return (
    <div className="grid content-start gap-4">
      <ChartCard
        title="Letter grade distribution"
        subtitle="Among participants who received a grade"
        icon={<BarChart3 className="size-4" />}
      >
        <HorizontalBarChart items={stats.gradeBreakdown} maxItems={6} />
      </ChartCard>

      <ChartCard
        title="Progress depth"
        subtitle="% of questions answered before submit or timeout"
        icon={<Layers className="size-4" />}
      >
        <HorizontalBarChart items={stats.progressBuckets} maxItems={6} />
      </ChartCard>
    </div>
  )
}

export function AdminSubmissionActivity({ stats }: AdminInsightsPanelProps) {
  if (stats.submissionsByDay.length === 0) return null

  return (
    <ChartCard
      title="Submission activity"
      subtitle="Submissions per day (last 14 days with data)"
      icon={<BarChart3 className="size-4" />}
    >
      <VerticalBarChart items={stats.submissionsByDay} />
    </ChartCard>
  )
}
