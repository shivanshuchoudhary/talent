import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  answerOptions,
  categories,
  getLetterGradeFromAverage,
  questions,
  scoreLevels,
} from '#/lib/assessment'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { useAssessmentStore } from '#/store/assessment-store'
import {
  getActiveMicrosoftAccount,
  isMsalConfigured,
  loginWithMicrosoft,
  logoutMicrosoft,
  toUserData,
} from '#/lib/msal-auth'
import { Progress } from '#/components/ui/progress'
import { cn } from '#/lib/utils'
import { Separator } from '#/components/ui/separator'

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

      // find the score level from the average score
      const scoreLevel =
        scoreLevels.find(
          (level) => averageScore >= level.min && averageScore <= level.max,
        )?.descriptor ?? ''

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

interface ResultData {
  userData: {
    name: string
    email: string
    Department: string
    Designation: string
  }
  categoryResults: CategoryResult
  questionsAnswered: number[]
}

const DEFAULT_API_BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : 'http://localhost:5000'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

function App() {
  const {
    currentQuestionId,
    answersArray,
    setAnswerForQuestion,
    nextQuestion,
    resetAssessment,
    isLoggedIn,
    userData,
    signIn,
    signOut,
  } = useAssessmentStore()
  const [remainingMinutes, setRemainingMinutes] = useState(7)
  const [timerRunId, setTimerRunId] = useState(0)
  const [isCheckingCompletion, setIsCheckingCompletion] = useState(false)
  const [hasCompletedAssessment, setHasCompletedAssessment] = useState(false)
  /** This session only — after a successful POST from completing all questions */
  const [submitPhase, setSubmitPhase] = useState<
    'idle' | 'submitting' | 'thanks' | 'error'
  >('idle')
  const autoSubmitStartedRef = useRef(false)
  const answeredCount = answersArray.reduce(
    (count, answer) => (answer === undefined ? count : count + 1),
    0,
  )
  const completionPercent = Math.round((answeredCount / questions.length) * 100)
  const isCompleted = answeredCount === questions.length
  const currentPageStart = Math.floor((currentQuestionId - 1) / 5) * 5
  const visibleQuestions = questions.slice(currentPageStart, currentPageStart + 5)
  const isTimeUp = remainingMinutes <= 0
  const buildResultPayload = (): ResultData => {
    const answersMap = answersArray.reduce<Record<number, number>>(
      (acc, value, index) => {
        if (value !== undefined) {
          acc[index + 1] = value
        }
        return acc
      },
      {},
    )
    const results = calculateCategoryResults(answersMap)
    return {
      userData: userData,
      categoryResults: results,
      questionsAnswered: answersArray.flatMap((answer) =>
        answer === undefined ? [] : [answer],
      ),
    }
  }

  const saveResultsToDatabase = async (resultData: ResultData) => {
    const endpoint = `${API_BASE_URL}/api/surveys/responses`
    console.log('[Survey][Frontend] Sending POST request:', {
      endpoint,
      method: 'POST',
    })

    try {
      const response = await fetch(endpoint, {
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

  const handleLogin = async () => {
    try {
      if (!isMsalConfigured()) {
        console.error(
          '[Auth] Missing Microsoft SSO config. Set VITE_MSAL_CLIENT_ID and VITE_MSAL_TENANT_ID.',
        )
        return
      }
      const account = await loginWithMicrosoft()
      signIn(toUserData(account))
      resetAssessment()
      setRemainingMinutes(7)
      setTimerRunId((v) => v + 1)
      setSubmitPhase('idle')
      autoSubmitStartedRef.current = false
    } catch (error) {
      console.error('[Auth] Microsoft SSO login failed:', error)
    }
  }

  const handleSignOut = async () => {
    try {
      await logoutMicrosoft()
    } catch (error) {
      console.error('[Auth] Microsoft logout failed:', error)
    } finally {
      resetAssessment()
      signOut()
      setSubmitPhase('idle')
      autoSubmitStartedRef.current = false
    }
  }

  useEffect(() => {
    if (isLoggedIn || !isMsalConfigured()) {
      return
    }
    const account = getActiveMicrosoftAccount()
    if (!account) {
      return
    }
    signIn(toUserData(account))
  }, [isLoggedIn, signIn])

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
    const deadline = Date.now() + 7 * 60 * 1000
    const timerId = window.setInterval(() => {
      const diff = Math.max(deadline - Date.now(), 0)
      setRemainingMinutes(Math.ceil(diff / 60000))
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [timerRunId])

  useEffect(() => {
    if (!isLoggedIn || !userData.email) {
      setHasCompletedAssessment(false)
      setSubmitPhase('idle')
      autoSubmitStartedRef.current = false
      return
    }

    const checkCompletionStatus = async () => {
      setIsCheckingCompletion(true)
      const endpoint = `${API_BASE_URL}/api/surveys/responses/status?email=${encodeURIComponent(
        userData.email,
      )}`
      console.log('[Survey][Frontend] Checking completion status:', {
        endpoint,
        email: userData.email,
      })

      try {
        const response = await fetch(endpoint)
        const body = await response.json().catch(() => null)
        console.log('[Survey][Frontend] Completion status response:', {
          status: response.status,
          ok: response.ok,
          body,
        })

        if (!response.ok) {
          setHasCompletedAssessment(false)
          setSubmitPhase('idle')
          return
        }

        setHasCompletedAssessment(Boolean(body?.hasCompleted))
        if (!body?.hasCompleted) {
          setSubmitPhase('idle')
          autoSubmitStartedRef.current = false
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        console.error('[Survey][Frontend] Failed completion check:', {
          message: errorMessage,
          raw: error,
        })
        setHasCompletedAssessment(false)
        setSubmitPhase('idle')
        autoSubmitStartedRef.current = false
      } finally {
        setIsCheckingCompletion(false)
      }
    }

    void checkCompletionStatus()
  }, [isLoggedIn, userData.email])

  useEffect(() => {
    if (isCheckingCompletion || hasCompletedAssessment) {
      return
    }
    if (!isCompleted) {
      return
    }
    if (autoSubmitStartedRef.current) {
      return
    }
    autoSubmitStartedRef.current = true
    setSubmitPhase('submitting')

    const run = async () => {
      const resultData = buildResultPayload()
      console.log('[Survey][Frontend] Auto-submit prepared payload:', {
        apiBaseUrl: API_BASE_URL,
        userEmail: resultData.userData.email,
        answersCount: resultData.questionsAnswered.length,
        letterGrade: resultData.categoryResults.letterGrade,
      })
      const ok = await saveResultsToDatabase(resultData)
      if (ok) {
        setSubmitPhase('thanks')
      } else {
        setSubmitPhase('error')
        autoSubmitStartedRef.current = false
      }
    }

    void run()
  }, [isCheckingCompletion, hasCompletedAssessment, isCompleted])

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
    <>
      {!isLoggedIn ? (
        <div className="flex justify-start gap-2 h-[calc(100vh-72px)] overflow-hidden">
          <div className="w-fit overflow-hidden">
            <img
              src="/talentdev.jpg"
              alt="Assessment welcome visual"
              className="h-full w-full object-contain object-center"
            />
          </div>
          <div className="w-1/2 flex items-center justify-center p-10">
            <div className="max-w-md w-full space-y-8">
              <h1 className="text-3xl font-bold mb-4">Welcome to the HPAQ Self Assessment</h1>
              <p className="text-muted-foreground mb-6">
                Please sign in to start your self assessment.
              </p>
              <Button className="w-full" onClick={() => void handleLogin()}>
                Sign in to get started
              </Button>
            </div>
          </div>

        </div>
      ) : null}

      {isLoggedIn ? (
        <main className="mx-auto w-full max-w-[1200px] p-4">
          {isCheckingCompletion ? (
            <section className="rounded-xl bg-card p-6">
              <p className="text-sm text-muted-foreground">
                Checking your assessment status...
              </p>
            </section>
          ) : null}

          {!isCheckingCompletion && hasCompletedAssessment ? (
            <section className="rounded-xl border border-default bg-card p-6 shadow-xs">
              <h2 className="text-xl font-semibold">You already finished the assessment.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This account has already submitted a response.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => void handleSignOut()}>
                Log out
              </Button>
            </section>
          ) : null}

          {!isCheckingCompletion &&
          !hasCompletedAssessment &&
          submitPhase === 'thanks' ? (
            <section className="rounded-xl border border-default bg-card p-8 shadow-xs">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Thank you
              </p>
              <h2 className="text-2xl font-semibold">
                Thanks for completing the survey
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Your responses have been saved. You can sign out when you are ready.
              </p>
              <Button className="mt-6" variant="default" onClick={() => void handleSignOut()}>
                Sign out
              </Button>
            </section>
          ) : null}

          {!isCheckingCompletion &&
          !hasCompletedAssessment &&
          submitPhase !== 'thanks' ? (
            <>
          <div className="mb-4 flex items-start justify-between gap-3 p-2">
            <div>
              <h1 className="text-2xl font-semibold">Hi, {userData.name}</h1>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary">Designation: {userData.Designation}</Badge>
                <Badge variant="outline">Department: {userData.Department}</Badge>
              </div>
            </div>
            <p className="pt-1 text-lg font-semibold">Time left: {remainingMinutes} min</p>
          </div>

          <section className="rounded-xl bg-card p-4 w-full">
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

            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={isCompleted || submitPhase === 'submitting'}
                onClick={() => {
                  resetAssessment()
                  setRemainingMinutes(7)
                  setTimerRunId((v) => v + 1)
                  setSubmitPhase('idle')
                  autoSubmitStartedRef.current = false
                }}
              >
                Reset (Test)
              </Button>
            </div>

            {submitPhase === 'error' && isCompleted ? (
              <div className="w-full rounded-md border border-destructive/50 bg-card p-6">
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
                      const ok = await saveResultsToDatabase(buildResultPayload())
                      if (ok) {
                        setSubmitPhase('thanks')
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
            ) : isCompleted ? (
              <div className="w-full rounded-md border border-default bg-card p-8 text-center">
                <p className="text-base font-medium">Saving your responses…</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Please wait a moment.
                </p>
              </div>
            ) : (
              <div className="w-full border border-default rounded-md shadow-xs bg-card p-3">

                <div className="mt-3 space-y-5">
                  {visibleQuestions.map((question) => {
                    const currentAnswer = answersArray[question.id - 1]
                    return (
                        <div key={question.id}>
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col max-w-[500px]">
                              <p className="text-base font-semibold text-muted-foreground">Question {question.id}</p>
                              <h2 className="m-0 text-base font-semibold">{question.prompt}</h2>
                            </div>
                            <div className="mt-2 flex h-24 flex-wrap gap-4">
                              {answerOptions.map((option) => {
                                const active = currentAnswer === option.value
                                return (
                                  <div key={`${question.id}-${option.value}`} className="relative h-20 w-20">
                                    <button
                                      onClick={() => setAnswerForQuestion(question.id, option.value)}
                                      disabled={isTimeUp}
                                      className={cn(
                                        'absolute top-0 left-0 h-20 w-20 rounded-lg border-2 px-1 text-center text-sm font-medium transition-all duration-300 ease-out flex items-center justify-center',
                                        active
                                          ? 'border-primary bg-primary text-primary-foreground'
                                          : 'border-border bg-card text-card-foreground hover:border-primary hover:bg-primary/5',
                                      )}
                                    >
                                      {option.label}
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          <Separator />
                        </div>
                    )
                  })}
                </div>

                <div className="mt-4 flex justify-end">
                  <Button onClick={nextQuestion} disabled={!canGoNext}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {isTimeUp && !isCompleted ? (
              <p className="mt-4 text-sm font-semibold text-destructive">
                Time is up. Please answer all questions before your responses can be saved.
              </p>
            ) : null}
          </section>
            </>
          ) : null}
        </main>
      ) : null}
    </>
  )
}
