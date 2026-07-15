import type { ManagerLevel, ManagerStatus } from '#/lib/admin-api'
import { Input } from '#/components/ui/input'
import { Search } from 'lucide-react'
import { LEVEL_OPTIONS, STATUS_OPTIONS } from './manager-constants'

type ManagersFiltersProps = {
  search: string
  levelFilter: 'all' | ManagerLevel
  statusFilter: 'all' | ManagerStatus
  onSearchChange: (value: string) => void
  onLevelChange: (value: 'all' | ManagerLevel) => void
  onStatusChange: (value: 'all' | ManagerStatus) => void
}

export function ManagersFilters({
  search,
  levelFilter,
  statusFilter,
  onSearchChange,
  onLevelChange,
  onStatusChange,
}: ManagersFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search name, emp id, entity, function…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <select
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        value={levelFilter}
        onChange={(event) => onLevelChange(event.target.value as 'all' | ManagerLevel)}
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
        onChange={(event) => onStatusChange(event.target.value as 'all' | ManagerStatus)}
      >
        <option value="all">All statuses</option>
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
