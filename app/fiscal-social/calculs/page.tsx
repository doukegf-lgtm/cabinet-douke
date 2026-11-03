import Link from 'next/link'
import { redirect } from 'next/navigation'
import ModuleHomeLink from '@/components/fiscal-social/module-home-link'
import { requireAdmin } from '@/lib/platform/auth'
import { FISCAL_MODULE } from '@/lib/fiscal/config'
import CalculsClient from './calculs-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function FiscalCalculsPage() {
  const access = await requireAdmin().catch(() => null)
  if (!access?.ok) redirect('/')

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <ModuleHomeLink />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              CABINET DOUKE · ESPACE PROFESSIONNEL
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">
              Régularisation fiscale & sociale
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Préparation et suivi des demandes de calcul.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Moteur non certifié · v{FISCAL_MODULE.version}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <div className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            ESPACE DE TRAVAIL
          </div>
          <Link href="/fiscal-social" className="block rounded-xl px-4 py-3 text-sm text-slate-600 hover:bg-slate-100">▦ Clients</Link>
          <Link href="/fiscal-social/dossiers" className="block rounded-xl px-4 py-3 text-sm text-slate-600 hover:bg-slate-100">▣ Dossiers</Link>
          <Link href="/fiscal-social/documents" className="block rounded-xl px-4 py-3 text-sm text-slate-600 hover:bg-slate-100">▤ Documents</Link>
          <Link href="/fiscal-social/audit" className="block rounded-xl px-4 py-3 text-sm text-slate-600 hover:bg-slate-100">▤ Journal d’audit</Link>
          <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">⌁ Calculs</div>
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-bold text-amber-900">Calculs désactivés</div>
            <p className="mt-2 text-xs leading-5 text-amber-800">
              Les règles réglementaires et le moteur doivent être certifiés avant tout calcul réel.
            </p>
            <div className="mt-3 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
              NON CERTIFIÉ
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <CalculsClient />
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white px-5 py-4 text-center text-xs text-slate-400">
        Cabinet DOUKE · Module Fiscal & Social · Données isolées et journalisées
      </footer>
    </main>
  )
}
