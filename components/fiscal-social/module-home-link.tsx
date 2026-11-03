import Link from 'next/link'

export default function ModuleHomeLink() {
  return (
    <Link
      href="/"
      className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
      aria-label="Quitter le module fiscal et social et retourner à l’interface principale"
    >
      <span aria-hidden="true" className="text-lg leading-none">←</span>
      <span>Interface principale</span>
    </Link>
  )
}
