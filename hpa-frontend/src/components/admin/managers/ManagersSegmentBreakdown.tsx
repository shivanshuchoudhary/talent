import { useEffect, useMemo, useState } from 'react'
import type { ManagerRecord } from '#/lib/admin-api'
import {
  computeManagerSegmentInsights,
  getManagerSegmentOptions,
  type ManagerSegmentDimension,
} from './manager-analytics'
import { ChartLegend, DonutChart } from '#/components/admin/AdminChartPrimitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Briefcase, Building2 } from 'lucide-react'

type ManagersSegmentBreakdownProps = {
  managers: ManagerRecord[]
}

function SegmentOptionsNav({
  options,
  selected,
  onSelectedChange,
  emptyLabel,
}: {
  options: string[]
  selected: string
  onSelectedChange: (value: string) => void
  emptyLabel: string
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <Tabs value={selected} onValueChange={onSelectedChange} orientation="vertical" className="block">
      <TabsList className="max-h-[520px] w-full flex-col items-stretch justify-start overflow-y-auto">
        {options.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            className="min-h-9 flex-none justify-start text-left"
          >
            {option}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function ManagerSegmentInsightsPanel({
  managers,
  dimension,
  segment,
}: {
  managers: ManagerRecord[]
  dimension: ManagerSegmentDimension
  segment: string
}) {
  const insights = useMemo(
    () => computeManagerSegmentInsights(managers, dimension, segment),
    [managers, dimension, segment],
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Managers
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {insights.managerCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Completed
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {insights.completed}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({insights.completionRate}%)
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Avg rating
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {insights.avgRating.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-3 font-semibold">Status mix</h4>
          {insights.statusBreakdown.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <DonutChart
                slices={insights.statusBreakdown}
                size={110}
                centerLabel={insights.managerCount}
                centerHint="total"
              />
              <ChartLegend slices={insights.statusBreakdown} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No status data for this segment.</p>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-3 font-semibold">Letter grades</h4>
          {insights.gradeDistribution.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <DonutChart
                slices={insights.gradeDistribution}
                size={110}
                centerLabel={insights.gradedCount}
                centerHint="graded"
              />
              <ChartLegend slices={insights.gradeDistribution} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No grades for this segment.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <h4 className="mb-3 font-semibold">Level split</h4>
        {insights.levelBreakdown.length > 0 ? (
          <div className="flex flex-wrap items-center gap-4">
            <DonutChart
              slices={insights.levelBreakdown}
              size={110}
              centerLabel={insights.managerCount}
              centerHint="managers"
            />
            <ChartLegend slices={insights.levelBreakdown} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No level data for this segment.</p>
        )}
      </div>
    </div>
  )
}

export function ManagersSegmentBreakdown({ managers }: ManagersSegmentBreakdownProps) {
  const [dimension, setDimension] = useState<ManagerSegmentDimension>('entity')
  const entityOptions = useMemo(
    () => getManagerSegmentOptions(managers, 'entity'),
    [managers],
  )
  const functionOptions = useMemo(
    () => getManagerSegmentOptions(managers, 'function'),
    [managers],
  )
  const [selectedEntity, setSelectedEntity] = useState('')
  const [selectedFunction, setSelectedFunction] = useState('')

  useEffect(() => {
    setSelectedEntity(entityOptions[0] ?? '')
  }, [entityOptions])

  useEffect(() => {
    setSelectedFunction(functionOptions[0] ?? '')
  }, [functionOptions])

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {dimension === 'entity' ? (
            <Building2 className="size-4" />
          ) : (
            <Briefcase className="size-4" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {dimension === 'entity' ? 'Entity analysis' : 'Function analysis'}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Drill into status, grades, and ratings by segment
          </p>
        </div>
      </div>

      <Tabs
        value={dimension}
        onValueChange={(value) => setDimension(value as ManagerSegmentDimension)}
        orientation="vertical"
        className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)]"
      >
        <div className="space-y-3">
          <TabsList className="h-fit w-full flex-col items-stretch">
            <TabsTrigger value="entity" className="flex-none justify-start">
              By entity
            </TabsTrigger>
            <TabsTrigger value="function" className="flex-none justify-start">
              By function
            </TabsTrigger>
          </TabsList>
          {dimension === 'entity' ? (
            <SegmentOptionsNav
              options={entityOptions}
              selected={selectedEntity}
              onSelectedChange={setSelectedEntity}
              emptyLabel="No entities found in manager records yet."
            />
          ) : (
            <SegmentOptionsNav
              options={functionOptions}
              selected={selectedFunction}
              onSelectedChange={setSelectedFunction}
              emptyLabel="No functions found in manager records yet."
            />
          )}
        </div>

        <TabsContent value="entity" className="min-w-0">
          {selectedEntity ? (
            <ManagerSegmentInsightsPanel
              managers={managers}
              dimension="entity"
              segment={selectedEntity}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No entities found in manager records yet.
            </p>
          )}
        </TabsContent>

        <TabsContent value="function" className="min-w-0">
          {selectedFunction ? (
            <ManagerSegmentInsightsPanel
              managers={managers}
              dimension="function"
              segment={selectedFunction}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No functions found in manager records yet.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}
