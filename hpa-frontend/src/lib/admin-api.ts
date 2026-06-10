import {
  API_SURVEY_ADMIN_PARTICIPANTS_URL,
  API_SURVEY_ADMIN_USERS_URL,
  API_SURVEY_EXPORT_URL,
  API_SURVEY_ME_URL,
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
