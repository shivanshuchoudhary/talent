import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { AuthHeroPanel } from '#/components/AuthHeroPanel'
import { useAdminPage } from '#/features/admin/use-admin-page'
import type { AdminParticipant } from '#/lib/admin-api'
import { Download, LogOut } from 'lucide-react'

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'Completed') {
    return 'default'
  }
  if (status === 'Timed out') {
    return 'destructive'
  }
  if (status.includes('progress')) {
    return 'secondary'
  }
  return 'outline'
}

function formatSubmittedAt(value: string | null | undefined) {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleString()
}

function ParticipantTable({ rows }: { rows: AdminParticipant[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No participants registered yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Answered</TableHead>
            <TableHead>Submitted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.user.id}>
              <TableCell>
                <div className="font-medium">{row.user.name}</div>
                <div className="text-xs text-muted-foreground">{row.user.employeeCode}</div>
              </TableCell>
              <TableCell className="text-sm">{row.user.email}</TableCell>
              <TableCell className="text-sm">{row.user.Department}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
              </TableCell>
              <TableCell>{row.response?.letterGrade ?? '—'}</TableCell>
              <TableCell>{row.response?.questionsAnsweredCount ?? 0}</TableCell>
              <TableCell className="text-sm">
                {formatSubmittedAt(row.response?.submittedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

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

  const showLogin =
    !isSignedIn && !isHandlingMsalRedirect && !isAuthRedirecting && !isLoadingDashboard

  return (
    <div className="min-h-[calc(100vh-72px)] bg-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      <AuthHeroPanel title="Admin dashboard — assessment submissions" titleAs="h2" />

      <section className="flex flex-col bg-white px-5 py-8 sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-10 xl:px-12">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
              {access?.email ? (
                <p className="mt-1 text-sm text-muted-foreground">{access.email}</p>
              ) : null}
            </div>
            {isSignedIn ? (
              <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
                <LogOut className="mr-2 size-4" />
                Sign out
              </Button>
            ) : null}
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
                  className="w-full max-w-md"
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
              You are signed in but do not have admin access. Contact your administrator to be
              added to the admin list.
            </p>
          ) : null}

          {isSignedIn && isAdmin && !isHandlingMsalRedirect && !isLoadingDashboard ? (
            <div className="mt-6 flex flex-1 flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void handleDownload()}
                  disabled={isDownloading}
                >
                  <Download className="mr-2 size-4" />
                  {isDownloading ? 'Preparing download…' : 'Download Excel export'}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {participants.length} participant{participants.length === 1 ? '' : 's'}
                </p>
              </div>
              <ParticipantTable rows={participants} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
