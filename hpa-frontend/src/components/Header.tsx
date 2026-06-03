import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { AdminDashboardNavLink } from '#/components/admin/AdminDashboardNavLink'
import { useUserAccess } from '#/features/access/use-user-access'
import { logoutMicrosoft } from '#/lib/msal-auth'
import { useAssessmentStore } from '#/store/assessment-store'

export default function Header() {
  const { isLoggedIn, signOut, resetAssessment } = useAssessmentStore()
  const { isAdmin, isLoading: isAccessLoading } = useUserAccess()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isAdminRoute = pathname === '/admin'
  const isSurveyLoginScreen = pathname === '/' && !isLoggedIn

  const handleSignOut = async () => {
    try {
      await logoutMicrosoft()
    } catch (error) {
      console.error('[Auth] Microsoft logout failed:', error)
    } finally {
      resetAssessment()
      signOut()
    }
  }

  const showAdminDashboardLink =
    isAdmin && !isAccessLoading && !isSurveyLoginScreen && (isLoggedIn || isAdminRoute)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background px-4">
      <nav className="mx-auto flex h-[72px] w-full max-w-[1400px] items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold no-underline">
          <img
            src="/logo-sobha.png"
            alt="Sobha Ascend Logo"
            className="h-10 w-10 object-contain"
          />
          <span className="text-2xl font-semibold text-primary">Sobha Ascend</span>
        </a>
        <div className="flex items-center gap-2">
          {isAdminRoute && isAdmin ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/">Assessment</Link>
            </Button>
          ) : showAdminDashboardLink ? (
            <AdminDashboardNavLink variant="outline" />
          ) : null}
          {isLoggedIn ? (
            <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          ) : null}
        </div>
      </nav>
    </header>
  )
}
