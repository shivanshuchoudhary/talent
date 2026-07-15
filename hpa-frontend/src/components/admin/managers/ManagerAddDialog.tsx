import type { FormEvent } from 'react'
import type { ManagerLevel, ManagerRating, ManagerStatus } from '#/lib/admin-api'
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
import {
  LEVEL_OPTIONS,
  RATING_OPTIONS,
  STATUS_OPTIONS,
  type ManagerCreateForm,
} from './manager-constants'

type ManagerAddDialogProps = {
  open: boolean
  form: ManagerCreateForm
  isCreating: boolean
  onOpenChange: (open: boolean) => void
  onFormChange: (form: ManagerCreateForm) => void
  onSubmit: (event: FormEvent) => void
}

export function ManagerAddDialog({
  open,
  form,
  isCreating,
  onOpenChange,
  onFormChange,
  onSubmit,
}: ManagerAddDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add manager</DialogTitle>
          <DialogDescription>Create a single manager row manually.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mgr-code">Emp id</Label>
              <Input
                id="mgr-code"
                value={form.employeeCode}
                placeholder="Optional — leave blank if unknown"
                onChange={(event) =>
                  onFormChange({ ...form, employeeCode: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mgr-name">Name</Label>
              <Input
                id="mgr-name"
                required
                value={form.name}
                onChange={(event) => onFormChange({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mgr-entity">Entity</Label>
              <Input
                id="mgr-entity"
                value={form.entity}
                placeholder="Optional"
                onChange={(event) => onFormChange({ ...form, entity: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mgr-function">Function</Label>
              <Input
                id="mgr-function"
                value={form.function}
                placeholder="Optional"
                onChange={(event) =>
                  onFormChange({ ...form, function: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mgr-level">Level</Label>
              <select
                id="mgr-level"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.level}
                onChange={(event) =>
                  onFormChange({ ...form, level: event.target.value as ManagerLevel })
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
                value={form.status}
                onChange={(event) =>
                  onFormChange({ ...form, status: event.target.value as ManagerStatus })
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
                value={form.averageRating}
                onChange={(event) =>
                  onFormChange({ ...form, averageRating: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mgr-rating">Rating</Label>
              <select
                id="mgr-rating"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.rating}
                onChange={(event) =>
                  onFormChange({ ...form, rating: event.target.value as ManagerRating })
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
  )
}
