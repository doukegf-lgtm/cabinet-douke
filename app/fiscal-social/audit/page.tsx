import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/platform/auth'
import { FISCAL_MODULE } from '@/lib/fiscal/config'
import AuditClient from './audit-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function FiscalAuditPage() {
  const access = await requireAdmin().catch(() => null)
  if (!access?.ok) redirect('/')

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-5 sm:px-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              CABINET DOUKE · ESPACE PROFESSIONNEL
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              Journal d’audit fiscal & social
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Traçabilité des opérations du module · Consultation en lecture seule.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            Espace sécurisé · v{FISCAL_MODULE.version}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8">
        <nav className="mb-6 flex flex-wrap gap-2 text-sm">
          <Link href="/fiscal-social" className="rounded-lg border bg-white px-3 py-2 text-slate-600 hover:bg-slate-100">Clients</Link>
          <Link href="/fiscal-social/dossiers" className="rounded-lg border bg-white px-3 py-2 text-slate-600 hover:bg-slate-100">Dossiers</Link>
          <Link href="/fiscal-social/documents" className="rounded-lg border bg-white px-3 py-2 text-slate-600 hover:bg-slate-100">Documents</Link>
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-800">Journal d’audit</span>
        </nav>

        <AuditClient />
      </div>

      <footer className="border-t border-slate-200 bg-white px-5 py-4 text-center text-xs text-slate-400">
        Cabinet DOUKE · Journal fiscal-social · Historique non modifiable
      </footer>
    </main>
  )
}
