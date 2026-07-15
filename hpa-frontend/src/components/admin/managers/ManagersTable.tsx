import type { ManagerLevel, ManagerRecord, ManagerStatus } from '#/lib/admin-api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { statusLabel, statusVariant } from './manager-constants'

type ManagersTableProps = {
  rows: ManagerRecord[]
  isLoading: boolean
  deletingId: string | null
  onEdit: (row: ManagerRecord) => void
  onDelete: (row: ManagerRecord) => void
}

export function ManagersTable({
  rows,
  isLoading,
  deletingId,
  onEdit,
  onDelete,
}: ManagersTableProps) {
  return (
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
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                No managers yet. Import a CSV or add a row.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.employeeCode}</TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(row.status as ManagerStatus)}>
                    {statusLabel(row.status)}
                  </Badge>
                </TableCell>
                <TableCell>{row.averageRating.toFixed(2)}</TableCell>
                <TableCell>{row.rating}</TableCell>
                <TableCell>{row.entity}</TableCell>
                <TableCell>{row.function}</TableCell>
                <TableCell>{row.level as ManagerLevel}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => onEdit(row)}
                      aria-label={`Edit ${row.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={deletingId === row.id}
                      onClick={() => onDelete(row)}
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
  )
}
