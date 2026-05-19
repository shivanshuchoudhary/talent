import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import {
  answerOptions,
  categories,
  getLetterGradeFromAverage,
  questions,
  scoreLevels,
} from '#/lib/assessment'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { createEmptyUserData, useAssessmentStore } from '#/store/assessment-store'
import type { UserData } from '#/store/assessment-store'
import {
  applyMicrosoftAccountToProfile,
  formatMsalError,
  handleMicrosoftRedirect,
  isMsalConfigured,
  loginWithMicrosoft,
  logoutMicrosoft,
} from '#/lib/msal-auth'
import { Progress } from '#/components/ui/progress'
import { cn } from '#/lib/utils'
import { Separator } from '#/components/ui/separator'
import { EmployeeDetailsForm } from '#/components/EmployeeDetailsForm'
import { AuthHeroPanel } from '#/components/AuthHeroPanel'
import {
  API_SURVEY_RESPONSES_URL,
  API_SURVEY_SESSION_URL,
  getApiBaseUrl,
} from '#/lib/api'

export const Route = createFileRoute('/')({ component: App })

export interface CategoryResult {
  categories: {
    categoryId: number
    title: string
    totalScore: number
    averageScore: number
    weightedScore: number
    scoreLevel: string
  }[]
  letterGrade: string
}

function roundTo2(value: number) {
  return Number(value.toFixed(2))
}

function getScoreLevelDescriptor(averageScore: number) {
  return (
    scoreLevels.find(
      (level) => averageScore >= level.min && averageScore <= level.max,
    )?.descriptor ?? 'Developing'
  )
}

function calculateCategoryResults(
  answers: Record<number, number>,
): CategoryResult {
  const categoryScores: CategoryResult['categories'] = categories.map(
    (category) => {
      const rawSum = category.questions.reduce(
        (sum, questionId) => sum + (answers[questionId] ?? 0),
        0,
      )
      const averageScore = rawSum / category.questions.length
      const weightedScore = averageScore * category.weight

      const scoreLevel = getScoreLevelDescriptor(averageScore)

      return {
        categoryId: category.id,
        title: category.title,
        totalScore: roundTo2(rawSum),
        averageScore: roundTo2(averageScore),
        weightedScore: roundTo2(weightedScore),
        scoreLevel: scoreLevel,
      }
    },
  )

  const weightSum = categories.reduce((sum, c) => sum + c.weight, 0)
  const overallWeightedAverage =
    categoryScores.reduce((sum, item) => sum + item.weightedScore, 0) /
    weightSum

  const letterGrade = getLetterGradeFromAverage(overallWeightedAverage)

  return {
    categories: categoryScores,
    letterGrade,
  }
}

/** Partial save: only categories with at least one answered question (avoids invalid scoreLevel). */
function calculateCategoryResultsFromAnsweredOnly(
  answersArray: Array<number | undefined>,
): CategoryResult {
  const answersMap = buildAnswersMapFromArray(answersArray)
  const categoryScores: CategoryResult['categories'] = []

  for (const category of categories) {
    const answeredQuestionIds = category.questions.filter(
      (questionId) => answersMap[questionId] !== undefined,
    )
    if (answeredQuestionIds.length === 0) {
      continue
    }

    const rawSum = answeredQuestionIds.reduce(
      (sum, questionId) => sum + answersMap[questionId]!,
      0,
    )
    const averageScore = rawSum / answeredQuestionIds.length
    const weightedScore = averageScore * category.weight

    categoryScores.push({
      categoryId: category.id,
      title: category.title,
      totalScore: roundTo2(rawSum),
      averageScore: roundTo2(averageScore),
      weightedScore: roundTo2(weightedScore),
      scoreLevel: getScoreLevelDescriptor(averageScore),
    })
  }

  const weightSum = categoryScores.reduce((sum, item) => {
    const category = categories.find((entry) => entry.id === item.categoryId)
    return sum + (category?.weight ?? 0)
  }, 0)
  const overallWeightedAverage =
    weightSum > 0
      ? categoryScores.reduce((sum, item) => sum + item.weightedScore, 0) / weightSum
      : 0

  return {
    categories: categoryScores,
    letterGrade: getLetterGradeFromAverage(overallWeightedAverage),
  }
}

interface SurveySubmitStatus {
  isCompleted: boolean
  timedOut: boolean
}

interface ResultData {
  userId: string
  categoryResults: CategoryResult
  questionsAnswered: {
    questionId: number
    answer: number
  }[]
  isCompleted: boolean
  timedOut: boolean
}

const API_BASE_URL = getApiBaseUrl()

const ASSESSMENT_DURATION_SECONDS = 7 * 60
const SECONDS_PER_QUESTION = ASSESSMENT_DURATION_SECONDS / questions.length

type ProfileErrors = Partial<Record<keyof UserData | 'otherEntity', string>>
type SubmitPhase =
  | 'idle'
  | 'submitting'
  | 'completed'
  | 'timed_out'
  | 'error'

const surveyBackgroundStyle = {
  backgroundImage:
    "linear-gradient(rgba(248, 245, 235, 0.58), rgba(248, 245, 235, 0.68)), url('/talent_background.PNG')",
  backgroundPosition: 'left center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
}

function normalizeUserData(value: UserData, otherEntity: string): UserData {
  const normalizedOtherEntity = otherEntity.trim()

  return {
    employeeCode: value.employeeCode.trim(),
    name: value.name.trim(),
    email: value.email.trim().toLowerCase(),
    Department: value.Department.trim(),
    Designation: value.Designation.trim(),
    entity:
      value.entity.trim() === 'Other' ? normalizedOtherEntity : value.entity.trim(),
  }
}

function validateUserData(value: UserData, otherEntity: string): ProfileErrors {
  const normalized = normalizeUserData(value, otherEntity)
  const errors: ProfileErrors = {}

  if (!normalized.employeeCode) {
    errors.employeeCode = 'Employee code is required.'
  }
  if (!normalized.name) {
    errors.name = 'Employee name is required.'
  }
  if (!normalized.email) {
    errors.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    errors.email = 'Enter a valid email address.'
  }
  if (!normalized.Designation) {
    errors.Designation = 'Designation is required.'
  }
  if (!normalized.Department) {
    errors.Department = 'Department is required.'
  }
  if (!normalized.entity) {
    errors.entity = 'Entity is required.'
  }
  if (value.entity.trim() === 'Other' && !otherEntity.trim()) {
    errors.otherEntity = 'Please enter the entity name.'
  }

  return errors
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getCompletionSubmitPhase(isCompleted: boolean): SubmitPhase {
  return isCompleted ? 'completed' : 'timed_out'
}

function buildAnswersMapFromArray(answersArray: Array<number | undefined>) {
  return answersArray.reduce<Record<number, number>>((acc, value, index) => {
    if (value !== undefined) {
      acc[index + 1] = value
    }
    return acc
  }, {})
}

function buildAnsweredEntries(answersArray: Array<number | undefined>) {
  return answersArray.flatMap((answer, index) =>
    answer === undefined
      ? []
      : [
        {
          questionId: index + 1,
          answer,
        },
      ],
  )
}

function toAnswersArrayFromEntries(
  entries: Array<{ questionId: number; answer: number }> | undefined,
) {
  const restoredAnswers: Array<1 | 2 | 3 | 4 | 5 | undefined> = Array.from(
    { length: questions.length },
    () => undefined,
  )
  if (!Array.isArray(entries)) {
    return restoredAnswers
  }

  for (const entry of entries) {
    if (
      entry.questionId >= 1 &&
      entry.questionId <= questions.length &&
      (entry.answer === 1 ||
        entry.answer === 2 ||
        entry.answer === 3 ||
        entry.answer === 4 ||
        entry.answer === 5)
    ) {
      restoredAnswers[entry.questionId - 1] = entry.answer
    }
  }

  return restoredAnswers
}

function calculateResumeDurationSeconds(answersArray: Array<number | undefined>) {
  const answeredCount = answersArray.reduce<number>(
    (count, answer) => (answer === undefined ? count : count + 1),
    0,
  )
  const remainingQuestions = Math.max(questions.length - answeredCount, 0)
  return Math.max(1, Math.ceil(remainingQuestions * SECONDS_PER_QUESTION))
}

function isUserProfileComplete(user: {
  employeeCode?: string
  Department?: string
  Designation?: string
  entity?: string
}) {
  return Boolean(
    user.employeeCode?.trim() &&
    user.Department?.trim() &&
    user.Designation?.trim() &&
    user.entity?.trim(),
  )
}

function userDataFromBackend(backendUser: Record<string, unknown>): UserData {
  return {
    employeeCode: String(backendUser.employeeCode ?? ''),
    name: String(backendUser.name ?? ''),
    email: String(backendUser.email ?? ''),
    Department: String(backendUser.Department ?? ''),
    Designation: String(backendUser.Designation ?? ''),
    entity: String(backendUser.entity ?? ''),
  }
}

function App() {
  const {
    currentQuestionId,
    answersArray,
    setAnswerForQuestion,
    nextQuestion,
    resetAssessment,
    hydrateAnswers,
    isLoggedIn,
    userData,
    signIn,
    signOut,
  } = useAssessmentStore()
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [profileForm, setProfileForm] = useState<UserData>(() => createEmptyUserData())
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({})
  const [otherEntity, setOtherEntity] = useState('')
  const [remainingSeconds, setRemainingSeconds] = useState(ASSESSMENT_DURATION_SECONDS)
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [timerRunId, setTimerRunId] = useState(0)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isAuthRedirecting, setIsAuthRedirecting] = useState(false)
  const [isHandlingMsalRedirect, setIsHandlingMsalRedirect] = useState(true)
  const [isRestoringSession, setIsRestoringSession] = useState(false)
  const [isCheckingCompletion, setIsCheckingCompletion] = useState(false)
  const [hasCompletedAssessment, setHasCompletedAssessment] = useState(false)
  const [hasTimedOutAssessment, setHasTimedOutAssessment] = useState(false)
  const [activeUserId, setActiveUserId] = useState('')
  /** This session only — after a successful POST from completing all questions */
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle')
  const autoSubmitStartedRef = useRef(false)
  const answeredCount = answersArray.reduce(
    (count, answer) => (answer === undefined ? count : count + 1),
    0,
  )
  const completionPercent = Math.round((answeredCount / questions.length) * 100)
  const isCompleted = answeredCount === questions.length
  const currentPageStart = Math.floor((currentQuestionId - 1) / 5) * 5
  const visibleQuestions = questions.slice(currentPageStart, currentPageStart + 5)
  const isTimeUp = remainingSeconds <= 0
  const countdownLabel = formatCountdown(remainingSeconds)
  const isFinalMessageVisible =
    submitPhase === 'completed' || submitPhase === 'timed_out'
  const buildResultPayload = (status: SurveySubmitStatus): ResultData | null => {
    if (!activeUserId) {
      return null
    }
    const questionsAnswered = buildAnsweredEntries(answersArray)
    if (questionsAnswered.length === 0) {
      return null
    }
    const allQuestionsAnswered = answeredCount === questions.length
    const categoryResults = allQuestionsAnswered
      ? calculateCategoryResults(buildAnswersMapFromArray(answersArray))
      : calculateCategoryResultsFromAnsweredOnly(answersArray)
    if (categoryResults.categories.length === 0) {
      return null
    }
    return {
      userId: activeUserId,
      categoryResults,
      questionsAnswered,
      isCompleted: status.isCompleted,
      timedOut: status.timedOut,
    }
  }

  const saveResultsToDatabase = async (resultData: ResultData) => {
    console.log('[Survey][Frontend] Sending POST request:', {
      endpoint: API_SURVEY_RESPONSES_URL,
      method: 'POST',
    })

    try {
      const response = await fetch(API_SURVEY_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resultData),
      })

      const responseBody = await response.json().catch(() => null)
      console.log('[Survey][Frontend] Received response:', {
        status: response.status,
        ok: response.ok,
        body: responseBody,
      })

      if (!response.ok) {
        throw new Error(`Failed to save survey response. Status: ${response.status}`)
      }

      console.log('[Survey][Frontend] Survey response posted successfully.')
      return true
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      console.error('[Survey][Frontend] Error posting survey response:', {
        message: errorMessage,
        raw: error,
      })
      return false
    }
  }

  const updateProfileField = (field: keyof UserData, value: string) => {
    setProfileForm((current) => ({ ...current, [field]: value }))
    setProfileErrors((current) => ({
      ...current,
      [field]: undefined,
      ...(field === 'entity' ? { otherEntity: undefined } : null),
    }))

    if (field === 'entity' && value !== 'Other') {
      setOtherEntity('')
    }
  }

  const handleOtherEntityChange = (value: string) => {
    setOtherEntity(value)
    setProfileErrors((current) => ({
      ...current,
      otherEntity: undefined,
    }))
  }

  const resetProfileForm = () => {
    setProfileForm(createEmptyUserData())
    setProfileErrors({})
    setOtherEntity('')
  }

  const applySessionFromBackend = (
    normalizedUser: UserData,
    backendUser: Record<string, unknown>,
    backendResponse: Record<string, unknown> | null | undefined,
  ) => {
    const backendUserId = String(backendUser._id ?? backendUser.id ?? '')
    if (!backendUserId) {
      throw new Error('User ID was not returned by the backend.')
    }

    signIn(normalizedUser)
    setActiveUserId(backendUserId)

    const restoredAnswers = toAnswersArrayFromEntries(
      backendResponse?.questionsAnswered as
        | Array<{ questionId: number; answer: number }>
        | undefined,
    )
    const hasSavedProgress = restoredAnswers.some((answer) => answer !== undefined)
    const savedAnswerCount = hasSavedProgress
      ? restoredAnswers.reduce(
          (count, answer) => (answer === undefined ? count : count + 1),
          0,
        )
      : 0
    const legacyTimedOut =
      Boolean(backendResponse?.isCompleted) &&
      !Boolean(backendResponse?.timedOut) &&
      savedAnswerCount > 0 &&
      savedAnswerCount < questions.length
    const timedOutFromBackend =
      Boolean(backendUser.hasTimedOut) ||
      Boolean(backendResponse?.timedOut) ||
      legacyTimedOut
    const completedFromBackend =
      (Boolean(backendUser.hasCompletedQuestions) ||
        Boolean(backendResponse?.isCompleted)) &&
      !timedOutFromBackend
    const surveyClosed = completedFromBackend || timedOutFromBackend

    if (hasSavedProgress && !surveyClosed) {
      hydrateAnswers(restoredAnswers)
      setRemainingSeconds(calculateResumeDurationSeconds(restoredAnswers))
    } else if (!surveyClosed) {
      resetAssessment()
      setRemainingSeconds(ASSESSMENT_DURATION_SECONDS)
    }

    setIsTimerActive(false)
    setHasCompletedAssessment(completedFromBackend)
    setHasTimedOutAssessment(timedOutFromBackend)
    setShowInstructions(!surveyClosed)
    setShowProfileForm(false)
    setSubmitPhase('idle')
    autoSubmitStartedRef.current = false
  }

  const tryRestoreSessionAfterMicrosoftLogin = async (
    account: NonNullable<Awaited<ReturnType<typeof handleMicrosoftRedirect>>>,
  ) => {
    const { name, email } = applyMicrosoftAccountToProfile(account)
    setIsRestoringSession(true)
    setAuthError(null)

    try {
      const response = await fetch(API_SURVEY_SESSION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userData: { email, name },
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(`Failed to restore user session. Status: ${response.status}`)
      }

      const backendUser = body?.data?.user as Record<string, unknown> | null | undefined
      if (!backendUser) {
        setProfileForm((current) => ({
          ...current,
          name,
          email,
        }))
        setShowProfileForm(true)
        return
      }

      const restoredUser = userDataFromBackend(backendUser)
      if (!isUserProfileComplete(restoredUser)) {
        setProfileForm(restoredUser)
        setOtherEntity('')
        setShowProfileForm(true)
        return
      }

      applySessionFromBackend(
        restoredUser,
        backendUser,
        body?.data?.response as Record<string, unknown> | null | undefined,
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Survey][Frontend] Failed to restore session after Microsoft login:', {
        message: errorMessage,
        raw: error,
      })
      setProfileForm((current) => ({
        ...current,
        name,
        email,
      }))
      setShowProfileForm(true)
    } finally {
      setIsRestoringSession(false)
    }
  }

  const handleLogin = async () => {
    resetProfileForm()
    setAuthError(null)

    if (!isMsalConfigured()) {
      setAuthError(
        'Microsoft SSO is not configured. Add VITE_MSAL_CLIENT_ID and VITE_MSAL_TENANT_ID to hpa-frontend/.env.production.local, then run npm run build and restart the frontend.',
      )
      return
    }

    setIsAuthRedirecting(true)
    try {
      await loginWithMicrosoft()
    } catch (error) {
      const errorMessage = formatMsalError(error)
      console.error('[Auth] Microsoft login failed:', {
        message: errorMessage,
        raw: error,
      })
      setAuthError(errorMessage)
      setIsAuthRedirecting(false)
    }
  }

  const handleProfileSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    const errors = validateUserData(profileForm, otherEntity)
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors)
      return
    }

    const normalizedUser = normalizeUserData(profileForm, otherEntity)
    setIsCheckingCompletion(true)

    try {
      const response = await fetch(API_SURVEY_SESSION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userData: normalizedUser,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(`Failed to prepare user session. Status: ${response.status}`)
      }

      const backendUser = body?.data?.user as Record<string, unknown> | undefined
      const backendResponse = body?.data?.response as
        | Record<string, unknown>
        | null
        | undefined
      if (!backendUser) {
        throw new Error('User was not returned by the backend.')
      }

      applySessionFromBackend(normalizedUser, backendUser, backendResponse)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Survey][Frontend] Failed to prepare user session:', {
        message: errorMessage,
        raw: error,
      })
      setSubmitPhase('error')
    } finally {
      setIsCheckingCompletion(false)
    }
  }

  const handleStartOrContinueSurvey = () => {
    setShowInstructions(false)
    if (answeredCount === 0) {
      resetAssessment()
      setRemainingSeconds(ASSESSMENT_DURATION_SECONDS)
    } else {
      setRemainingSeconds(calculateResumeDurationSeconds(answersArray))
    }
    setIsTimerActive(true)
    setTimerRunId((v) => v + 1)
  }

  const handleSignOut = async () => {
    try {
      await logoutMicrosoft()
    } catch (error) {
      console.error('[Auth] Microsoft logout failed:', error)
    } finally {
      resetAssessment()
      setActiveUserId('')
      setIsTimerActive(false)
      signOut()
      resetProfileForm()
      setShowProfileForm(false)
      setShowInstructions(false)
      setHasTimedOutAssessment(false)
      setSubmitPhase('idle')
      autoSubmitStartedRef.current = false
    }
  }

  useEffect(() => {
    if (isLoggedIn) {
      setIsHandlingMsalRedirect(false)
      return
    }

    void (async () => {
      try {
        const account = await handleMicrosoftRedirect()
        if (account) {
          await tryRestoreSessionAfterMicrosoftLogin(account)
        }
      } catch (error) {
        const errorMessage = formatMsalError(error)
        console.error('[Auth] Microsoft redirect handling failed:', error)
        setAuthError(errorMessage)
      } finally {
        setIsHandlingMsalRedirect(false)
        setIsAuthRedirecting(false)
      }
    })()
  }, [isLoggedIn])

  useEffect(() => {
    console.log('[Auth/Survey State]', {
      isLoggedIn,
      answeredCount,
      currentQuestionId,
      isCompleted,
      isTimeUp,
      visibleQuestionIds: visibleQuestions.map((q) => q.id),
    })
  }, [
    isLoggedIn,
    answeredCount,
    currentQuestionId,
    isCompleted,
    isTimeUp,
    visibleQuestions,
  ])

  useEffect(() => {
    if (!isTimerActive) {
      return
    }
    const deadline = Date.now() + remainingSeconds * 1000
    const timerId = window.setInterval(() => {
      const diff = Math.max(deadline - Date.now(), 0)
      setRemainingSeconds(Math.ceil(diff / 1000))
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [isTimerActive, timerRunId])

  useEffect(() => {
    if (
      isCheckingCompletion ||
      hasCompletedAssessment ||
      hasTimedOutAssessment ||
      showInstructions
    ) {
      return
    }
    if (!isCompleted && !isTimeUp) {
      return
    }
    if (autoSubmitStartedRef.current) {
      return
    }
    autoSubmitStartedRef.current = true
    setSubmitPhase('submitting')

    const run = async () => {
      const submitStatus: SurveySubmitStatus = {
        isCompleted,
        timedOut: isTimeUp && !isCompleted,
      }
      const resultData = buildResultPayload(submitStatus)
      if (!resultData) {
        setSubmitPhase('error')
        autoSubmitStartedRef.current = false
        return
      }
      console.log('[Survey][Frontend] Auto-submit prepared payload:', {
        apiBaseUrl: API_BASE_URL,
        userId: resultData.userId,
        answersCount: resultData.questionsAnswered.length,
        letterGrade: resultData.categoryResults.letterGrade,
        ...submitStatus,
      })
      const ok = await saveResultsToDatabase(resultData)
      if (ok) {
        setIsTimerActive(false)
        if (submitStatus.isCompleted) {
          setHasCompletedAssessment(true)
        }
        if (submitStatus.timedOut) {
          setHasTimedOutAssessment(true)
        }
        setSubmitPhase(getCompletionSubmitPhase(isCompleted))
      } else {
        setSubmitPhase('error')
        autoSubmitStartedRef.current = false
      }
    }

    void run()
  }, [
    isCheckingCompletion,
    hasCompletedAssessment,
    hasTimedOutAssessment,
    isCompleted,
    isTimeUp,
  ])

  const handleSaveAndSignOut = async () => {
    const resultData = buildResultPayload({ isCompleted: false, timedOut: false })
    if (!resultData) {
      await handleSignOut()
      return
    }

    setSubmitPhase('submitting')
    autoSubmitStartedRef.current = true
    setIsTimerActive(false)
    const ok = await saveResultsToDatabase(resultData)
    if (!ok) {
      setSubmitPhase('error')
      autoSubmitStartedRef.current = false
      setIsTimerActive(true)
      setTimerRunId((v) => v + 1)
      return
    }
    setSubmitPhase('idle')
    autoSubmitStartedRef.current = false
    await handleSignOut()
  }

  const canGoNext = useMemo(() => {
    if (isTimeUp) {
      return false
    }
    if (currentQuestionId >= questions.length) {
      return false
    }
    return visibleQuestions.every(
      (question) => answersArray[question.id - 1] !== undefined,
    )
  }, [answersArray, currentQuestionId, isTimeUp, visibleQuestions])

  return (
    <div className="min-h-[calc(100vh-72px)]" style={surveyBackgroundStyle}>
      {!isLoggedIn && !showProfileForm ? (
        <div className="min-h-[calc(100vh-72px)] bg-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="contents lg:contents">
            <AuthHeroPanel
              title="Welcome to the High Potential Assessment Questionnaire"
            />

            <section className="flex items-center justify-center bg-white px-5 py-10 sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-12 xl:px-16">
              <div className="w-full max-w-md">
                <img src="/logo-sobha.png" alt="Sobha Ascend Logo" className="mb-4  mx-auto h-20 w-20 object-contain" />
                <div className="text-center">

                  <p className="text-2xl font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                    Sobha Ascend
                  </p>
                </div>

                {authError ? (
                  <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {authError}
                  </p>
                ) : null}

                <Button
                  className="mt-8 w-full flex items-center justify-center gap-3"
                  size="lg"
                  disabled={isAuthRedirecting || isHandlingMsalRedirect || isRestoringSession}
                  onClick={() => void handleLogin()}
                >
                  <img
                    src="/microsoft.png"
                    alt="Microsoft Logo"
                    className="h-5 w-5 object-contain"
                  />
                  {isHandlingMsalRedirect || isRestoringSession
                    ? 'Completing sign in…'
                    : isAuthRedirecting
                      ? 'Redirecting to Microsoft…'
                      : 'Sign in with Microsoft Single Sign-On'}
                </Button>

              </div>
            </section>
          </div>
        </div>
      ) : null}

      {!isLoggedIn && showProfileForm ? (
        <EmployeeDetailsForm
          profileForm={profileForm}
          profileErrors={profileErrors}
          otherEntity={otherEntity}
          onUpdateField={updateProfileField}
          onOtherEntityChange={handleOtherEntityChange}
          onSubmit={handleProfileSubmit}
          onBack={() => {
            resetProfileForm()
            setShowProfileForm(false)
          }}
        />
      ) : null}

      {isLoggedIn && showInstructions ? (
        <div className="min-h-[calc(100vh-72px)] bg-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="contents lg:contents">
            <AuthHeroPanel
              title="High Potential Assessment Questionnaire"
            />

            <section className="flex items-center justify-center bg-white px-5 py-10 sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-12 xl:px-16">
              <div className="w-full max-w-2xl">
                <div className=" mb-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                    Sobha Ascend
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">Instructions</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Please read the following instructions carefully before starting the assessment:
                  </p>
                </div>

                <div className="space-y-6 text-left">
                  <div className="rounded-lg border border-border bg-card/50 p-6">
                    <ul className="space-y-4 text-sm leading-6">
                      <li className="flex items-start gap-3">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                        <span>The assessment consists of <strong>40 questions</strong>. Ensure that you attempt and complete all questions.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                        <span>This is a timed assessment with a total duration of <strong>7 minutes</strong>. The assessment is designed to be quick and can typically be completed within 2 minutes if done in one sitting.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                        <span>If needed, click "Save and Sign Out" Button to save your progress and exit. You can resume later by signing in again.</span>

                      </li>
                    </ul>
                  </div>
                </div>

                <div className="mt-8 text-center">
                  <Button
                    className="w-full sm:w-auto"
                    size="lg"
                    onClick={handleStartOrContinueSurvey}
                  >
                    {answeredCount > 0 ? 'Continue Survey' : 'Start Survey'}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {isLoggedIn && !showInstructions ? (
        <main className="mx-auto w-full max-w-[1200px] p-3 sm:p-4 md:p-6">
          {isCheckingCompletion ? (
            <section className="rounded-xl bg-card/78 p-6 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground">
                Checking your assessment status...
              </p>
            </section>
          ) : null}

          {!isCheckingCompletion && hasCompletedAssessment ? (
            <section className="rounded-xl border border-default bg-card/78 p-6 shadow-xs backdrop-blur-sm">
              <h2 className="text-xl font-semibold">You already finished the assessment.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You completed all questions before time ran out. This account cannot take the
                survey again.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => void handleSignOut()}>
                Log out
              </Button>
            </section>
          ) : null}

          {!isCheckingCompletion && hasTimedOutAssessment ? (
            <section className="rounded-xl border border-default bg-card/78 p-6 shadow-xs backdrop-blur-sm">
              <h2 className="text-xl font-semibold">Your assessment time has ended.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The timer ran out before you finished all questions. Your partial responses were
                saved, but you cannot continue this attempt.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => void handleSignOut()}>
                Log out
              </Button>
            </section>
          ) : null}

          {!isCheckingCompletion &&
            !hasCompletedAssessment &&
            !hasTimedOutAssessment &&
            isFinalMessageVisible ? (
            <section className="animate-in fade-in zoom-in-95 duration-500 rounded-xl border border-default bg-card/78 p-8 shadow-xs backdrop-blur-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {submitPhase === 'timed_out' ? 'Time is up' : 'Thank you'}
              </p>
              <h2 className="text-2xl font-semibold">
                {submitPhase === 'timed_out'
                  ? 'Time is up. Thank you for participating.'
                  : 'Thank you for participating in the survey.'}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {submitPhase === 'timed_out'
                  ? 'Your progress has been saved to the best of what you completed before the timer ended.'
                  : 'Your responses have been saved successfully.'}
              </p>
              <Button className="mt-6" variant="default" onClick={() => void handleSignOut()}>
                Sign out
              </Button>
            </section>
          ) : null}

          {!isCheckingCompletion &&
            !hasCompletedAssessment &&
            !hasTimedOutAssessment &&
            !isFinalMessageVisible ? (
            <>
              <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white/62 p-3 backdrop-blur-sm sm:p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold sm:text-2xl">Hi, {userData.name}</h1>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Badge className="w-fit max-w-full truncate" variant="secondary">
                      Designation: {userData.Designation}
                    </Badge>
                    <Badge className="w-fit max-w-full truncate" variant="outline">
                      Department: {userData.Department}
                    </Badge>
                  </div>
                </div>
                <div className="shrink-0 rounded-xl border border-border/80 bg-white/80 px-4 py-2 text-center shadow-xs sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Time Left
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{countdownLabel}</p>
                </div>
              </div>

              <section className="w-full rounded-xl bg-card/78 p-3 backdrop-blur-sm sm:p-4">
                <div className="mb-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Self Assessment
                  </p>
                  <h1 className="m-0 text-base font-semibold">40 Questions</h1>
                  <div className="mt-2">
                    <Progress value={completionPercent} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {answeredCount}/{questions.length} complete ({completionPercent}%)
                    </p>
                  </div>
                </div>

                {submitPhase === 'error' ? (
                  <div className="w-full rounded-md border border-destructive/50 bg-card/82 p-6 backdrop-blur-sm">
                    <p className="font-medium text-destructive">
                      We could not save your responses.
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Check your connection and try again.
                    </p>
                    <Button
                      className="mt-4"
                      onClick={() => {
                        setSubmitPhase('submitting')
                        void (async () => {
                          const resultData = buildResultPayload({
                            isCompleted,
                            timedOut: false,
                          })
                          if (!resultData) {
                            setSubmitPhase('error')
                            autoSubmitStartedRef.current = false
                            return
                          }
                          const ok = await saveResultsToDatabase(resultData)
                          if (ok) {
                            setSubmitPhase(getCompletionSubmitPhase(isCompleted))
                            autoSubmitStartedRef.current = true
                          } else {
                            setSubmitPhase('error')
                          }
                        })()
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                ) : submitPhase === 'submitting' ? (
                  <div className="w-full rounded-md border border-default bg-card/82 p-8 text-center backdrop-blur-sm">
                    <p className="text-base font-medium">
                      {isTimeUp && !isCompleted
                        ? 'Time is up. Saving your responses…'
                        : 'Saving your responses…'}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Please wait a moment.
                    </p>
                  </div>
                ) : (
                  <div className="w-full rounded-md border border-default bg-card/82 p-3 shadow-xs backdrop-blur-sm sm:p-4">

                    <div className="mt-1 space-y-6 sm:mt-3 sm:space-y-5">
                      {visibleQuestions.map((question) => {
                        const currentAnswer = answersArray[question.id - 1]
                        return (
                          <div key={question.id} className="space-y-3">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                              <div className="min-w-0 flex-1 lg:max-w-[min(100%,32rem)] xl:max-w-[500px]">
                                <p className="text-sm font-semibold text-muted-foreground sm:text-base">
                                  Question {question.id}
                                </p>
                                <h2 className="mt-1 text-base font-semibold leading-snug sm:text-base">
                                  {question.prompt}
                                </h2>
                              </div>
                              <div
                                className="grid w-full shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:justify-end lg:gap-3"
                                role="group"
                                aria-label={`Answer choices for question ${question.id}`}
                              >
                                {answerOptions.map((option) => {
                                  const active = currentAnswer === option.value
                                  return (
                                    <button
                                      key={`${question.id}-${option.value}`}
                                      type="button"
                                      onClick={() => setAnswerForQuestion(question.id, option.value)}
                                      disabled={isTimeUp}
                                      className={cn(
                                        'min-h-11 w-full rounded-lg border-2 px-3 py-2.5 text-left text-sm font-medium leading-tight transition-all duration-200 ease-out sm:min-h-12 lg:h-20 lg:w-20 lg:px-1 lg:py-0 lg:text-center',
                                        active
                                          ? 'border-primary bg-primary text-primary-foreground'
                                          : 'border-border bg-card text-card-foreground active:bg-primary/10 lg:hover:border-primary lg:hover:bg-primary/5',
                                      )}
                                    >
                                      {option.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            <Separator />
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        className="w-full sm:w-auto"
                        variant="outline"
                        onClick={() => void handleSaveAndSignOut()}
                        disabled={isTimeUp}
                      >
                        Save and Sign Out
                      </Button>
                      <Button className="w-full sm:w-auto" onClick={nextQuestion} disabled={!canGoNext}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </main>
      ) : null}
    </div>
  )
}
