/**
 * Block 36 — Ein Klarname im Bildfeld
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (14.09.2026)
 *
 * `service_records.client_signature` ist das Feld für das
 * Unterschriftsbild; `app/admin/leistungsnachweis-digital` rendert es als
 *
 *     <img src={detailRecord.client_signature} alt="Unterschrift" />
 *
 * Der Signaturweg über `uebernimmSignaturInNachweis` legt dort aber den
 * KLARNAMEN des Signatars ab („Erika Mustermann"). Für jeden auf dem
 * Tablet oder über den Signaturdienst unterschriebenen Nachweis zeigte
 * die Admin-Detailansicht damit ein kaputtes Bild — und die daneben
 * vorhandenen Spalten `client_signer_name`/`client_signer_role`, die
 * dieselbe Ansicht bereits ausgibt, blieben leer.
 *
 * ── WAS NICHT DER BEFUND WAR ───────────────────────────────────────────
 *
 * Beim Bau dieses Blocks habe ich zunächst versucht, den Namen aus
 * `client_signature` zu entfernen. Die Kette riss sofort: der Trigger
 * `enforce_unterschrift_beleg` lässt `proof_status='UNTERSCHRIEBEN'` nur
 * durch, wenn ENTWEDER `client_signature` mit `client_signed_at` vorliegt
 * ODER eine Zeile in `service_signatures` mit `signer_role='client'`. Der
 * Signaturdienst schreibt nicht nach `service_signatures` — für ihn ist
 * dieses Feld der einzige Beleg, den die Datenbank akzeptiert.
 *
 * Das Feld bleibt also. Repariert wird die ANZEIGE.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { istBilddaten } from '@/lib/leistungsnachweis/status-sync'
import { SIGNER_ROLLEN, SIGNER_ROLE_KUNDE } from '@/lib/signaturen/nachweis-uebernahme'

describe('istBilddaten', () => {
  it('erkennt eine Data-URL', () => {
    expect(istBilddaten('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  })

  it('erkennt eine verlinkte Bilddatei', () => {
    expect(istBilddaten('https://example.test/unterschrift.png')).toBe(true)
  })

  it('weist einen Klarnamen ab — DER Befund', () => {
    expect(istBilddaten('Erika Mustermann')).toBe(false)
  })

  it('weist leer, null und undefined ab', () => {
    for (const wert of ['', '   ', null, undefined]) {
      expect(istBilddaten(wert)).toBe(false)
    }
  })

  it('weist den Text "false" ab', () => {
    // Live steht in client_signature stellenweise der String 'false' —
    // siehe hatUnterschrift() in derselben Datei.
    expect(istBilddaten('false')).toBe(false)
  })

  it('lässt sich von führenden Leerzeichen nicht täuschen', () => {
    expect(istBilddaten('  data:image/png;base64,xxx')).toBe(true)
  })

  it('hält eine andere Data-URL für kein Bild', () => {
    // `data:text/plain` ist kein Bild und gehört nicht in ein <img>.
    expect(istBilddaten('data:text/plain;base64,SGFsbG8=')).toBe(false)
  })
})

describe('Admin-Detailansicht', () => {
  const quelle = readFileSync(
    path.resolve(__dirname, '../../app/admin/leistungsnachweis-digital/page.tsx'), 'utf-8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

  it('rendert <img> nur für echte Bilddaten', () => {
    expect(quelle).toMatch(/istBilddaten\(detailRecord\.client_signature\)/)
  })

  it('zeigt den Unterschriftsblock auch ohne Bild, wenn ein Name vorliegt', () => {
    // Sonst sähe ein auf dem Tablet unterschriebener Nachweis in der
    // Admin-Ansicht aus, als sei er gar nicht unterschrieben.
    expect(quelle).toMatch(/detailRecord\.client_signature \|\| detailRecord\.client_signer_name/)
  })

  it('erklärt im Klartext, wo das Bild dann liegt', () => {
    expect(quelle).toMatch(/Signaturakte/)
  })

  it('gibt Unterzeichner und Rolle weiterhin aus', () => {
    expect(quelle).toMatch(/Unterzeichner: \{detailRecord\.client_signer_name\}/)
    expect(quelle).toMatch(/detailRecord\.client_signer_role/)
  })
})

describe('Rollenvokabular der Spalte', () => {
  it('kennt genau die drei Werte des CHECK', () => {
    // service_records_client_signer_role_check, live gelesen:
    //   KUNDE | ANGEHOERIGER | VERTRETER
    expect([...SIGNER_ROLLEN]).toEqual(['KUNDE', 'ANGEHOERIGER', 'VERTRETER'])
  })

  it('nutzt für die Kundenunterschrift KUNDE, nicht das Vokabular der App', () => {
    // Die Native-Route führt ihr eigenes Vokabular ('client' |
    // 'caregiver'). Ungeprüft durchgereicht scheitert das GANZE Update am
    // CHECK — und dann erreicht die Unterschrift den Nachweis gar nicht
    // mehr. Genau das ist beim Bau dieses Blocks passiert.
    expect(SIGNER_ROLE_KUNDE).toBe('KUNDE')
    expect(SIGNER_ROLLEN).toContain(SIGNER_ROLE_KUNDE)
    expect(SIGNER_ROLLEN).not.toContain('client' as never)
  })
})

describe('Testschema und Produktion', () => {
  it('führt client_signer_role samt CHECK im PGlite-Schema', () => {
    // Die Spalte fehlte — und ein UPDATE auf eine unbekannte Spalte
    // scheitert in Postgres KOMPLETT (42703), nicht nur im fehlenden
    // Feld. Ohne den CHECK hätte das Testschema ausserdem 'client'
    // klaglos geschluckt, die Produktion nicht.
    const schema = readFileSync(
      path.resolve(__dirname, '../e2e/helpers/kette-schema.ts'), 'utf-8',
    )
    expect(schema).toMatch(/client_signer_role TEXT/)
    expect(schema).toMatch(/service_records_client_signer_role_check/)
    expect(schema).toMatch(/'KUNDE'::text, 'ANGEHOERIGER'::text, 'VERTRETER'::text/)
  })
})
