import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AdminParticipant } from '#/lib/admin-api'
import type { AdminDashboardStats, SubmissionPeriod } from '#/lib/admin-analytics'
import { countSubmissionsInPeriod } from '#/lib/admin-analytics'
import { ChartLegend, DonutChart } from '#/components/admin/AdminChartPrimitives'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { PieChart, UserCheck, Users } from 'lucide-react'
import { cn } from '#/lib/utils'

const SUBMISSION_PERIOD_OPTIONS: { value: SubmissionPeriod; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_3_days', label: 'Last 3 days' },
  { value: 'last_week', label: 'Last week' },
]

type OverviewCardProps = {
  children: ReactNode
  className?: string
}

function OverviewCard({ children, className }: OverviewCardProps) {
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

type AdminStatsOverviewProps = {
  stats: AdminDashboardStats
  participants: AdminParticipant[]
}

export function AdminStatsOverview({ stats, participants }: AdminStatsOverviewProps) {
  const [submissionPeriod, setSubmissionPeriod] =
    useState<SubmissionPeriod>('last_3_days')

  const submissionCount = useMemo(
    () => countSubmissionsInPeriod(participants, submissionPeriod),
    [participants, submissionPeriod],
  )

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-4" />
          </div>
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Total registered
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {stats.totalParticipants}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span style={{ color: 'oklch(0.55 0.14 155)' }}>
            +{stats.registeredToday}
          </span>{' '}
          today
        </p>
      </OverviewCard>

      <OverviewCard>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Submission activity
          </p>
          <Select
            value={submissionPeriod}
            onValueChange={(value) => setSubmissionPeriod(value as SubmissionPeriod)}
          >
            <SelectTrigger size="sm" className="h-8 min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {SUBMISSION_PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="mt-4 text-4xl font-semibold tabular-nums tracking-tight">
          {submissionCount}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">submissions</p>
      </OverviewCard>

      <OverviewCard>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserCheck className="size-4" />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Participation
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {stats.participationRate}%
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {stats.withSubmission} started the survey
        </p>
      </OverviewCard>

      <OverviewCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PieChart className="size-4" />
          </div>
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Assessment status
        </p>
        <div className="mt-3 flex items-center gap-4">
          <DonutChart
            slices={stats.statusBreakdown}
            size={100}
            centerLabel={
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {stats.completionRate}%
              </span>
            }
            centerHint="done"
          />
          <div className="min-w-0 flex-1">
            <ChartLegend slices={stats.statusBreakdown} />
          </div>
        </div>
      </OverviewCard>
    </section>
  )
}
