/**
 * Türsteher an Cron und Webhook — sind sie VERDRAHTET?
 * ═══════════════════════════════════════════════════════════════════
 *
 * Es gibt bereits gute Tests für die beiden Prüffunktionen selbst:
 * `lib/api/cron-auth.test.ts` (Bearer-Vergleich, Null-Riegel,
 * Konstantzeit) und `lib/marketing/webhook-signatur.test.ts` (Svix-HMAC,
 * Zeitfenster, Schlüsselwechsel). Beide prüfen die FUNKTION.
 *
 * Keiner von beiden prüft, ob eine ROUTE sie aufruft.
 *
 * Das ist die Lücke, die zählt. Eine perfekt getestete Prüffunktion, die
 * in `app/api/cron/neue-route/route.ts` schlicht vergessen wurde, ist
 * eine offene Tür — und die bestehende Suite bliebe dabei grün. Genau
 * diese Form von Scheinabdeckung ist im Projekt schon einmal aufgefallen
 * („Quelltext-Grep ist kein Test": Module ohne echten Import, deren
 * Statik-Suiten Abdeckung vortäuschten).
 *
 * ── WARUM NICHT PER GREP ──────────────────────────────────────────
 *
 * Ein `grep pruefeCronGeheimnis app/api/cron/**` wäre schnell und
 * wertlos. Er bestätigt einen Bezeichner im Text, nicht ein Verhalten:
 * er wird auch dann grün, wenn der Aufruf hinter einer Bedingung steht,
 * sein Ergebnis nicht zurückgegeben wird, oder er erst NACH dem ersten
 * Datenbankzugriff kommt. Diese Suite importiert die Routen deshalb und
 * RUFT SIE AUF. Was zählt, ist der Statuscode.
 *
 * ── DIE ROUTENLISTE WIRD GELESEN, NICHT GEPFLEGT ──────────────────
 *
 * `app/api/cron` wird zur Laufzeit durchsucht. Eine von Hand gepflegte
 * Liste würde die eine neue Route nicht enthalten, wegen der es diesen
 * Test gibt — sie wäre wieder nur so vollständig wie die Erinnerung
 * dessen, der sie zuletzt angefasst hat.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'

// Die Routen ziehen beim Import ihre Abhängigkeiten mit. Keine davon darf
// den Test entscheiden — der Türsteher greift VOR jedem Datenzugriff, und
// genau das soll hier sichtbar werden: kommt trotz unbrauchbarer Datenbank
// ein 401, lag es am Türsteher und an nichts anderem.
//
// WICHTIG — was hier NICHT wirft: das ERZEUGEN des Clients.
// Drei Routen (review-request, mahnlauf, automatisierung) rufen
// `createAdminClient()` auf Modulebene auf, also beim Import. Ein erster
// Entwurf dieses Mocks warf schon dort und machte die drei rot — das war
// ein Fehler DES TESTS, nicht der Routen: einen Client anzulegen ist noch
// keine Abfrage, und der Türsteher steht in allen drei Fällen korrekt als
// erste Anweisung im Handler.
//
// Geprüft wird deshalb die Eigenschaft, auf die es ankommt: es darf keine
// ABFRAGE vor dem Türsteher geben. Der Doppelgänger lässt sich anlegen und
// wirft erst bei `from()` / `rpc()`.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => new Proxy({}, {
    get(_ziel, eigenschaft) {
      return () => {
        throw new Error(
          `Datenbankzugriff (.${String(eigenschaft)}()) vor dem Türsteher — das darf nie passieren.`,
        )
      }
    },
  }),
}))

const CRON_WURZEL = join(process.cwd(), 'app', 'api', 'cron')

/** Alle Cron-Routen, aus dem Dateisystem gelesen. */
function cronRouten(): string[] {
  const gefunden: string[] = []
  for (const eintrag of readdirSync(CRON_WURZEL)) {
    const ordner = join(CRON_WURZEL, eintrag)
    if (!statSync(ordner).isDirectory()) continue
    try {
      statSync(join(ordner, 'route.ts'))
      gefunden.push(eintrag)
    } catch { /* kein Handler in diesem Ordner */ }
  }
  return gefunden.sort()
}

const ROUTEN = cronRouten()

describe('Cron-Routen — der Türsteher ist verdrahtet', () => {
  const urspruenglich = process.env.CRON_SECRET

  beforeEach(() => { vi.resetModules() })
  afterEach(() => {
    if (urspruenglich === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = urspruenglich
  })

  it('findet überhaupt Routen — sonst prüft diese Suite nichts', () => {
    // Ohne diese Gegenprobe wäre eine leere Liste ein stiller Durchlauf:
    // 0 Routen, 0 Fehler, grün. Das ist der Fehlermodus, den die
    // Route-Quelle-Zerlegung schon einmal hatte.
    expect(ROUTEN.length).toBeGreaterThanOrEqual(11)
  })

  for (const name of ROUTEN) {
    describe(`/api/cron/${name}`, () => {
      it('weist einen Aufruf OHNE Authorization-Header ab (401)', async () => {
        process.env.CRON_SECRET = 'ein-hinreichend-langes-testgeheimnis'
        vi.resetModules()
        const mod = await import(`../../app/api/cron/${name}/route.ts`)
        const antwort = await mod.GET(new Request(`https://example.test/api/cron/${name}`))
        expect(antwort.status).toBe(401)
      })

      it('weist ein FALSCHES Geheimnis ab (401)', async () => {
        process.env.CRON_SECRET = 'ein-hinreichend-langes-testgeheimnis'
        vi.resetModules()
        const mod = await import(`../../app/api/cron/${name}/route.ts`)
        const antwort = await mod.GET(new Request(`https://example.test/api/cron/${name}`, {
          headers: { authorization: 'Bearer falsch-falsch-falsch-falsch-fal' },
        }))
        expect(antwort.status).toBe(401)
      })

      it('weist "Bearer undefined" ab, wenn CRON_SECRET NICHT gesetzt ist (401)', async () => {
        // Der eigentliche Befund hinter lib/api/cron-auth.ts: ohne
        // Null-Riegel lautet der Vergleichswert wörtlich "Bearer undefined"
        // — ein Header, den jeder schicken kann. Hier wird geprüft, dass
        // die ROUTE fail-closed bleibt, nicht nur die Funktion.
        delete process.env.CRON_SECRET
        vi.resetModules()
        const mod = await import(`../../app/api/cron/${name}/route.ts`)
        const antwort = await mod.GET(new Request(`https://example.test/api/cron/${name}`, {
          headers: { authorization: 'Bearer undefined' },
        }))
        expect(antwort.status).toBe(401)
      })
    })
  }
})

// ═══════════════════════════════════════════════════════════════════
// Resend-Webhook — öffentlich erreichbar, sperrt Adressen dauerhaft
// ═══════════════════════════════════════════════════════════════════
//
// Diese Route hat keinen Anmeldeschutz; die Signatur IST die Grenze. Ein
// gefälschtes `email.bounced` nimmt einer Person dauerhaft die Post.

const SCHLUESSEL_ROH = Buffer.from('geheim-geheim-geheim-32-zeichen!').toString('base64')
const RUMPF = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_1' } })

function signiereRumpf(rumpf: string, id: string, sekunden: number): string {
  return createHmac('sha256', Buffer.from(SCHLUESSEL_ROH, 'base64'))
    .update(`${id}.${sekunden}.${rumpf}`)
    .digest('base64')
}

function webhookAnfrage(kopfzeilen: Record<string, string>, rumpf = RUMPF): Request {
  return new Request('https://example.test/api/marketing/resend-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...kopfzeilen },
    body: rumpf,
  })
}

describe('POST /api/marketing/resend-webhook — die Signatur ist die Grenze', () => {
  const urspruenglich = process.env.RESEND_WEBHOOK_SECRET

  afterEach(() => {
    if (urspruenglich === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = urspruenglich
    vi.resetModules()
  })

  it('weist eine UNGÜLTIGE Signatur ab (401)', async () => {
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${SCHLUESSEL_ROH}`
    vi.resetModules()
    const { POST } = await import('@/app/api/marketing/resend-webhook/route')
    const antwort = await POST(webhookAnfrage({
      'svix-id': 'msg_1',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,dGhpcy1pc3QtZWluZS1mYWVsc2NodW5n',
    }))
    expect(antwort.status).toBe(401)
  })

  it('weist einen VERÄNDERTEN Rumpf ab, obwohl die Signatur echt ist (401)', async () => {
    // Der Fall, den eine reine „Signatur vorhanden?"-Prüfung durchließe.
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${SCHLUESSEL_ROH}`
    vi.resetModules()
    const { POST } = await import('@/app/api/marketing/resend-webhook/route')
    const id = 'msg_2'
    const sek = Math.floor(Date.now() / 1000)
    const echt = signiereRumpf(RUMPF, id, sek)
    const veraendert = JSON.stringify({ type: 'email.bounced', data: { email_id: 're_1' } })
    const antwort = await POST(webhookAnfrage({
      'svix-id': id,
      'svix-timestamp': String(sek),
      'svix-signature': `v1,${echt}`,
    }, veraendert))
    expect(antwort.status).toBe(401)
  })

  it('weist einen Aufruf GANZ OHNE Signaturkopfzeilen ab (400)', async () => {
    // 400, nicht 401: fehlende Kopfzeilen sind eine fehlerhaft AUFGEBAUTE
    // Anfrage, keine fehlgeschlagene Authentifizierung. Ein 401 zeigte bei
    // der Fehlersuche auf den Schlüssel, wo in Wirklichkeit die Kopfzeilen
    // fehlen. Sicherheitlich ist beides gleichwertig — entscheidend ist,
    // dass NICHTS verarbeitet wird, und das prüft die zweite Zusicherung.
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${SCHLUESSEL_ROH}`
    vi.resetModules()
    const { POST } = await import('@/app/api/marketing/resend-webhook/route')
    const antwort = await POST(webhookAnfrage({}))
    expect(antwort.status).toBe(400)
    expect(antwort.status).toBeGreaterThanOrEqual(400)
  })

  it('lädt bei fehlenden Kopfzeilen NICHT zum erneuten Versuch ein', async () => {
    // Ein Retry-After hier hieße: „versuch's gleich nochmal" — genau das,
    // was ein Angreifer hören möchte. Nur der 503 (Fehler bei uns) darf
    // um Wiederholung bitten.
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${SCHLUESSEL_ROH}`
    vi.resetModules()
    const { POST } = await import('@/app/api/marketing/resend-webhook/route')
    const antwort = await POST(webhookAnfrage({}))
    expect(antwort.headers.get('Retry-After')).toBeNull()
  })

  it('antwortet 503, solange RESEND_WEBHOOK_SECRET fehlt — und verarbeitet NICHTS', async () => {
    // Fail-closed und unterscheidbar: 503 ist ein Betriebsfehler bei uns,
    // 401 eine gefälschte Nachricht. Beides als 401 zu beantworten würde
    // eine fehlende Variable als Angriff tarnen.
    delete process.env.RESEND_WEBHOOK_SECRET
    vi.resetModules()
    const { POST } = await import('@/app/api/marketing/resend-webhook/route')
    const id = 'msg_3'
    const sek = Math.floor(Date.now() / 1000)
    const antwort = await POST(webhookAnfrage({
      'svix-id': id,
      'svix-timestamp': String(sek),
      'svix-signature': `v1,${signiereRumpf(RUMPF, id, sek)}`,
    }))
    expect(antwort.status).toBe(503)

    // Der Rumpf muss sagen, WAS fehlt — sonst steht bei der Fehlersuche
    // nur „nicht konfiguriert" da. Der Variablenname ist kein Geheimnis;
    // ihr Wert darf nirgends auftauchen.
    const rumpf = await antwort.json()
    expect(rumpf.fehlend).toBe('RESEND_WEBHOOK_SECRET')
    expect(JSON.stringify(rumpf)).not.toContain(SCHLUESSEL_ROH)

    // Wiederholen ist hier erwünscht: sobald die Variable gesetzt ist,
    // soll das Ereignis ankommen.
    expect(antwort.headers.get('Retry-After')).toBeTruthy()
  })
})
