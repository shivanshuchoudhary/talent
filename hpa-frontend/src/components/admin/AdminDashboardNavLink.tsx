import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { LayoutDashboard } from 'lucide-react'
import { cn } from '#/lib/utils'

type AdminDashboardNavLinkProps = {
  variant?: 'button' | 'outline' | 'ghost'
  className?: string
  fullWidth?: boolean
}

export function AdminDashboardNavLink({
  variant = 'outline',
  className,
  fullWidth = false,
}: AdminDashboardNavLinkProps) {
  return (
    <Button
      variant={variant === 'button' ? 'default' : variant}
      size={fullWidth ? 'lg' : 'sm'}
      className={cn(fullWidth && 'w-full', className)}
      asChild
    >
      <Link to="/admin">
        <LayoutDashboard className="mr-2 size-4" />
        View admin dashboard
      </Link>
    </Button>
  )
}
