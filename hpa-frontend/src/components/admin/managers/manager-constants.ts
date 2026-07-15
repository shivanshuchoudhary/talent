import type {
  ManagerColumnMap,
  ManagerLevel,
  ManagerRating,
  ManagerStatus,
} from '#/lib/admin-api'

export const STATUS_OPTIONS: Array<{ value: ManagerStatus; label: string }> = [
  { value: 'completed', label: 'Completed' },
  { value: 'not_completed', label: 'not Completed' },
  { value: 'in_progress', label: 'in progress' },
]

export const RATING_OPTIONS: ManagerRating[] = ['A', 'B', 'C', '-']
export const LEVEL_OPTIONS: ManagerLevel[] = ['n-2', 'n-3']

export const IMPORT_FIELDS: Array<{
  key: keyof ManagerColumnMap
  label: string
  required?: boolean
}> = [
  { key: 'employeeCode', label: 'Emp id' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'averageRating', label: 'Average rating' },
  { key: 'rating', label: 'Rating (grade)' },
  { key: 'entity', label: 'Entity' },
  { key: 'function', label: 'Function' },
]

export function statusLabel(status: ManagerStatus) {
  const match = STATUS_OPTIONS.find((option) => option.value === status)
  return match?.label ?? status
}

export function statusVariant(
  status: ManagerStatus,
): 'default' | 'secondary' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'in_progress') return 'secondary'
  return 'outline'
}

export type ManagerCreateForm = {
  employeeCode: string
  name: string
  entity: string
  function: string
  status: ManagerStatus
  averageRating: string
  rating: ManagerRating
  level: ManagerLevel
}

export const EMPTY_CREATE_FORM: ManagerCreateForm = {
  employeeCode: '',
  name: '',
  entity: '',
  function: '',
  status: 'not_completed',
  averageRating: '0',
  rating: 'A',
  level: 'n-2',
}
