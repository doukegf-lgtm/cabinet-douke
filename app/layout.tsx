import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

// Métadonnées mises à jour pour un rendu professionnel sur les moteurs de recherche et LinkedIn
export const metadata: Metadata = {
  title: 'Cabinet DOUKE | Structuration Financière & PPP',
  description: 'Expertise en ingénierie financière, mobilisation de ressources et gestion des contrats de Partenariat Public-Privé (PPP) en Afrique de l’Ouest.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr"> {/* Changement de la langue en français pour l'accessibilité et le SEO */}
      <body 
        className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}
        style={{ minHeight: '100vh' }}
      >
        {children}
      </body>
    </html>
  )
}
