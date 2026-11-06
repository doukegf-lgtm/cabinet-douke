import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import ModuleHomeLink from '@/components/fiscal-social/module-home-link'
import { requireAdmin } from '@/lib/platform/auth'
import { FISCAL_MODULE } from '@/lib/fiscal/config'
import AnnualInputClient from './saisie-client'
import TaxProfileClient from './tax-profile-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function AnnualInputPage({
  params,
}: {
  params: { id: string }
}) {
  const access = await requireAdmin().catch(() => null)
  if (!access?.ok) redirect('/')
  if (!UUID.test(params.id)) notFound()

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-5 sm:px-8 md:flex-row md:items-center md:justify-between">
          <ModuleHomeLink />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              CABINET DOUKE · ESPACE PROFESSIONNEL
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Saisie annuelle</h1>
            <p className="mt-1 text-sm text-slate-500">
              Collecte et revue des données financières déclaratives.
            </p>
          </div>
          <Link
            href="/fiscal-social/dossiers"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Retour aux dossiers
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-5 py-7 sm:px-8">
        <AnnualInputClient dossierId={params.id} />
        <TaxProfileClient dossierId={params.id} />
      </div>

      <footer className="border-t border-slate-200 bg-white px-5 py-4 text-center text-xs text-slate-400">
        Cabinet DOUKE · Module Fiscal & Social · v{FISCAL_MODULE.version}
      </footer>
    </main>
  )
}
