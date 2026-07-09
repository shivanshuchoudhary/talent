import { Link, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { AdminDashboardNavLink } from '#/components/admin/AdminDashboardNavLink'
import { useUserAccess } from '#/features/access/use-user-access'
import { downloadSurveyExport } from '#/lib/admin-api'
import { logoutMicrosoft } from '#/lib/msal-auth'
import { useAssessmentStore } from '#/store/assessment-store'
import { Download, LogOut } from 'lucide-react'

export default function Header() {
  const { isLoggedIn, signOut, resetAssessment } = useAssessmentStore()
  const { access, isAdmin, isLoading: isAccessLoading } = useUserAccess()
  const [isDownloading, setIsDownloading] = useState(false)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isAdminRoute = pathname.startsWith('/admin')
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

  const handleExport = async () => {
    setIsDownloading(true)
    try {
      await downloadSurveyExport()
    } catch (error) {
      console.error('[Admin] Export failed:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  const showAdminDashboardLink =
    isAdmin && !isAccessLoading && !isSurveyLoginScreen && (isLoggedIn || isAdminRoute)
  const showSignOut = isLoggedIn || (isAdminRoute && isAdmin)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background px-4">
      <nav className="mx-auto flex h-[72px] w-full max-w-[1400px] items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold no-underline">
          <img
            src="/logo-sobha.png"
            alt="Sobha Ascend Logo"
            className="h-10 w-10 object-contain"
          />
          <span>
            <span className="block text-xl font-semibold text-primary sm:text-2xl">
              {isAdminRoute ? 'Assessment analytics' : 'Sobha Ascend'}
            </span>
            {isAdminRoute && access?.email ? (
              <span className="block text-xs font-normal text-muted-foreground">
                {access.email}
              </span>
            ) : null}
          </span>
        </a>
        <div className="flex items-center gap-2">
          {isAdminRoute && isAdmin ? (
            <Button
              size="sm"
              onClick={() => void handleExport()}
              disabled={isDownloading}
            >
              <Download className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {isDownloading ? 'Preparing export...' : 'Export Excel'}
              </span>
            </Button>
          ) : null}
          {isAdminRoute && isAdmin ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/">Assessment</Link>
            </Button>
          ) : showAdminDashboardLink ? (
            <AdminDashboardNavLink variant="outline" />
          ) : null}
          {showSignOut ? (
            <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
              <LogOut className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          ) : null}
        </div>
      </nav>
    </header>
  )
}
