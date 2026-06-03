import type { ReactNode, SubmitEvent } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { cn } from '#/lib/utils'
import type { UserData } from '#/store/assessment-store'
import { AuthHeroPanel } from '#/components/AuthHeroPanel'

const ENTITY_OPTIONS = [
  'Realty',
  'Construction',
  'PNCA',
  'Sobha Community Management',
  'LFM',
  'Sobha Concrete',
  'Latinem Landscaping',
  'Advanced Manufacturing',
  'Sobha Modular & Facade',
  'Sobha Energy Solutions',
  'Sobha Realty Abu Dhabi',
  'Al Siniya',
  'Furniture',
  'Stay By Latinem',
  'Other',
] as const

type ProfileErrors = Partial<Record<keyof UserData | 'otherEntity', string>>

interface EmployeeDetailsFormProps {
  profileForm: UserData
  profileErrors: ProfileErrors
  otherEntity: string
  onUpdateField: (field: keyof UserData, value: string) => void
  onOtherEntityChange: (value: string) => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  onBack: () => void
  footerExtra?: ReactNode
}

export function EmployeeDetailsForm({
  profileForm,
  profileErrors,
  otherEntity,
  onUpdateField,
  onOtherEntityChange,
  onSubmit,
  onBack,
  footerExtra,
}: EmployeeDetailsFormProps) {
  return (
    <div className="min-h-[calc(100vh-72px)] bg-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      <div className="contents lg:contents">
        <AuthHeroPanel
          title="Welcome to the High Potential Assessment Questionnaire"
        />

        <section className="flex items-center justify-center bg-white px-5 py-10 sm:px-8 lg:min-h-[calc(100vh-72px)] lg:px-10 xl:px-14">
          <div className="w-full max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
              Sobha Ascend
            </p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight">
              Employee Details
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">
              Fill in all mandatory details before you move to the survey.
            </p>

            <form className="mt-8 space-y-6" onSubmit={onSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employeeCode">Employee Code *</Label>
                  <Input
                    id="employeeCode"
                    value={profileForm.employeeCode}
                    onChange={(event) => onUpdateField('employeeCode', event.target.value)}
                    aria-invalid={Boolean(profileErrors.employeeCode)}
                    placeholder="eg. 123456"
                  />
                  {profileErrors.employeeCode ? (
                    <p className="text-sm text-destructive">
                      {profileErrors.employeeCode}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileForm.email}
                    onChange={(event) => onUpdateField('email', event.target.value)}
                    aria-invalid={Boolean(profileErrors.email)}
                    placeholder="eg. john.doe@example.com"
                  />
                  {profileErrors.email ? (
                    <p className="text-sm text-destructive">{profileErrors.email}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Employee Name *</Label>
                  <Input
                    id="name"
                    value={profileForm.name}
                    onChange={(event) => onUpdateField('name', event.target.value)}
                    aria-invalid={Boolean(profileErrors.name)}
                    placeholder="eg. John Ternus"
                  />
                  {profileErrors.name ? (
                    <p className="text-sm text-destructive">{profileErrors.name}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="designation">Designation *</Label>
                  <Input
                    id="designation"
                    value={profileForm.Designation}
                    onChange={(event) => onUpdateField('Designation', event.target.value)}
                    aria-invalid={Boolean(profileErrors.Designation)}
                    placeholder="eg. Senior Software Engineer"
                  />
                  {profileErrors.Designation ? (
                    <p className="text-sm text-destructive">
                      {profileErrors.Designation}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department *</Label>
                  <Input
                    id="department"
                    value={profileForm.Department}
                    onChange={(event) => onUpdateField('Department', event.target.value)}
                    aria-invalid={Boolean(profileErrors.Department)}
                    placeholder="eg. Engineering"
                  />
                  {profileErrors.Department ? (
                    <p className="text-sm text-destructive">
                      {profileErrors.Department}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entity">Entity *</Label>
                  <select
                    id="entity"
                    value={profileForm.entity}
                    onChange={(event) => onUpdateField('entity', event.target.value)}
                    aria-invalid={Boolean(profileErrors.entity)}
                    className={cn(
                      'h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      profileErrors.entity
                        ? 'border-destructive ring-destructive/20'
                        : undefined,
                    )}
                  >
                    <option value="">Select entity</option>
                    {ENTITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {profileErrors.entity ? (
                    <p className="text-sm text-destructive">{profileErrors.entity}</p>
                  ) : null}
                </div>

                {profileForm.entity === 'Other' ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="otherEntity">Other Entity *</Label>
                    <Input
                      id="otherEntity"
                      value={otherEntity}
                      onChange={(event) => onOtherEntityChange(event.target.value)}
                      aria-invalid={Boolean(profileErrors.otherEntity)}
                      placeholder="eg. Sobha Realty"
                    />
                    {profileErrors.otherEntity ? (
                      <p className="text-sm text-destructive">
                        {profileErrors.otherEntity}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="outline" onClick={onBack}>
                  Back
                </Button>
                <Button type="submit">Next</Button>
              </div>
              {footerExtra}
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}