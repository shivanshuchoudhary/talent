import { EmployeeDetailsForm } from '#/components/EmployeeDetailsForm'
import { AdminDashboardNavLink } from '#/components/admin/AdminDashboardNavLink'
import { useUserAccess } from '#/features/access/use-user-access'
import { useSurveyFlow } from '#/features/survey-flow/survey-flow-context'

export function ProfileScreen() {
  const {
    profileForm,
    profileErrors,
    otherEntity,
    updateProfileField,
    handleOtherEntityChange,
    handleProfileSubmit,
    handleProfileBack,
  } = useSurveyFlow()
  const { isAdmin, isLoading: isAccessLoading } = useUserAccess()

  return (
    <EmployeeDetailsForm
      profileForm={profileForm}
      profileErrors={profileErrors}
      otherEntity={otherEntity}
      onUpdateField={updateProfileField}
      onOtherEntityChange={handleOtherEntityChange}
      onSubmit={handleProfileSubmit}
      onBack={handleProfileBack}
      footerExtra={
        isAdmin && !isAccessLoading ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-center text-xs text-muted-foreground">
              You have admin access to assessment analytics
            </p>
            <AdminDashboardNavLink variant="outline" fullWidth />
          </div>
        ) : null
      }
    />
  )
}
