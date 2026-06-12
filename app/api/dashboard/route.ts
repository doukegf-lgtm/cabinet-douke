import { NextResponse } from 'next/server';
import { createServerSupabaseClient, dashboardRead, dashboardWrite, forceSupabaseConnection, isTableName } from '../../supabaseClient';

const supabase = createServerSupabaseClient();

export async function GET() {
  try {
    await forceSupabaseConnection(supabase);
    return NextResponse.json(await dashboardRead(supabase));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, table, id, data } = body ?? {};

    if (!isTableName(table)) {
      return NextResponse.json({ error: 'Table invalide' }, { status: 400 });
    }

    if (action === 'insert') {
      return NextResponse.json({ data: await dashboardWrite(supabase, 'insert', table, data, id) });
    }

    if (action === 'update') {
      return NextResponse.json({ data: await dashboardWrite(supabase, 'update', table, data, id) });
    }

    if (action === 'delete') {
      return NextResponse.json(await dashboardWrite(supabase, 'delete', table, data, id));
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
