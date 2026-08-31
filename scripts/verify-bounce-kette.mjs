#!/usr/bin/env node
/**
 * Bounce- und Beschwerdeverarbeitung: laeuft sie ueberhaupt?
 *
 * WARUM DIESE PRUEFUNG
 * Der Code fuer Bounce/Complaint steht seit Wochen im Repo — fuer
 * Kampagnen, und seit dem 31.08.2026 auch fuer Transaktionspost
 * (lib/notifications/zustellrueckmeldung.ts). Vorhandener Code ist aber
 * kein laufender Weg: die Kette haengt an VIER Voraussetzungen, und
 * faellt eine aus, passiert schlicht nichts. Still. Genau so war es am
 * 31.08.2026 — bei Resend war KEIN Webhook eingetragen, und in der
 * Produktion fehlte das Signaturgeheimnis. Es ist also nie eine einzige
 * Rueckmeldung verarbeitet worden.
 *
 * Die vier Voraussetzungen:
 *   1. Bei Resend ist ein Webhook auf unsere Route eingetragen.
 *   2. Er ist aktiv und hoert auf die Bounce-/Beschwerde-Ereignisse.
 *   3. In der Produktion steht RESEND_WEBHOOK_SECRET (sonst 503).
 *   4. Es gibt Zustellzeilen mit Provider-Nachrichten-ID — ohne sie
 *      laesst sich keine Rueckmeldung zuordnen.
 *
 * NUR LESEND. Der Aufruf gegen die eigene Route schickt bewusst eine
 * ungueltige Signatur: die Antwort unterscheidet 503 (kein Geheimnis)
 * von 401 (Geheimnis vorhanden, Signatur falsch) — mehr wird nicht
 * gebraucht, und geschrieben wird nichts.
 *
 * Aufruf: npm run verify:bounce-kette
 */
import { apiHeaders, secretKey, envWert } from './lib/supabase-keys.mjs'

const BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const KEY = secretKey()
const RESEND = envWert('RESEND_API_KEY')
const SEITE = process.env.SEITE_BASIS || 'https://alltagsengel.care'
const ROUTE = '/api/marketing/resend-webhook'

const ergebnisse = []
function pruefe(id, bestanden, meldung) {
  ergebnisse.push({ id, bestanden })
  console.log(`  ${bestanden ? ' OK ' : 'OFFEN'}  ${id.padEnd(28)} ${meldung}`)
}

console.log('\n═══ Bounce-/Beschwerdeverarbeitung — laeuft sie? ═══\n')

// ── 1+2 · Webhook bei Resend ────────────────────────────────────────────
let webhooks = []
if (!RESEND) {
  pruefe('B1 Webhook eingetragen', false, 'RESEND_API_KEY fehlt lokal — nicht pruefbar')
} else {
  const res = await fetch('https://api.resend.com/webhooks', {
    headers: { Authorization: `Bearer ${RESEND}` },
  })
  if (!res.ok) {
    pruefe('B1 Webhook eingetragen', false, `Resend antwortet HTTP ${res.status}`)
  } else {
    webhooks = (await res.json()).data ?? []
    const unserer = webhooks.find(w => String(w.endpoint || w.url || '').includes(ROUTE))
    pruefe('B1 Webhook eingetragen', !!unserer,
      unserer
        ? `${unserer.endpoint || unserer.url}`
        : `KEIN Webhook auf ${ROUTE} (${webhooks.length} insgesamt eingetragen)`)

    const NOETIG = ['email.delivered', 'email.bounced', 'email.complained']
    const events = unserer?.events ?? []
    const fehlend = NOETIG.filter(e => !events.includes(e))
    pruefe('B2 Ereignisse abonniert', !!unserer && fehlend.length === 0,
      !unserer ? 'ohne Webhook nicht pruefbar'
        : fehlend.length ? `fehlt: ${fehlend.join(', ')}`
        : NOETIG.join(', '))
  }
}

// ── 3 · Signaturgeheimnis in der Produktion ─────────────────────────────
{
  const res = await fetch(SEITE + ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email.bounced' }),
    redirect: 'follow',
  })
  // 503 = die Route sagt selbst „nicht konfiguriert".
  // 401 = Geheimnis vorhanden, unsere Testsignatur ist erwartungsgemaess falsch.
  pruefe('B3 Signaturgeheimnis live', res.status === 401,
    res.status === 503 ? 'RESEND_WEBHOOK_SECRET fehlt in der Produktion (HTTP 503)'
      : res.status === 401 ? 'gesetzt (HTTP 401 auf ungueltige Signatur — richtig)'
      : `unerwartet: HTTP ${res.status}`)
}

// ── 4 · Zuordenbare Zustellzeilen ───────────────────────────────────────
if (!BASIS || !KEY) {
  pruefe('B4 Zuordenbare Zeilen', false, 'Supabase-Zugang fehlt')
} else {
  const res = await fetch(
    `${BASIS}/rest/v1/notification_delivery_log`
    + '?select=id,vorgang_art,status&provider_message_id=not.is.null&limit=200',
    { headers: apiHeaders(KEY) },
  )
  const zeilen = res.ok ? await res.json() : []
  const nachArt = {}
  for (const z of zeilen) nachArt[z.vorgang_art ?? '(ohne)'] = (nachArt[z.vorgang_art ?? '(ohne)'] ?? 0) + 1
  pruefe('B4 Zuordenbare Zeilen', zeilen.length > 0,
    zeilen.length
      ? `${zeilen.length} mit Provider-ID — ${Object.entries(nachArt).map(([a, n]) => `${a}: ${n}`).join(', ')}`
      : 'KEINE Zustellzeile traegt eine Provider-Nachrichten-ID')

  const gescheitert = zeilen.filter(z => z.status === 'failed')
  console.log(`\n  Davon als gescheitert vermerkt: ${gescheitert.length}`)
}

const offen = ergebnisse.filter(e => !e.bestanden)
console.log('\n═══════════════════════════════════════════════════')
if (offen.length === 0) {
  console.log(' Die Kette laeuft. Rueckmeldungen werden verarbeitet.')
} else {
  console.log(` ${offen.length} von ${ergebnisse.length} Voraussetzungen OFFEN.`)
  console.log(' Solange auch nur eine fehlt, wird KEINE einzige Rueckmeldung')
  console.log(' verarbeitet — still, ohne Fehlermeldung. Ein Hard Bounce auf')
  console.log(' eine Sicherheitsmeldung bliebe unbemerkt.')
  console.log('')
  console.log(' Zwei Schritte, beide nur ueber die Oberflaeche:')
  console.log(`   1. Resend → Webhooks → Endpoint ${SEITE}${ROUTE}`)
  console.log('      Ereignisse: email.delivered, email.bounced, email.complained')
  console.log('      (email.sent und email.failed sinnvoll, nicht noetig)')
  console.log('   2. Das dort erzeugte Signing Secret als RESEND_WEBHOOK_SECRET')
  console.log('      in Vercel hinterlegen (Production) und neu ausrollen.')
  console.log('')
  console.log(' Danach diesen Lauf wiederholen — er muss vier von vier melden.')
}
console.log('═══════════════════════════════════════════════════\n')
process.exit(offen.length === 0 ? 0 : 1)
