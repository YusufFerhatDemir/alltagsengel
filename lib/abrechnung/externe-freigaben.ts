/**
 * Externe Freigaben — die drei Schalter, die NICHT im Code liegen.
 *
 * Die Kassenabrechnung ist bis auf drei Punkte vollständig gebaut. Diese drei
 * Punkte lassen sich nicht programmieren, sondern nur beschaffen:
 *
 *   ITSG_ZERTIFIZIERT   — ITSG-Zertifikat + SFTP-Zugang der Datenannahmestelle
 *   SGB_V_302_FREIGABE  — Technische Anlage 1 zur § 302-Vereinbarung
 *   KIM_AKTIV           — gematik-Zulassung, KIM-Provider, Konnektor
 *
 * WARUM ALS ENV-VARIABLE UND NICHT ALS FEATURE-FLAG IN DER DATENBANK
 * `kf_feature_flags` ist ein Produkt-Schalter: ein Admin darf ihn umlegen, um
 * eine Funktion auszurollen. Diese drei sind keine Produktentscheidung — sie
 * behaupten, dass ein externer Dritter (ITSG, GKV-Spitzenverband, gematik)
 * etwas erteilt hat. Ein Admin-Klick kann das nicht wahr machen. Als
 * Env-Variable braucht es einen Deploy mit Zugriff auf die Vercel-Umgebung,
 * und der Schalter steht dort, wo auch die zugehörigen Credentials liegen.
 *
 * FAIL-CLOSED
 * Nur der exakte String 'true' schaltet frei. Jeder andere Wert — auch '1',
 * 'TRUE', 'yes' oder ein Tippfehler — bedeutet gesperrt. Das ist Absicht: bei
 * einem Kanal, über den echte Forderungen an Kostenträger gehen, ist ein
 * versehentlich offener Schalter der teurere Fehler als ein versehentlich
 * geschlossener.
 *
 * WAS EIN OFFENER SCHALTER NICHT TUT
 * Er ersetzt keine der übrigen Prüfungen. Steht ITSG_ZERTIFIZIERT auf 'true',
 * ohne dass Zertifikat, SSH-Key und Readiness stimmen, scheitert der Versand
 * weiterhin — nur eben an der Sache statt am Gate. Reihenfolge im Versand:
 * Readiness (versand-guard) → Zertifikat/Schlüssel → GATE → Übertragung.
 */

/** Die drei extern beschaffbaren Freigaben. */
export type ExterneFreigabeId = 'itsg_zertifiziert' | 'sgb_v_302_freigabe' | 'kim_aktiv'

export interface FreigabeBeschreibung {
  id: ExterneFreigabeId
  /** Name der Env-Variable, exakt so wie sie in Vercel gesetzt werden muss. */
  envVariable: string
  label: string
  /** Was gesperrt ist, solange der Schalter zu ist. */
  sperrt: string
  /** Wer die Freigabe erteilt — die Stelle, bei der beantragt wird. */
  stelle: string
  /** Reihenfolge der Schritte bis zum Umlegen des Schalters. */
  schritte: string[]
  /**
   * Was ausser dem Schalter noch eingetragen werden muss, wenn die Unterlagen
   * da sind. Genau diese Liste beantwortet die Frage "was fehlt noch?".
   */
  eintragen: string[]
}

export const EXTERNE_FREIGABEN: Record<ExterneFreigabeId, FreigabeBeschreibung> = {
  itsg_zertifiziert: {
    id: 'itsg_zertifiziert',
    envVariable: 'ITSG_ZERTIFIZIERT',
    label: 'ITSG-Zertifizierung und Übertragungszugang (§ 105 SGB XI)',
    sperrt: 'Die Übertragung erzeugter DTA-Dateien an die Datenannahmestelle. '
      + 'Erzeugung, SECON-Verschlüsselung, Validierung und Testmodus laufen weiter.',
    stelle: 'ITSG Trust Center (Zertifikat) + jeweilige Datenannahmestelle (SFTP-Zugang)',
    schritte: [
      'Anerkennung nach § 45a SGB XI im Bundesland nachweisen',
      'IK-Nummer bei der ARGE·IK beantragen (falls noch nicht vorhanden)',
      'Zertifikat beim ITSG Trust Center beantragen (kostenpflichtig, mehrere Tage Vorlauf)',
      'SFTP-Zugang bei jeder Datenannahmestelle beantragen, öffentlichen SSH-Key dort registrieren',
      'Testübertragung mit Dateiindikator "0" mit der Annahmestelle vereinbaren und durchführen',
      'Erst nach bestätigter Testübertragung ITSG_ZERTIFIZIERT=true setzen',
    ],
    eintragen: [
      'PKCS#12-Zertifikat hochladen → Admin → Abrechnung → Einstellungen (landet im Bucket "abrechnung", nie in der DB)',
      'Env SECON_ZERT_PASSWORT in Vercel setzen (Passwort des PKCS#12)',
      'SSH Private Key hochladen → Admin → Annahmestellen (POST /api/admin/abrechnung/sftp-key)',
      'datenannahmestellen: sftp_host, sftp_port, sftp_user, sftp_verzeichnis, antwort_verzeichnis pflegen',
      'state_settings.dakota_export_enabled für das Bundesland aktivieren',
    ],
  },
  sgb_v_302_freigabe: {
    id: 'sgb_v_302_freigabe',
    envVariable: 'SGB_V_302_FREIGABE',
    label: '§ 302 SGB V — Abrechnung häuslicher Krankenpflege',
    sperrt: 'Erzeugung UND Versand von § 302-Dateien. Positionsaufbereitung, '
      + 'Routing und Versionsauflösung laufen weiter.',
    stelle: 'GKV-Spitzenverband (Technische Anlage 1) — Bezug über gkv-datenaustausch.de',
    schritte: [
      'Technische Anlage 1 zur § 302-Vereinbarung + Schlüsselverzeichnisse beschaffen',
      'Segment-Builder und Validator nach TA1 implementieren (lib/abrechnung/sgb-v/generator.ts)',
      'sgb_v_formatversionen.spec_bestaetigt = true mit spec_quelle setzen',
      'Testübertragung mit der Datenannahmestelle durchführen',
      'Erst danach SGB_V_302_FREIGABE=true setzen',
    ],
    eintragen: [
      'sgb_v_formatversionen: ta_version, gueltig_von, spec_bestaetigt, spec_quelle',
      'sgb_v_routing: je Kostenträger-IK die zuständige Datenannahmestelle',
      'Der Transportweg selbst ist derselbe wie bei § 105 — kein zweiter SFTP-Zugang nötig, '
        + 'sofern die Annahmestelle beide Verfahren annimmt',
    ],
  },
  kim_aktiv: {
    id: 'kim_aktiv',
    envVariable: 'KIM_AKTIV',
    label: 'KIM / Telematikinfrastruktur',
    sperrt: 'Jeden KIM-Versand und -Abruf. Postfachverwaltung, Kartenregister '
      + 'und Nachrichten-Warteschlange laufen weiter.',
    stelle: 'gematik (Zulassung) + KIM-Provider (Postfach) + Konnektor-Anbieter',
    schritte: [
      'gematik-Zulassung als Leistungserbringer beschaffen',
      'KIM-Provider-Vertrag abschliessen (liefert Postfachadresse + Zugang)',
      'Konnektor-Anbindung einrichten, über die SMC-B/eHBA angesprochen werden',
      'Technische Anlage 5 (KIM-Client-Spezifikation) beschaffen',
      'KIM-Adapter für den Provider implementieren und in lib/kim/adapter.ts registrieren',
      'Erst nach erfolgreicher Testnachricht KIM_AKTIV=true setzen',
    ],
    eintragen: [
      'kim_konfiguration: postfachadresse, provider_name, freischaltungsstatus = "freigeschaltet"',
      'kim_karten: SMC-B/eHBA-Zuordnung',
      'kim_formatversionen.spec_bestaetigt = true mit spec_quelle',
      'Provider-Adapter registrieren → registriereKimAdapter() in lib/kim/adapter.ts',
    ],
  },
}

/**
 * Wird geworfen, wenn eine gesperrte Freigabe benötigt wird.
 *
 * Eigene Klasse mit `code`, damit die API-Schicht sauber 409 („noch nicht
 * freigeschaltet") von 500 („kaputt") unterscheiden kann — ein gesperrter
 * Kanal ist kein Fehler, sondern der erwartete Zustand.
 */
export class ExternGesperrtError extends Error {
  readonly code = 'EXTERN_GESPERRT'
  readonly freigabe: ExterneFreigabeId
  readonly envVariable: string
  readonly schritte: string[]

  constructor(freigabe: ExterneFreigabeId, kontext?: string) {
    const b = EXTERNE_FREIGABEN[freigabe]
    super(
      `EXTERN_GESPERRT: ${b.label} ist nicht freigeschaltet`
      + `${kontext ? ` (${kontext})` : ''}. `
      + `Es wurde nichts übermittelt und es entsteht keine Forderung. `
      + `Gesperrt ist: ${b.sperrt} `
      + `Freigabe erteilt: ${b.stelle}. `
      + `Schalter nach Vorliegen der Unterlagen: ${b.envVariable}=true.`,
    )
    this.name = 'ExternGesperrtError'
    this.freigabe = freigabe
    this.envVariable = b.envVariable
    this.schritte = b.schritte
  }
}

/**
 * Ist die Freigabe erteilt?
 *
 * Bewusst ohne Cache und ohne Vorberechnung beim Modulladen: der Wert wird bei
 * jedem Aufruf frisch aus der Umgebung gelesen, damit ein Test ihn setzen kann
 * und damit ein Deploy mit geändertem Wert sofort greift.
 */
export function istFreigegeben(freigabe: ExterneFreigabeId): boolean {
  return process.env[EXTERNE_FREIGABEN[freigabe].envVariable] === 'true'
}

/**
 * Wirft `ExternGesperrtError`, wenn die Freigabe fehlt.
 *
 * Wirft, statt einen Wahrheitswert zurückzugeben — dasselbe Muster wie
 * `pruefeVersandbereitschaft()`: ein vergessener If-Zweig darf nicht zum
 * stillen Versand führen.
 *
 * @throws ExternGesperrtError
 */
export function pruefeFreigabe(freigabe: ExterneFreigabeId, kontext?: string): void {
  if (!istFreigegeben(freigabe)) {
    throw new ExternGesperrtError(freigabe, kontext)
  }
}

export interface FreigabeStatus {
  id: ExterneFreigabeId
  envVariable: string
  label: string
  freigegeben: boolean
  sperrt: string
  stelle: string
  schritte: string[]
  eintragen: string[]
}

export interface FreigabeUebersicht {
  freigaben: FreigabeStatus[]
  /** true nur, wenn alle drei Kanäle offen sind. */
  alleFreigegeben: boolean
  /** Kanäle, die derzeit extern blockiert sind. */
  gesperrt: ExterneFreigabeId[]
}

/**
 * Übersicht für Admin-Oberfläche und Readiness.
 *
 * Meldet ausschliesslich Ja/Nein pro Schalter — niemals Werte von Secrets.
 */
export function freigabeUebersicht(): FreigabeUebersicht {
  const freigaben: FreigabeStatus[] = (Object.keys(EXTERNE_FREIGABEN) as ExterneFreigabeId[])
    .map(id => {
      const b = EXTERNE_FREIGABEN[id]
      return {
        id,
        envVariable: b.envVariable,
        label: b.label,
        freigegeben: istFreigegeben(id),
        sperrt: b.sperrt,
        stelle: b.stelle,
        schritte: b.schritte,
        eintragen: b.eintragen,
      }
    })

  return {
    freigaben,
    alleFreigegeben: freigaben.every(f => f.freigegeben),
    gesperrt: freigaben.filter(f => !f.freigegeben).map(f => f.id),
  }
}
