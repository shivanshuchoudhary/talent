import { createFileRoute } from '@tanstack/react-router'
import { AdminDashboard } from '#/components/admin/AdminDashboard'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
  return <AdminDashboard />
}
