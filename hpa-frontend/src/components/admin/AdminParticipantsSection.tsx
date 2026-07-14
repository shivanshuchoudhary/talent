import { useMemo, useState } from 'react'
import { deleteParticipant, resetParticipantSurvey, type AdminParticipant } from '#/lib/admin-api'
import { filterParticipants } from '#/lib/admin-analytics'
import { AdminParticipantGradeCell } from '#/components/admin/AdminParticipantGradeCell'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Loader2, RotateCcw, Search, Trash2 } from 'lucide-react'
import { questions } from '#/lib/assessment'

const TOTAL_QUESTIONS = questions.length

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'Completed') return 'default'
  if (status === 'Timed out') return 'destructive'
  if (status.includes('progress')) return 'secondary'
  return 'outline'
}

function formatSubmittedAt(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
  onParticipantDeleted?: () => void | Promise<void>
}

export function AdminParticipantsSection({
  participants,
  onParticipantDeleted,
}: AdminParticipantsSectionProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [resettingUserId, setResettingUserId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = useMemo(
    () => filterParticipants(participants, search, statusFilter),
    [participants, search, statusFilter],
  )

  const handleDelete = async (row: AdminParticipant) => {
    const label = row.user.name || row.user.email
    const confirmed = window.confirm(
      `Delete ${label}?\n\nThis permanently removes their profile and survey data. They can register again from scratch.`,
    )
    if (!confirmed) return

    setDeletingUserId(row.user.id)
    setActionError(null)
    try {
      await deleteParticipant(row.user.id)
      await onParticipantDeleted?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete participant.')
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleResetSurvey = async (row: AdminParticipant) => {
    const label = row.user.name || row.user.email
    const confirmed = window.confirm(
      `Reset survey for ${label}?\n\nTheir profile stays registered. All answers and grades are removed so they can take the assessment again.`,
    )
    if (!confirmed) return

    setResettingUserId(row.user.id)
    setActionError(null)
    try {
      await resetParticipantSurvey(row.user.id)
      await onParticipantDeleted?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reset survey.')
    } finally {
      setResettingUserId(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Participants</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {filtered.length} of {participants.length} records · Reset or
              delete to let someone retake
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email…"
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

      {actionError ? (
        <p className="mx-5 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:mx-6">
          {actionError}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">
          No participants match your filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">Employee</TableHead>
                <TableHead className="px-3 text-center">Entity</TableHead>
                <TableHead className="px-3 text-center">Status</TableHead>
                <TableHead className="px-3 text-center">Progress</TableHead>
                <TableHead className="px-3 text-center">Grade</TableHead>
                <TableHead className="px-3 text-center">Submitted</TableHead>
                <TableHead className="px-3 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const answered = row.response?.questionsAnsweredCount ?? 0
                const progressPct = Math.round((answered / TOTAL_QUESTIONS) * 100)
                return (
                  <TableRow key={row.user.id}>
                    <TableCell className="px-3 text-left">
                      <div className="font-medium leading-tight">{row.user.name}</div>
                      <div className="text-xs text-muted-foreground">{row.user.email}</div>
                    </TableCell>
                    <TableCell className="px-3 text-center text-sm">
                      {row.user.entity || '—'}
                    </TableCell>
                    <TableCell className="px-3 text-center">
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="px-3 text-center">
                      <div className="mx-auto flex w-16 flex-col items-center gap-1">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {answered}/{TOTAL_QUESTIONS}
                        </span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/80 transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 text-center">
                      <div className="flex justify-center">
                        <AdminParticipantGradeCell participant={row} />
                      </div>
                    </TableCell>
                    <TableCell className="px-3 text-center text-sm whitespace-nowrap text-muted-foreground">
                      {formatSubmittedAt(row.response?.submittedAt)}
                    </TableCell>
                    <TableCell className="px-3 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          disabled={
                            resettingUserId === row.user.id || deletingUserId === row.user.id
                          }
                          aria-label={`Reset survey for ${row.user.name}`}
                          title="Reset survey (keep profile)"
                          onClick={() => void handleResetSurvey(row)}
                        >
                          {resettingUserId === row.user.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={
                            deletingUserId === row.user.id || resettingUserId === row.user.id
                          }
                          aria-label={`Delete ${row.user.name}`}
                          title="Delete participant"
                          onClick={() => void handleDelete(row)}
                        >
                          {deletingUserId === row.user.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
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
