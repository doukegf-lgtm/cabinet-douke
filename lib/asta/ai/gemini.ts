import type {
  AIAssistantProvider,
  AICompletionInput,
  AICompletionOutput
} from './provider'

const DEFAULT_MODEL = 'gemini-2.5-flash'

interface GeminiPart {
  text?: string
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
  error?: {
    message?: string
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY

  if (!key) {
    throw new Error('GEMINI_API_KEY est absente.')
  }

  return key
}

function toGeminiRole(
  role: 'system' | 'user' | 'assistant'
): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user'
}

export class GeminiAstaProvider implements AIAssistantProvider {
  readonly name = 'gemini'

  private readonly model: string

  constructor(model = process.env.ASTA_GEMINI_MODEL || DEFAULT_MODEL) {
    this.model = model
  }

  async complete(
    input: AICompletionInput
  ): Promise<AICompletionOutput> {
    const apiKey = getApiKey()

    const contents: GeminiContent[] = input.messages.map((message) => ({
      role: toGeminiRole(message.role),
      parts: [{ text: message.content }]
    }))

    const body = {
      system_instruction: {
        parts: [{ text: input.systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.3,
        maxOutputTokens: input.maxTokens ?? 800
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        cache: 'no-store'
      }
    )

    const data = (await response.json()) as GeminiResponse

    if (!response.ok) {
      throw new Error(
        data.error?.message ||
          `Gemini a répondu avec le statut ${response.status}.`
      )
    }

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || ''

    if (!text) {
      throw new Error('Gemini a retourné une réponse vide.')
    }

    return {
      text,
      provider: this.name,
      model: this.model
    }
  }
}

export const geminiAstaProvider = new GeminiAstaProvider()
