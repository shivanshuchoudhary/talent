import { useCallback, useEffect, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import {
  downloadSurveyExport,
  fetchAdminAccess,
  fetchAdminParticipants,
} from '#/lib/admin-api'
import type { AdminAccess, AdminParticipant } from '#/lib/admin-api'
import {
  formatMsalError,
  getActiveMicrosoftAccount,
  handleMicrosoftRedirect,
  isMsalConfigured,
  loginWithMicrosoft,
  logoutMicrosoft,
} from '#/lib/msal-auth'
import { isAuthSessionError, SESSION_EXPIRED_MESSAGE } from '#/lib/auth-session'

export function useAdminPage() {
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [participants, setParticipants] = useState<AdminParticipant[]>([])
  const [authError, setAuthError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [isHandlingMsalRedirect, setIsHandlingMsalRedirect] = useState(true)
  const [isAuthRedirecting, setIsAuthRedirecting] = useState(false)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const isSignedIn = Boolean(account) && !sessionExpired
  const isAdmin = Boolean(access?.isAdmin) && isSignedIn

  const loadDashboard = useCallback(
    async (preferredIdToken?: string | null) => {
      setIsLoadingDashboard(true)
      setLoadError(null)
      try {
        const nextAccess = await fetchAdminAccess(preferredIdToken)
        setAccess(nextAccess)
        setSessionExpired(false)
        if (!nextAccess.isAdmin) {
          setParticipants([])
          return
        }
        const rows = await fetchAdminParticipants(preferredIdToken)
        setParticipants(rows)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load admin data.'
        if (isAuthSessionError(message)) {
          setSessionExpired(true)
          setAccess(null)
          setParticipants([])
          setAuthError(SESSION_EXPIRED_MESSAGE)
          setLoadError(null)
          return
        }
        setLoadError(message)
        setParticipants([])
      } finally {
        setIsLoadingDashboard(false)
      }
    },
    [],
  )

  const reloadParticipants = useCallback(async () => {
    try {
      const rows = await fetchAdminParticipants()
      setParticipants(rows)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh participants.'
      if (isAuthSessionError(message)) {
        setSessionExpired(true)
        setAccess(null)
        setParticipants([])
        setAuthError(SESSION_EXPIRED_MESSAGE)
        setLoadError(null)
        return
      }
      setLoadError(message)
    }
  }, [])

  useEffect(() => {
    if (!isMsalConfigured()) {
      setAuthError(
        'Microsoft SSO is not configured. Set VITE_MSAL_CLIENT_ID and VITE_MSAL_TENANT_ID.',
      )
      setIsHandlingMsalRedirect(false)
      return
    }

    void (async () => {
      try {
        const redirect = await handleMicrosoftRedirect()
        if (redirect?.account) {
          setAccount(redirect.account)
          await loadDashboard(redirect.idToken)
          return
        }

        const activeAccount = await getActiveMicrosoftAccount()
        if (activeAccount) {
          setAccount(activeAccount)
          await loadDashboard()
        }
      } catch (error) {
        setAuthError(formatMsalError(error))
      } finally {
        setIsHandlingMsalRedirect(false)
      }
    })()
  }, [loadDashboard])

  const handleLogin = async () => {
    setAuthError(null)
    setSessionExpired(false)
    setIsAuthRedirecting(true)
    try {
      await loginWithMicrosoft()
    } catch (error) {
      setAuthError(formatMsalError(error))
      setIsAuthRedirecting(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await logoutMicrosoft(account)
    } catch (error) {
      console.error('[Admin] Microsoft logout failed:', error)
    } finally {
      setAccount(null)
      setAccess(null)
      setParticipants([])
      setLoadError(null)
      setSessionExpired(false)
      setAuthError(null)
    }
  }

  const handleDownload = async () => {
    setLoadError(null)
    setIsDownloading(true)
    try {
      await downloadSurveyExport()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to download export.'
      setLoadError(message)
    } finally {
      setIsDownloading(false)
    }
  }

  return {
    account,
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
    sessionExpired,
    isMsalConfigured: isMsalConfigured(),
    handleLogin,
    handleSignOut,
    handleDownload,
    reloadParticipants,
  }
}
