import type { ManagerRecord, ManagerStatus } from '#/lib/admin-api'
import type { CountSlice } from '#/lib/admin-analytics'

export type ManagerDashboardStats = {
  total: number
  completed: number
  inProgress: number
  notCompleted: number
  completionRate: number
  avgRating: number
  gradedCount: number
  statusBreakdown: CountSlice[]
  ratingBreakdown: CountSlice[]
  levelBreakdown: CountSlice[]
  entityBreakdown: CountSlice[]
  functionBreakdown: CountSlice[]
}

const STATUS_COLORS: Record<string, string> = {
  Completed: 'oklch(0.55 0.14 155)',
  'in progress': 'oklch(0.55 0.14 210)',
  'not Completed': 'oklch(0.65 0.02 107)',
}

const RATING_COLORS: Record<string, string> = {
  A: 'oklch(0.55 0.14 155)',
  B: 'oklch(0.55 0.14 210)',
  C: 'oklch(0.55 0.14 55)',
  '-': 'oklch(0.75 0.02 107)',
}

const LEVEL_COLORS: Record<string, string> = {
  'n-2': 'oklch(0.52 0.12 250)',
  'n-3': 'oklch(0.55 0.12 30)',
}

function statusDisplay(status: ManagerStatus) {
  if (status === 'completed') return 'Completed'
  if (status === 'in_progress') return 'in progress'
  return 'not Completed'
}

function countBy(
  rows: ManagerRecord[],
  getValue: (row: ManagerRecord) => string,
  colorMap?: Record<string, string>,
  limit = 8,
): CountSlice[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = getValue(row).trim() || 'Unspecified'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      color: colorMap?.[label] ?? 'var(--chart-3)',
    }))
}

export function computeManagerDashboardStats(
  managers: ManagerRecord[],
): ManagerDashboardStats {
  const completed = managers.filter((m) => m.status === 'completed').length
  const inProgress = managers.filter((m) => m.status === 'in_progress').length
  const notCompleted = managers.filter((m) => m.status === 'not_completed').length
  const total = managers.length
  const rated = managers.filter((m) => m.rating !== '-')
  const avgRating =
    managers.length === 0
      ? 0
      : managers.reduce((sum, m) => sum + m.averageRating, 0) / managers.length

  return {
    total,
    completed,
    inProgress,
    notCompleted,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
    avgRating: Math.round(avgRating * 100) / 100,
    gradedCount: rated.length,
    statusBreakdown: countBy(managers, (m) => statusDisplay(m.status), STATUS_COLORS),
    ratingBreakdown: countBy(managers, (m) => m.rating, RATING_COLORS),
    levelBreakdown: countBy(managers, (m) => m.level, LEVEL_COLORS),
    entityBreakdown: countBy(managers, (m) => m.entity, undefined, 8),
    functionBreakdown: countBy(managers, (m) => m.function, undefined, 8),
  }
}
