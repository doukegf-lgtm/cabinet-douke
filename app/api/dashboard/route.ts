import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TABLES = ['auth_accounts', 'collaborators', 'objectives', 'activities', 'realisations', 'remarques'] as const;

type TableName = (typeof TABLES)[number];

function isTableName(value: unknown): value is TableName {
  return typeof value === 'string' && TABLES.includes(value as TableName);
}

export async function GET() {
  try {
    const [authAccounts, collaborators, objectives, activities, realisations, remarques] = await Promise.all([
      supabase.from('auth_accounts').select('*').order('created_at', { ascending: true }),
      supabase.from('collaborators').select('*').order('created_at', { ascending: true }),
      supabase.from('objectives').select('*').order('created_at', { ascending: false }),
      supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('realisations').select('*').order('date', { ascending: false }),
      supabase.from('remarques').select('*').order('date', { ascending: false }),
    ]);

    return NextResponse.json({
      auth_accounts: authAccounts.data ?? [],
      collaborators: collaborators.data ?? [],
      objectives: objectives.data ?? [],
      activities: activities.data ?? [],
      realisations: realisations.data ?? [],
      remarques: remarques.data ?? [],
      errors: [authAccounts.error, collaborators.error, objectives.error, activities.error, realisations.error, remarques.error].filter(Boolean),
    });
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
      const { data: inserted, error } = await supabase.from(table).insert(data).select('*').single();
      if (error) return NextResponse.json({ error: error.message, details: error.details, code: error.code }, { status: 400 });
      return NextResponse.json({ data: inserted });
    }

    if (action === 'update') {
      const { data: updated, error } = await supabase.from(table).update(data).eq('id', id).select('*').single();
      if (error) return NextResponse.json({ error: error.message, details: error.details, code: error.code }, { status: 400 });
      return NextResponse.json({ data: updated });
    }

    if (action === 'delete') {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message, details: error.details, code: error.code }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
