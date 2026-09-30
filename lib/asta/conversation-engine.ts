import { ASTA_PROFILE } from './profile'

export type ConversationRole = 'system' | 'user' | 'assistant'

export interface ConversationMessage {
  role: ConversationRole
  content: string
  createdAt?: string
}

export interface AstaContext {
  prospect?: {
    fullName?: string
    country?: string
    sector?: string
    companyAge?: string
  }

  diagnostic?: {
    total?: number
    band?: string
    scores?: Record<string, number>
  }

  currentGoal?: string

  authorizedActions?: string[]

  autonomyState?: string
}

export interface ConversationInput {
  message: string
  history?: ConversationMessage[]
  context?: AstaContext
}

export interface ConversationOutput {
  reply: string
  intent: string
  requiresValidation: boolean
  proposedAction?: string
}

const MAX_HISTORY = 12
const MAX_MESSAGE_LENGTH = 4000

function clean(value: string): string {
  return value.trim().slice(0, MAX_MESSAGE_LENGTH)
}

function detectIntent(message: string): string {
  const text = message.toLowerCase()

  if (
    text.includes('financement') ||
    text.includes('financer') ||
    text.includes('fonds') ||
    text.includes('crédit') ||
    text.includes('investisseur')
  ) {
    return 'financement'
  }

  if (
    text.includes('croissance') ||
    text.includes('développer') ||
    text.includes('développement') ||
    text.includes('chiffre')
  ) {
    return 'croissance'
  }

  if (
    text.includes('diagnostic') ||
    text.includes('score') ||
    text.includes('dgi')
  ) {
    return 'diagnostic'
  }

  if (
    text.includes('rendez-vous') ||
    text.includes('rendez vous') ||
    text.includes('appel')
  ) {
    return 'rendez_vous'
  }

  if (
    text.includes('bonjour') ||
    text.includes('bonsoir') ||
    text.includes('salut')
  ) {
    return 'salutation'
  }

  return 'general'
}

export function buildSystemPrompt(context: AstaContext = {}): string {
  const contextLines = [
    `Nom : ${context.prospect?.fullName ?? 'non communiqué'}`,
    `Pays : ${context.prospect?.country ?? 'non communiqué'}`,
    `Secteur : ${context.prospect?.sector ?? 'non communiqué'}`,
    `Ancienneté : ${context.prospect?.companyAge ?? 'non communiquée'}`,
    `DGI : ${context.diagnostic?.total ?? 'non calculé'}`,
    `Bande : ${context.diagnostic?.band ?? 'non calculée'}`,
    `Objectif courant : ${context.currentGoal ?? 'non défini'}`,
    `État d'autonomie : ${context.autonomyState ?? 'PROPOSÉ'}`
  ]

  return [
    `Tu es ${ASTA_PROFILE.name}, ${ASTA_PROFILE.role} de ${ASTA_PROFILE.organization}.`,
    ASTA_PROFILE.mission,
    '',
    'Règles impératives :',
    ...ASTA_PROFILE.principles.map((item) => `- ${item}`),
    '',
    'Contexte disponible :',
    ...contextLines.map((item) => `- ${item}`)
  ].join('\n')
}

export function prepareConversation(
  input: ConversationInput
): {
  systemPrompt: string
  messages: ConversationMessage[]
  intent: string
} {
  const message = clean(input.message)

  if (!message) {
    throw new Error('Le message ASTA ne peut pas être vide.')
  }

  const history = (input.history ?? [])
    .filter(
      (item) =>
        item &&
        (item.role === 'system' ||
          item.role === 'user' ||
          item.role === 'assistant') &&
        typeof item.content === 'string'
    )
    .slice(-MAX_HISTORY)

  return {
    systemPrompt: buildSystemPrompt(input.context),
    messages: [
      ...history,
      {
        role: 'user',
        content: message,
        createdAt: new Date().toISOString()
      }
    ],
    intent: detectIntent(message)
  }
}

export function fallbackResponse(
  message: string,
  context: AstaContext = {}
): ConversationOutput {
  const intent = detectIntent(message)

  if (intent === 'salutation') {
    return {
      reply:
        'Bonjour. Je suis ASTA, l’employée numérique de DOUKE Growth & Funding. Dites-moi ce que vous cherchez à résoudre et nous pouvons commencer par clarifier le besoin.',
      intent,
      requiresValidation: false
    }
  }

  if (intent === 'diagnostic') {
    return {
      reply:
        'Je peux vous accompagner sur votre diagnostic de croissance. Le score DGI est calculé à partir des réponses du diagnostic DOUKE ; je ne l’invente pas.',
      intent,
      requiresValidation: false
    }
  }

  if (intent === 'financement') {
    return {
      reply:
        'Je peux vous aider à structurer votre besoin de financement : montant, objet, capacité de remboursement ou de retour, preuves d’activité et préparation du dossier. Pour une recommandation précise, il me faudra les informations disponibles sur votre entreprise.',
      intent,
      requiresValidation: false
    }
  }

  if (intent === 'rendez_vous') {
    return {
      reply:
        'Je peux préparer une proposition de rendez-vous, mais la prise de rendez-vous constitue une action distincte et doit être explicitement autorisée avant exécution.',
      intent,
      requiresValidation: true,
      proposedAction: 'préparer une demande de rendez-vous'
    }
  }

  const scoreText =
    context.diagnostic?.total !== undefined
      ? ` Votre DGI actuellement disponible est de ${context.diagnostic.total}/100.`
      : ''

  return {
    reply:
      `Je comprends votre demande. Je peux vous aider à la structurer en distinguant le problème, les données disponibles et la prochaine action utile.${scoreText}`,
    intent,
    requiresValidation: false
  }
}
