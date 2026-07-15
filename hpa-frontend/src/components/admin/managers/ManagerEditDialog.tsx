import type { FormEvent } from 'react'
import type { ManagerRating, ManagerRecord, ManagerStatus } from '#/lib/admin-api'
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
import { RATING_OPTIONS, STATUS_OPTIONS } from './manager-constants'

type ManagerEditDialogProps = {
  target: ManagerRecord | null
  status: ManagerStatus
  averageRating: string
  rating: ManagerRating
  isSaving: boolean
  onClose: () => void
  onStatusChange: (value: ManagerStatus) => void
  onAverageChange: (value: string) => void
  onRatingChange: (value: ManagerRating) => void
  onSubmit: (event: FormEvent) => void
}

export function ManagerEditDialog({
  target,
  status,
  averageRating,
  rating,
  isSaving,
  onClose,
  onStatusChange,
  onAverageChange,
  onRatingChange,
  onSubmit,
}: ManagerEditDialogProps) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit metrics</DialogTitle>
          <DialogDescription>
            Update status, average rating, and grade for {target?.name ?? 'manager'}.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={status}
              onChange={(event) => onStatusChange(event.target.value as ManagerStatus)}
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
              value={averageRating}
              onChange={(event) => onAverageChange(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-rating">Rating</Label>
            <select
              id="edit-rating"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={rating}
              onChange={(event) => onRatingChange(event.target.value as ManagerRating)}
            >
              {RATING_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
