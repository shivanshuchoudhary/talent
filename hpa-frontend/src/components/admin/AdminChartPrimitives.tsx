import { cn } from '#/lib/utils'
import type { CountSlice } from '#/lib/admin-analytics'

type DonutChartProps = {
  slices: CountSlice[]
  size?: number
  className?: string
}

export function DonutChart({ slices, size = 200, className }: DonutChartProps) {
  const total = slices.reduce((sum, s) => sum + s.count, 0)
  if (total === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          className,
        )}
        style={{ width: size, height: size }}
      >
        No data
      </div>
    )
  }

  const radius = size / 2 - 12
  const cx = size / 2
  const cy = size / 2
  const stroke = 28
  const circumference = 2 * Math.PI * radius
  let offset = 0

  const arcs = slices.map((slice) => {
    const fraction = slice.count / total
    const dash = fraction * circumference
    const arc = (
      <circle
        key={slice.label}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={slice.color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        className="transition-all duration-500"
      />
    )
    offset += dash
    return arc
  })

  return (
    <div className={cn('relative inline-flex', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
          opacity={0.35}
        />
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-semibold tabular-nums text-foreground">
          {total}
        </span>
        <span className="text-xs text-muted-foreground">participants</span>
      </div>
    </div>
  )
}

type HorizontalBarChartProps = {
  items: CountSlice[]
  maxItems?: number
  className?: string
}

export function HorizontalBarChart({
  items,
  maxItems = 8,
  className,
}: HorizontalBarChartProps) {
  const visible = items.slice(0, maxItems)
  const max = Math.max(...visible.map((i) => i.count), 1)

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No data for this view.</p>
    )
  }

  return (
    <ul className={cn('space-y-3', className)}>
      {visible.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.count}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(item.count / max) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

type VerticalBarChartProps = {
  items: { label: string; count: number }[]
  className?: string
}

export function VerticalBarChart({ items, className }: VerticalBarChartProps) {
  const max = Math.max(...items.map((i) => i.count), 1)

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No submissions in this period.</p>
    )
  }

  return (
    <div className={cn('flex h-40 items-end justify-between gap-1 sm:gap-2', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 flex-1 flex-col items-center gap-2"
        >
          <span className="text-xs font-medium tabular-nums text-foreground">
            {item.count}
          </span>
          <div
            className="w-full max-w-10 rounded-t-md bg-primary/85 transition-all duration-700"
            style={{
              height: `${Math.max(8, (item.count / max) * 100)}%`,
              minHeight: item.count > 0 ? 8 : 0,
            }}
            title={`${item.label}: ${item.count}`}
          />
          <span className="w-full truncate text-center text-[10px] text-muted-foreground sm:text-xs">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ChartLegend({ slices }: { slices: CountSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0)
  return (
    <ul className="space-y-2">
      {slices.map((slice) => (
        <li key={slice.label} className="flex items-center gap-2 text-sm">
          <span
            className="size-3 shrink-0 rounded-sm"
            style={{ backgroundColor: slice.color }}
          />
          <span className="min-w-0 flex-1 truncate">{slice.label}</span>
          <span className="tabular-nums text-muted-foreground">
            {slice.count}
            {total > 0 ? (
              <span className="ml-1 text-xs">
                ({Math.round((slice.count / total) * 100)}%)
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
