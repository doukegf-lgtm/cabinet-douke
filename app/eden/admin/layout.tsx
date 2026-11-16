import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/platform/auth'

export default async function EdenAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const auth = await requireAdmin()

  if (!auth.ok) {
    redirect('/')
  }

  return <>{children}</>
}