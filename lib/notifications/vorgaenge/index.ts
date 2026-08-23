// ═══════════════════════════════════════════════════════════════════════
// Sammelstelle der wiederherstellbaren Vorgaenge
// ═══════════════════════════════════════════════════════════════════════
//
// Das Vorgangsregister (lib/notifications/wiederherstellung.ts) fuellt
// sich als Nebenwirkung des Modulladens. Wer den Wiederholungslauf
// startet, MUSS deshalb diese Datei importieren — sonst ist das Register
// leer und jede offene Zustellung landet als „nicht wiederherstellbar"
// im Dead Letter.
//
// Ein neuer Vorgang wird hier eingetragen, sonst nirgends.
// ═══════════════════════════════════════════════════════════════════════

import '@/lib/notifications/vorgaenge/buchung'
import '@/lib/notifications/vorgaenge/rechnung'

export { registrierteVorgaenge } from '@/lib/notifications/wiederherstellung'
