// ═══════════════════════════════════════════════════════════════
// Kamera-Adapter — Block 20 (Native Features)
// ═══════════════════════════════════════════════════════════════
// Geprüft (12.08.2026): @capacitor/camera ist NICHT in package.json
// installiert (nur @capacitor/android, /cli, /core, /ios, /keyboard,
// /push-notifications, /splash-screen, /status-bar). Ein `npm install`
// wurde hier bewusst NICHT durchgeführt — das ist eine Produkt-
// entscheidung (neue native Abhängigkeit + Xcode/Gradle-Rebuild), keine
// rein technische. Diese Datei liefert stattdessen:
//
//   1. Ein Adapter-Interface (KameraAdapter), das später 1:1 mit einer
//      @capacitor/camera-Implementierung gefüllt werden kann, ohne
//      Aufrufer anzupassen.
//   2. Eine ECHTE, funktionierende Default-Implementierung über den
//      Standard-Web-Mechanismus `<input type="file" accept="image/*"
//      capture>` — funktioniert auch in der Capacitor-WKWebView (die
//      App ist laut Memory "ios-app-capacitor-remote" die Live-Website
//      im WebView, kein Expo) und öffnet dort ebenfalls die native
//      Kamera-App. KEINE Fake-Fotodaten — die Funktion nimmt eine
//      echte `File` entgegen (aus einem existierenden <input>-Element
//      in der aufrufenden UI-Komponente) und liest sie per FileReader.
//   3. Eine Offline-Queue-Anbindung: ist das Gerät offline, wird das
//      Foto (als Base64-DataURL) in die bestehende lib/offline/
//      -Queue eingereiht (entity_typ 'wunddoku') statt verworfen zu
//      werden.
// ═══════════════════════════════════════════════════════════════

import type { OfflineQueue } from './offline-queue'
import type { OfflineEntityTyp } from './types'
import { DEFAULT_OFFLINE_CONFIG } from './types'

export interface FotoAufnahme {
  dataUrl: string
  mimeType: string
  groesseBytes: number
  aufgenommen_am: number
}

export interface KameraAdapter {
  /** Kennzeichnet, ob eine native Plugin-Implementierung verfügbar ist. */
  istNativ: boolean
  aufnehmen(): Promise<FotoAufnahme>
}

/** Erkennt, ob die App aktuell in einer Capacitor-Hülle läuft (informativ, kein Verhalten). */
export function laeuftInCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  return !!window.Capacitor?.isNativePlatform?.()
}

/**
 * Liest eine vom Nutzer ausgewählte/aufgenommene Datei (aus
 * `<input type="file" accept="image/*" capture="environment">`) als
 * Base64-DataURL ein. Echte Browser-API (FileReader), keine Simulation.
 */
export function dateiZuFoto(datei: File): Promise<FotoAufnahme> {
  return new Promise((resolve, reject) => {
    if (!datei.type.startsWith('image/')) {
      reject(new Error('Nur Bilddateien werden unterstützt.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.onload = () => {
      resolve({
        dataUrl: String(reader.result),
        mimeType: datei.type,
        groesseBytes: datei.size,
        aufgenommen_am: Date.now(),
      })
    }
    reader.readAsDataURL(datei)
  })
}

/**
 * Web-Fallback-Adapter: erwartet, dass die UI dem Nutzer ein
 * `<input type="file" accept="image/*" capture="environment">` anbietet
 * und die ausgewählte Datei hier durchreicht. Das ist die einzige
 * Implementierung, solange @capacitor/camera nicht installiert ist.
 */
export class WebDateiKameraAdapter implements KameraAdapter {
  readonly istNativ = false
  private ausstehendeDatei: File | null = null

  /** Wird von der UI aufgerufen, sobald der Nutzer ein Foto ausgewählt/aufgenommen hat. */
  setzeDatei(datei: File): void {
    this.ausstehendeDatei = datei
  }

  async aufnehmen(): Promise<FotoAufnahme> {
    if (!this.ausstehendeDatei) {
      throw new Error('Keine Datei übergeben — zuerst setzeDatei() mit der Datei aus dem <input>-Element aufrufen.')
    }
    const foto = await dateiZuFoto(this.ausstehendeDatei)
    this.ausstehendeDatei = null
    return foto
  }
}

/**
 * Factory: liefert den aktuell verfügbaren Kamera-Adapter. Sobald
 * @capacitor/camera installiert ist, hier eine zweite Implementierung
 * ergänzen und je nach `laeuftInCapacitor()` auswählen — bewusst NICHT
 * vorab implementiert, um keinen toten Code für ein nicht vorhandenes
 * Plugin zu pflegen.
 */
export function erstelleKameraAdapter(): KameraAdapter {
  return new WebDateiKameraAdapter()
}

/**
 * Reicht ein aufgenommenes Foto in die bestehende Offline-Queue ein
 * (entity_typ 'wunddoku', aktion 'create' → POST) — für den Fall, dass
 * das Gerät beim Fotografieren offline ist. Der Direkt-Upload-Pfad
 * (online) bleibt Sache der aufrufenden UI-Komponente (lib/wunden/fotos.ts
 * über app/api/wounds/[id]/photos).
 *
 * WICHTIG: app/api/wounds/[id]/photos ist ein Sub-Ressourcen-Endpunkt
 * (POST auf eine bestehende Wunde), den die Entity-Registry
 * (lib/sync/entity-registry.ts) für 'wunddoku' NICHT kennt — dort ist
 * 'wunddoku' auf die Wunde selbst gemappt (/api/wounds bzw.
 * /api/wounds/{id}). Foto-Items dürfen daher NUR über den
 * client-seitigen Direkt-Sync (OfflineQueue.syncAll(), nutzt
 * item.endpoint 1:1) synchronisiert werden — NICHT über den
 * registry-basierten Batch-Endpunkt app/api/sync, der sie fälschlich
 * gegen /api/wounds statt /api/wounds/{id}/photos schicken würde.
 */
export async function reiheFotoInOfflineQueueEin(
  queue: OfflineQueue,
  params: {
    organizationId: string
    userId: string
    wundeId: string
    foto: FotoAufnahme
    beschreibung?: string
  },
): Promise<void> {
  const entityTyp: OfflineEntityTyp = 'wunddoku'
  await queue.enqueue({
    idempotency_key: `wunddoku-foto-${params.wundeId}-${params.foto.aufgenommen_am}`,
    entity_typ: entityTyp,
    aktion: 'create',
    max_retries: DEFAULT_OFFLINE_CONFIG.max_retries,
    endpoint: `/api/wounds/${params.wundeId}/photos`,
    payload: {
      wunde_id: params.wundeId,
      foto_data_url: params.foto.dataUrl,
      mime_type: params.foto.mimeType,
      beschreibung: params.beschreibung ?? null,
    },
    user_id: params.userId,
    organization_id: params.organizationId,
  })
}
