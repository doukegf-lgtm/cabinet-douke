import { NextRequest, NextResponse } from 'next/server'
import {
  fallbackResponse,
  prepareConversation,
  type AstaContext,
  type ConversationMessage
} from '@/lib/asta/conversation-engine'
import { geminiAstaProvider } from '@/lib/asta/ai/gemini'

export const runtime = 'nodejs'

interface RequestBody {
  message?: string
  history?: ConversationMessage[]
  context?: AstaContext
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody

    if (!body || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'Message ASTA invalide.' },
        { status: 400 }
      )
    }

    const prepared = prepareConversation({
      message: body.message,
      history: body.history,
      context: body.context
    })

    /*
     * Le moteur de conversation reste utilisable même sans fournisseur IA.
     * En production, Gemini est utilisé lorsque GEMINI_API_KEY est disponible.
     */
    if (!process.env.GEMINI_API_KEY) {
      const fallback = fallbackResponse(
        body.message,
        body.context
      )

      return NextResponse.json({
        ...fallback,
        provider: 'fallback'
      })
    }

    try {
      const result = await geminiAstaProvider.complete({
        systemPrompt: prepared.systemPrompt,
        messages: prepared.messages,
        context: body.context
      })

      return NextResponse.json({
        reply: result.text,
        intent: prepared.intent,
        requiresValidation: false,
        provider: result.provider,
        model: result.model
      })
    } catch (aiError) {
      console.error('ASTA AI provider error:', aiError)

      const fallback = fallbackResponse(
        body.message,
        body.context
      )

      return NextResponse.json({
        ...fallback,
        provider: 'fallback'
      })
    }
  } catch (error) {
    console.error('ASTA conversation error:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erreur ASTA.'
      },
      { status: 400 }
    )
  }
}
