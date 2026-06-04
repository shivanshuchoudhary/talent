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

type StatCardProps = {
  label: string
  value: string | number
  hint?: ReactNode
  icon: ReactNode
  accent?: string
}

function StatCard({ label, value, hint, icon, accent }: StatCardProps) {
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm',
        'transition-shadow hover:shadow-md',
      )}
    >
      <div
        className="pointer-events-none absolute -right-4 -top-4 size-24 rounded-full opacity-[0.08]"
        style={{ backgroundColor: accent ?? 'var(--primary)' }}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: accent ? `${accent}18` : 'var(--muted)',
            color: accent ?? 'var(--primary)',
          }}
        >
          {icon}
        </div>
      </div>
    </article>
  )
}

type AdminStatsOverviewProps = {
  stats: AdminDashboardStats
}

export function AdminStatsOverview({ stats }: AdminStatsOverviewProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <StatCard
        label="Total registered"
        value={stats.totalParticipants}
        hint={
          <>
            <span style={{ color: 'oklch(0.55 0.14 155)' }}>
              +{stats.registeredToday}
            </span>{' '}
            today
          </>
        }
        icon={<Users className="size-5" />}
        accent="var(--primary)"
      />
      <StatCard
        label="Completed"
        value={stats.completed}
        hint={`${stats.completionRate}% of all participants`}
        icon={<CheckCircle2 className="size-5" />}
        accent="oklch(0.55 0.14 155)"
      />
      <StatCard
        label="In progress"
        value={stats.inProgress}
        hint="Started but not finished"
        icon={<Clock className="size-5" />}
        accent="oklch(0.55 0.14 210)"
      />
      <StatCard
        label="Timed out"
        value={stats.timedOut}
        hint="Saved partial progress"
        icon={<TimerOff className="size-5" />}
        accent="oklch(0.55 0.2 27)"
      />
      <StatCard
        label="Participation"
        value={`${stats.participationRate}%`}
        hint={`${stats.withSubmission} started the survey`}
        icon={<UserCheck className="size-5" />}
        accent="var(--chart-2)"
      />
      <StatCard
        label="Avg. progress"
        value={`${stats.avgProgressPercent}%`}
        hint={`~${stats.avgQuestionsAnswered} of 40 questions`}
        icon={<Award className="size-5" />}
        accent="var(--chart-1)"
      />
    </section>
  )
}
