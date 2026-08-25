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
