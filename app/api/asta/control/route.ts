import { NextResponse } from 'next/server'
import { getSession } from '@/lib/platform/auth'
import { getAstaControlSummary } from '@/lib/asta/control/service'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()

  if (!session) {
    return NextResponse.json(
      { error: 'Non authentifié' },
      { status: 401 }
    )
  }

  try {
    const summary = await getAstaControlSummary()

    return NextResponse.json({
      ok: true,
      ...summary
    })
  } catch (error) {
    console.error('[ASTA_CONTROL]', error)

    return NextResponse.json(
      {
        error: 'Impossible de charger le contrôle ASTA'
      },
      { status: 500 }
    )
  }
}
