import { NextResponse } from 'next/server';
import { createServerSupabaseClient, dashboardRead, dashboardWrite, forceSupabaseConnection, isTableName } from '../../supabaseClient';

const supabase = createServerSupabaseClient();

// ============================================================
// Extraction robuste du message d'erreur.
// Les erreurs Supabase (PostgrestError) sont des objets simples
// { message, details, hint, code } et NE SONT PAS des instances
// de la classe Error native. `error instanceof Error` est donc
// toujours `false` pour elles, ce qui masquait le vrai message.
// ============================================================
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    const parts = [err.message, err.details, err.hint, err.code]
      .filter((v) => typeof v === 'string' && v.length > 0);
    if (parts.length > 0) {
      return parts.join(' | ');
    }
    try {
      return JSON.stringify(error);
    } catch {
      // ignore stringify failure
    }
  }
  return 'Erreur serveur inconnue';
}

export async function GET() {
  try {
    await forceSupabaseConnection(supabase);
    return NextResponse.json(await dashboardRead(supabase));
  } catch (error) {
    return NextResponse.json({ error: extractErrorMessage(error) }, { status: 500 });
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
    return NextResponse.json({ error: extractErrorMessage(error) }, { status: 500 });
  }
}