import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  createManager,
  deleteAllManagers,
  deleteManager,
  fetchAdminAccess,
  fetchManagers,
  importManagersCsv,
  updateManagerMetrics,
} from '#/lib/admin-api'
import type { ManagerColumnMap, ManagerLevel, ManagerRating, ManagerRecord, ManagerStatus } from '#/lib/admin-api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Loader2, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'

const STATUS_OPTIONS: Array<{ value: ManagerStatus; label: string }> = [
  { value: 'completed', label: 'Completed' },
  { value: 'not_completed', label: 'not Completed' },
  { value: 'in_progress', label: 'in progress' },
]

const RATING_OPTIONS: ManagerRating[] = ['A', 'B', 'C', '-']
const LEVEL_OPTIONS: ManagerLevel[] = ['n-2', 'n-3']

const IMPORT_FIELDS: Array<{ key: keyof ManagerColumnMap; label: string; required?: boolean }> =
  [
    { key: 'employeeCode', label: 'Emp id', required: true },
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status' },
    { key: 'averageRating', label: 'Average rating' },
    { key: 'rating', label: 'Rating (grade)' },
    { key: 'entity', label: 'Entity' },
    { key: 'function', label: 'Function' },
  ]

function statusLabel(status: ManagerStatus) {
  const match = STATUS_OPTIONS.find((option) => option.value === status)
  return match?.label ?? status
}

function statusVariant(
  status: ManagerStatus,
): 'default' | 'secondary' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'in_progress') return 'secondary'
  return 'outline'
}

function parseCsvHeaders(csvText: string): string[] {
  const { headers } = parseCsv(csvText)
  return headers
}

function parseCsv(csvText: string): { headers: string[]; rows: string[][] } {
  const normalized = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseLine = (line: string) => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      const next = line[i + 1]
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (char === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    cells.push(current.trim())
    return cells
  }

  const headers = parseLine(lines[0] ?? '')
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

function isBlankCell(raw: string) {
  const value = raw.replace(/\u00a0/g, ' ').trim()
  if (!value) return true
  const upper = value.toUpperCase()
  return (
    value === '-' ||
    value === '–' ||
    value === '—' ||
    upper === 'N/A' ||
    upper === 'NA' ||
    upper === '.'
  )
}

type ImportPreview = {
  toAdd: Array<{ line: number; employeeCode: string; name: string }>
  toUpdate: Array<{
    line: number
    employeeCode: string
    name: string
    existingName: string
  }>
  toSkip: Array<{ line: number; reason: string }>
}

function buildImportPreview(
  csvText: string,
  columnMap: ManagerColumnMap,
  existing: ManagerRecord[],
): ImportPreview {
  const { headers, rows } = parseCsv(csvText)
  const headerIndex = new Map(
    headers.map((header, index) => [header.trim().toLowerCase(), index]),
  )
  const codeIdx = headerIndex.get((columnMap.employeeCode ?? '').trim().toLowerCase())
  const nameIdx = columnMap.name
    ? headerIndex.get(columnMap.name.trim().toLowerCase())
    : undefined

  const existingByCode = new Map(
    existing.map((row) => [row.employeeCode.trim().toLowerCase(), row]),
  )

  const toAdd: ImportPreview['toAdd'] = []
  const toUpdate: ImportPreview['toUpdate'] = []
  const toSkip: ImportPreview['toSkip'] = []

  if (codeIdx === undefined) {
    return {
      toAdd,
      toUpdate,
      toSkip: [{ line: 1, reason: 'Emp id column not found in CSV headers.' }],
    }
  }

  rows.forEach((row, rowIndex) => {
    const line = rowIndex + 2
    const employeeCode = String(row[codeIdx] ?? '').trim()
    if (isBlankCell(employeeCode)) {
      toSkip.push({ line, reason: 'Missing emp id (empty or -)' })
      return
    }
    const name =
      nameIdx !== undefined
        ? String(row[nameIdx] ?? '').trim() || employeeCode
        : employeeCode
    const existingRow = existingByCode.get(employeeCode.toLowerCase())
    if (existingRow) {
      toUpdate.push({
        line,
        employeeCode,
        name,
        existingName: existingRow.name,
      })
    } else {
      toAdd.push({ line, employeeCode, name })
    }
  })

  return { toAdd, toUpdate, toSkip }
}

const emptyCreateForm = {
  employeeCode: '',
  name: '',
  entity: '',
  function: '',
  status: 'not_completed' as ManagerStatus,
  averageRating: '0',
  rating: 'A' as ManagerRating,
  level: 'n-2' as ManagerLevel,
}

export function ManagersDashboard() {
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [managers, setManagers] = useState<ManagerRecord[]>([])
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<'all' | ManagerLevel>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ManagerStatus>('all')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [isCreating, setIsCreating] = useState(false)

  const [editTarget, setEditTarget] = useState<ManagerRecord | null>(null)
  const [editStatus, setEditStatus] = useState<ManagerStatus>('not_completed')
  const [editAverage, setEditAverage] = useState('0')
  const [editRating, setEditRating] = useState<ManagerRating>('A')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [importLevel, setImportLevel] = useState<ManagerLevel>('n-2')
  const [columnMap, setColumnMap] = useState<ManagerColumnMap>({
    employeeCode: '',
  })
  const [isImporting, setIsImporting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

  const loadManagers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await fetchManagers()
      setManagers(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load managers.')
      setManagers([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      setIsCheckingAccess(true)
      try {
        const access = await fetchAdminAccess()
        setIsAdmin(access.isAdmin)
        if (access.isAdmin) {
          await loadManagers()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to verify access.')
        setIsAdmin(false)
      } finally {
        setIsCheckingAccess(false)
      }
    })()
  }, [loadManagers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return managers.filter((row) => {
      if (levelFilter !== 'all' && row.level !== levelFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.employeeCode.toLowerCase().includes(q) ||
        row.entity.toLowerCase().includes(q) ||
        row.function.toLowerCase().includes(q)
      )
    })
  }, [managers, search, levelFilter, statusFilter])

  const openEdit = (row: ManagerRecord) => {
    setEditTarget(row)
    setEditStatus(row.status)
    setEditAverage(String(row.averageRating))
    setEditRating(row.rating)
    setSuccess(null)
    setError(null)
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const averageRating = Number.parseFloat(createForm.averageRating)
    if (!Number.isFinite(averageRating) || averageRating < 0 || averageRating > 5) {
      setError('Average rating must be between 0 and 5.')
      return
    }
    setIsCreating(true)
    setError(null)
    setSuccess(null)
    try {
      await createManager({
        employeeCode: createForm.employeeCode.trim(),
        name: createForm.name.trim(),
        entity: createForm.entity.trim(),
        function: createForm.function.trim(),
        status: createForm.status,
        averageRating,
        rating: createForm.rating,
        level: createForm.level,
      })
      setAddOpen(false)
      setCreateForm(emptyCreateForm)
      setSuccess('Manager added.')
      await loadManagers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add manager.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editTarget) return
    const averageRating = Number.parseFloat(editAverage)
    if (!Number.isFinite(averageRating) || averageRating < 0 || averageRating > 5) {
      setError('Average rating must be between 0 and 5.')
      return
    }
    setIsSavingEdit(true)
    setError(null)
    setSuccess(null)
    try {
      await updateManagerMetrics(editTarget.id, {
        status: editStatus,
        averageRating,
        rating: editRating,
      })
      setEditTarget(null)
      setSuccess('Manager updated.')
      await loadManagers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update manager.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async (row: ManagerRecord) => {
    const confirmed = window.confirm(
      `Delete ${row.name} (${row.employeeCode})? This cannot be undone.`,
    )
    if (!confirmed) return
    setDeletingId(row.id)
    setError(null)
    setSuccess(null)
    try {
      await deleteManager(row.id)
      setSuccess('Manager deleted.')
      await loadManagers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete manager.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'Delete ALL managers?\n\nYou can re-import from CSV afterward. This cannot be undone.',
    )
    if (!confirmed) return
    setIsClearing(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await deleteAllManagers()
      setSuccess(`Cleared ${result.deletedCount} manager(s). Re-import your CSV with Function mapped.`)
      await loadManagers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear managers.')
    } finally {
      setIsClearing(false)
    }
  }

  const handleCsvFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    const headers = parseCsvHeaders(text)
    setCsvText(text)
    setCsvHeaders(headers)
    setImportPreview(null)
    setColumnMap({
      employeeCode: headers[0] ?? '',
      name: '',
      status: '',
      averageRating: '',
      rating: '',
      entity: '',
      function: '',
    })
  }

  const cleanedColumnMap = (): ManagerColumnMap | null => {
    if (!columnMap.employeeCode) return null
    const cleanedMap: ManagerColumnMap = { employeeCode: columnMap.employeeCode }
    for (const field of IMPORT_FIELDS) {
      if (field.key === 'employeeCode') continue
      const value = columnMap[field.key]
      if (value) cleanedMap[field.key] = value
    }
    return cleanedMap
  }

  const handlePreviewImport = (event: FormEvent) => {
    event.preventDefault()
    if (!csvText.trim()) {
      setError('Choose a CSV file first.')
      return
    }
    const cleanedMap = cleanedColumnMap()
    if (!cleanedMap) {
      setError('Map the Emp id column before importing.')
      return
    }
    setError(null)
    setImportPreview(buildImportPreview(csvText, cleanedMap, managers))
  }

  const handleConfirmImport = async () => {
    const cleanedMap = cleanedColumnMap()
    if (!cleanedMap || !csvText.trim()) return

    setIsImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await importManagersCsv({
        csvText,
        columnMap: cleanedMap,
        level: importLevel,
      })
      setImportOpen(false)
      setImportPreview(null)
      setCsvText('')
      setCsvHeaders([])
      setSuccess(
        `Import done for ${result.level}: ${result.imported} added, ${result.updated} updated, ${result.skipped} skipped.` +
          (result.errors?.length
            ? ` First issues: ${result.errors
                .slice(0, 3)
                .map((e) => `line ${e.line} — ${e.message}`)
                .join('; ')}`
            : ''),
      )
      await loadManagers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import CSV.')
    } finally {
      setIsImporting(false)
    }
  }

  if (isCheckingAccess) {
    return (
      <div className="flex min-h-[calc(100vh-72px)] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking access…
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Managers dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin access is required to view manager data.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/admin">Back to admin</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[oklch(0.98_0.005_106)]">
      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Managers dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              n-2 / n-3 roster imported from CSV. Separate from employee survey responses.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin">Admin overview</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isClearing || managers.length === 0}
              onClick={() => void handleClearAll()}
            >
              {isClearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear all
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreateForm(emptyCreateForm)
                setAddOpen(true)
              }}
            >
              <Plus className="size-4" />
              Add manager
            </Button>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name, emp id, entity, function…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={levelFilter}
            onChange={(event) =>
              setLevelFilter(event.target.value as 'all' | ManagerLevel)
            }
          >
            <option value="all">All levels</option>
            {LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | ManagerStatus)
            }
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emp id</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Avg rating</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Function</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Loading managers…
                    </span>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No managers yet. Import a CSV or add a row.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.employeeCode}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
                        {statusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.averageRating.toFixed(2)}</TableCell>
                    <TableCell>{row.rating}</TableCell>
                    <TableCell>{row.entity}</TableCell>
                    <TableCell>{row.function}</TableCell>
                    <TableCell>{row.level}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => openEdit(row)}
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={deletingId === row.id}
                          onClick={() => void handleDelete(row)}
                          aria-label={`Delete ${row.name}`}
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add manager</DialogTitle>
            <DialogDescription>Create a single manager row manually.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleCreate(event)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mgr-code">Emp id</Label>
                <Input
                  id="mgr-code"
                  required
                  value={createForm.employeeCode}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, employeeCode: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-name">Name</Label>
                <Input
                  id="mgr-name"
                  required
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-entity">Entity</Label>
                <Input
                  id="mgr-entity"
                  required
                  value={createForm.entity}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, entity: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-function">Function</Label>
                <Input
                  id="mgr-function"
                  required
                  value={createForm.function}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, function: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-level">Level</Label>
                <select
                  id="mgr-level"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={createForm.level}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      level: event.target.value as ManagerLevel,
                    }))
                  }
                >
                  {LEVEL_OPTIONS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-status">Status</Label>
                <select
                  id="mgr-status"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={createForm.status}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      status: event.target.value as ManagerStatus,
                    }))
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-avg">Average rating</Label>
                <Input
                  id="mgr-avg"
                  type="number"
                  min={0}
                  max={5}
                  step="0.01"
                  required
                  value={createForm.averageRating}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      averageRating: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-rating">Rating</Label>
                <select
                  id="mgr-rating"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={createForm.rating}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      rating: event.target.value as ManagerRating,
                    }))
                  }
                >
                  {RATING_OPTIONS.map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit metrics</DialogTitle>
            <DialogDescription>
              Update status, average rating, and grade for{' '}
              {editTarget?.name ?? 'manager'}.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleSaveEdit(event)}>
            <div className="space-y-1.5">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value as ManagerStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-avg">Average rating</Label>
              <Input
                id="edit-avg"
                type="number"
                min={0}
                max={5}
                step="0.01"
                required
                value={editAverage}
                onChange={(event) => setEditAverage(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-rating">Rating</Label>
              <select
                id="edit-rating"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={editRating}
                onChange={(event) => setEditRating(event.target.value as ManagerRating)}
              >
                {RATING_OPTIONS.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingEdit}>
                {isSavingEdit ? <Loader2 className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open)
          if (!open) setImportPreview(null)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import managers CSV</DialogTitle>
            <DialogDescription>
              Map columns, preview who will be added or updated, then confirm import.
              Empty or "-" for entity/function is allowed (stored as Unknown).
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handlePreviewImport}>
            <div className="space-y-1.5">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  void handleCsvFile(file)
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-level">Level for all rows</Label>
              <select
                id="import-level"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={importLevel}
                onChange={(event) => {
                  setImportLevel(event.target.value as ManagerLevel)
                  setImportPreview(null)
                }}
              >
                {LEVEL_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            {csvHeaders.length > 0 ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Column mapping</p>
                {IMPORT_FIELDS.map((field) => (
                  <div key={field.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2">
                    <Label className="text-xs text-muted-foreground">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </Label>
                    <select
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      value={columnMap[field.key] ?? ''}
                      onChange={(event) => {
                        setColumnMap((prev) => ({
                          ...prev,
                          [field.key]: event.target.value,
                        }))
                        setImportPreview(null)
                      }}
                      required={field.required}
                    >
                      <option value="">{field.required ? 'Select column…' : 'Skip'}</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}

            {importPreview ? (
              <div className="space-y-3 rounded-md border p-3 text-sm">
                <p className="font-medium">
                  Preview · {importPreview.toAdd.length} new ·{' '}
                  {importPreview.toUpdate.length} update · {importPreview.toSkip.length}{' '}
                  skip
                </p>

                {importPreview.toUpdate.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-amber-800">
                      Will update (same emp id already in table)
                    </p>
                    <ul className="max-h-36 space-y-1 overflow-y-auto rounded border bg-amber-50/60 p-2 text-xs">
                      {importPreview.toUpdate.map((row) => (
                        <li key={`u-${row.line}-${row.employeeCode}`}>
                          <span className="font-mono">{row.employeeCode}</span> — {row.name}
                          {row.existingName !== row.name
                            ? ` (was ${row.existingName})`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {importPreview.toAdd.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-emerald-800">Will add (new)</p>
                    <ul className="max-h-28 space-y-1 overflow-y-auto rounded border bg-emerald-50/60 p-2 text-xs">
                      {importPreview.toAdd.slice(0, 40).map((row) => (
                        <li key={`a-${row.line}-${row.employeeCode}`}>
                          <span className="font-mono">{row.employeeCode}</span> — {row.name}
                        </li>
                      ))}
                      {importPreview.toAdd.length > 40 ? (
                        <li>…and {importPreview.toAdd.length - 40} more</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}

                {importPreview.toSkip.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-destructive">Will skip</p>
                    <ul className="max-h-28 space-y-1 overflow-y-auto rounded border bg-destructive/5 p-2 text-xs">
                      {importPreview.toSkip.slice(0, 20).map((row) => (
                        <li key={`s-${row.line}`}>
                          Line {row.line}: {row.reason}
                        </li>
                      ))}
                      {importPreview.toSkip.length > 20 ? (
                        <li>…and {importPreview.toSkip.length - 20} more</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="secondary" disabled={!csvText}>
                  Preview
                </Button>
                <Button
                  type="button"
                  disabled={isImporting || !importPreview}
                  onClick={() => void handleConfirmImport()}
                >
                  {isImporting ? <Loader2 className="size-4 animate-spin" /> : null}
                  Confirm import
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
