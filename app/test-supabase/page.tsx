'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function TestSupabase() {
  useEffect(() => {
    const test = async () => {
      const { data, error } = await supabase.from('organizations').select('*')

      console.log('DATA:', data)
      console.log('ERROR:', error)
    }

    test()
  }, [])

  return <div>Test Supabase en cours... regarde la console</div>
}
