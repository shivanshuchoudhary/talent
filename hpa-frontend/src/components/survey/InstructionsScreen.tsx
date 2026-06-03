import { Button } from '#/components/ui/button'
import { AuthHeroPanel } from '#/components/AuthHeroPanel'
import { AdminDashboardNavLink } from '#/components/admin/AdminDashboardNavLink'
import { useUserAccess } from '#/features/access/use-user-access'
import { useSurveyFlow } from '#/features/survey-flow/survey-flow-context'

export function InstructionsScreen() {
  const { answeredCount, handleStartOrContinueSurvey } = useSurveyFlow()
  const { isAdmin, isLoading: isAccessLoading } = useUserAccess()

  return (
    <div className="min-h-[calc(100vh-72px)] bg-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      <div className="contents lg:contents">
        <AuthHeroPanel title="High Potential Assessment Questionnaire" />

        <section className="flex items-center justify-center bg-white px-5 py-10 sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-12 xl:px-16">
          <div className="w-full max-w-2xl">
            <div className=" mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                Sobha Ascend
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Instructions</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Please read the following instructions carefully before starting the
                assessment:
              </p>
            </div>

            <div className="space-y-6 text-left">
              <div className="rounded-lg border border-border bg-card/50 p-6">
                <ul className="space-y-4 text-sm leading-6">
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                    <span>
                      The assessment consists of <strong>40 questions</strong>. Ensure that
                      you attempt and complete all questions.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                    <span>
                      This is a timed assessment with a total duration of{' '}
                      <strong>7 minutes</strong>. The assessment is designed to be quick and can
                      typically be completed within 2 minutes if done in one sitting.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                    <span>
                      If needed, click &quot;Save and Sign Out&quot; Button to save your
                      progress and exit. You can resume later by signing in again.
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <Button
                className="w-full sm:w-auto"
                size="lg"
                onClick={handleStartOrContinueSurvey}
              >
                {answeredCount > 0 ? 'Continue Survey' : 'Start Survey'}
              </Button>
              {isAdmin && !isAccessLoading ? (
                <AdminDashboardNavLink variant="outline" fullWidth className="sm:w-auto" />
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
