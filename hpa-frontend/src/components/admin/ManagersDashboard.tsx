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
import type {
  ManagerColumnMap,
  ManagerLevel,
  ManagerRating,
  ManagerRecord,
  ManagerStatus,
} from '#/lib/admin-api'
import { Button } from '#/components/ui/button'
import { Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { ManagerAddDialog } from './managers/ManagerAddDialog'
import { ManagerEditDialog } from './managers/ManagerEditDialog'
import { ManagerImportDialog } from './managers/ManagerImportDialog'
import { ManagersFilters } from './managers/ManagersFilters'
import { ManagersTable } from './managers/ManagersTable'
import {
  EMPTY_CREATE_FORM,
  IMPORT_FIELDS,
} from './managers/manager-constants'
import type { ManagerCreateForm } from './managers/manager-constants'
import {
  buildCleanedColumnMap,
  buildImportPreview,
  isBlankCell,
  parseCsvHeaders,
} from './managers/manager-csv'
import type { ImportPreview } from './managers/manager-csv'

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
  const [isClearing, setIsClearing] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [createForm, setCreateForm] = useState<ManagerCreateForm>(EMPTY_CREATE_FORM)
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
  const [columnMap, setColumnMap] = useState<ManagerColumnMap>({ employeeCode: '' })
  const [isImporting, setIsImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

  const loadManagers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setManagers(await fetchManagers())
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
        if (access.isAdmin) await loadManagers()
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
      const code = createForm.employeeCode.trim()
      await createManager({
        employeeCode: isBlankCell(code) ? `MANUAL-${Date.now()}` : code,
        name: createForm.name.trim(),
        entity: isBlankCell(createForm.entity) ? 'Unknown' : createForm.entity.trim(),
        function: isBlankCell(createForm.function)
          ? 'Unknown'
          : createForm.function.trim(),
        status: createForm.status,
        averageRating,
        rating: createForm.rating,
        level: createForm.level,
      })
      setAddOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
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
    if (!window.confirm(`Delete ${row.name} (${row.employeeCode})? This cannot be undone.`)) {
      return
    }
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
    if (
      !window.confirm(
        'Delete ALL managers?\n\nYou can re-import from CSV afterward. This cannot be undone.',
      )
    ) {
      return
    }
    setIsClearing(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await deleteAllManagers()
      setSuccess(`Cleared ${result.deletedCount} manager(s).`)
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
    setCsvText(text)
    setCsvHeaders(parseCsvHeaders(text))
    setImportPreview(null)
    setColumnMap({
      employeeCode: '',
      name: '',
      status: '',
      averageRating: '',
      rating: '',
      entity: '',
      function: '',
    })
  }

  const handlePreviewImport = (event: FormEvent) => {
    event.preventDefault()
    if (!csvText.trim()) {
      setError('Choose a CSV file first.')
      return
    }
    setError(null)
    setImportPreview(
      buildImportPreview(csvText, buildCleanedColumnMap(columnMap, IMPORT_FIELDS), managers),
    )
  }

  const handleConfirmImport = async () => {
    if (!csvText.trim()) return
    setIsImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await importManagersCsv({
        csvText,
        columnMap: buildCleanedColumnMap(columnMap, IMPORT_FIELDS),
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
                setCreateForm(EMPTY_CREATE_FORM)
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

        <ManagersFilters
          search={search}
          levelFilter={levelFilter}
          statusFilter={statusFilter}
          onSearchChange={setSearch}
          onLevelChange={setLevelFilter}
          onStatusChange={setStatusFilter}
        />

        <ManagersTable
          rows={filtered}
          isLoading={isLoading}
          deletingId={deletingId}
          onEdit={(row) => {
            setEditTarget(row)
            setEditStatus(row.status)
            setEditAverage(String(row.averageRating))
            setEditRating(row.rating)
            setError(null)
            setSuccess(null)
          }}
          onDelete={(row) => void handleDelete(row)}
        />
      </main>

      <ManagerAddDialog
        open={addOpen}
        form={createForm}
        isCreating={isCreating}
        onOpenChange={setAddOpen}
        onFormChange={setCreateForm}
        onSubmit={(event) => void handleCreate(event)}
      />

      <ManagerEditDialog
        target={editTarget}
        status={editStatus}
        averageRating={editAverage}
        rating={editRating}
        isSaving={isSavingEdit}
        onClose={() => setEditTarget(null)}
        onStatusChange={setEditStatus}
        onAverageChange={setEditAverage}
        onRatingChange={setEditRating}
        onSubmit={(event) => void handleSaveEdit(event)}
      />

      <ManagerImportDialog
        open={importOpen}
        csvText={csvText}
        csvHeaders={csvHeaders}
        importLevel={importLevel}
        columnMap={columnMap}
        preview={importPreview}
        isImporting={isImporting}
        onOpenChange={(open) => {
          setImportOpen(open)
          if (!open) setImportPreview(null)
        }}
        onFileChange={(file) => void handleCsvFile(file)}
        onLevelChange={(level) => {
          setImportLevel(level)
          setImportPreview(null)
        }}
        onColumnMapChange={(map) => {
          setColumnMap(map)
          setImportPreview(null)
        }}
        onPreview={handlePreviewImport}
        onConfirm={() => void handleConfirmImport()}
      />
    </div>
  )
}
