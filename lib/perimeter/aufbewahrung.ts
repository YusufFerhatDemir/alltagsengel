// ═══════════════════════════════════════════════════════════════════════
// Aufbewahrung am unauthentifizierten Perimeter (Track 13, Befund B5)
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DIESE DATEI GIBT
//
// Vier Routen der oeffentlichen Website schreiben ohne jede Anmeldung mit
// dem DIENSTSCHLUESSEL in die Datenbank: /api/track, /api/track-conversion,
// /api/analytics/vitals und (mittelbar) /api/visitor-alert. Was dort
// entsteht, hat nie jemand wieder angefasst. Live am 28.08.2026:
//
//   visitors           3391 Zeilen, 548 verschiedene VOLLE IP-Adressen,
//                      aelteste vom 09.03.2026
//   visitor_locations  3850 Zeilen, davon 2743 mit ip_address,
//                      1091 verschiedene, aelteste vom 15.03.2026
//   conversions          38 Zeilen, 26 verschiedene IP-Adressen
//   analytics_events   4165 Zeilen
//
// `vercel.json` fuehrt neun Cron-Eintraege. KEINER davon raeumt hier auf.
// Es gab also keine Aufbewahrungsfrist — nicht „eine zu lange", sondern
// gar keine.
//
// DER WIDERSPRUCH IM SELBEN BEREICH. `analytics_events` traegt eine Spalte
// `ip_hash`. Der Entwurf sah dort also ausdruecklich einen GEHASHTEN Wert
// vor. Sie ist live in 0 von 4165 Zeilen belegt — die Route schreibt
// woertlich `ip_hash: null`. Die drei Schwestertabellen daneben legen die
// IP dagegen ROH ab. Zwei Antworten auf dieselbe Frage, im selben Bereich,
// aus derselben Feder.
//
// Eine volle IP-Adresse ist nach Art. 4 Nr. 1 DSGVO ein personenbezogenes
// Datum. Sie unbefristet zu halten, braucht einen Zweck, der ebenso lange
// traegt — Reichweitenmessung ist keiner.
//
// ─────────────────────────────────────────────────────────────────────
// ZWEI STUFEN, NICHT EINE
//
// Nur „alte Zeilen loeschen" waere die schlechtere Loesung: sie wirft die
// Auswertung mit weg, obwohl an ihr gar nichts Personenbezogenes haengt.
// Deshalb zwei getrennte Fristen je Tabelle:
//
//   Stufe 1 — IP KUERZEN. Nach `ipFristTage` wird die IP-Spalte auf NULL
//             gesetzt. Die Zeile bleibt, die Auswertung bleibt, der
//             direkte Personenbezug faellt weg.
//   Stufe 2 — ZEILE LOESCHEN. Nach `loeschFristTage` verschwindet sie ganz.
//
// ─────────────────────────────────────────────────────────────────────
// WOHER DIE ZAHLEN KOMMEN — UND WOHER NICHT
//
// Diese Fristen sind KEINE gesetzlichen Werte, und es wird hier keiner
// erfunden. Fuer Reichweitenmessung gibt es keine gesetzliche Frist; es
// gibt die Pflicht, eine zu haben (Art. 5 Abs. 1 lit. e DSGVO,
// Speicherbegrenzung). Die Werte unten sind eine BETRIEBSENTSCHEIDUNG,
// bewusst kurz gewaehlt und an einer Stelle aenderbar.
//
// Zwei Tabellen sind AUSDRUECKLICH AUSGENOMMEN, weil dort eine erfundene
// Frist schaedlich waere — sie stehen in NICHT_AUTOMATISCH mit Begruendung.
// ═══════════════════════════════════════════════════════════════════════

export interface DbFehler {
  message: string
  code?: string
}

export interface AufbewahrungsEintrag {
  tabelle: string
  /** Spalte mit dem Entstehungszeitpunkt. */
  zeitSpalte: string
  /** Spalte mit der vollen IP-Adresse, falls die Tabelle eine hat. */
  ipSpalte?: string
  /** Nach so vielen Tagen wird die IP-Spalte auf NULL gesetzt. */
  ipFristTage?: number
  /** Nach so vielen Tagen verschwindet die Zeile. */
  loeschFristTage: number
  begruendung: string
}

/** Tabellen, die der Lauf anfasst. */
export const AUFBEWAHRUNG: readonly AufbewahrungsEintrag[] = [
  {
    tabelle: 'visitors',
    zeitSpalte: 'created_at',
    ipSpalte: 'ip',
    ipFristTage: 7,
    loeschFristTage: 90,
    begruendung:
      'Reichweitenmessung der oeffentlichen Website. Die volle IP wird nur fuer die Geo-Aufloesung und den '
      + 'Besucher-Alarm gebraucht — beides geschieht im Request selbst. Nach einer Woche hat sie keinen Zweck mehr.',
  },
  {
    tabelle: 'visitor_locations',
    zeitSpalte: 'created_at',
    ipSpalte: 'ip_address',
    ipFristTage: 7,
    loeschFristTage: 90,
    begruendung:
      'Wie visitors, zusaetzlich mit Portalbezug. ACHTUNG: die Zeilen mit user_id sind zusaetzlich ueber den '
      + 'Loeschkatalog an die Kontoloeschung gebunden (Track 13 B4) — diese Frist ersetzt das nicht, sie greift nur frueher.',
  },
  {
    tabelle: 'page_views',
    zeitSpalte: 'viewed_at',
    ipSpalte: 'ip_address',
    ipFristTage: 7,
    loeschFristTage: 90,
    begruendung:
      'Seitenaufrufe aus allen Portalen. Der groesste Bestand des Perimeters (live 8315 Zeilen, 6632 mit IP, '
      + '2033 verschiedene). ACHTUNG Zeitspalte: `viewed_at`, NICHT `created_at` — die Tabelle hat keine. '
      + 'Die Zeilen mit user_id haengen zusaetzlich ueber den Loeschkatalog an der Kontoloeschung.',
  },
  {
    tabelle: 'analytics_events',
    zeitSpalte: 'created_at',
    // Keine ipSpalte: `ip_hash` ist live in 0 von 4165 Zeilen belegt und
    // waere ohnehin schon pseudonym. Es gibt hier nichts zu kuerzen.
    loeschFristTage: 180,
    begruendung:
      'Web-Vitals (Ladezeiten je Seitenpfad). Enthaelt keinen direkten Personenbezug — der user_agent ist der '
      + 'staerkste Wert. Laengere Frist als bei visitors, weil ein Jahresvergleich der Ladezeiten fachlich Sinn ergibt.',
  },
  {
    tabelle: 'conversions',
    zeitSpalte: 'created_at',
    ipSpalte: 'ip',
    ipFristTage: 30,
    loeschFristTage: 365,
    begruendung:
      'Server-seitige Conversion-Erfassung fuer den Offline-Import zu Google Ads. E-Mail und Telefon liegen '
      + 'bereits nur als SHA-256 vor; die IP dagegen roh — sie wird fuer den Import gar nicht gebraucht und faellt '
      + 'nach 30 Tagen. Die Zeile selbst bleibt ein Jahr, damit Jahresvergleiche der Werbewirkung moeglich sind. '
      + 'BETRIEBSENTSCHEIDUNG, keine gesetzliche Frist.',
  },
]

/**
 * Tabellen des Perimeters, die der Lauf AUSDRUECKLICH NICHT anfasst.
 *
 * Sie stehen hier, damit „wird nicht geloescht" eine Entscheidung ist und
 * kein Vergessen — dieselbe Rolle, die der Loeschkatalog fuer die
 * Kontoloeschung spielt.
 */
export const NICHT_AUTOMATISCH: readonly { tabelle: string; begruendung: string }[] = [
  {
    tabelle: 'lead_inquiries',
    begruendung:
      'Eine Beratungsanfrage ist eine geschaeftliche Willenserklaerung („bitte rufen Sie mich an"), kein '
      + 'Messwert. Wann sie erledigt ist, entscheidet die Bearbeitung im CRM (status: converted/lost), nicht '
      + 'ein Kalender. Eine hier erfundene Frist wuerde offene Anfragen loeschen. Der richtige Ort fuer die '
      + 'Entscheidung ist die CRM-Pflege.',
  },
  {
    tabelle: 'newsletter_subscribers',
    begruendung:
      'Die abgemeldete Zeile IST der Nachweis, dass dem Widerspruch entsprochen wurde (Art. 21 DSGVO), und '
      + 'gleichzeitig die Sperrliste, die eine Wiederaufnahme derselben Adresse verhindert. Sie zu loeschen wuerde '
      + 'beides zerstoeren und die Person erneut anschreibbar machen.',
  },
]

/** Der Ausschnitt des Supabase-Clients, den dieses Modul braucht. */
export interface AufbewahrungsClient {
  from(tabelle: string): {
    select(
      spalten: string,
      optionen?: { count?: 'exact'; head?: boolean },
    ): {
      lt(spalte: string, wert: string): {
        not(spalte: string, operator: string, wert: null): PromiseLike<{ count?: number | null; error: DbFehler | null }>
      } & PromiseLike<{ count?: number | null; error: DbFehler | null }>
    }
    update(werte: Record<string, unknown>): {
      lt(spalte: string, wert: string): {
        not(spalte: string, operator: string, wert: null): {
          select(spalten: string): PromiseLike<{ data: unknown[] | null; error: DbFehler | null }>
        }
      }
    }
    delete(): {
      lt(spalte: string, wert: string): {
        select(spalten: string): PromiseLike<{ data: unknown[] | null; error: DbFehler | null }>
      }
    }
  }
}

export interface TabellenErgebnis {
  tabelle: string
  /** Wie viele Zeilen die IP verloren haben (bzw. verlieren wuerden). */
  ipGekuerzt: number
  /** Wie viele Zeilen entfernt wurden (bzw. wuerden). */
  geloescht: number
  fehler?: string
}

export interface AufbewahrungsErgebnis {
  trockenlauf: boolean
  tabellen: TabellenErgebnis[]
  ipGekuerztGesamt: number
  geloeschtGesamt: number
  fehler: number
}

/** Stichtag: `tage` Tage vor `jetzt`, als ISO-Zeichenkette. */
export function stichtag(jetzt: Date, tage: number): string {
  return new Date(jetzt.getTime() - tage * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Fuehrt die Aufbewahrung aus.
 *
 * @param trockenlauf `true` = nur zaehlen, nichts aendern. Das ist der
 *   STANDARD des Cron-Aufrufers. Der Lauf loescht in Produktion erst,
 *   wenn er ausdruecklich freigeschaltet ist — dieselbe Zurueckhaltung
 *   wie beim Pilot-Erstversand: ein Lauf, der beim ersten Einschalten
 *   mehrere tausend Zeilen entfernt, muss vorher gesehen worden sein.
 *
 * Ein Fehler an einer Tabelle haelt die anderen NICHT auf und wird im
 * Ergebnis benannt. Ein Lauf, der bei der ersten Stoerung abbricht,
 * hinterliesse eine halb angewandte Frist, die niemand nachvollziehen kann.
 */
export async function fuehreAufbewahrungAus(
  client: AufbewahrungsClient,
  optionen: { jetzt: Date; trockenlauf: boolean },
): Promise<AufbewahrungsErgebnis> {
  const { jetzt, trockenlauf } = optionen
  const tabellen: TabellenErgebnis[] = []

  for (const eintrag of AUFBEWAHRUNG) {
    const ergebnis: TabellenErgebnis = { tabelle: eintrag.tabelle, ipGekuerzt: 0, geloescht: 0 }

    try {
      // ── Stufe 1: IP kuerzen ──────────────────────────────────────
      if (eintrag.ipSpalte && eintrag.ipFristTage != null) {
        const grenze = stichtag(jetzt, eintrag.ipFristTage)
        if (trockenlauf) {
          const { count, error } = await client
            .from(eintrag.tabelle)
            .select('id', { count: 'exact', head: true })
            .lt(eintrag.zeitSpalte, grenze)
            .not(eintrag.ipSpalte, 'is', null)
          if (error) throw new Error(`Zaehlen (IP) fehlgeschlagen: ${error.message}`)
          ergebnis.ipGekuerzt = count ?? 0
        } else {
          // `.select()` ist der Wirkungsnachweis: PostgREST meldet keinen
          // Fehler, wenn NULL Zeilen getroffen wurden. Ohne ihn koennte
          // dieser Lauf jahrelang „erfolgreich" nichts tun.
          const { data, error } = await client
            .from(eintrag.tabelle)
            .update({ [eintrag.ipSpalte]: null })
            .lt(eintrag.zeitSpalte, grenze)
            .not(eintrag.ipSpalte, 'is', null)
            .select('id')
          if (error) throw new Error(`IP-Kuerzung fehlgeschlagen: ${error.message}`)
          ergebnis.ipGekuerzt = data?.length ?? 0
        }
      }

      // ── Stufe 2: Zeile loeschen ──────────────────────────────────
      const loeschGrenze = stichtag(jetzt, eintrag.loeschFristTage)
      if (trockenlauf) {
        const { count, error } = await client
          .from(eintrag.tabelle)
          .select('id', { count: 'exact', head: true })
          .lt(eintrag.zeitSpalte, loeschGrenze)
        if (error) throw new Error(`Zaehlen (Loeschung) fehlgeschlagen: ${error.message}`)
        ergebnis.geloescht = count ?? 0
      } else {
        const { data, error } = await client
          .from(eintrag.tabelle)
          .delete()
          .lt(eintrag.zeitSpalte, loeschGrenze)
          .select('id')
        if (error) throw new Error(`Loeschung fehlgeschlagen: ${error.message}`)
        ergebnis.geloescht = data?.length ?? 0
      }
    } catch (err) {
      ergebnis.fehler = err instanceof Error ? err.message : String(err)
    }

    tabellen.push(ergebnis)
  }

  return {
    trockenlauf,
    tabellen,
    ipGekuerztGesamt: tabellen.reduce((s, t) => s + t.ipGekuerzt, 0),
    geloeschtGesamt: tabellen.reduce((s, t) => s + t.geloescht, 0),
    fehler: tabellen.filter(t => t.fehler).length,
  }
}
