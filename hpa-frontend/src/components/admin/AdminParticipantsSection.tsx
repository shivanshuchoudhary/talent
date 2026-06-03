import { useMemo, useState } from 'react'
import type { AdminParticipant } from '#/lib/admin-api'
import { filterParticipants } from '#/lib/admin-analytics'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Search } from 'lucide-react'
import { questions } from '#/lib/assessment'

const TOTAL_QUESTIONS = questions.length

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'Completed') return 'default'
  if (status === 'Timed out') return 'destructive'
  if (status.includes('progress')) return 'secondary'
  return 'outline'
}

function gradeClass(grade: string | null | undefined) {
  if (!grade) return 'text-muted-foreground'
  const g = grade.toUpperCase()
  if (g === 'A+' || g === 'A') return 'font-semibold text-[oklch(0.5_0.14_155)]'
  if (g.startsWith('B')) return 'font-semibold text-[oklch(0.5_0.14_210)]'
  return 'font-medium'
}

function formatSubmittedAt(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'Completed', label: 'Completed' },
  { value: 'In progress', label: 'In progress' },
  { value: 'Timed out', label: 'Timed out' },
  { value: 'Started (no answers yet)', label: 'Started' },
  { value: 'Registered (no submission)', label: 'Registered only' },
] as const

type AdminParticipantsSectionProps = {
  participants: AdminParticipant[]
}

export function AdminParticipantsSection({
  participants,
}: AdminParticipantsSectionProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(
    () => filterParticipants(participants, search, statusFilter),
    [participants, search, statusFilter],
  )

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Participants</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {filtered.length} of {participants.length} records
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">
          No participants match your filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const answered = row.response?.questionsAnsweredCount ?? 0
                const progressPct = Math.round((answered / TOTAL_QUESTIONS) * 100)
                return (
                  <TableRow key={row.user.id}>
                    <TableCell>
                      <div className="font-medium">{row.user.name}</div>
                      <div className="text-xs text-muted-foreground">{row.user.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.user.employeeCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{row.user.Department || '—'}</TableCell>
                    <TableCell className="text-sm">{row.user.entity || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[100px] flex-col gap-1">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {answered}/{TOTAL_QUESTIONS} ({progressPct}%)
                        </span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/80 transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={gradeClass(row.response?.letterGrade)}>
                        {row.response?.letterGrade ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatSubmittedAt(row.response?.submittedAt)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
