import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/supabaseClient'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, name, role, eden_access')
      .order('role', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { target_id, access_value } = await req.json()
    if (!target_id || typeof access_value !== 'boolean') {
      return NextResponse.json({ error: 'target_id et access_value requis' }, { status: 400 })
    }
    const supabase = createServerSupabaseClient()
    const { error } = await supabase
      .from('profiles')
      .update({ eden_access: access_value })
      .eq('id', target_id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
