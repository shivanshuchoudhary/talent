import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  createManager,
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

const RATING_OPTIONS: ManagerRating[] = ['A', 'B', '-']
const LEVEL_OPTIONS: ManagerLevel[] = ['n-2', 'n-3']

const IMPORT_FIELDS: Array<{ key: keyof ManagerColumnMap; label: string; required?: boolean }> =
  [
    { key: 'employeeCode', label: 'Emp id', required: true },
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status' },
    { key: 'averageRating', label: 'Average rating' },
    { key: 'rating', label: 'Rating (grade)' },
    { key: 'entity', label: 'Entity' },
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
  const firstLine = csvText.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? ''
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i]
    const next = firstLine[i + 1]
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
  return cells.filter(Boolean)
}

const emptyCreateForm = {
  employeeCode: '',
  name: '',
  entity: '',
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
        row.entity.toLowerCase().includes(q)
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

  const handleCsvFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    const headers = parseCsvHeaders(text)
    setCsvText(text)
    setCsvHeaders(headers)
    setColumnMap({
      employeeCode: headers[0] ?? '',
      name: '',
      status: '',
      averageRating: '',
      rating: '',
      entity: '',
    })
  }

  const handleImport = async (event: FormEvent) => {
    event.preventDefault()
    if (!csvText.trim()) {
      setError('Choose a CSV file first.')
      return
    }
    if (!columnMap.employeeCode) {
      setError('Map the Emp id column before importing.')
      return
    }
    setIsImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const cleanedMap: ManagerColumnMap = { employeeCode: columnMap.employeeCode }
      for (const field of IMPORT_FIELDS) {
        if (field.key === 'employeeCode') continue
        const value = columnMap[field.key]
        if (value) cleanedMap[field.key] = value
      }
      const result = await importManagersCsv({
        csvText,
        columnMap: cleanedMap,
        level: importLevel,
      })
      setImportOpen(false)
      setCsvText('')
      setCsvHeaders([])
      setSuccess(
        `Import done for ${result.level}: ${result.imported} added, ${result.updated} updated, ${result.skipped} skipped.`,
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
              placeholder="Search name, emp id, entity…"
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
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Loading managers…
                    </span>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import managers CSV</DialogTitle>
            <DialogDescription>
              Map CSV columns to manager fields, then choose one level for the whole file.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleImport(event)}>
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
                onChange={(event) => setImportLevel(event.target.value as ManagerLevel)}
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
                      onChange={(event) =>
                        setColumnMap((prev) => ({
                          ...prev,
                          [field.key]: event.target.value,
                        }))
                      }
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isImporting || !csvText}>
                {isImporting ? <Loader2 className="size-4 animate-spin" /> : null}
                Import
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
