import { NextResponse } from 'next/server'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { FISCAL_MODULE } from '@/lib/fiscal/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const db = getServiceClient()

    const [clients, dossiers] = await Promise.all([
      db.from('fiscal_clients').select('id', {
        count: 'exact',
        head: true,
      }),
      db.from('fiscal_dossiers').select('id', {
        count: 'exact',
        head: true,
      }),
    ])

    if (clients.error || dossiers.error) {
      return NextResponse.json(
        {
          ok: false,
          database: 'migration_required_or_unavailable',
          migration: '0005_fiscal_social_core.sql',
        },
        { status: 503 },
      )
    }

    const privateDir = join(process.cwd(), 'private', 'fiscal')

    const workbookPath = join(privateDir, FISCAL_MODULE.workbook)
    const mappingPath = join(privateDir, FISCAL_MODULE.mapping)

    const workbookExists = existsSync(workbookPath)
    const mappingExists = existsSync(mappingPath)

    return NextResponse.json({
      ok: true,
      module: FISCAL_MODULE.name,
      version: FISCAL_MODULE.version,
      database: 'connected',
      counts: {
        clients: clients.count ?? 0,
        dossiers: dossiers.count ?? 0,
      },
      files: {
        workbook: {
          present: workbookExists,
          sizeBytes: workbookExists ? statSync(workbookPath).size : null,
        },
        mapping: {
          present: mappingExists,
          sizeBytes: mappingExists ? statSync(mappingPath).size : null,
        },
      },
      calculationEngine: 'not_certified',
      finalCalculationsEnabled: false,
    })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Configuration serveur indisponible' },
      { status: 500 },
    )
  }
}
