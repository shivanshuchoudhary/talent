import {
  API_SURVEY_ADMIN_MANAGERS_IMPORT_URL,
  API_SURVEY_ADMIN_MANAGERS_URL,
  API_SURVEY_ADMIN_PARTICIPANTS_URL,
  API_SURVEY_ADMIN_USERS_URL,
  API_SURVEY_EXPORT_URL,
  API_SURVEY_ME_URL,
  apiSurveyAdminManagerUrl,
  apiSurveyAdminParticipantUrl,
  apiSurveyAdminParticipantResetSurveyUrl,
  apiSurveyAdminUserUrl,
} from '#/lib/api'
import { getMicrosoftAuthToken } from '#/lib/msal-auth'

export type AdminAccess = {
  email: string | null
  name: string | null
  isAdmin: boolean
  isSuperAdmin: boolean
  role: string | null
}

export type AdminRole = 'admin' | 'super_admin'

export type AdminUserRecord = {
  email: string
  name: string
  role: AdminRole
  source: 'database'
  canRemove: boolean
  createdAt?: string | null
  updatedAt?: string | null
}

export type AdminParticipant = {
  user: {
    id: string
    employeeCode: string
    name: string
    email: string
    Department: string
    Designation: string
    entity: string
    hasCompletedQuestions: boolean
    hasTimedOut: boolean
    createdAt: string
    updatedAt: string
  }
  response: {
    id: string
    isCompleted: boolean
    timedOut: boolean
    questionsAnsweredCount: number
    letterGrade: string | null
    calculatedLetterGrade?: string | null
    effectiveLetterGrade?: string | null
    cappedDueToTimeout?: boolean
    categoryResults: {
      letterGrade: string | null
      categories: Array<{
        categoryId: number
        title: string
        totalScore: number
        averageScore: number
        weightedScore: number
        scoreLevel: string
      }>
    } | null
    submittedAt: string | null
    updatedAt: string | null
  } | null
  status: string
}

export type ManagerStatus = 'completed' | 'not_completed' | 'in_progress'
export type ManagerRating = 'A' | 'B' | 'C' | '-'
export type ManagerLevel = 'n-2' | 'n-3'

export type ManagerRecord = {
  id: string
  employeeCode: string
  name: string
  status: ManagerStatus
  averageRating: number
  rating: ManagerRating
  entity: string
  function: string
  level: ManagerLevel
  createdAt?: string
  updatedAt?: string
}

export type ManagerColumnMap = {
  employeeCode?: string
  name?: string
  status?: string
  averageRating?: string
  rating?: string
  entity?: string
  function?: string
}

export type ManagerImportResult = {
  level: ManagerLevel
  totalRows: number
  imported: number
  updated: number
  skipped: number
  errors: Array<{ line: number; message: string }>
}

export type CreateManagerPayload = {
  employeeCode: string
  name: string
  status: ManagerStatus
  averageRating: number
  rating: ManagerRating
  entity: string
  function: string
  level: ManagerLevel
}

export type UpdateManagerMetricsPayload = {
  status?: ManagerStatus
  averageRating?: number
  rating?: ManagerRating
}

async function buildAuthHeaders(preferredIdToken?: string | null): Promise<HeadersInit> {
  const headers: Record<string, string> = {}
  const token = await getMicrosoftAuthToken(preferredIdToken)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function readApiErrorMessage(
  response: Response,
  body: unknown,
  fallback: string,
): Promise<string> {
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }
  return `${fallback} Status: ${response.status}`
}

export async function fetchAdminAccess(
  preferredIdToken?: string | null,
): Promise<AdminAccess> {
  const response = await fetch(API_SURVEY_ME_URL, {
    method: 'GET',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to verify access.'))
  }
  const data = (body as { data?: AdminAccess } | null)?.data
  return {
    email: data?.email ?? null,
    name: data?.name ?? null,
    isAdmin: Boolean(data?.isAdmin),
    isSuperAdmin: Boolean(data?.isSuperAdmin),
    role: data?.role ?? null,
  }
}

export async function fetchAdminParticipants(
  preferredIdToken?: string | null,
): Promise<AdminParticipant[]> {
  const response = await fetch(API_SURVEY_ADMIN_PARTICIPANTS_URL, {
    method: 'GET',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, body, 'Failed to load participants.'),
    )
  }
  const payload = body as { data?: AdminParticipant[] } | null
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function fetchAdminUsers(
  preferredIdToken?: string | null,
): Promise<AdminUserRecord[]> {
  const response = await fetch(API_SURVEY_ADMIN_USERS_URL, {
    method: 'GET',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to load admins.'))
  }
  const payload = body as { data?: AdminUserRecord[] } | null
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function grantAdminAccess(
  email: string,
  role: AdminRole = 'admin',
  preferredIdToken?: string | null,
): Promise<AdminUserRecord> {
  const response = await fetch(API_SURVEY_ADMIN_USERS_URL, {
    method: 'POST',
    headers: {
      ...(await buildAuthHeaders(preferredIdToken)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, role }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to add admin.'))
  }
  const data = (body as { data?: AdminUserRecord } | null)?.data
  if (!data) {
    throw new Error('Server did not return admin user data.')
  }
  return data
}

export async function revokeAdminAccess(
  email: string,
  preferredIdToken?: string | null,
): Promise<void> {
  const response = await fetch(apiSurveyAdminUserUrl(email), {
    method: 'DELETE',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to remove admin.'))
  }
}

export async function deleteParticipant(
  userId: string,
  preferredIdToken?: string | null,
): Promise<void> {
  const response = await fetch(apiSurveyAdminParticipantUrl(userId), {
    method: 'DELETE',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, body, 'Failed to delete participant.'),
    )
  }
}

export async function resetParticipantSurvey(
  userId: string,
  preferredIdToken?: string | null,
): Promise<void> {
  const response = await fetch(apiSurveyAdminParticipantResetSurveyUrl(userId), {
    method: 'POST',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, body, 'Failed to reset survey.'),
    )
  }
}

export async function downloadSurveyExport(
  preferredIdToken?: string | null,
): Promise<void> {
  const response = await fetch(API_SURVEY_EXPORT_URL, {
    method: 'GET',
    headers: await buildAuthHeaders(preferredIdToken),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(await readApiErrorMessage(response, body, 'Failed to download export.'))
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filenameMatch = disposition.match(/filename="([^"]+)"/i)
  const filename =
    filenameMatch?.[1] ?? `sobha-ascend-assessment-export-${new Date().toISOString().slice(0, 10)}.xlsx`

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function fetchManagers(
  level?: ManagerLevel | 'all',
  preferredIdToken?: string | null,
): Promise<ManagerRecord[]> {
  const query =
    level && level !== 'all' ? `?level=${encodeURIComponent(level)}` : ''
  const response = await fetch(`${API_SURVEY_ADMIN_MANAGERS_URL}${query}`, {
    method: 'GET',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to load managers.'))
  }
  const payload = body as { data?: ManagerRecord[] } | null
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function createManager(
  payload: CreateManagerPayload,
  preferredIdToken?: string | null,
): Promise<ManagerRecord> {
  const response = await fetch(API_SURVEY_ADMIN_MANAGERS_URL, {
    method: 'POST',
    headers: {
      ...(await buildAuthHeaders(preferredIdToken)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to create manager.'))
  }
  const data = (body as { data?: ManagerRecord } | null)?.data
  if (!data) {
    throw new Error('Server did not return manager data.')
  }
  return data
}

export async function updateManagerMetrics(
  id: string,
  payload: UpdateManagerMetricsPayload,
  preferredIdToken?: string | null,
): Promise<ManagerRecord> {
  const response = await fetch(apiSurveyAdminManagerUrl(id), {
    method: 'PATCH',
    headers: {
      ...(await buildAuthHeaders(preferredIdToken)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to update manager.'))
  }
  const data = (body as { data?: ManagerRecord } | null)?.data
  if (!data) {
    throw new Error('Server did not return manager data.')
  }
  return data
}

export async function deleteManager(
  id: string,
  preferredIdToken?: string | null,
): Promise<void> {
  const response = await fetch(apiSurveyAdminManagerUrl(id), {
    method: 'DELETE',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to delete manager.'))
  }
}

export async function deleteAllManagers(
  preferredIdToken?: string | null,
): Promise<{ deletedCount: number }> {
  const response = await fetch(API_SURVEY_ADMIN_MANAGERS_URL, {
    method: 'DELETE',
    headers: await buildAuthHeaders(preferredIdToken),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      await readApiErrorMessage(response, body, 'Failed to delete all managers.'),
    )
  }
  const data = (body as { data?: { deletedCount?: number } } | null)?.data
  return { deletedCount: data?.deletedCount ?? 0 }
}

export async function importManagersCsv(
  payload: {
    csvText: string
    columnMap: ManagerColumnMap
    level: ManagerLevel
  },
  preferredIdToken?: string | null,
): Promise<ManagerImportResult> {
  const response = await fetch(API_SURVEY_ADMIN_MANAGERS_IMPORT_URL, {
    method: 'POST',
    headers: {
      ...(await buildAuthHeaders(preferredIdToken)),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, body, 'Failed to import managers.'))
  }
  const data = (body as { data?: ManagerImportResult } | null)?.data
  if (!data) {
    throw new Error('Server did not return import result.')
  }
  return data
}
