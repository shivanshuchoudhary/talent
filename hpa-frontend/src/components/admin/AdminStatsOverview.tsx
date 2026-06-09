import type { ReactNode } from 'react'
import type { AdminDashboardStats } from '#/lib/admin-analytics'
import { ChartLegend, DonutChart } from '#/components/admin/AdminChartPrimitives'
import {
  Award,
  CheckCircle2,
  Clock,
  TimerOff,
  UserCheck,
} from 'lucide-react'
import { cn } from '#/lib/utils'

type StatBadgeProps = {
  label: string
  value: string | number
  hint?: string
  icon: ReactNode
  accent: string
}

function StatBadge({ label, value, hint, icon, accent }: StatBadgeProps) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm"
      style={{ borderColor: `${accent}30` }}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: `${accent}18`,
          color: accent,
        }}
      >
        {icon}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {hint ? (
        <span className="text-xs tabular-nums text-muted-foreground">({hint})</span>
      ) : null}
    </div>
  )
}

type AdminStatsOverviewProps = {
  stats: AdminDashboardStats
}

export function AdminStatsOverview({ stats }: AdminStatsOverviewProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6',
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full opacity-[0.06]"
        style={{ backgroundColor: 'var(--primary)' }}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Total registered
          </p>
          <p className="mt-1 text-5xl font-semibold tabular-nums tracking-tight">
            {stats.totalParticipants}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <span style={{ color: 'oklch(0.55 0.14 155)' }}>
              +{stats.registeredToday}
            </span>{' '}
            today
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <StatBadge
              label="Completed"
              value={stats.completed}
              hint={`${stats.completionRate}%`}
              icon={<CheckCircle2 className="size-3.5" />}
              accent="oklch(0.55 0.14 155)"
            />
            <StatBadge
              label="In progress"
              value={stats.inProgress}
              icon={<Clock className="size-3.5" />}
              accent="oklch(0.55 0.14 210)"
            />
            <StatBadge
              label="Timed out"
              value={stats.timedOut}
              icon={<TimerOff className="size-3.5" />}
              accent="oklch(0.55 0.2 27)"
            />
            <StatBadge
              label="Participation"
              value={`${stats.participationRate}%`}
              hint={`${stats.withSubmission} started`}
              icon={<UserCheck className="size-3.5" />}
              accent="var(--chart-2)"
            />
            <StatBadge
              label="Avg. progress"
              value={`${stats.avgProgressPercent}%`}
              hint={`~${stats.avgQuestionsAnswered} of 40`}
              icon={<Award className="size-3.5" />}
              accent="var(--chart-1)"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3 sm:flex-row lg:flex-col lg:items-end">
          <DonutChart
            slices={stats.statusBreakdown}
            size={148}
            centerLabel={
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {stats.completionRate}%
              </span>
            }
            centerHint="completed"
          />
          <div className="w-full min-w-[180px] max-w-[220px]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Assessment status
            </p>
            <ChartLegend slices={stats.statusBreakdown} />
          </div>
        </div>
      </div>
    </section>
  )
}
