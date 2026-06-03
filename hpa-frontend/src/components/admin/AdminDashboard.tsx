import { useMemo } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { AuthHeroPanel } from '#/components/AuthHeroPanel'
import { AdminInsightsPanel } from '#/components/admin/AdminInsightsPanel'
import { AdminParticipantsSection } from '#/components/admin/AdminParticipantsSection'
import { AdminUserManagement } from '#/components/admin/AdminUserManagement'
import { AdminStatsOverview } from '#/components/admin/AdminStatsOverview'
import { useAdminPage } from '#/features/admin/use-admin-page'
import { computeAdminDashboardStats } from '#/lib/admin-analytics'
import { Download, LayoutDashboard, LogOut, Shield } from 'lucide-react'

export function AdminDashboard() {
  const {
    access,
    participants,
    authError,
    loadError,
    isHandlingMsalRedirect,
    isAuthRedirecting,
    isLoadingDashboard,
    isDownloading,
    isSignedIn,
    isAdmin,
    isMsalConfigured,
    handleLogin,
    handleSignOut,
    handleDownload,
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
        <div
          className="border-b border-border bg-card/90 backdrop-blur-sm"
          style={{
            backgroundImage:
              'linear-gradient(90deg, oklch(0.98 0.01 106) 0%, oklch(0.96 0.02 95) 100%)',
          }}
        >
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <img
                src="/logo-sobha.png"
                alt=""
                className="size-12 object-contain"
                aria-hidden
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    Assessment analytics
                  </h1>
                  <Badge variant="secondary" className="gap-1">
                    <Shield className="size-3" />
                    Admin
                  </Badge>
                  {access?.isSuperAdmin ? (
                    <Badge variant="outline">Super admin</Badge>
                  ) : null}
                </div>
                {access?.email ? (
                  <p className="mt-1 text-sm text-muted-foreground">{access.email}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void handleDownload()}
                disabled={isDownloading}
              >
                <Download className="mr-2 size-4" />
                {isDownloading ? 'Preparing export…' : 'Export Excel'}
              </Button>
              <Button variant="outline" onClick={() => void handleSignOut()}>
                <LogOut className="mr-2 size-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          {loadError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LayoutDashboard className="size-4 text-primary" />
            <span>High Potential Assessment — live overview</span>
          </div>

          <AdminStatsOverview stats={stats} />
          <AdminInsightsPanel stats={stats} />
          {access?.isSuperAdmin ? <AdminUserManagement /> : null}
          <AdminParticipantsSection participants={participants} />
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
