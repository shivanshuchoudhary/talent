/** Detect expired Microsoft / JWT session errors from API or MSAL messages. */
export function isAuthSessionError(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('"exp"') ||
    lower.includes('exp" claim') ||
    lower.includes('exp claim') ||
    lower.includes('timestamp check failed') ||
    lower.includes('jwt expired') ||
    lower.includes('token is expired') ||
    lower.includes('token expired') ||
    lower.includes('session has expired') ||
    lower.includes('authentication required') ||
    lower.includes('not authenticated') ||
    /\b401\b/.test(lower) ||
    lower.includes('unauthorized')
  )
}

export const SESSION_EXPIRED_MESSAGE =
  'Your Microsoft session has expired. Sign in again to continue.'
