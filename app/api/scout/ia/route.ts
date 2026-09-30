import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/platform/auth'
import { hit } from '@/lib/platform/ratelimit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const a = await requireUser(); if (!a.ok) return a.response
  if (!hit(`ia:${a.session.sub}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Limite horaire atteinte (30 requêtes)' }, { status: 429 })
  }
  try {
    const { system, prompt } = await req.json()
    if (!system || !prompt) return NextResponse.json({ error: 'system et prompt sont requis' }, { status: 400 })
    if (String(system).length > 8000 || String(prompt).length > 8000) {
      return NextResponse.json({ error: 'Requête trop longue' }, { status: 413 })
    }
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY non configuree cote serveur' }, { status: 500 })

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Erreur Gemini' }, { status: res.status })
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return NextResponse.json({ error: 'Reponse Gemini vide ou bloquee' }, { status: 502 })
    return NextResponse.json({ text })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
