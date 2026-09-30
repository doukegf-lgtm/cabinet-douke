'use client'

import { ReactNode } from 'react'

interface AstaGuardProps {
  children: ReactNode
}

export default function AstaGuard({ children }: AstaGuardProps) {
  return (
    <div
      data-asta="guard"
      style={{
        minHeight: '100vh',
        background: '#f7f9fc',
        color: '#172033'
      }}
    >
      {children}
    </div>
  )
}
