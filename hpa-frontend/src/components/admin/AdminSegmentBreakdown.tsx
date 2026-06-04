import { useEffect, useMemo, useState } from 'react'
import type { AdminParticipant } from '#/lib/admin-api'
import {
  computeSegmentInsights,
  getSegmentOptions,
  type SegmentDimension,
} from '#/lib/admin-analytics'
import { ChartLegend, HorizontalBarChart } from '#/components/admin/AdminChartPrimitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Building2, Sparkles, TrendingUp } from 'lucide-react'

type AdminSegmentBreakdownProps = {
  participants: AdminParticipant[]
}

function GradeDistributionSummary({
  gradedCount,
  grades,
}: {
  gradedCount: number
  grades: { label: string; count: number }[]
}) {
  if (gradedCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No letter grades yet for this segment.
      </p>
    )
  }

  return (
    <p className="text-sm text-foreground">
      {grades
        .filter((grade) => grade.count > 0)
        .map((grade, index) => (
          <span key={grade.label}>
            {index > 0 ? ', ' : null}
            <span className="font-semibold tabular-nums">
              {Math.round((grade.count / gradedCount) * 100)}%
            </span>{' '}
            in {grade.label}
          </span>
        ))}
    </p>
  )
}

function SegmentInsightsPanel({
  participants,
  dimension,
  segment,
}: {
  participants: AdminParticipant[]
  dimension: SegmentDimension
  segment: string
}) {
  const insights = useMemo(
    () => computeSegmentInsights(participants, dimension, segment),
    [participants, dimension, segment],
  )

  const gradeSlices = insights.gradeDistribution.filter((slice) => slice.count > 0)
  const competencyItems = insights.competencyAverages.map((item, index) => ({
    ...item,
    color: item.color || `var(--chart-${(index % 5) + 1})`,
  }))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Participants
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {insights.participantCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            With submission
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {insights.withSubmission}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Graded
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {insights.gradedCount}
          </p>
        </div>
      </div>

      {insights.topCompetency ? (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Majority competency trend</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {insights.segmentLabel}
              </span>{' '}
              scores highest in{' '}
              <span className="font-semibold text-foreground">
                {insights.topCompetency.title}
              </span>{' '}
              <span className="tabular-nums">
                (avg {insights.topCompetency.averageScore.toFixed(2)})
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Not enough competency data yet for this segment.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="size-4" />
            </div>
            <div>
              <h4 className="font-semibold">Grade distribution</h4>
              <GradeDistributionSummary
                gradedCount={insights.gradedCount}
                grades={insights.gradeDistribution}
              />
            </div>
          </div>
          {gradeSlices.length > 0 ? (
            <ChartLegend slices={gradeSlices} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Grade breakdown appears once participants receive letter grades.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-4" />
            </div>
            <div>
              <h4 className="font-semibold">Competency averages</h4>
              <p className="text-sm text-muted-foreground">
                Mean score by competency (1–5 scale)
              </p>
            </div>
          </div>
          {competencyItems.length > 0 ? (
            <HorizontalBarChart items={competencyItems} maxItems={8} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Competency scores appear after participants submit responses.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SegmentTabs({
  participants,
  dimension,
}: {
  participants: AdminParticipant[]
  dimension: SegmentDimension
}) {
  const options = useMemo(
    () => getSegmentOptions(participants, dimension),
    [participants, dimension],
  )
  const [selected, setSelected] = useState('')

  useEffect(() => {
    setSelected(options[0] ?? '')
  }, [options])

  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No {dimension === 'entity' ? 'entities' : 'departments'} found in participant
        records yet.
      </p>
    )
  }

  return (
    <Tabs value={selected} onValueChange={setSelected}>
      <TabsList
        variant="line"
        className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0"
      >
        {options.map((option) => (
          <TabsTrigger key={option} value={option} className="shrink-0">
            {option}
          </TabsTrigger>
        ))}
      </TabsList>
      {options.map((option) => (
        <TabsContent key={option} value={option} className="mt-6">
          <SegmentInsightsPanel
            participants={participants}
            dimension={dimension}
            segment={option}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}

export function AdminSegmentBreakdown({ participants }: AdminSegmentBreakdownProps) {
  const [dimension, setDimension] = useState<SegmentDimension>('entity')

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Entity & department analysis
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Filter by business unit or department to compare competency trends and grade
            distribution. Lists are built from live participant records.
          </p>
        </div>
      </div>

      <Tabs
        value={dimension}
        onValueChange={(value) => setDimension(value as SegmentDimension)}
      >
        <TabsList>
          <TabsTrigger value="entity">By entity</TabsTrigger>
          <TabsTrigger value="department" disabled>By department</TabsTrigger>
        </TabsList>
        <TabsContent value="entity" className="mt-5">
          <SegmentTabs participants={participants} dimension="entity" />
        </TabsContent>
        {/* <TabsContent value="department" className="mt-5">
          <SegmentTabs participants={participants} dimension="department" />
        </TabsContent> */}
      </Tabs>
    </section>
  )
}
