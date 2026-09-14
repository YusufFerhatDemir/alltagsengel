/**
 * Block 35 — Ein Unterschriftsbild, das nichts belegt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (14.09.2026)
 *
 * `saveServiceRecord` — der gemeinsame Einstieg für jeden neu erfassten
 * Leistungsnachweis — schrieb `client_signature` und sonst nichts. Der
 * Trigger `compute_signature_hash` verlangt aber BEIDES:
 *
 *     IF NEW.proof_status = 'UNTERSCHRIEBEN'
 *        AND NEW.client_signed_at IS NOT NULL THEN
 *       NEW.signature_hash := encode(digest(…), 'hex');
 *       NEW.is_locked := true;
 *
 * Ohne die zwei Felder blieb der Nachweis auf `proof_status = 'ENTWURF'`,
 * bekam keinen Hash und wurde nicht gesperrt — mit einem
 * Unterschriftsbild in der Zeile, das kryptografisch nichts belegt und
 * jederzeit änderbar blieb.
 *
 * Live gemessen (alle 30 Nachweise am 02.07.2026 angelegt):
 *
 *     26 von 30   Bild vorhanden, client_signed_at NULL
 *     30 von 30   kein signature_hash, is_locked = false
 *     30 von 30   proof_status = 'ENTWURF'
 *
 * Davon mit `status = 'signed'`: 10 mit Bild, 3 ohne — exakt die 13 aus
 * BUSINESS_DECISION #5.
 *
 * Der BESTAND wird nicht angefasst; das ist eine Geschäftsentscheidung.
 * Was diese Tests sichern, ist: kein NEUER Nachweis entsteht mehr so.
 */
import { describe, it, expect } from 'vitest'
import { saveServiceRecord } from '@/lib/admin/service-records'

const KLIENT = '00000000-0000-4000-8000-00000000f001'
const ENGEL = '00000000-0000-4000-8000-00000000f002'

const BASIS = {
  client_id: KLIENT,
  caregiver_id: ENGEL,
  date: '2026-09-14',
  start_time: '09:00',
  end_time: '11:00',
  service_type: 'Alltagsbegleitung',
  budget_type: 'entlastung',
  caregiver_initials: 'M.S.',
  status: 'signed',
}

/** Attrappe, die den eingefügten Datensatz festhält. */
function fangeInsert() {
  const eingefuegt: Record<string, unknown>[] = []
  const client = {
    from(tabelle: string) {
      if (tabelle !== 'service_records') throw new Error(`Unerwartete Tabelle: ${tabelle}`)
      return {
        insert: (werte: Record<string, unknown>) => {
          eingefuegt.push(werte)
          return { select: () => ({ single: async () => ({ data: { id: 'neue-id' }, error: null }) }) }
        },
      }
    },
  }
  return { client: client as never, eingefuegt }
}

describe('Nachweis MIT Unterschrift', () => {
  it('setzt client_signed_at — sonst bildet der Trigger keinen Hash', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS, client_signature: 'data:image/png;base64,xxx' })
    expect(eingefuegt[0].client_signed_at).toBeTruthy()
  })

  it('setzt proof_status auf UNTERSCHRIEBEN — die zweite Triggerbedingung', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS, client_signature: 'data:image/png;base64,xxx' })
    expect(eingefuegt[0].proof_status).toBe('UNTERSCHRIEBEN')
  })

  it('schreibt einen gültigen ISO-Zeitstempel', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS, client_signature: 'x' })
    const ts = String(eingefuegt[0].client_signed_at)
    expect(Number.isNaN(Date.parse(ts))).toBe(false)
  })

  it('übernimmt Name und Rolle der unterzeichnenden Person', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, {
      ...BASIS,
      client_signature: 'x',
      client_signer_name: 'Erika Muster',
      client_signer_role: 'angehoerige',
    })
    expect(eingefuegt[0].client_signer_name).toBe('Erika Muster')
    expect(eingefuegt[0].client_signer_role).toBe('angehoerige')
  })

  it('lässt Name und Rolle weg, wenn sie fehlen — statt leere Strings zu schreiben', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS, client_signature: 'x' })
    expect('client_signer_name' in eingefuegt[0]).toBe(false)
    expect('client_signer_role' in eingefuegt[0]).toBe(false)
  })
})

describe('Nachweis OHNE Unterschrift', () => {
  it('bleibt ein Entwurf — kein Zeitstempel, kein proof_status', async () => {
    // Ein Nachweis ohne Unterschrift IST ein Entwurf. Ihn zu stempeln
    // wäre dieselbe Unwahrheit, nur andersherum.
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS, client_signature: null })
    expect('client_signed_at' in eingefuegt[0]).toBe(false)
    expect('proof_status' in eingefuegt[0]).toBe(false)
  })

  it('behandelt eine Unterschrift aus Leerzeichen wie keine', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS, client_signature: '   ' })
    expect('client_signed_at' in eingefuegt[0]).toBe(false)
    expect('proof_status' in eingefuegt[0]).toBe(false)
  })

  it('schreibt auch ohne Unterschriftsfeld nichts Beleghaftes', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS })
    expect('client_signed_at' in eingefuegt[0]).toBe(false)
  })
})

describe('GPS gehört in denselben Insert', () => {
  it('schreibt GPS mit, wenn es erfasst wurde', async () => {
    // Seit die Unterschrift den Datensatz sperrt, weist
    // prevent_locked_record_change() jedes Folge-UPDATE ab — ein
    // GPS-Nachtrag käme zu spät.
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS, client_signature: 'x', gps_lat: 50.11, gps_lng: 8.68 })
    expect(eingefuegt[0].gps_lat).toBe(50.11)
    expect(eingefuegt[0].gps_lng).toBe(8.68)
  })

  it('lässt die GPS-Spalten weg, wenn nichts erfasst wurde', async () => {
    const { client, eingefuegt } = fangeInsert()
    await saveServiceRecord(client, { ...BASIS })
    expect('gps_lat' in eingefuegt[0]).toBe(false)
    expect('gps_lng' in eingefuegt[0]).toBe(false)
  })
})

describe('Der Aufrufer trägt keinen GPS-Nachtrag mehr', () => {
  it('app/admin/records/new/actions.ts reicht GPS in den Insert', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const quelle = readFileSync(
      path.resolve(__dirname, '../../app/admin/records/new/actions.ts'), 'utf-8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    expect(quelle).toMatch(/gps_lat: input\.gps\?\.lat/)
    // Kein nachgelagertes UPDATE mehr auf service_records.
    expect(quelle).not.toMatch(/\.update\(\{ gps_lat/)
  })
})
