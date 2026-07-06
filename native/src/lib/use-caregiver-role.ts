import { useEffect, useState } from 'react'
import { useAuth } from './auth-context'
import { supabase } from './supabase'

// ═══════════════════════════════════════════════════════════
// useCaregiverRole — einfache Rollen-Prüfung für den neuen
// Einsatz-Bereich (Betreuungskraft-Features). Kein generisches
// Rollen-System: nur das, was der Einsatz-Tab + die Screens
// darunter brauchen.
// ═══════════════════════════════════════════════════════════

const ALLOWED_ROLES = ['betreuungskraft', 'admin', 'superadmin']

interface CaregiverRoleState {
  loading: boolean
  allowed: boolean
  caregiverId: string | null
}

export function useCaregiverRole(): CaregiverRoleState {
  const { session, loading: authLoading } = useAuth()
  const [state, setState] = useState<CaregiverRoleState>({
    loading: true,
    allowed: false,
    caregiverId: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (authLoading) return
      if (!session) {
        if (!cancelled) setState({ loading: false, allowed: false, caregiverId: null })
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      const allowed = !!profile && ALLOWED_ROLES.includes(profile.role)

      if (!allowed) {
        if (!cancelled) setState({ loading: false, allowed: false, caregiverId: null })
        return
      }

      const { data: caregiver } = await supabase
        .from('caregivers')
        .select('id')
        .eq('user_id', session.user.id)
        .single()

      if (!cancelled) {
        setState({ loading: false, allowed: true, caregiverId: caregiver?.id ?? null })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [session, authLoading])

  return state
}
