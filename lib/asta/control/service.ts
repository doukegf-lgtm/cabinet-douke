import { getServiceClient } from '@/lib/platform/supabase-server'

export type AstaActionState =
  | 'propose'
  | 'a_valider'
  | 'autorise'
  | 'execute'
  | 'refuse'
  | 'annule'
  | 'echec'

export async function getAstaControlSummary() {
  const supabase = getServiceClient()

  const [
    actionsResult,
    pendingResult,
    memoryResult,
    eventsResult
  ] = await Promise.all([
    supabase
      .from('asta_actions')
      .select('id,state,priority,type,title,created_at,executed_at')
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('asta_actions')
      .select('id,state,priority,type,title,created_at')
      .in('state', ['propose', 'a_valider', 'autorise'])
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('asta_memory')
      .select('id,scope,memory_type,content,importance,created_at')
      .eq('active', true)
      .order('importance', { ascending: false })
      .limit(20),

    supabase
      .from('asta_events')
      .select('id,type,payload,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
  ])

  if (actionsResult.error) {
    throw new Error(actionsResult.error.message)
  }

  if (pendingResult.error) {
    throw new Error(pendingResult.error.message)
  }

  if (memoryResult.error) {
    throw new Error(memoryResult.error.message)
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message)
  }

  return {
    actions: actionsResult.data ?? [],
    pendingActions: pendingResult.data ?? [],
    memory: memoryResult.data ?? [],
    events: eventsResult.data ?? []
  }
}
