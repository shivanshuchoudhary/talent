import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Button } from '#/components/ui/button'
import { AuthHeroPanel } from '#/components/AuthHeroPanel'
import { AdminInsightsSidebar } from '#/components/admin/AdminInsightsPanel'
import { AdminParticipantsSection } from '#/components/admin/AdminParticipantsSection'
import { AdminSegmentBreakdown } from '#/components/admin/AdminSegmentBreakdown'
import { AdminUserManagement } from '#/components/admin/AdminUserManagement'
import { AdminStatsOverview } from '#/components/admin/AdminStatsOverview'
import { useAdminPage } from '#/features/admin/use-admin-page'
import { computeAdminDashboardStats } from '#/lib/admin-analytics'

export function AdminDashboard() {
  const {
    access,
    participants,
    authError,
    loadError,
    isHandlingMsalRedirect,
    isAuthRedirecting,
    isLoadingDashboard,
    isSignedIn,
    isAdmin,
    isMsalConfigured,
    handleLogin,
    reloadParticipants,
  } = useAdminPage()

  const stats = useMemo(
    () => computeAdminDashboardStats(participants),
    [participants],
  )

  const showLogin =
    !isSignedIn && !isHandlingMsalRedirect && !isAuthRedirecting && !isLoadingDashboard

  const showDashboard =
    isSignedIn && isAdmin && !isHandlingMsalRedirect && !isLoadingDashboard

  if (showDashboard) {
    return (
      <div className="min-h-[calc(100vh-72px)] bg-[oklch(0.98_0.005_106)]">
        <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          {loadError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
            <Button variant="outline" asChild>
              <Link to="/admin/managers">Managers dashboard</Link>
            </Button>
          </div>

          <AdminStatsOverview stats={stats} participants={participants} />
          <div className="grid gap-5 lg:grid-cols-2">
            <AdminSegmentBreakdown participants={participants} />
            <AdminInsightsSidebar stats={stats} />
          </div>
          {access?.isSuperAdmin ? <AdminUserManagement /> : null}
          <AdminParticipantsSection
            participants={participants}
            onParticipantDeleted={reloadParticipants}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      <AuthHeroPanel title="Admin dashboard — assessment insights" titleAs="h2" />

      <section className="flex flex-col bg-white px-5 py-8 sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-10 xl:px-12">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with Microsoft to view assessment analytics and exports.
            </p>
          </div>

          {authError ? (
            <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {authError}
            </p>
          ) : null}

          {loadError ? (
            <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {isHandlingMsalRedirect || isAuthRedirecting || isLoadingDashboard ? (
            <p className="mt-8 text-sm text-muted-foreground">
              {isHandlingMsalRedirect
                ? 'Completing sign in…'
                : isAuthRedirecting
                  ? 'Redirecting to Microsoft…'
                  : 'Loading dashboard…'}
            </p>
          ) : null}

          {showLogin ? (
            <div className="mt-8 flex flex-1 flex-col justify-center">
              {!isMsalConfigured ? (
                <p className="text-sm text-muted-foreground">
                  Microsoft SSO is not configured for this environment.
                </p>
              ) : (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => void handleLogin()}
                >
                  <img
                    src="/microsoft.png"
                    alt=""
                    className="mr-3 h-5 w-5 object-contain"
                    aria-hidden
                  />
                  Sign in with Microsoft
                </Button>
              )}
            </div>
          ) : null}

          {isSignedIn && !isAdmin && !isHandlingMsalRedirect && !isLoadingDashboard ? (
            <p className="mt-8 rounded-lg border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              You are signed in but do not have admin access. Contact your administrator to
              be added to the admin list.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
