/**
 * Fehlercodes der Kostenträger → vier interne Kategorien.
 *
 * WARUM NUR VIER KATEGORIEN
 * Die Kassen und ihre Datenannahmestellen verwenden je eigene Fehlercodes,
 * teils dreistellig numerisch, teils mit Buchstabenpräfix. Für die
 * Sachbearbeitung zählt aber nur eine Frage: was muss ich jetzt tun? Darauf
 * gibt es vier Antworten, und die sind hier die Kategorien:
 *
 *   verarbeitungsfehler    → Datei/Technik. Nichts am Fall ändern, neu senden.
 *   datenfehler            → Ein Feld stimmt nicht. Stammdaten korrigieren.
 *   tarifabweichung        → Betrag/Position strittig. Tarif oder Leistung prüfen.
 *   versicherter_unbekannt → Zuordnung stimmt nicht. Versichertendaten prüfen.
 *
 * WARUM DIE ECHTEN CODES NICHT IM CODE STEHEN
 * Sie stehen in den Fehlerverzeichnissen der jeweiligen Annahmestelle. Eine
 * hier hartkodierte Liste wäre eine Behauptung darüber, was Code "301" bei
 * DAVASO bedeutet — und wenn sie falsch ist, wird eine echte Ablehnung still
 * in die falsche Schublade sortiert und verschwindet aus dem Arbeitsvorrat.
 * Deshalb: der Katalog liegt in `dta_fehlercode_katalog`, wird gepflegt statt
 * geraten, und jeder Eintrag braucht eine Quellenangabe.
 *
 * WAS OHNE KATALOG PASSIERT
 * `klassifiziereFehlercode()` fällt auf Heuristiken zurück, die ausschliesslich
 * auf projekteigenen Konventionen beruhen (das 'T'-Präfix setzt der eigene
 * SLGA-Parser für technische Fehler, siehe slga-parser.ts), und landet sonst
 * bei 'unbekannt'. 'unbekannt' ist kein Ausfall, sondern das gewünschte
 * Verhalten: der Fall bleibt sichtbar auf dem Tisch, statt falsch einsortiert
 * zu werden.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Abrechnungsverfahren, aus dem ein Fehlercode stammt.
 *
 * WARUM DAS NÖTIG IST
 * `dta_fehlercode_katalog` kennt nur `kassen_code` — kein Verfahrensfeld. Die
 * heute gepflegten 20 Einträge stammen ausnahmslos aus dem Fehlerverzeichnis
 * zur § 105 SGB XI-Vereinbarung (spec_quelle "TA1 6.5.1 Anlage 4"). Die Codes
 * sind kurz und numerisch ("01", "02", "03") und im § 302-Verfahren
 * (häusliche Krankenpflege) mit ANDERER Bedeutung belegt.
 *
 * Ohne Verfahrensfilter würde ein § 302-Rückläufer mit Code "02" die
 * § 105-Beschreibung "Nutzdatendatei fehlerhaft — EDIFACT-Struktur ungueltig"
 * samt Massnahme erben. Das ist eine plausible, aber unbelegte Behauptung
 * über eine fremde Spezifikation — genau der Fehler, den der Katalog laut
 * Modulkopf verhindern soll.
 *
 * Die Trennung läuft über `spec_quelle`, weil das Schema kein eigenes Feld
 * hat und für DDL kein Zugang besteht: ein Eintrag gehört zu § 302, wenn seine
 * Quellenangabe die Vorschrift ausdrücklich nennt.
 *
 * Die Zuordnung ist bewusst streng. "TA1" allein genügt NICHT — sowohl die
 * § 105- als auch die § 302-Vereinbarung haben eine Technische Anlage 1, und
 * die heute gepflegten Einträge ("TA1 6.5.1 Anlage 4 Fehlerverzeichnis")
 * nennen keine Vorschrift. Sie gehören damit zu KEINEM erkennbaren Verfahren
 * und greifen bei gesetztem Verfahrensfilter nicht. Das ist das gewollte
 * Ergebnis: lieber unklassifiziert und sichtbar auf dem Tisch, als mit der
 * Beschreibung eines fremden Verfahrens versehen. Wer sie für § 105 nutzbar
 * machen will, ergänzt die Quellenangabe um die Vorschrift.
 */
export type Abrechnungsverfahren = 'sgb_xi_105' | 'sgb_v_302'

/** Erkennt am Quellendokument, zu welchem Verfahren ein Katalogeintrag gehört. */
export function verfahrenAusQuelle(specQuelle: string | null | undefined): Abrechnungsverfahren | null {
  const q = (specQuelle ?? '').trim()
  if (!q) return null
  if (/§\s*302|302\s*(Abs|SGB\s*V)|SGB\s*V/i.test(q)) return 'sgb_v_302'
  if (/§\s*105|105\s*(Abs|SGB\s*XI)|SGB\s*XI/i.test(q)) return 'sgb_xi_105'
  return null
}

export type FehlerKategorie =
  | 'verarbeitungsfehler'
  | 'datenfehler'
  | 'tarifabweichung'
  | 'versicherter_unbekannt'
  | 'unbekannt'

export interface KategorieBeschreibung {
  kategorie: FehlerKategorie
  label: string
  bedeutung: string
  /** Was die Sachbearbeitung tun muss. */
  massnahme: string
  /** Ist eine erneute Einreichung nach Korrektur überhaupt sinnvoll? */
  korrigierbar: boolean
}

export const FEHLER_KATEGORIEN: Record<FehlerKategorie, KategorieBeschreibung> = {
  verarbeitungsfehler: {
    kategorie: 'verarbeitungsfehler',
    label: 'Verarbeitungsfehler',
    bedeutung: 'Die Kasse konnte die Datei technisch nicht verarbeiten — Format, '
      + 'Struktur, Verschlüsselung oder Übertragung.',
    massnahme: 'Nichts am Fall ändern. Ursache in der Datei beheben und den Lauf erneut übertragen.',
    korrigierbar: true,
  },
  datenfehler: {
    kategorie: 'datenfehler',
    label: 'Datenfehler',
    bedeutung: 'Ein Feld fehlt oder ist unplausibel (Pflegegrad, Zeitraum, IK, Datum).',
    massnahme: 'Stammdaten oder Leistungsnachweis korrigieren, dann als Korrekturlauf erneut einreichen.',
    korrigierbar: true,
  },
  tarifabweichung: {
    kategorie: 'tarifabweichung',
    label: 'Tarifabweichung',
    bedeutung: 'Betrag oder Abrechnungsposition weicht vom hinterlegten Vertrag der Kasse ab. '
      + 'Häufig eine Kürzung statt einer vollständigen Ablehnung.',
    massnahme: 'Tarif gegen den Landesrahmenvertrag prüfen. Stimmt der Tarif nicht, in der '
      + 'Tarifverwaltung korrigieren und neu verifizieren — sonst wiederholt sich die Kürzung jeden Monat.',
    korrigierbar: true,
  },
  versicherter_unbekannt: {
    kategorie: 'versicherter_unbekannt',
    label: 'Versicherter unbekannt',
    bedeutung: 'Versichertennummer, Kassenzugehörigkeit oder Zeitraum passen bei der Kasse nicht zusammen. '
      + 'Auch der Fall "Versicherung zum Leistungszeitpunkt beendet".',
    massnahme: 'Versichertendaten mit der Kundin/dem Kunden abgleichen. Ist die Kasse eine andere, '
      + 'Kostenträger am Fall ändern und neu einreichen. Bestand kein Versicherungsschutz, '
      + 'ist die Leistung privat zu berechnen — nicht erneut bei der Kasse einreichen.',
    korrigierbar: true,
  },
  unbekannt: {
    kategorie: 'unbekannt',
    label: 'Nicht klassifiziert',
    bedeutung: 'Der Code steht nicht im Katalog. Absichtlich kein Rateergebnis.',
    massnahme: 'Fehlerverzeichnis der Annahmestelle heranziehen, Code in den Katalog eintragen '
      + '(mit Quellenangabe) — danach wird er dauerhaft richtig einsortiert.',
    korrigierbar: true,
  },
}

export interface Klassifizierung {
  kategorie: FehlerKategorie
  /** Woher die Einordnung stammt — für die Anzeige wichtig. */
  herkunft: 'katalog' | 'heuristik' | 'unbekannt'
  beschreibung: string
  massnahme: string
  korrigierbar: boolean
  /** Katalogeintrag, falls einer gegriffen hat. */
  katalogId: string | null
  quelle: string | null
}

function ausKategorie(
  kategorie: FehlerKategorie,
  herkunft: Klassifizierung['herkunft'],
): Klassifizierung {
  const b = FEHLER_KATEGORIEN[kategorie]
  return {
    kategorie,
    herkunft,
    beschreibung: b.bedeutung,
    massnahme: b.massnahme,
    korrigierbar: b.korrigierbar,
    katalogId: null,
    quelle: null,
  }
}

/**
 * Heuristik ohne Katalogeintrag.
 *
 * Sie stützt sich AUSSCHLIESSLICH auf Konventionen, die dieses Projekt selbst
 * erzeugt — nicht auf vermutete Codes fremder Systeme:
 *   - 'T'-Präfix setzt `slga-parser.ts` für technische Fehler
 *   - der Freitext stammt aus derselben Rückmeldung und wird nur auf
 *     eindeutige deutsche Schlüsselwörter geprüft
 *
 * Alles andere ergibt 'unbekannt'.
 */
export function klassifiziereHeuristisch(
  fehlerCode?: string | null,
  fehlerText?: string | null,
): Klassifizierung {
  const code = (fehlerCode ?? '').trim()
  const text = (fehlerText ?? '').toLowerCase()

  // Eigene Konvention aus dem SLGA-Parser: T = technisch.
  if (/^T/i.test(code)) return ausKategorie('verarbeitungsfehler', 'heuristik')

  if (!text) return ausKategorie('unbekannt', 'unbekannt')

  if (/versicherungsschutz|nicht versichert|versichertennummer|versicherten-nr|unbekannter versicherter|kein mitglied|kassenwechsel/.test(text)) {
    return ausKategorie('versicherter_unbekannt', 'heuristik')
  }
  if (/tarif|vergütung|verguetung|preis|betrag|kürzung|kuerzung|punktwert|vertrag/.test(text)) {
    return ausKategorie('tarifabweichung', 'heuristik')
  }
  if (/format|syntax|edifact|segment|datei|entschlüssel|entschluessel|zertifikat|übertragung|uebertragung/.test(text)) {
    return ausKategorie('verarbeitungsfehler', 'heuristik')
  }
  if (/pflegegrad|geburtsdatum|zeitraum|pflichtfeld|fehlt|unplausibel|ungültig|ungueltig|ik-nummer/.test(text)) {
    return ausKategorie('datenfehler', 'heuristik')
  }

  return ausKategorie('unbekannt', 'unbekannt')
}

export interface KlassifizierungsOptionen {
  /**
   * Nur Katalogeinträge dieses Verfahrens akzeptieren. Ohne Angabe wird nicht
   * gefiltert — das ist das seit jeher bestehende Verhalten des § 105-Pfads.
   */
  verfahren?: Abrechnungsverfahren
}

/**
 * Klassifiziert einen Fehlercode: erst Katalog, dann Heuristik.
 *
 * Der Katalog schlägt die Heuristik immer — ein gepflegter Eintrag ist belegt,
 * die Heuristik ist bestenfalls plausibel.
 *
 * Mit `optionen.verfahren` greifen nur Katalogeinträge, deren Quellendokument
 * zu diesem Verfahren gehört. Findet sich keiner, bleibt es bei der Heuristik
 * bzw. 'unbekannt' — ein sichtbar unklassifizierter Rückläufer ist besser als
 * einer, der die Beschreibung eines fremden Verfahrens trägt.
 */
export async function klassifiziereFehlercode(
  supabase: SupabaseClient,
  organizationId: string,
  fehlerCode?: string | null,
  fehlerText?: string | null,
  quelleIk?: string | null,
  optionen?: KlassifizierungsOptionen,
): Promise<Klassifizierung> {
  const code = (fehlerCode ?? '').trim()
  if (!code) return klassifiziereHeuristisch(fehlerCode, fehlerText)

  // Spezifisch (eigene Org + passende Quelle) vor allgemein.
  const { data: rohTreffer, error: katalogFehler } = await supabase
    .from('dta_fehlercode_katalog')
    .select('id, kategorie, beschreibung, massnahme, korrigierbar, spec_quelle, organization_id, quelle_ik')
    .eq('kassen_code', code)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .is('deleted_at', null)

  // Ein verworfener Fehler wurde hier zum stillen Rueckfall auf die
  // Heuristik: der Katalogeintrag existiert, war nur nicht abrufbar, und die
  // geratene Kategorie landete anschliessend als Tatsache in
  // dta_wiedervorlage. Ein Rueckstand ist besser als ein falscher Eintrag.
  if (katalogFehler) {
    throw new Error(`Fehlercode-Katalog nicht abrufbar: ${katalogFehler.message}`)
  }

  // Verfahrensfilter nur, wenn der Aufrufer ein Verfahren nennt. Ohne Angabe
  // bleibt das Verhalten unverändert (§ 105-Pfad, seit jeher so im Einsatz).
  const treffer = optionen?.verfahren
    ? (rohTreffer ?? []).filter(t => verfahrenAusQuelle(t.spec_quelle) === optionen.verfahren)
    : rohTreffer

  if (treffer?.length) {
    const sortiert = [...treffer].sort((a, b) => {
      const punkte = (z: typeof a) =>
        (z.organization_id === organizationId ? 2 : 0) +
        (quelleIk && z.quelle_ik === quelleIk ? 1 : 0)
      return punkte(b) - punkte(a)
    })
    const eintrag = sortiert[0]
    return {
      kategorie: eintrag.kategorie as FehlerKategorie,
      herkunft: 'katalog',
      beschreibung: eintrag.beschreibung,
      massnahme: eintrag.massnahme || FEHLER_KATEGORIEN[eintrag.kategorie as FehlerKategorie].massnahme,
      korrigierbar: eintrag.korrigierbar,
      katalogId: eintrag.id,
      quelle: eintrag.spec_quelle,
    }
  }

  return klassifiziereHeuristisch(fehlerCode, fehlerText)
}

export interface KatalogEintragEingabe {
  organizationId: string | null
  kassenCode: string
  quelleIk?: string | null
  kategorie: FehlerKategorie
  beschreibung: string
  massnahme?: string | null
  korrigierbar?: boolean
  /** Pflicht: welches Dokument, welcher Stand. */
  specQuelle: string
  actorId: string
}

/**
 * Legt einen Katalogeintrag an oder aktualisiert ihn.
 *
 * `specQuelle` ist Pflicht und wird hier zusätzlich zur DB-Bedingung geprüft:
 * ein Eintrag ohne Beleg ist eine Behauptung, und Behauptungen sollen in
 * diesem Kanal nicht entstehen.
 */
export async function pflegeKatalogEintrag(
  supabase: SupabaseClient,
  eingabe: KatalogEintragEingabe,
): Promise<{ id: string }> {
  if (!eingabe.specQuelle?.trim()) {
    throw new Error(
      'spec_quelle ist Pflicht: ohne Angabe, aus welchem Fehlerverzeichnis '
      + '(Dokument + Stand) der Code stammt, wird kein Katalogeintrag angelegt.',
    )
  }
  if (!eingabe.kassenCode?.trim()) {
    throw new Error('kassen_code ist Pflicht')
  }

  const code = eingabe.kassenCode.trim()
  const felder = {
    kategorie: eingabe.kategorie,
    beschreibung: eingabe.beschreibung,
    massnahme: eingabe.massnahme ?? null,
    korrigierbar: eingabe.korrigierbar ?? true,
    spec_quelle: eingabe.specQuelle.trim(),
  }

  // Bewusst Select-dann-Insert/Update statt `.upsert()`: der Unique-Index ist
  // partiell (deleted_at IS NULL) und arbeitet über COALESCE-Ausdrücke, damit
  // NULL-Organisation und NULL-Quelle mitzählen. Auf so einen Index kann
  // ON CONFLICT nicht inferieren — ein Upsert liefe in einen Laufzeitfehler
  // "no unique or exclusion constraint matching the ON CONFLICT specification".
  let bestehend = supabase
    .from('dta_fehlercode_katalog')
    .select('id')
    .eq('kassen_code', code)
    .is('deleted_at', null)

  bestehend = eingabe.organizationId
    ? bestehend.eq('organization_id', eingabe.organizationId)
    : bestehend.is('organization_id', null)
  bestehend = eingabe.quelleIk
    ? bestehend.eq('quelle_ik', eingabe.quelleIk)
    : bestehend.is('quelle_ik', null)

  const { data: vorhanden } = await bestehend.maybeSingle()

  if (vorhanden) {
    const { data, error } = await supabase
      .from('dta_fehlercode_katalog')
      .update(felder)
      .eq('id', vorhanden.id)
      .select('id')
      .single()
    if (error || !data) {
      throw new Error(`Katalogeintrag konnte nicht aktualisiert werden: ${error?.message}`)
    }
    return { id: data.id }
  }

  const { data, error } = await supabase
    .from('dta_fehlercode_katalog')
    .insert({
      organization_id: eingabe.organizationId,
      kassen_code: code,
      quelle_ik: eingabe.quelleIk ?? null,
      created_by: eingabe.actorId,
      ...felder,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Katalogeintrag konnte nicht gespeichert werden: ${error?.message}`)
  }
  return { id: data.id }
}
