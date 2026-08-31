#!/usr/bin/env node
/** Fragt die Zustellstatus der Test-Alarme beim Provider ab. Kein Schluessel in der Ausgabe. */
import fs from 'node:fs'
import { envWert } from './lib/supabase-keys.mjs'
const KEY = envWert('RESEND_API_KEY')
if (!KEY) { console.error('RESEND_API_KEY fehlt'); process.exit(1) }
const IDS = [
  { id: '13307e4c-46da-4eb3-8584-48679557738e', bezug: 'cf56c43b (Test-Alarm 13:44)' },
  { id: '02eebce1-f0ce-42c0-a862-de60c50de412', bezug: '9ec3e6dc (Kettenlauf 06:01)' },
]
const raus = []
for (const { id, bezug } of IDS) {
  const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${KEY}` } })
  const j = await res.json().catch(() => null)
  const eintrag = {
    bezug, provider_message_id: id, http: res.status,
    last_event: j?.last_event, to: j?.to, from: j?.from, subject: j?.subject,
    created_at: j?.created_at, roh: j,
  }
  raus.push(eintrag)
  console.log(`HTTP ${res.status}  ${id}  last_event=${j?.last_event ?? '-'}  to=${(j?.to ?? []).join(',')}  ${j?.created_at ?? ''}`)
  console.log(`        Betreff: ${j?.subject ?? '-'}`)
}
fs.writeFileSync('docs/security/belege/roh/08_resend.json', JSON.stringify(raus, null, 2))
