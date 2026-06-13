import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, dashboardRead, dashboardWrite, WritePayload } from '@/app/supabaseClient';

export async function GET() {
  try {
    const client = createServerSupabaseClient();
    const data = await dashboardRead(client);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, table, data, id } = body as {
      action: string;
      table: string;
      data?: WritePayload;
      id?: string;
    };
    if (!action || !table) {
      return NextResponse.json({ error: 'action et table sont requis' }, { status: 400 });
    }
    const client = createServerSupabaseClient();
    const result = await dashboardWrite(client, action, table, data, id);
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
