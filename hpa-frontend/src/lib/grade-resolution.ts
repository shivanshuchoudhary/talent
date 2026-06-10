import type { AdminParticipant } from '#/lib/admin-api'
import { questions } from '#/lib/assessment'

export const MIN_QUESTIONS_FOR_FULL_GRADE = 30
const TOTAL_QUESTIONS = questions.length

export type ResolvedGrade = {
  calculatedLetterGrade: string | null
  effectiveLetterGrade: string | null
  cappedDueToTimeout: boolean
}

function gradeRank(grade: string): number {
  if (grade === 'A+') return 3
  if (grade === 'A') return 2
  return 1
}

export function isSubmissionTimedOut(input: {
  timedOut: boolean
  hasTimedOut?: boolean
  isCompleted: boolean
  questionsAnsweredCount: number
}): boolean {
  if (input.timedOut || input.hasTimedOut) {
    return true
  }
  return (
    input.isCompleted &&
    input.questionsAnsweredCount > 0 &&
    input.questionsAnsweredCount < TOTAL_QUESTIONS
  )
}

export function resolveEffectiveGrade(input: {
  calculatedGrade: string | null
  timedOut: boolean
  hasTimedOut?: boolean
  isCompleted: boolean
  questionsAnsweredCount: number
}): ResolvedGrade {
  const calculatedLetterGrade = input.calculatedGrade?.trim() || null
  if (!calculatedLetterGrade) {
    return {
      calculatedLetterGrade: null,
      effectiveLetterGrade: null,
      cappedDueToTimeout: false,
    }
  }

  const timedOut = isSubmissionTimedOut(input)
  const cappedDueToTimeout =
    timedOut &&
    input.questionsAnsweredCount < MIN_QUESTIONS_FOR_FULL_GRADE &&
    gradeRank(calculatedLetterGrade) > gradeRank('B')

  return {
    calculatedLetterGrade,
    effectiveLetterGrade: cappedDueToTimeout ? 'B' : calculatedLetterGrade,
    cappedDueToTimeout,
  }
}

export function getParticipantGrades(participant: AdminParticipant): ResolvedGrade {
  const response = participant.response
  if (!response) {
    return {
      calculatedLetterGrade: null,
      effectiveLetterGrade: null,
      cappedDueToTimeout: false,
    }
  }

  if (
    response.effectiveLetterGrade != null ||
    response.cappedDueToTimeout === true
  ) {
    return {
      calculatedLetterGrade:
        response.calculatedLetterGrade ?? response.letterGrade ?? null,
      effectiveLetterGrade:
        response.effectiveLetterGrade ?? response.letterGrade ?? null,
      cappedDueToTimeout: response.cappedDueToTimeout ?? false,
    }
  }

  return resolveEffectiveGrade({
    calculatedGrade: response.letterGrade,
    timedOut: response.timedOut,
    hasTimedOut: participant.user.hasTimedOut,
    isCompleted: response.isCompleted,
    questionsAnsweredCount: response.questionsAnsweredCount,
  })
}
