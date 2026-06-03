import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  fetchAdminUsers,
  grantAdminAccess,
  revokeAdminAccess,
  type AdminUserRecord,
} from '#/lib/admin-api'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Loader2, Shield, Trash2, UserPlus } from 'lucide-react'

function roleLabel(role: string) {
  if (role === 'super_admin') return 'Super admin'
  if (role === 'admin') return 'Admin'
  return role
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  if (role === 'super_admin') return 'default'
  if (role === 'admin') return 'secondary'
  return 'outline'
}

export function AdminUserManagement() {
  const [admins, setAdmins] = useState<AdminUserRecord[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [removingEmail, setRemovingEmail] = useState<string | null>(null)

  const loadAdmins = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await fetchAdminUsers()
      setAdmins(rows)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load admins.'
      setError(message)
      setAdmins([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAdmins()
  }, [loadAdmins])

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email) {
      setError('Enter a valid email address.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await grantAdminAccess(email)
      setNewEmail('')
      setSuccess(`${email} can now access the admin dashboard.`)
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add admin.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemove = async (email: string) => {
    setRemovingEmail(email)
    setError(null)
    setSuccess(null)
    try {
      await revokeAdminAccess(email)
      setSuccess(`Admin access removed for ${email}.`)
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove admin.')
    } finally {
      setRemovingEmail(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Shield className="size-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Admin access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Grant or revoke dashboard access for colleagues. Super admins and
              environment-configured admins cannot be removed here.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-6">
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium">
              Add admin by email
            </label>
            <Input
              id="admin-email"
              type="email"
              placeholder="colleague@company.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" disabled={isSubmitting} className="shrink-0">
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 size-4" />
            )}
            Add admin
          </Button>
        </form>

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-lg border border-[oklch(0.55_0.14_155/0.35)] bg-[oklch(0.55_0.14_155/0.08)] px-4 py-3 text-sm text-[oklch(0.4_0.12_155)]">
            {success}
          </p>
        ) : null}

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading admin list…
          </p>
        ) : admins.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No admin users found.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.email}>
                    <TableCell className="font-medium">{admin.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {admin.name || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(admin.role)}>
                        {roleLabel(admin.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {admin.source}
                    </TableCell>
                    <TableCell className="text-right">
                      {admin.canRemove ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={removingEmail === admin.email}
                          onClick={() => void handleRemove(admin.email)}
                        >
                          {removingEmail === admin.email ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Protected</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  )
}
