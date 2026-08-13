import { redirect } from 'next/navigation'
import { dipaModus, freischaltungPflicht } from '@/lib/coach/config'
import FreischaltungClient from './FreischaltungClient'

// Der Freischaltcode ist ein DiPA-/Pilot-Mechanismus, kein Bestandteil des
// normalen Betriebs. Sind beide Schalter aus, existiert die Seite für den
// Nutzer nicht — sonst stünde im Produkt eine Zugangshürde, die es gar
// nicht gibt (COACH_DIPA_MODUS / COACH_FREISCHALTUNG_PFLICHT, beide Default aus).
export default function FreischaltungSeite() {
  if (!dipaModus() && !freischaltungPflicht()) redirect('/pflegecoach')
  return <FreischaltungClient />
}
