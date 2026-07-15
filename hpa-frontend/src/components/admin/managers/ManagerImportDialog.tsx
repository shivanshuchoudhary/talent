import type { FormEvent } from 'react'
import type { ManagerColumnMap, ManagerLevel } from '#/lib/admin-api'
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
import { Loader2 } from 'lucide-react'
import { IMPORT_FIELDS, LEVEL_OPTIONS } from './manager-constants'
import type { ImportPreview } from './manager-csv'

type ManagerImportDialogProps = {
  open: boolean
  csvText: string
  csvHeaders: string[]
  importLevel: ManagerLevel
  columnMap: ManagerColumnMap
  preview: ImportPreview | null
  isImporting: boolean
  onOpenChange: (open: boolean) => void
  onFileChange: (file: File | null) => void
  onLevelChange: (level: ManagerLevel) => void
  onColumnMapChange: (map: ManagerColumnMap) => void
  onPreview: (event: FormEvent) => void
  onConfirm: () => void
}

export function ManagerImportDialog({
  open,
  csvText,
  csvHeaders,
  importLevel,
  columnMap,
  preview,
  isImporting,
  onOpenChange,
  onFileChange,
  onLevelChange,
  onColumnMapChange,
  onPreview,
  onConfirm,
}: ManagerImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import managers CSV</DialogTitle>
          <DialogDescription>
            Map columns, preview adds/updates, then confirm. Empty or "-" emp id becomes
            NO-ID-LINE-N (still imported). Empty entity/function become Unknown.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onPreview}>
          <div className="space-y-1.5">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-level">Level for all rows</Label>
            <select
              id="import-level"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={importLevel}
              onChange={(event) => onLevelChange(event.target.value as ManagerLevel)}
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
                <div
                  key={field.key}
                  className="grid grid-cols-[1fr_1.2fr] items-center gap-2"
                >
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  <select
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={columnMap[field.key] ?? ''}
                    onChange={(event) =>
                      onColumnMapChange({
                        ...columnMap,
                        [field.key]: event.target.value,
                      })
                    }
                  >
                    <option value="">Skip</option>
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

          {preview ? (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              <p className="font-medium">
                Preview · {preview.toAdd.length} new · {preview.toUpdate.length} update
              </p>

              {preview.toUpdate.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-800">
                    Will update (same emp id already in table)
                  </p>
                  <ul className="max-h-36 space-y-1 overflow-y-auto rounded border bg-amber-50/60 p-2 text-xs">
                    {preview.toUpdate.map((row) => (
                      <li key={`u-${row.line}-${row.employeeCode}`}>
                        <span className="font-mono">{row.employeeCode}</span> — {row.name}
                        {row.generatedCode ? ' (generated id)' : ''}
                        {row.existingName !== row.name
                          ? ` (was ${row.existingName})`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.toAdd.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-emerald-800">Will add (new)</p>
                  <ul className="max-h-28 space-y-1 overflow-y-auto rounded border bg-emerald-50/60 p-2 text-xs">
                    {preview.toAdd.slice(0, 40).map((row) => (
                      <li key={`a-${row.line}-${row.employeeCode}`}>
                        <span className="font-mono">{row.employeeCode}</span> — {row.name}
                        {row.generatedCode ? ' (generated id)' : ''}
                      </li>
                    ))}
                    {preview.toAdd.length > 40 ? (
                      <li>…and {preview.toAdd.length - 40} more</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary" disabled={!csvText}>
                Preview
              </Button>
              <Button
                type="button"
                disabled={isImporting || !preview}
                onClick={onConfirm}
              >
                {isImporting ? <Loader2 className="size-4 animate-spin" /> : null}
                Confirm import
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
