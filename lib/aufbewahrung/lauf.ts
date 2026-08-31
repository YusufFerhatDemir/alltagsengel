// ═══════════════════════════════════════════════════════════════════════
// Der Aufbewahrungslauf — und die Spur, die er hinterlaesst
// ═══════════════════════════════════════════════════════════════════════
//
// Der Ablauf ist derselbe wie in `lib/perimeter/aufbewahrung.ts`: zwei
// Stufen (IP kuerzen, dann Zeile loeschen), Trockenlauf als Standard, ein
// Fehler an einer Tabelle haelt die anderen nicht auf. Zwei Dinge kommen
// hinzu.
//
// ── 1. DIE SCHUTZBEDINGUNG ────────────────────────────────────────────
//
// Am Perimeter war jede Zeile gleich: ein Messwert, alt genug, weg. Im
// Betrieb stimmt das nicht. Ein `geo_event` mit `service_record_id` ist
// der Standortbeleg einer abzurechnenden Leistung; eine `offline_queue`-
// Zeile auf `pending` ist eine Aenderung, die den Server nie erreicht hat.
// Beides nach Kalender zu loeschen hiesse, einen Beleg oder die Arbeit
// einer Kollegin wegzuwerfen.
//
// Die Bedingung steht deshalb DEKLARATIV an der Regel (siehe
// `AufbewahrungsRegel.schutz`) und nicht in einer Funktion hier — so
// steht sie im Bericht, und wer die Fristen liest, liest die Ausnahmen
// mit.
//
// ── 2. DIE SPUR ───────────────────────────────────────────────────────
//
// Eine automatische Loeschung ohne Protokoll ist nicht nachweisbar. Nach
// Art. 5 Abs. 2 DSGVO muss belegbar sein, DASS geloescht wurde — und bei
// einer Rueckfrage („wo ist der Standortnachweis vom 3.?") ist der
// Unterschied zwischen „nie erfasst" und „fristgemaess entfernt" der
// ganze Unterschied.
//
// Geschrieben wird nach `mis_audit_log` mit `action='delete'` und
// `entity_type='aufbewahrung'`. Beide Werte sind vom Live-CHECK gedeckt
// (geprueft am 31.08.2026) — ein erfundener `action`-Wert liesse den
// Insert lautlos scheitern, und dann waere die Spur eine Behauptung.
//
// Protokolliert wird NUR der scharfe Lauf und NUR, wenn wirklich etwas
// passiert ist. Ein Trockenlauf hat nichts geloescht; eine Zeile darueber
// wuerde die Spur mit Nichtereignissen fuellen, bis niemand mehr
// hineinsieht.

import { katalogMitFristen, type AufgelosteRegel } from './katalog'

export interface DbFehler {
  message: string
  code?: string
}

/**
 * Der Ausschnitt des Supabase-Clients, den der Lauf braucht.
 *
 * Bewusst schmal und locker getypt: PostgREST-Ketten sind je nach
 * angehaengtem Filter unterschiedlich lang, und ein exakter Typ dafuer
 * waere laenger als das Modul. Die Aufrufer reichen einen echten Client
 * herein; Tests reichen einen Doppelgaenger.
 */
export interface LaufClient {
  from(tabelle: string): any
}

export interface RegelErgebnis {
  tabelle: string
  bereich: string
  /** Wie viele Zeilen die IP verloren haben (bzw. verlieren wuerden). */
  ipGekuerzt: number
  /** Wie viele Zeilen entfernt wurden (bzw. wuerden). */
  geloescht: number
  loeschFristTage: number
  fristQuelle: 'vorgabe' | 'umgebung'
  /** Ein ENV-Wert, der verworfen wurde. */
  warnung?: string
  /** Der angewandte Schutz, im Klartext. */
  schutz?: string
  fehler?: string
}

export interface LaufErgebnis {
  trockenlauf: boolean
  regeln: RegelErgebnis[]
  ipGekuerztGesamt: number
  geloeschtGesamt: number
  fehler: number
  warnungen: string[]
  /** Ob die Spur geschrieben werden konnte. `null` = es gab nichts zu protokollieren. */
  spurGeschrieben: boolean | null
  spurFehler?: string
}

/** Stichtag: `tage` Tage vor `jetzt`, als ISO-Zeichenkette. */
export function stichtag(jetzt: Date, tage: number): string {
  return new Date(jetzt.getTime() - tage * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Haengt die Schutzbedingung an eine PostgREST-Kette.
 *
 * `wert: 'IST_NULL'` ist die Sonderform fuer „Spalte ist leer" — PostgREST
 * schreibt das als `.is(spalte, null)` und nicht als `.eq(spalte, null)`.
 * Ohne diese Unterscheidung liefe der geo_events-Schutz ins Leere: `eq`
 * gegen NULL trifft in SQL NIE etwas, der Filter waere wirkungslos und
 * der Lauf wuerde ALLE alten Ereignisse loeschen — auch die mit Beleg.
 */
function mitSchutz(kette: any, regel: AufgelosteRegel): any {
  const s = regel.schutz
  if (!s) return kette
  if (s.operator === 'eq' && s.wert === 'IST_NULL') return kette.is(s.spalte, null)
  if (s.operator === 'in') return kette.in(s.spalte, [...(s.wert as readonly string[])])
  return kette[s.operator](s.spalte, s.wert as string)
}

/**
 * Fuehrt den Aufbewahrungslauf ueber den ganzen Katalog aus.
 *
 * @param trockenlauf `true` = nur zaehlen, nichts aendern. Das ist der
 *   STANDARD des Cron-Aufrufers: die Wirkung braucht eine ausdrueckliche
 *   Freischaltung, weil der erste scharfe Lauf einen Bestand entfernt,
 *   den nie jemand angesehen hat.
 */
export async function fuehreAufbewahrungslaufAus(
  client: LaufClient,
  optionen: {
    jetzt: Date
    trockenlauf: boolean
    env?: Record<string, string | undefined>
  },
): Promise<LaufErgebnis> {
  const { jetzt, trockenlauf } = optionen
  const katalog = katalogMitFristen(optionen.env ?? process.env)
  const regeln: RegelErgebnis[] = []
  const warnungen: string[] = []

  for (const regel of katalog) {
    const ergebnis: RegelErgebnis = {
      tabelle: regel.tabelle,
      bereich: regel.bereich,
      ipGekuerzt: 0,
      geloescht: 0,
      loeschFristTage: regel.loeschFrist.tage,
      fristQuelle: regel.loeschFrist.quelle,
      warnung: regel.loeschFrist.warnung ?? regel.ipFrist?.warnung,
      schutz: regel.schutz?.begruendung,
    }
    if (ergebnis.warnung) warnungen.push(`${regel.tabelle}: ${ergebnis.warnung}`)

    try {
      // ── Stufe 1: IP kuerzen ──────────────────────────────────────
      if (regel.ipSpalte && regel.ipFrist) {
        const grenze = stichtag(jetzt, regel.ipFrist.tage)
        if (trockenlauf) {
          const { count, error } = await client
            .from(regel.tabelle)
            .select('id', { count: 'exact', head: true })
            .lt(regel.zeitSpalte, grenze)
            .not(regel.ipSpalte, 'is', null)
          if (error) throw new Error(`Zaehlen (IP) fehlgeschlagen: ${error.message}`)
          ergebnis.ipGekuerzt = count ?? 0
        } else {
          // `.select()` ist der Wirkungsnachweis: PostgREST meldet keinen
          // Fehler, wenn null Zeilen getroffen wurden. Ohne ihn koennte
          // dieser Lauf jahrelang „erfolgreich" nichts tun.
          const { data, error } = await client
            .from(regel.tabelle)
            .update({ [regel.ipSpalte]: null })
            .lt(regel.zeitSpalte, grenze)
            .not(regel.ipSpalte, 'is', null)
            .select('id')
          if (error) throw new Error(`IP-Kuerzung fehlgeschlagen: ${error.message}`)
          ergebnis.ipGekuerzt = data?.length ?? 0
        }
      }

      // ── Stufe 2: Zeile loeschen, Schutzbedingung eingerechnet ────
      const loeschGrenze = stichtag(jetzt, regel.loeschFrist.tage)
      if (trockenlauf) {
        const kette = client
          .from(regel.tabelle)
          .select('id', { count: 'exact', head: true })
          .lt(regel.zeitSpalte, loeschGrenze)
        const { count, error } = await mitSchutz(kette, regel)
        if (error) throw new Error(`Zaehlen (Loeschung) fehlgeschlagen: ${error.message}`)
        ergebnis.geloescht = count ?? 0
      } else {
        const kette = client
          .from(regel.tabelle)
          .delete()
          .lt(regel.zeitSpalte, loeschGrenze)
        const { data, error } = await mitSchutz(kette, regel).select('id')
        if (error) throw new Error(`Loeschung fehlgeschlagen: ${error.message}`)
        ergebnis.geloescht = data?.length ?? 0
      }
    } catch (err) {
      ergebnis.fehler = err instanceof Error ? err.message : String(err)
    }

    regeln.push(ergebnis)
  }

  const ipGekuerztGesamt = regeln.reduce((s, r) => s + r.ipGekuerzt, 0)
  const geloeschtGesamt = regeln.reduce((s, r) => s + r.geloescht, 0)

  const spur = await schreibeSpur(client, {
    trockenlauf, regeln, ipGekuerztGesamt, geloeschtGesamt, jetzt,
  })

  return {
    trockenlauf,
    regeln,
    ipGekuerztGesamt,
    geloeschtGesamt,
    fehler: regeln.filter(r => r.fehler).length,
    warnungen,
    spurGeschrieben: spur.geschrieben,
    spurFehler: spur.fehler,
  }
}

/**
 * Schreibt die Loeschung in die Revisionsspur.
 *
 * `action='delete'` und `entity_type='aufbewahrung'`: `action` ist durch
 * `mis_audit_log_action_check` beschraenkt, `delete` steht dort drin
 * (Live-Stand 31.08.2026). Ein erfundener Wert liesse den Insert lautlos
 * scheitern — die Spur waere dann eine Behauptung, und genau dieser Fall
 * ist in diesem Projekt schon einmal eingetreten.
 *
 * Ein Fehler beim Protokollieren macht den Lauf NICHT rueckgaengig (das
 * ginge auch gar nicht) und bricht ihn nicht ab — er wird gemeldet. Ein
 * Lauf, der wegen der Spur abbraeche, liesse den Bestand halb geraeumt
 * zurueck.
 */
async function schreibeSpur(
  client: LaufClient,
  daten: {
    trockenlauf: boolean
    regeln: RegelErgebnis[]
    ipGekuerztGesamt: number
    geloeschtGesamt: number
    jetzt: Date
  },
): Promise<{ geschrieben: boolean | null; fehler?: string }> {
  // Ein Trockenlauf hat nichts getan. Und ein scharfer Lauf ohne Wirkung
  // ebenfalls — beides zu protokollieren fuellt die Spur mit
  // Nichtereignissen, bis niemand mehr hineinsieht.
  if (daten.trockenlauf) return { geschrieben: null }
  if (daten.geloeschtGesamt === 0 && daten.ipGekuerztGesamt === 0) return { geschrieben: null }

  try {
    const { error } = await client.from('mis_audit_log').insert({
      entity_type: 'aufbewahrung',
      action: 'delete',
      actor_name: 'Cron Aufbewahrung',
      actor_role: 'system',
      details: {
        zeitpunkt: daten.jetzt.toISOString(),
        zeilen_geloescht: daten.geloeschtGesamt,
        ip_gekuerzt: daten.ipGekuerztGesamt,
        je_tabelle: daten.regeln
          .filter(r => r.geloescht > 0 || r.ipGekuerzt > 0 || r.fehler)
          .map(r => ({
            tabelle: r.tabelle,
            bereich: r.bereich,
            geloescht: r.geloescht,
            ip_gekuerzt: r.ipGekuerzt,
            frist_tage: r.loeschFristTage,
            frist_quelle: r.fristQuelle,
            ...(r.schutz ? { schutz: r.schutz } : {}),
            ...(r.fehler ? { fehler: r.fehler } : {}),
          })),
      },
    })
    if (error) return { geschrieben: false, fehler: error.message }
    return { geschrieben: true }
  } catch (err) {
    return { geschrieben: false, fehler: err instanceof Error ? err.message : String(err) }
  }
}
