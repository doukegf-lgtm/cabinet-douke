import type { AstaContext, ConversationMessage } from '../conversation-engine'

export interface AICompletionInput {
  systemPrompt: string
  messages: ConversationMessage[]
  context?: AstaContext
  temperature?: number
  maxTokens?: number
}

export interface AICompletionOutput {
  text: string
  provider: string
  model: string
}

export interface AIAssistantProvider {
  readonly name: string
  complete(input: AICompletionInput): Promise<AICompletionOutput>
}
