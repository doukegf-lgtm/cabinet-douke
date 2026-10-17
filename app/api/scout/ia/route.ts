import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/platform/auth'
import { hit } from '@/lib/platform/ratelimit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const a = await requireUser(); if (!a.ok) return a.response
  if (!hit(`ia:${a.session.sub}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Limite horaire atteinte (60 requêtes)' }, { status: 429 })
  }
  try {
    const { system, prompt, grounded } = await req.json()
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
          ...(grounded === true ? { tools: [{ google_search: {} }] } : { generationConfig: { responseMimeType: 'application/json' } }),
        }),
      }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Erreur Gemini' }, { status: res.status })
    const parts = data?.candidates?.[0]?.content?.parts
    const text = grounded === true && Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p?.text || '').join('')
      : parts?.[0]?.text
    if (!text) return NextResponse.json({ error: 'Reponse Gemini vide ou bloquee' }, { status: 502 })
    const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks
    const sources = grounded === true && Array.isArray(chunks)
      ? chunks
          .map((c: { web?: { uri?: string; title?: string } }) => ({ uri: c?.web?.uri || '', title: c?.web?.title || '' }))
          .filter((s: { uri: string }) => s.uri)
      : []
    return NextResponse.json(grounded === true ? { text, sources } : { text })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
