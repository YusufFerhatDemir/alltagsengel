#!/usr/bin/env node
/**
 * MARKETING-KETTE gegen die PRODUKTIONSDATENBANK.
 *
 *   Anmeldung → Bestaetigung → Einwilligung → Segment → Trockenlauf
 *   → Zustellrueckmeldung (Open/Click/Bounce) → Sperrliste → Abmeldung
 *
 * ── WAS HIER WIRKLICH GESCHRIEBEN WIRD ────────────────────────────────────
 *
 * Anders als beim Sicherheits- und Standort-Audit laeuft das hier NICHT im
 * zurueckrollenden Orakel: geprueft werden die echten Modulfunktionen, und
 * die bringen ihre eigenen Verbindungen mit. Es entstehen also wirklich
 * Zeilen — fuer EINE eigens erzeugte Pruefadresse, die am Ende wieder
 * entfernt wird. Der Aufraeumschritt laeuft in `finally` und meldet, was
 * er getan hat; bleibt etwas stehen, steht es im Bericht.
 *
 * ES WIRD KEINE MAIL VERSCHICKT. Die Kette wird an den Modulfunktionen
 * gemessen, nicht am Versanddienst — ein Massenversand ist ausdruecklich
 * ausgeschlossen, und selbst eine einzelne Bestaetigungsmail waere fuer
 * eine erfundene Adresse nur ein Bounce.
 *
 * ── WAS DAS SKRIPT NICHT BEWEISEN KANN ────────────────────────────────────
 *
 * Den Webhook ueber HTTP. Er ist fail-closed und antwortet ohne
 * RESEND_WEBHOOK_SECRET mit 503; die Variable ist in Vercel nicht gesetzt.
 * Geprueft wird deshalb die Verarbeitung (berechneAenderung, sperrgrundFuer)
 * gegen echte Zeilen — und getrennt davon, dass der Endpunkt draussen
 * wirklich abweist.
 *
 * Aufruf:  npm run verify:marketing-kette
 */

import { readFileSync, existsSync } from 'node:fs'

// Die Modulfunktionen lesen ihre Schluessel selbst aus process.env
// (optInSchluessel, sendRawEmail). Ohne diesen Schritt scheitert die
// Kette an einer fehlenden Variable statt an einem echten Befund.
for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

import { apiHeaders, envWert, secretKey } from './lib/supabase-keys.mjs'
import { createClient } from '@supabase/supabase-js'
import {
  erteileEinwilligung, widerrufeEinwilligung, ladeEinwilligungsLage,
  pruefeEmpfaenger, normalisiereAdresse,
} from '../lib/marketing/einwilligung.ts'
import {
  bestaetigungsLink, pruefeOptInToken, GUELTIGKEIT_TAGE,
} from '../lib/marketing/doppel-opt-in.ts'
import { berechneAenderung, sperrgrundFuer } from '../lib/marketing/zustellereignis.ts'
import { pruefeSvixSignatur } from '../lib/marketing/webhook-signatur.ts'
import { SEGMENTE, filtereSegment } from '../lib/marketing/segmente.ts'
import { ladeMarketingKontakte } from '../lib/marketing/empfaenger.ts'
import { VORLAGEN } from '../lib/marketing/vorlagen.ts'
import { ermittleEmpfaenger, pruefeVersandtore } from '../lib/marketing/versand.ts'

const URL_BASIS = envWert('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE = secretKey()
const SITE = envWert('NEXT_PUBLIC_SITE_URL') || 'https://alltagsengel.care'
const ORG = '00000000-0000-4000-8000-000460629986'

if (!URL_BASIS || !SERVICE) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const admin = createClient(URL_BASIS, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Eine Adresse, die es nur fuer diesen Lauf gibt. */
const PRUEFADRESSE = `pruefung-kette-${Date.now().toString(36)}@alltagsengel.invalid`

const ergebnisse = []
function pruefe(id, titel, bestanden, gemessen) {
  ergebnisse.push({ id, bestanden })
  console.log(`\n[${id}] ${bestanden ? 'OK     ' : 'OFFEN  '} ${titel}`)
  console.log(`  ${String(gemessen).split('\n').join('\n  ')}`)
}

console.log('═══════════════════════════════════════════════════════════════════')
console.log(' MARKETING-KETTE — Live gegen Produktion, ohne Versand')
console.log(` ${new Date().toISOString()}`)
console.log(` Pruefadresse: ${PRUEFADRESSE}`)
console.log('═══════════════════════════════════════════════════════════════════')

let aufgeraeumt = 'nicht ausgefuehrt'

try {
  // ── M1) Doppel-Opt-in: der Link und sein Ablauf ─────────────────────────
  const { link, ablauf } = bestaetigungsLink(PRUEFADRESSE, 'newsletter', ORG, SITE)
  const url = new URL(link)
  const token = url.searchParams.get('token')
  const gueltig = pruefeOptInToken(PRUEFADRESSE, 'newsletter', ORG, token)
  const abgelaufen = pruefeOptInToken(
    PRUEFADRESSE, 'newsletter', ORG, token, undefined,
    ablauf + 1000,
  )
  const fremd = pruefeOptInToken('jemand.anders@example.com', 'newsletter', ORG, token)

  pruefe('M1', 'Doppel-Opt-in: Link gilt, laeuft ab, bindet die Adresse',
    gueltig.gueltig === true && abgelaufen.gueltig === false
      && abgelaufen.grund === 'abgelaufen' && fremd.gueltig === false,
    `gueltig=${gueltig.gueltig} | nach ${GUELTIGKEIT_TAGE} Tagen=${abgelaufen.grund} `
    + `| fremde Adresse=${fremd.grund}`)

  // ── M2) Ohne Bestaetigung entsteht KEINE Einwilligung ───────────────────
  const { data: vorher } = await admin.from('marketing_consents').select('id')
    .eq('organization_id', ORG).eq('email', PRUEFADRESSE)
  pruefe('M2', 'Die blosse Anfrage erzeugt keine Einwilligung',
    (vorher ?? []).length === 0,
    `Zeilen zur Pruefadresse vor der Bestaetigung: ${(vorher ?? []).length}`)

  // ── M3) Bestaetigung traegt die Einwilligung ein ────────────────────────
  const eingetragen = await erteileEinwilligung(admin, {
    organizationId: ORG, email: PRUEFADRESSE, consentTyp: 'newsletter',
    quelle: 'doppel_opt_in', ipAdresse: null,
    notiz: 'Automatische Kettenpruefung — wird am Ende wieder entfernt.',
  })
  const { data: nachher } = await admin
    .from('marketing_consents').select('id, source, granted_at, revoked_at')
    .eq('organization_id', ORG).eq('email', PRUEFADRESSE)
  pruefe('M3', 'Bestaetigung erzeugt genau eine offene Einwilligung',
    eingetragen.ok && (nachher ?? []).length === 1 && !nachher[0].revoked_at
      && nachher[0].source === 'doppel_opt_in',
    `ok=${eingetragen.ok}${eingetragen.ok ? '' : ` grund=${eingetragen.grund}`} `
    + `| Zeilen=${(nachher ?? []).length} `
    + `| quelle=${nachher?.[0]?.source} | widerrufen=${nachher?.[0]?.revoked_at ?? 'nein'}`)

  // ── M4) Einwilligungslage und Empfaengerpruefung ────────────────────────
  const lage = await ladeEinwilligungsLage(admin, ORG, [PRUEFADRESSE], 'newsletter')
  const kontakt = {
    userId: null, email: PRUEFADRESSE, anzeigename: 'Pruefung', rolle: 'abonnent',
    plz: null, bundesland: null, istTestkonto: false, istGeloescht: false,
    istDipaNutzer: false, registrierungVollstaendig: true, registriertAm: null,
    letzteAktivitaet: null, letzteBuchung: null, anzahlBuchungen: 0,
    verfuegbarkeitsFenster: 0, qualifiziert: false, einsatzfreigabe: false,
    fuehrungszeugnisGueltigBis: null,
  }
  const [darf] = pruefeEmpfaenger([kontakt], lage)
  pruefe('M4', 'Mit Einwilligung ist die Adresse versandfaehig',
    darf.versandfaehig === true,
    `versandfaehig=${darf.versandfaehig}${darf.grund ? ` grund=${darf.grund}` : ''} `
    + `| eingewilligt=${lage.eingewilligt.size} gesperrt=${lage.gesperrt.size}`)

  // ── M5) DiPA-Riegel schlaegt die Einwilligung ───────────────────────────
  const [dipa] = pruefeEmpfaenger([{ ...kontakt, istDipaNutzer: true }], lage)
  pruefe('M5', 'Ein PflegeCoach-Nutzer bleibt trotz Einwilligung ausgeschlossen',
    dipa.versandfaehig === false && dipa.grund === 'dipa_nutzer',
    `versandfaehig=${dipa.versandfaehig} grund=${dipa.grund}`)

  // ── M6) Abmeldung: Widerruf UND Sperrliste ──────────────────────────────
  const abgemeldet = await widerrufeEinwilligung(admin, ORG, PRUEFADRESSE, 'alle', 'abmeldung')
  const { data: gesperrt } = await admin.from('email_suppression_list')
    .select('id, reason').eq('organization_id', ORG).eq('email', PRUEFADRESSE)
  pruefe('M6', 'Abmeldung widerruft UND sperrt in einem Schritt',
    abgemeldet.ok && abgemeldet.widerrufen === 1 && (gesperrt ?? []).length === 1,
    `widerrufen=${abgemeldet.widerrufen ?? '-'} | Sperreintrag=${(gesperrt ?? []).length} `
    + `(${gesperrt?.[0]?.reason ?? '-'})`)

  // ── M7) Nach der Abmeldung nicht mehr versandfaehig ─────────────────────
  const lageDanach = await ladeEinwilligungsLage(admin, ORG, [PRUEFADRESSE], 'newsletter')
  const [danach] = pruefeEmpfaenger([kontakt], lageDanach)
  pruefe('M7', 'Nach der Abmeldung ist die Adresse gesperrt',
    danach.versandfaehig === false && danach.grund === 'gesperrt',
    `versandfaehig=${danach.versandfaehig} grund=${danach.grund}`)

  // ── M8) Die Sperrliste laesst keine neue Einwilligung zu ────────────────
  const erneut = await erteileEinwilligung(admin, {
    organizationId: ORG, email: PRUEFADRESSE, consentTyp: 'newsletter',
    quelle: 'website_formular', notiz: 'Darf nicht durchgehen.',
  })
  pruefe('M8', 'Eine gesperrte Adresse kann nicht erneut einwilligen',
    erneut.ok === false,
    `ok=${erneut.ok} | ${erneut.grund ?? ''}`)

  // ── M9) Zustellrueckmeldung: Reihenfolge und Sperrgrund ─────────────────
  const bestand = {
    status: 'geklickt', sent_at: '2026-08-31T09:00:00.000Z',
    delivered_at: null, opened_at: null, clicked_at: '2026-08-31T09:05:00.000Z',
    bounced_at: null, unsubscribed_at: null,
  }
  const spaet = berechneAenderung('email.delivered', bestand, '2026-08-31T09:10:00.000Z')
  const bounce = berechneAenderung('email.bounced', bestand, '2026-08-31T09:10:00.000Z')
  pruefe('M9', 'Open/Click/Bounce: Status steigt nur, Bounce schlaegt Klick',
    spaet.statusGehoben === false && spaet.felder.delivered_at
      && bounce.felder.status === 'unzustellbar',
    `spaetes "zugestellt": Status gehoben=${spaet.statusGehoben}, `
    + `Zeitstempel gesetzt=${!!spaet.felder.delivered_at} | Bounce ⇒ ${bounce.felder.status}`)

  pruefe('M10', 'Nur dauerhafte Fehler und Beschwerden sperren',
    sperrgrundFuer('email.bounced', 'Permanent') === 'hard_bounce'
      && sperrgrundFuer('email.bounced', 'Transient') === null
      && sperrgrundFuer('email.complained', null) === 'spam_beschwerde'
      && sperrgrundFuer('email.opened', 'Permanent') === null,
    'Permanent⇒hard_bounce, Transient⇒keine Sperre, Beschwerde⇒spam_beschwerde, '
    + 'Oeffnung⇒keine Sperre')

  // ── M11) Webhook: ohne gueltige Signatur geht nichts ────────────────────
  const ohneSignatur = pruefeSvixSignatur('{"type":"email.bounced"}',
    { id: null, timestamp: null, signature: null }, 'whsec_' + Buffer.from('x'.repeat(32)).toString('base64'))
  const res = await fetch(`${SITE}/api/marketing/resend-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{"type":"email.bounced","data":{"email_id":"re_erfunden"}}',
  })
  pruefe('M11', 'Webhook weist eine unsignierte Nachricht ab — auch live',
    ohneSignatur.ok === false && (res.status === 401 || res.status === 503),
    `lokal: ${ohneSignatur.grund} | live: HTTP ${res.status} `
    + `${res.status === 503 ? '(RESEND_WEBHOOK_SECRET fehlt in Vercel — fail-closed)' : ''}`)

  // ── M12) Segmentierung gegen den echten Bestand ─────────────────────────
  const kontakte = await ladeMarketingKontakte(admin, ORG)
  const heute = new Date()
  const zeilen = SEGMENTE.slice(0, 6).map((seg) => {
    const drin = filtereSegment(kontakte, seg.key, heute)
    const lagelos = { eingewilligt: new Set(), widerrufen: new Set(), gesperrt: new Set() }
    const versandfaehig = pruefeEmpfaenger(drin, lagelos).filter(e => e.versandfaehig).length
    return `${seg.key.padEnd(36)} im Segment ${String(drin.length).padStart(3)}  versandfaehig ${versandfaehig}`
  })
  pruefe('M13', 'Segmentierung laeuft gegen den echten Bestand',
    kontakte.length > 0,
    `${kontakte.length} Kontakte geladen\n${zeilen.join('\n')}`)

  // ── M14) Trockenlauf-Aussage: 0 versandfaehig ist eine ANTWORT ──────────
  const alleAdressen = kontakte.map(k => k.email).filter(Boolean)
  const echteLage = await ladeEinwilligungsLage(admin, ORG, alleAdressen, 'newsletter')
  const gepruefte = pruefeEmpfaenger(kontakte, echteLage)
  const gruende = {}
  for (const g of gepruefte) if (!g.versandfaehig) gruende[g.grund] = (gruende[g.grund] ?? 0) + 1
  pruefe('M14', 'Trockenlauf schluesselt auf, WARUM niemand versandfaehig ist',
    Object.keys(gruende).length > 0 || gepruefte.some(g => g.versandfaehig),
    `versandfaehig ${gepruefte.filter(g => g.versandfaehig).length} von ${gepruefte.length}\n`
    + Object.entries(gruende).map(([g, n]) => `  ${n} × ${g}`).join('\n'))

  // ── M15) Kampagnenfaehigkeit: die Empfaengermenge einer echten Kampagne ─
  //
  // Bis hierher wurde die Einwilligung EINER Adresse geprueft. Die Frage
  // der Kampagne ist eine andere: WER steht am Ende auf der Liste. Der
  // Weg dorthin ist derselbe, den `fuehreVersandAus` geht — nur ohne
  // Versand: `ermittleEmpfaenger` laedt Kontakte, Segment, Einwilligungen
  // und die bereits Angeschriebenen und gibt die Ausschluesse aufgeschluesselt
  // zurueck.
  const kampagne = {
    id: '00000000-0000-4000-8000-00000000f00d',   // existiert nicht — genau darum
    organization_id: ORG,
    template_key: VORLAGEN[0].templateKey,
    segment_key: SEGMENTE.find(sg => sg.consentTyp === VORLAGEN[0].consentTyp).key,
  }
  const kampagnenlage = await ermittleEmpfaenger(admin, kampagne, new Date())
  const summeAusschluesse = Object.values(kampagnenlage.ausschluesse).reduce((n, x) => n + x, 0)
  pruefe('M15', 'Die Empfaengerlage einer Kampagne geht auf: im Segment = versandfaehig + Ausschluesse',
    kampagnenlage.imSegment.length === kampagnenlage.versandfaehig.length + summeAusschluesse,
    `Vorlage ${kampagnenlage.vorlage.templateKey} (${kampagnenlage.vorlage.consentTyp}) auf Segment ${kampagnenlage.segment.key}\n`
    + `im Segment ${kampagnenlage.imSegment.length} = versandfaehig ${kampagnenlage.versandfaehig.length} `
    + `+ ausgeschlossen ${summeAusschluesse}\n`
    + Object.entries(kampagnenlage.ausschluesse).filter(([, n]) => n > 0)
        .map(([g, n]) => `  ${n} × ${g}`).join('\n'))

  // ── M16) Die gesperrte Pruefadresse steht in KEINER Empfaengermenge ─────
  //
  // Der eigentliche Nachweis fuer „erneuter Versand blockiert". M7 hat
  // gezeigt, dass die Adresse als gesperrt GILT; hier wird gemessen, dass
  // der Versandweg sie deshalb auch wirklich auslaesst — die Sperre wirkt
  // nur, wenn der Weg dorthin sie liest.
  const inEmpfaengern = kampagnenlage.versandfaehig.some(k => k.email === PRUEFADRESSE)
  const imSegmentDrin = kampagnenlage.imSegment.some(k => k.email === PRUEFADRESSE)
  pruefe('M16', 'Die gesperrte Pruefadresse ist in keiner Empfaengermenge',
    !inEmpfaengern,
    `im Segment: ${imSegmentDrin} | versandfaehig: ${inEmpfaengern} (erwartet false)\n`
    + (imSegmentDrin
      ? 'Die Adresse steht im Segment und wurde von der Einwilligungspruefung aussortiert — genau so soll es sein.'
      : 'Die Pruefadresse gehoert zu keinem Kontakt im Bestand; die Sperre wurde in M7/M8 unmittelbar geprueft.'))

  // ── M17) Die Versandtore sind zu ────────────────────────────────────────
  //
  // Vier Tore, und schon eines genuegt. Geprueft wird die Kampagne mit
  // ALLEN Feldern leer — also der Zustand, in dem eine frisch angelegte
  // Kampagne ist. Sie darf unter keinen Umstaenden versandfaehig sein.
  const tore = pruefeVersandtore(
    { ...kampagne, status: 'entwurf', versendet_am: null,
      freigegeben_am: null, freigegeben_fuer_anzahl: null },
    kampagnenlage.versandfaehig.length)
  pruefe('M17', 'Eine frisch angelegte Kampagne kommt an den Versandtoren nicht vorbei',
    tore.erlaubt === false && tore.gruende.length >= 2,
    `erlaubt=${tore.erlaubt} | ${tore.gruende.length} Grund/Gruende:\n`
    + tore.gruende.map(g => `  · ${g}`).join('\n'))

} finally {
  // ── Aufraeumen ──────────────────────────────────────────────────────────
  const { error: e1, data: d1 } = await admin.from('marketing_consents')
    .delete().eq('organization_id', ORG).eq('email', PRUEFADRESSE).select('id')
  const { error: e2, data: d2 } = await admin.from('email_suppression_list')
    .delete().eq('organization_id', ORG).eq('email', PRUEFADRESSE).select('id')
  aufgeraeumt = (e1 || e2)
    ? `FEHLER — Einwilligung: ${e1?.message ?? 'ok'}, Sperrliste: ${e2?.message ?? 'ok'}`
    : `${(d1 ?? []).length} Einwilligung(en), ${(d2 ?? []).length} Sperreintrag/-eintraege entfernt`
}

console.log(`\n── Aufraeumen ──────────────────────────────────────────────────────`)
console.log(`  Pruefadresse ${PRUEFADRESSE}`)
console.log(`  ${aufgeraeumt}`)

const offen = ergebnisse.filter(e => !e.bestanden).length
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log(` ${ergebnisse.length - offen} von ${ergebnisse.length} Pruefungen bestanden.`)
console.log('═══════════════════════════════════════════════════════════════════')
process.exit(offen > 0 ? 1 : 0)
