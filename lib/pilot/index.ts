// Pilot / kontrollierter Echtbetrieb — öffentlicher Einstieg.
export * from './types'
export { KETTEN_SCHRITTE, schrittHref } from './schritte'
export { ermittleVoraussetzungen } from './voraussetzungen'
export { ermittleKundenKette, ermittleKundenKetten } from './kundenkette'
// Money-Path-Betriebslage — die dritte Frage neben Betriebsbereitschaft
// und Kundenkette: wie steht es HEUTE um die vier Geldpfade?
export {
  ermittleMoneyPath,
  FREIGABE_HINWEIS,
  NICHT_VERSANDFAEHIGE_STATUS,
  type MoneyPathAmpel,
  type MoneyPathBereich,
  type MoneyPathKennzahl,
  type MoneyPathUebersicht,
  type Messwert,
} from './control-center'

// Phase 8 — kontrollierter Erstbetrieb der Geldpfade.
export {
  erstellePrePilotSnapshot,
  snapshotAlsText,
  projektRefAus,
  SNAPSHOT_FREIGABE_HINWEIS,
  ERWARTETER_PROJEKT_REF,
  DOKUMENTIERTE_SICHERHEITSLAGE,
  JUENGSTE_MIGRATIONEN,
  type PrePilotSnapshot,
  type SnapshotAbschnitt,
  type SnapshotPunkt,
  type SnapshotHerkunft,
  type SnapshotAmpel,
  type PilotZustand,
  type Zusicherungen,
  type GemeldeterStand,
  type SnapshotEingaben,
} from './pre-pilot-snapshot'

export {
  pruefeRechnungFuerPilot,
  pilotBerichtAlsText,
  verdeckeEmail,
  AUFTRAGS_KATALOG,
  type PilotUrteil,
  type PilotBefund,
  type PilotBefundArt,
  type RechnungPilotBericht,
  type RechnungPilotParams,
} from './rechnung-pilot'

export {
  erstversandFreigabe,
  erzeugeSendeToken,
  pruefeSendeToken,
  verbraucheSendeToken,
  entwerteSendeToken,
  entwerteAlleOffenenTokens,
  FIRST_REAL_INVOICE_APPROVED,
  FREIGABE_ENV,
  FREIGABE_AN_WERT,
  STANDARD_GUELTIGKEIT_MINUTEN,
  type FreigabeStand,
  type SendeToken,
  type TokenAblehnung,
  type TokenPruefung,
  type TokenVerbrauch,
  type TokenErzeugenParams,
  type TokenErzeugenErgebnis,
  type TokenPruefenParams,
} from './send-gate'

export {
  pruefeNachVersand,
  nachpruefungAlsText,
  type NachpruefErgebnis,
  type NachpruefUrteil,
  type Nachpruefpunkt,
  type NachpruefSchluessel,
  type NachpruefEingaben,
} from './post-send-verification'

// Phase 8, Tracks 5–10 — CAMT-Pilot, Allocation-Gate, Mahn-Trockenlauf,
// Abstimmung, Geschaeftsangaben, Phasenkette.
export {
  camtPilotLauf,
  pilotBerichtText,
  beurteilePilot,
  dublettenInDatei,
  baueRechnungsreferenzen,
  centAlsText,
  PILOT_MODUS,
  PILOT_QUELLE,
  type CamtPilotBericht,
  type CamtPilotParams,
  type CamtPilotUrteil,
  type PilotPosten,
  type PilotRechnungsreferenz,
  type PilotDublettenschutz,
  type PilotUmgebungsbefund,
  type SollHaben,
} from './camt-pilot'

export {
  pruefeZuordnung,
  oeffneAllocationGate,
  loeseAllocationGateEin,
  gateBerichtText,
  allocationIdempotencyKey,
  TOKEN_GUELTIG_MINUTEN,
  AKTION_GEOEFFNET,
  AKTION_EINGELOEST,
  type AllocationGateErgebnis,
  type OeffneGateParams,
  type EinloeseGateParams,
  type EinloeseErgebnis,
  type EinloeseBefund,
  type GateStatus,
  type GatePunkt,
  type GatePruefung,
  type ZuordnungsArt,
} from './allocation-gate'

export {
  mahnwesenDryRun,
  mahnDryRunBerichtText,
  urteileUeberGate,
  ermittleBeobachtungen,
  ermittleZustaende,
  ernsteresUrteil,
  URTEIL_RANG,
  ZUSTAND_LABEL,
  KLEINBETRAG_CENT,
  MAHN_STANDARD_LIMIT,
  type MahnUrteil,
  type MahnDryRunBericht,
  type MahnDryRunPosten,
  type MahnDryRunParams,
  type MahnBeobachtung,
  type Rechnungszustand,
} from './mahnwesen-dryrun'

export {
  stimmeMoneyPathAb,
  abstimmBerichtText,
  STUFEN_REIHENFOLGE,
  STUFEN_TITEL,
  ABSTIMM_STANDARD_LIMIT,
  type AbstimmBericht,
  type AbstimmStufe,
  type AbstimmBefund,
  type AbstimmParams,
  type StufenBefund,
  type StufeId,
} from './reconciliation'

export {
  ermittleBusinessInputs,
  businessInputsBerichtText,
  ALLE_EINGABEN,
  DATEV_EINGABEN,
  CHAIRMATCH_EINGABEN,
  LAEUFT_UNABHAENGIG,
  LAEUFT_NICHT_OHNE_D1_D2,
  RECHNUNGSPILOT_ABHAENGIGKEITEN,
  type BusinessInput,
  type BusinessInputBericht,
  type BusinessInputStand,
  type EingabeBereich,
  type EingabeSchwere,
  type EingabeStand,
} from './business-inputs'

export {
  ermittlePilotPhasen,
  PHASEN_REIHENFOLGE,
  PHASEN_TITEL,
  STATUS_REIHENFOLGE,
  PHASEN_FREIGABE_HINWEIS,
  type PhaseId,
  type PilotPhase,
  type PilotPhasenUebersicht,
  type PhasenKennzahl,
  type PhasenParams,
  type VorgangStatus,
} from './pilot-phasen'

// Phase 8.3, Track 4 — Kandidatenfrage und Herkunft des laufenden Codes.
export {
  ermittlePilotKandidat,
  ACTION_REQUIRED_KEIN_KANDIDAT,
  type KandidatZustand,
  type KandidatToken,
  type PilotKandidat,
  type PilotKandidatUebersicht,
} from './pilot-kandidat'

export {
  ermittleLaufzeitHerkunft,
  supabaseProjektKennung,
  type LaufzeitHerkunft,
  type HerkunftPunkt,
  type HerkunftStand,
} from './laufzeit-herkunft'
