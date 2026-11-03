import Link from 'next/link'

type ModuleHomeLinkProps = {
  href?: string
  label?: string
}

export default function ModuleHomeLink({
  href = '/fiscal-social',
  label = 'Retour aux clients',
}: ModuleHomeLinkProps) {
  const isMainHome = href === '/'

  return (
    <Link
      href={href}
      className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
      aria-label={
        isMainHome
          ? 'Retourner à l’interface principale'
          : 'Retourner à la page Clients du module fiscal et social'
      }
    >
      <span aria-hidden="true" className="text-lg leading-none">←</span>
      <span>{label}</span>
    </Link>
  )
}
