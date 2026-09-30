'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  Brain,
  CheckCircle2,
  Clock3,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Target
} from 'lucide-react'

type Message = {
  role: 'assistant' | 'user'
  content: string
}

type Action = {
  id: string
  state: string
  priority: string
  type: string
  title: string
  created_at: string
}

type ControlData = {
  actions: Action[]
  pendingActions: Action[]
  memory: {
    id: string
    scope: string
    memory_type: string
    content: string
    importance: number
    created_at: string
  }[]
  events: {
    id: number
    type: string
    payload: Record<string, unknown>
    created_at: string
  }[]
}

const initialMessage: Message = {
  role: 'assistant',
  content:
    'Bonjour. Je suis ASTA, l’employée numérique de DOUKE Growth & Funding. Je peux vous accompagner sur le pilotage de croissance, la structuration et la mobilisation de financements.'
}

export default function AstaPage() {
  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [control, setControl] = useState<ControlData | null>(null)

  async function loadControl() {
    try {
      const response = await fetch('/api/asta/control', {
        cache: 'no-store'
      })

      if (!response.ok) return

      const data = await response.json()
      setControl(data)
    } catch {
      // Le centre de contrôle reste utilisable même si les données
      // opérationnelles ne sont momentanément pas disponibles.
    }
  }

  useEffect(() => {
    loadControl()
  }, [])

  async function sendMessage() {
    const message = input.trim()

    if (!message || loading) return

    setInput('')
    setMessages((current) => [
      ...current,
      { role: 'user', content: message }
    ])
    setLoading(true)

    try {
      const response = await fetch('/api/asta/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          history: messages
        })
      })

      const data = await response.json()

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            data.reply ||
            'Je n’ai pas pu traiter cette demande.'
        }
      ])
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            'Une erreur technique est survenue. La demande n’a pas été exécutée.'
        }
      ])
    } finally {
      setLoading(false)
      loadControl()
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f7f9fc',
        padding: '32px'
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto'
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 20,
            marginBottom: 28
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 8
              }}
            >
              <Brain size={30} />
              <h1 style={{ margin: 0 }}>ASTA</h1>
            </div>

            <p style={{ margin: 0, color: '#667085' }}>
              Employée numérique de DOUKE Growth & Funding
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#fff',
              border: '1px solid #e4e7ec',
              borderRadius: 10
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#12b76a'
              }}
            />
            Système opérationnel
          </div>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 24
          }}
        >
          <StatCard
            icon={<Activity size={20} />}
            label="État"
            value="OPÉRATIONNEL"
          />

          <StatCard
            icon={<Target size={20} />}
            label="Mission"
            value="Croissance"
          />

          <StatCard
            icon={<Clock3 size={20} />}
            label="Actions à traiter"
            value={String(control?.pendingActions?.length ?? 0)}
          />

          <StatCard
            icon={<ShieldCheck size={20} />}
            label="Autonomie"
            value="Sous contrôle"
          />
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(0, 1.7fr) minmax(300px, 1fr)',
            gap: 20
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid #e4e7ec',
              borderRadius: 14,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: 20,
                borderBottom: '1px solid #eaecf0',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <MessageCircle size={21} />
              <strong>Conversation avec ASTA</strong>
            </div>

            <div
              style={{
                minHeight: 430,
                maxHeight: 520,
                overflowY: 'auto',
                padding: 20
              }}
            >
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent:
                      message.role === 'user'
                        ? 'flex-end'
                        : 'flex-start',
                    marginBottom: 14
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '12px 15px',
                      borderRadius: 12,
                      background:
                        message.role === 'user'
                          ? '#172033'
                          : '#f2f4f7',
                      color:
                        message.role === 'user'
                          ? '#fff'
                          : '#172033',
                      lineHeight: 1.5
                    }}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div
                  style={{
                    color: '#667085',
                    fontSize: 14
                  }}
                >
                  ASTA analyse votre demande…
                </div>
              )}
            </div>

            <div
              style={{
                padding: 16,
                borderTop: '1px solid #eaecf0',
                display: 'flex',
                gap: 10
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    sendMessage()
                  }
                }}
                placeholder="Écrivez à ASTA…"
                style={{
                  flex: 1,
                  border: '1px solid #d0d5dd',
                  borderRadius: 10,
                  padding: '12px 14px',
                  outline: 'none'
                }}
              />

              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  border: 0,
                  borderRadius: 10,
                  padding: '0 20px',
                  background: '#172033',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Envoyer
              </button>
            </div>
          </div>

          <aside
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20
            }}
          >
            <Panel title="Autonomie ASTA">
              <StatusRow
                icon={<Brain size={18} />}
                label="Observer"
                state="ACTIF"
              />
              <StatusRow
                icon={<Activity size={18} />}
                label="Analyser"
                state="ACTIF"
              />
              <StatusRow
                icon={<Target size={18} />}
                label="Proposer"
                state="ACTIF"
              />
              <StatusRow
                icon={<ShieldCheck size={18} />}
                label="Validation"
                state="REQUISE"
              />
              <StatusRow
                icon={<PlayCircle size={18} />}
                label="Exécution"
                state="CONTRÔLÉE"
              />
            </Panel>

            <Panel title="Missions ASTA">
              <Mission
                title="100 diagnostics DOUKE"
                status="Mission prioritaire"
              />
              <Mission
                title="Formation du 20 octobre"
                status="Mission indépendante"
              />
            </Panel>

            <Panel title="Actions récentes">
              {control?.actions?.length ? (
                control.actions.slice(0, 5).map((action) => (
                  <div
                    key={action.id}
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid #f2f4f7'
                    }}
                  >
                    <strong
                      style={{
                        display: 'block',
                        fontSize: 14
                      }}
                    >
                      {action.title}
                    </strong>

                    <span
                      style={{
                        color: '#667085',
                        fontSize: 12
                      }}
                    >
                      {action.state}
                    </span>
                  </div>
                ))
              ) : (
                <p
                  style={{
                    margin: 0,
                    color: '#667085',
                    fontSize: 14
                  }}
                >
                  Aucune action enregistrée pour le moment.
                </p>
              )}
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  )
}

function StatCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e4e7ec',
        borderRadius: 14,
        padding: 18
      }}
    >
      <div style={{ marginBottom: 12 }}>{icon}</div>
      <div
        style={{
          fontSize: 12,
          color: '#667085',
          marginBottom: 4
        }}
      >
        {label}
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function Panel({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e4e7ec',
        borderRadius: 14,
        padding: 18
      }}
    >
      <h2
        style={{
          margin: '0 0 15px',
          fontSize: 16
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  )
}

function StatusRow({
  icon,
  label,
  state
}: {
  icon: React.ReactNode
  label: string
  state: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '9px 0'
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        {icon}
        {label}
      </span>

      <small>{state}</small>
    </div>
  )
}

function Mission({
  title,
  status
}: {
  title: string
  status: string
}) {
  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: '1px solid #f2f4f7'
      }}
    >
      <strong
        style={{
          display: 'block',
          fontSize: 14
        }}
      >
        {title}
      </strong>

      <span
        style={{
          color: '#667085',
          fontSize: 12
        }}
      >
        {status}
      </span>
    </div>
  )
}
