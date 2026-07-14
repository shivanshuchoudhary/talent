import { ArrowRight } from 'lucide-react'
import type { AdminParticipant } from '#/lib/admin-api'
import { getParticipantGrades } from '#/lib/grade-resolution'
import { cn } from '#/lib/utils'

function gradeClass(grade: string | null | undefined) {
  if (!grade) return 'text-muted-foreground'
  const g = grade.toUpperCase()
  if (g === 'A+' || g === 'A') return 'font-semibold text-[oklch(0.5_0.14_155)]'
  if (g.startsWith('B')) return 'font-semibold text-[oklch(0.5_0.14_210)]'
  return 'font-medium'
}

type AdminParticipantGradeCellProps = {
  participant: AdminParticipant
}

export function AdminParticipantGradeCell({
  participant,
}: AdminParticipantGradeCellProps) {
  const { calculatedLetterGrade, effectiveLetterGrade, cappedDueToTimeout } =
    getParticipantGrades(participant)

  if (!effectiveLetterGrade) {
    return <span className="text-muted-foreground">—</span>
  }

  if (!cappedDueToTimeout || !calculatedLetterGrade) {
    return (
      <span className={cn('text-sm tabular-nums', gradeClass(effectiveLetterGrade))}>
        {effectiveLetterGrade}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span
          className={cn(
            'inline-flex min-w-7 items-center justify-center rounded-md border border-border/80 bg-muted/40 px-1 py-0.5 text-xs font-medium tabular-nums text-muted-foreground line-through decoration-muted-foreground/50',
            gradeClass(calculatedLetterGrade),
          )}
        >
          {calculatedLetterGrade}
        </span>
        <ArrowRight
          className="size-3 shrink-0 text-muted-foreground/70"
          aria-hidden
        />
        <span
          className={cn(
            'inline-flex min-w-7 items-center justify-center rounded-md border border-[oklch(0.5_0.14_210/0.25)] bg-[oklch(0.5_0.14_210/0.08)] px-1 py-0.5 text-sm font-semibold tabular-nums',
            gradeClass(effectiveLetterGrade),
          )}
        >
          {effectiveLetterGrade}
        </span>
      </div>
      <p className="text-[10px] leading-tight text-muted-foreground">Timed out</p>
    </div>
  )
}
