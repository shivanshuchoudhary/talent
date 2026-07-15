const PRODUCTION_ORIGIN = 'https://sobhaascend.sobhaapps.com'

/** All backend survey routes (see hpa-backend/src/routes/surveyRoutes.js). */
export const SURVEY_API_PATHS = {
  userSession: '/api/surveys/users/session',
  saveResponse: '/api/surveys/responses',
  listResponses: '/api/surveys/responses',
  responseStatus: '/api/surveys/responses/status',
  me: '/api/surveys/me',
  adminParticipants: '/api/surveys/admin/participants',
  adminParticipant: '/api/surveys/admin/participants',
  adminManagers: '/api/surveys/admin/managers',
  adminUsers: '/api/surveys/admin/users',
  exportResponses: '/api/surveys/responses/export',
} as const

function devApiOrigin(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim()
  if (fromEnv) {
    // Local backend is HTTP only — https://localhost:5001 always fails in the browser
    if (/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromEnv)) {
      return fromEnv.replace(/^https:/i, 'http:').replace(/\/$/, '')
    }
    return fromEnv.replace(/\/$/, '')
  }
  // Empty in dev: requests go to same origin; Vite proxies /api → localhost:5001
  return ''
}

function productionUrl(path: string): string {
  return `${PRODUCTION_ORIGIN}${path}`
}

function resolveUrl(path: string): string {
  if (import.meta.env.DEV) {
    return `${devApiOrigin()}${path}`
  }
  return productionUrl(path)
}

/** POST — prepare / resume user session */
export const API_SURVEY_SESSION_URL = resolveUrl(SURVEY_API_PATHS.userSession)

/** POST — save or update survey answers */
export const API_SURVEY_RESPONSES_URL = resolveUrl(SURVEY_API_PATHS.saveResponse)

/** GET — list all responses (admin) */
export const API_SURVEY_RESPONSES_LIST_URL = resolveUrl(SURVEY_API_PATHS.listResponses)

/** GET — current user access (admin flag) */
export const API_SURVEY_ME_URL = resolveUrl(SURVEY_API_PATHS.me)

/** GET — admin participant summary */
export const API_SURVEY_ADMIN_PARTICIPANTS_URL = resolveUrl(
  SURVEY_API_PATHS.adminParticipants,
)

/** DELETE — admin: remove participant and survey data */
export function apiSurveyAdminParticipantUrl(userId: string): string {
  return resolveUrl(
    `${SURVEY_API_PATHS.adminParticipant}/${encodeURIComponent(userId)}`,
  )
}

/** POST — admin: clear survey so participant can retake */
export function apiSurveyAdminParticipantResetSurveyUrl(userId: string): string {
  return resolveUrl(
    `${SURVEY_API_PATHS.adminParticipant}/${encodeURIComponent(userId)}/reset-survey`,
  )
}

/** GET — admin Excel export */
export const API_SURVEY_EXPORT_URL = resolveUrl(SURVEY_API_PATHS.exportResponses)

/** GET/POST — admin managers list / create */
export const API_SURVEY_ADMIN_MANAGERS_URL = resolveUrl(
  SURVEY_API_PATHS.adminManagers,
)

/** POST — admin managers CSV import */
export const API_SURVEY_ADMIN_MANAGERS_IMPORT_URL = resolveUrl(
  `${SURVEY_API_PATHS.adminManagers}/import`,
)

export function apiSurveyAdminManagerUrl(id: string): string {
  return resolveUrl(
    `${SURVEY_API_PATHS.adminManagers}/${encodeURIComponent(id)}`,
  )
}

/** GET/POST — super admin: list / grant admin */
export const API_SURVEY_ADMIN_USERS_URL = resolveUrl(SURVEY_API_PATHS.adminUsers)

export function apiSurveyAdminUserUrl(email: string): string {
  return resolveUrl(
    `${SURVEY_API_PATHS.adminUsers}/${encodeURIComponent(email)}`,
  )
}

/** GET — check completion by email (?email=) */
export function apiSurveyResponsesStatusUrl(email: string): string {
  const query = `?email=${encodeURIComponent(email)}`
  return resolveUrl(`${SURVEY_API_PATHS.responseStatus}${query}`)
}

/** GET — backend health */
export const API_HEALTH_URL = resolveUrl('/health')

export function getApiBaseUrl(): string {
  return import.meta.env.DEV ? devApiOrigin() : PRODUCTION_ORIGIN
}
