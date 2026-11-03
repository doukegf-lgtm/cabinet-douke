import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/platform/auth'
import ReferentialClient from './referentiel-client'

export const dynamic = 'force-dynamic'

export default async function ReferentialPage() {
  const access = await requireAdmin()
  if (!access.ok) redirect('/')

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Cabinet DOUKE · Fiscal et social</p>
          <h1 className="text-2xl font-semibold">Référentiel juridique et réglementaire</h1>
          <p className="mt-1 text-sm text-gray-600">
            Textes officiels, paramètres et obligations applicables au Bénin.
          </p>
        </div>
        <Link href="/fiscal-social" className="rounded border px-4 py-2 text-sm hover:bg-gray-50">
          Retour au module
        </Link>
      </div>
      <ReferentialClient />
    </main>
  )
}
