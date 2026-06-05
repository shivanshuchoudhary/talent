import type { ReactNode } from 'react'
import type { AdminDashboardStats } from '#/lib/admin-analytics'
import {
  Award,
  CheckCircle2,
  Clock,
  TimerOff,
  Users,
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
        'relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8',
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full opacity-[0.06]"
        style={{ backgroundColor: 'var(--primary)' }}
      />

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Total registered
          </p>
          <p className="mt-2 text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
            {stats.totalParticipants}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <span style={{ color: 'oklch(0.55 0.14 155)' }}>
              +{stats.registeredToday}
            </span>{' '}
            today
          </p>
        </div>
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-16"
          style={{
            backgroundColor: 'color-mix(in oklch, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
          }}
        >
          <Users className="size-7 sm:size-8" />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
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
    </section>
  )
}
