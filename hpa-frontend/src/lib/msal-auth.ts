import type {
  AccountInfo,
  PublicClientApplication,
  RedirectRequest,
} from '@azure/msal-browser'
import type { UserData } from '#/store/assessment-store'

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID?.trim() ?? ''
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID?.trim() ?? ''
const redirectUri =
  import.meta.env.VITE_MSAL_REDIRECT_URI?.trim() ||
  (typeof window !== 'undefined' ? window.location.origin : '')

const authority = tenantId
  ? `https://login.microsoftonline.com/${tenantId}`
  : 'https://login.microsoftonline.com/common'

const loginRequest: RedirectRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}

let msalInstancePromise: Promise<PublicClientApplication | null> | null = null

async function getMsalInstance() {
  if (typeof window === 'undefined') {
    return null
  }

  if (!msalInstancePromise) {
    msalInstancePromise = import('@azure/msal-browser').then(
      async ({ PublicClientApplication }) => {
        const instance = new PublicClientApplication({
          auth: {
            clientId,
            authority,
            redirectUri,
            navigateToLoginRequestUrl: true,
          },
          cache: {
            cacheLocation: 'sessionStorage',
            storeAuthStateInCookie: true,
          },
        })
        await instance.initialize()
        return instance
      },
    )
  }

  return msalInstancePromise
}

function ensureMsalConfigured() {
  if (!isMsalConfigured()) {
    throw new Error(
      'Microsoft SSO is not configured. Set VITE_MSAL_CLIENT_ID and VITE_MSAL_TENANT_ID, then rebuild the frontend.',
    )
  }
}

export function isMsalConfigured() {
  return clientId.length > 0 && tenantId.length > 0
}

/** Maps common Azure AD errors to actionable setup hints. */
export function formatMsalError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error'

  if (
    message.includes('AADSTS9002326') ||
    message.includes('Single-Page Application')
  ) {
    return (
      'Azure app registration must use platform type "Single-page application" (SPA), not "Web". ' +
      'In Azure Portal → App registrations → your app → Authentication: add redirect URI ' +
      `${redirectUri || 'https://sobhaascend.sobhaapps.com'} under SPA (and remove it from Web if listed there).`
    )
  }

  return message
}

export type MicrosoftRedirectResult = {
  account: AccountInfo
  /** Present right after login redirect; use for the first API call if silent refresh is not ready yet. */
  idToken?: string
}

/** Call on app load — completes login after Microsoft redirect. */
export async function handleMicrosoftRedirect(): Promise<MicrosoftRedirectResult | null> {
  if (!isMsalConfigured()) {
    return null
  }

  const msalInstance = await getMsalInstance()
  if (!msalInstance) {
    return null
  }

  const result = await msalInstance.handleRedirectPromise()
  if (result?.account) {
    msalInstance.setActiveAccount(result.account)
    return {
      account: result.account,
      idToken: result.idToken || undefined,
    }
  }

  return null
}

export async function loginWithMicrosoft() {
  ensureMsalConfigured()
  const msalInstance = await getMsalInstance()
  if (!msalInstance) {
    throw new Error('Microsoft SSO is only available in the browser.')
  }

  await msalInstance.loginRedirect(loginRequest)
}

export async function logoutMicrosoft(account?: AccountInfo | null) {
  if (!isMsalConfigured() || typeof window === 'undefined') {
    return
  }

  const msalInstance = await getMsalInstance()
  if (!msalInstance) {
    return
  }

  await msalInstance.logoutRedirect({
    account: account ?? msalInstance.getActiveAccount() ?? undefined,
    postLogoutRedirectUri: redirectUri || window.location.origin,
  })
}

export async function getActiveMicrosoftAccount() {
  if (!isMsalConfigured()) {
    return null
  }

  const msalInstance = await getMsalInstance()
  if (!msalInstance) {
    return null
  }

  const activeAccount = msalInstance.getActiveAccount()
  if (activeAccount) {
    return activeAccount
  }

  const fallbackAccount = msalInstance.getAllAccounts().at(0)
  if (!fallbackAccount) {
    return null
  }

  msalInstance.setActiveAccount(fallbackAccount)
  return fallbackAccount
}

export async function getMicrosoftAuthToken(
  fallbackIdToken?: string | null,
): Promise<string | null> {
  if (!isMsalConfigured() || typeof window === 'undefined') {
    return fallbackIdToken?.trim() || null
  }

  const msalInstance = await getMsalInstance()
  if (!msalInstance) {
    return fallbackIdToken?.trim() || null
  }

  const account =
    msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts().at(0) ?? null
  if (!account) {
    return fallbackIdToken?.trim() || null
  }

  msalInstance.setActiveAccount(account)

  try {
    const result = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    })
    if (result.idToken?.trim()) {
      return result.idToken.trim()
    }
  } catch (error) {
    console.error('[Auth] Failed to acquire Microsoft token for API:', error)
  }

  return fallbackIdToken?.trim() || null
}

export function toUserData(account: AccountInfo): UserData {
  const fullName = account.name ?? ''
  const [first, ...rest] = fullName.split(' ')
  return {
    employeeCode: '',
    name: fullName || account.username,
    email: account.username.trim().toLowerCase(),
    Department: '',
    Designation: rest.length > 0 ? rest.join(' ') : first || 'Employee',
    entity: '',
  }
}

export function applyMicrosoftAccountToProfile(
  account: AccountInfo,
): Pick<UserData, 'name' | 'email'> {
  const user = toUserData(account)
  return {
    name: user.name,
    email: user.email,
  }
}
