import { ReactNode } from 'react'
import AstaGuard from '@/components/asta/AstaGuard'

export const metadata = {
  title: 'ASTA · DOUKE Growth & Funding',
  description:
    'ASTA, employée numérique de DOUKE Growth & Funding.'
}

export default function AstaLayout({
  children
}: {
  children: ReactNode
}) {
  return <AstaGuard>{children}</AstaGuard>
}
