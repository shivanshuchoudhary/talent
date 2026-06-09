import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'
import type { CountSlice } from '#/lib/admin-analytics'

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function describeDonutSlice(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle)
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle)
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle)
  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ')
}

type DonutChartProps = {
  slices: CountSlice[]
  size?: number
  className?: string
  centerLabel?: ReactNode
  centerHint?: string
}

export function DonutChart({
  slices,
  size = 200,
  className,
  centerLabel,
  centerHint,
}: DonutChartProps) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0)
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

  const cx = size / 2
  const cy = size / 2
  const outerRadius = size / 2 - 4
  const innerRadius = outerRadius * 0.62
  let currentAngle = 0

  const arcs = slices
    .filter((slice) => slice.count > 0)
    .map((slice) => {
      const sweep = (slice.count / total) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + sweep
      currentAngle = endAngle

      return (
        <path
          key={slice.label}
          d={describeDonutSlice(cx, cy, outerRadius, innerRadius, startAngle, endAngle)}
          fill={slice.color}
          className="transition-opacity duration-300 hover:opacity-90"
        />
      )
    })

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {centerLabel ?? (
          <span className="text-3xl font-semibold tabular-nums text-foreground">
            {total}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {centerHint ?? 'participants'}
        </span>
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
