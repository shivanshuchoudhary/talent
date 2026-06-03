import { useCallback, useEffect, useState } from 'react'
import { fetchAdminAccess, type AdminAccess } from '#/lib/admin-api'
import { getActiveMicrosoftAccount, isMsalConfigured } from '#/lib/msal-auth'
import { useAssessmentStore } from '#/store/assessment-store'

export function useUserAccess() {
  const isLoggedIn = useAssessmentStore((s) => s.isLoggedIn)
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!isMsalConfigured()) {
      setAccess(null)
      setIsLoading(false)
      return
    }

    const account = await getActiveMicrosoftAccount()
    if (!account) {
      setAccess(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const next = await fetchAdminAccess()
      setAccess(next)
    } catch {
      setAccess(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, isLoggedIn])

  return {
    access,
    isAdmin: Boolean(access?.isAdmin),
    isSuperAdmin: Boolean(access?.isSuperAdmin),
    isLoading,
    refresh,
  }
}
