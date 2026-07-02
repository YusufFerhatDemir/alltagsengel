import { API_BASE } from '../constants/config'

// Formular-Anfragen laufen über die bestehenden Next.js-API-Routes
// der Web-App (Spam-Schutz, Validierung und Benachrichtigung inklusive).

export interface LeadInquiry {
  name: string
  phone: string
  plz: string
  service?: string
  message?: string
  source: string
}

export async function sendLeadInquiry(lead: LeadInquiry): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/lead-inquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, website: '', utm_source: 'ios-app' }),
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => null)
    return { ok: false, error: data?.error }
  } catch {
    return { ok: false }
  }
}

export interface KontaktMessage {
  name: string
  email: string
  phone?: string
  message: string
  type: 'kunde' | 'engel'
}

export async function sendKontakt(msg: KontaktMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/kontakt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => null)
    return { ok: false, error: data?.error }
  } catch {
    return { ok: false }
  }
}
