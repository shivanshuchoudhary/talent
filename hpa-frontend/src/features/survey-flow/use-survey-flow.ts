import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { questions } from '#/lib/assessment'
import { getApiBaseUrl } from '#/lib/api'
import {
  applyMicrosoftAccountToProfile,
  formatMsalError,
  handleMicrosoftRedirect,
  isMsalConfigured,
  loginWithMicrosoft,
  logoutMicrosoft,
} from '#/lib/msal-auth'
import { postSurveySession, saveSurveyResults } from '#/lib/survey-api'
import {
  resolveRemainingSecondsFromBackend,
  toAnswersArrayFromEntries,
} from '#/lib/survey-answers'
import {
  ASSESSMENT_DURATION_SECONDS,
  formatCountdown,
  getCompletionSubmitPhase,
} from '#/lib/survey-constants'
import {
  isUserProfileComplete,
  normalizeUserData,
  userDataFromBackend,
  validateUserData,
  type ProfileErrors,
} from '#/lib/survey-profile'
import { buildSurveyResultPayload } from '#/lib/survey-scoring'
import type { SubmitPhase } from '#/lib/survey-types'
import {
  createEmptyUserData,
  useAssessmentStore,
  type UserData,
} from '#/store/assessment-store'

const API_BASE_URL = getApiBaseUrl()

export function useSurveyFlowState() {
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

  const buildResultPayload = (
    status: { isCompleted: boolean; timedOut: boolean },
    savedRemainingSeconds?: number,
  ) =>
    buildSurveyResultPayload(
      activeUserId,
      answersArray,
      answeredCount,
      status,
      savedRemainingSeconds,
    )

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
      setRemainingSeconds(
        resolveRemainingSecondsFromBackend(
          backendResponse?.remainingSeconds,
          restoredAnswers,
        ),
      )
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
    redirect: NonNullable<Awaited<ReturnType<typeof handleMicrosoftRedirect>>>,
  ) => {
    const { name, email } = applyMicrosoftAccountToProfile(redirect.account)
    setIsRestoringSession(true)
    setAuthError(null)

    try {
      const body = await postSurveySession({ email, name }, redirect.idToken)
      const backendUser = body?.data?.user
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

      applySessionFromBackend(restoredUser, backendUser, body?.data?.response)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Survey][Frontend] Failed to restore session after Microsoft login:', {
        message: errorMessage,
        raw: error,
      })
      setAuthError(
        errorMessage.includes('Authentication is not configured')
          ? 'The survey server is missing Microsoft sign-in configuration. Contact your administrator.'
          : `We could not restore your session. ${errorMessage}`,
      )
      setShowProfileForm(false)
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
      const body = await postSurveySession(normalizedUser)
      const backendUser = body?.data?.user
      const backendResponse = body?.data?.response
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

  const handleSaveAndSignOut = async () => {
    const resultData = buildResultPayload(
      { isCompleted: false, timedOut: false },
      remainingSeconds,
    )
    if (!resultData) {
      await handleSignOut()
      return
    }

    setSubmitPhase('submitting')
    autoSubmitStartedRef.current = true
    setIsTimerActive(false)
    const ok = await saveSurveyResults(resultData)
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

  const handleRetrySave = async () => {
    setSubmitPhase('submitting')
    const resultData = buildResultPayload({
      isCompleted,
      timedOut: false,
    })
    if (!resultData) {
      setSubmitPhase('error')
      autoSubmitStartedRef.current = false
      return
    }
    const ok = await saveSurveyResults(resultData)
    if (ok) {
      setSubmitPhase(getCompletionSubmitPhase(isCompleted))
      autoSubmitStartedRef.current = true
    } else {
      setSubmitPhase('error')
    }
  }

  const handleProfileBack = () => {
    resetProfileForm()
    setShowProfileForm(false)
  }

  useEffect(() => {
    if (isLoggedIn) {
      setIsHandlingMsalRedirect(false)
      return
    }

    void (async () => {
      try {
        const redirect = await handleMicrosoftRedirect()
        if (redirect) {
          await tryRestoreSessionAfterMicrosoftLogin(redirect)
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
      const submitStatus = {
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
      const ok = await saveSurveyResults(resultData)
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
    showInstructions,
  ])

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

  return {
    isLoggedIn,
    showProfileForm,
    showInstructions,
    profileForm,
    profileErrors,
    otherEntity,
    authError,
    isAuthRedirecting,
    isHandlingMsalRedirect,
    isRestoringSession,
    isCheckingCompletion,
    hasCompletedAssessment,
    hasTimedOutAssessment,
    userData,
    answeredCount,
    completionPercent,
    isCompleted,
    visibleQuestions,
    answersArray,
    isTimeUp,
    countdownLabel,
    isFinalMessageVisible,
    submitPhase,
    canGoNext,
    setAnswerForQuestion,
    nextQuestion,
    updateProfileField,
    handleOtherEntityChange,
    handleLogin,
    handleProfileSubmit,
    handleProfileBack,
    handleStartOrContinueSurvey,
    handleSignOut,
    handleSaveAndSignOut,
    handleRetrySave,
  }
}

export type SurveyFlow = ReturnType<typeof useSurveyFlowState>
