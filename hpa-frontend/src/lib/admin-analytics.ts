import type { AdminParticipant } from '#/lib/admin-api'
import { questions } from '#/lib/assessment'

const TOTAL_QUESTIONS = questions.length

export type CountSlice = {
  label: string
  count: number
  color: string
}

export type AdminDashboardStats = {
  totalParticipants: number
  registeredToday: number
  withSubmission: number
  completed: number
  timedOut: number
  inProgress: number
  registeredOnly: number
  completionRate: number
  participationRate: number
  avgQuestionsAnswered: number
  avgProgressPercent: number
  statusBreakdown: CountSlice[]
  gradeBreakdown: CountSlice[]
  departmentBreakdown: CountSlice[]
  entityBreakdown: CountSlice[]
  progressBuckets: CountSlice[]
  submissionsByDay: { date: string; label: string; count: number }[]
}

const STATUS_COLORS: Record<string, string> = {
  Completed: 'oklch(0.55 0.14 155)',
  'Timed out': 'oklch(0.55 0.2 27)',
  'In progress': 'oklch(0.55 0.14 210)',
  'Started (no answers yet)': 'oklch(0.7 0.12 75)',
  'Registered (no submission)': 'oklch(0.65 0.02 107)',
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'oklch(0.55 0.14 155)',
  A: 'oklch(0.52 0.12 165)',
  B: 'oklch(0.55 0.14 210)',
  'Not graded': 'oklch(0.75 0.02 107)',
}

function countByField(
  rows: AdminParticipant[],
  getValue: (row: AdminParticipant) => string,
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

function isToday(dateValue: string): boolean {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return false
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

function buildSubmissionsByDay(rows: AdminParticipant[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const submitted = row.response?.submittedAt
    if (!submitted) continue
    const date = new Date(submitted)
    if (Number.isNaN(date.getTime())) continue
    const key = date.toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const recent = sorted.slice(-14)

  return recent.map(([date, count]) => ({
    date,
    count,
    label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
  }))
}

export function computeAdminDashboardStats(
  participants: AdminParticipant[],
): AdminDashboardStats {
  const totalParticipants = participants.length
  const registeredToday = participants.filter((p) => isToday(p.user.createdAt)).length
  const completed = participants.filter((p) => p.status === 'Completed').length
  const timedOut = participants.filter((p) => p.status === 'Timed out').length
  const inProgress = participants.filter((p) => p.status === 'In progress').length
  const registeredOnly = participants.filter(
    (p) => p.status === 'Registered (no submission)',
  ).length
  const withSubmission = totalParticipants - registeredOnly

  const answeredCounts = participants
    .map((p) => p.response?.questionsAnsweredCount ?? 0)
    .filter((n) => n > 0)
  const avgQuestionsAnswered =
    answeredCounts.length > 0
      ? answeredCounts.reduce((sum, n) => sum + n, 0) / answeredCounts.length
      : 0
  const avgProgressPercent = Math.round((avgQuestionsAnswered / TOTAL_QUESTIONS) * 100)

  const statusOrder = [
    'Completed',
    'In progress',
    'Timed out',
    'Started (no answers yet)',
    'Registered (no submission)',
  ]
  const statusBreakdown = statusOrder
    .map((label) => ({
      label,
      count: participants.filter((p) => p.status === label).length,
      color: STATUS_COLORS[label] ?? 'var(--muted-foreground)',
    }))
    .filter((slice) => slice.count > 0)

  const gradeOrder = ['A+', 'A', 'B']
  const graded = participants.filter((p) => p.response?.letterGrade)
  const gradeBreakdown = [
    ...gradeOrder.map((label) => ({
      label,
      count: graded.filter((p) => p.response?.letterGrade === label).length,
      color: GRADE_COLORS[label] ?? 'var(--chart-3)',
    })),
    {
      label: 'Not graded',
      count: participants.filter((p) => !p.response?.letterGrade && p.response).length,
      color: GRADE_COLORS['Not graded'],
    },
    {
      label: 'No submission',
      count: registeredOnly,
      color: 'oklch(0.8 0.02 107)',
    },
  ].filter((slice) => slice.count > 0)

  const progressBuckets: CountSlice[] = [
    { label: '0%', count: 0, color: 'oklch(0.8 0.02 107)' },
    { label: '1–25%', count: 0, color: 'var(--chart-5)' },
    { label: '26–50%', count: 0, color: 'var(--chart-4)' },
    { label: '51–75%', count: 0, color: 'var(--chart-3)' },
    { label: '76–99%', count: 0, color: 'var(--chart-2)' },
    { label: '100%', count: 0, color: 'oklch(0.55 0.14 155)' },
  ]

  for (const row of participants) {
    const answered = row.response?.questionsAnsweredCount ?? 0
    const pct = Math.round((answered / TOTAL_QUESTIONS) * 100)
    if (answered === 0) progressBuckets[0].count += 1
    else if (pct <= 25) progressBuckets[1].count += 1
    else if (pct <= 50) progressBuckets[2].count += 1
    else if (pct <= 75) progressBuckets[3].count += 1
    else if (pct < 100) progressBuckets[4].count += 1
    else progressBuckets[5].count += 1
  }

  return {
    totalParticipants,
    registeredToday,
    withSubmission,
    completed,
    timedOut,
    inProgress,
    registeredOnly,
    completionRate:
      totalParticipants > 0 ? Math.round((completed / totalParticipants) * 100) : 0,
    participationRate:
      totalParticipants > 0
        ? Math.round((withSubmission / totalParticipants) * 100)
        : 0,
    avgQuestionsAnswered: Math.round(avgQuestionsAnswered * 10) / 10,
    avgProgressPercent,
    statusBreakdown,
    gradeBreakdown,
    departmentBreakdown: countByField(
      participants,
      (p) => p.user.Department,
      undefined,
      10,
    ),
    entityBreakdown: countByField(participants, (p) => p.user.entity, undefined, 10),
    progressBuckets: progressBuckets.filter((b) => b.count > 0),
    submissionsByDay: buildSubmissionsByDay(participants),
  }
}

export function filterParticipants(
  rows: AdminParticipant[],
  query: string,
  statusFilter: string,
): AdminParticipant[] {
  const q = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (statusFilter !== 'all' && row.status !== statusFilter) {
      return false
    }
    if (!q) return true
    const haystack = [
      row.user.name,
      row.user.email,
      row.user.employeeCode,
      row.user.Department,
      row.user.entity,
      row.status,
      row.response?.letterGrade ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}
