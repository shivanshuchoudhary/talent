import { createFileRoute } from '@tanstack/react-router'
import { ManagersDashboard } from '#/components/admin/ManagersDashboard'

export const Route = createFileRoute('/admin/managers')({
  component: AdminManagersPage,
})

function AdminManagersPage() {
  return <ManagersDashboard />
}
