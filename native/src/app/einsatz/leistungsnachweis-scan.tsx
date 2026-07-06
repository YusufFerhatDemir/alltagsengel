import { useRef, useState } from 'react'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, Card, GhostButton, GoldButton, MutedText } from '../../components/ui'
import { API_BASE } from '../../constants/config'
import { Colors, Fonts } from '../../constants/theme'
import { enqueueAction } from '../../lib/offline-queue'
import { supabase } from '../../lib/supabase'

// ═══════════════════════════════════════════════════════════
// LEISTUNGSNACHWEIS-SCAN — Foto des Papier-Nachweises fotografieren
// (Kamera) oder aus der Galerie wählen, dann Upload an die dedizierte
// Bridge-API-Route (service_role-Insert serverseitig). Bei
// Netzwerkfehler: Offline-Queue statt Fehlerdialog.
// ═══════════════════════════════════════════════════════════

export default function LeistungsnachweisScanScreen() {
  const router = useRouter()
  const { serviceRecordId } = useLocalSearchParams<{ serviceRecordId: string }>()
  const [permission, requestPermission] = useCameraPermissions()
  const [showCamera, setShowCamera] = useState(false)
  const [photo, setPhoto] = useState<{ base64: string; mimeType: string } | null>(null)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const cameraRef = useRef<CameraView>(null)

  async function openCamera() {
    setError('')
    if (!permission?.granted) {
      const res = await requestPermission()
      if (!res.granted) {
        setError('Kamerazugriff wurde nicht erlaubt. Bitte in den Einstellungen aktivieren.')
        return
      }
    }
    setShowCamera(true)
  }

  async function takePicture() {
    if (!cameraRef.current) return
    try {
      const result = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 })
      if (result?.base64) {
        setPhoto({ base64: result.base64, mimeType: 'image/jpeg' })
        setPreviewUri(result.uri)
      }
      setShowCamera(false)
    } catch (err) {
      console.warn('Foto-Aufnahme fehlgeschlagen:', err)
      setError('Foto konnte nicht aufgenommen werden. Bitte erneut versuchen.')
      setShowCamera(false)
    }
  }

  async function pickFromLibrary() {
    setError('')
    const permissionRes = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permissionRes.granted) {
      setError('Zugriff auf Fotos wurde nicht erlaubt. Bitte in den Einstellungen aktivieren.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    })
    if (!result.canceled && result.assets[0]?.base64) {
      setPhoto({ base64: result.assets[0].base64, mimeType: result.assets[0].mimeType || 'image/jpeg' })
      setPreviewUri(result.assets[0].uri)
    }
  }

  async function uploadPhoto() {
    if (!photo || !serviceRecordId) return
    setUploading(true)
    setError('')
    setSuccess('')

    const payload = {
      service_record_id: serviceRecordId,
      image_base64: photo.base64,
      mime_type: photo.mimeType,
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const res = await fetch(`${API_BASE}/api/native/leistungsnachweis-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('request-failed')

      setSuccess('Foto erfolgreich hochgeladen. Die Prüfung erfolgt durch das Büro.')
      setPhoto(null)
      setPreviewUri(null)
    } catch {
      // Netzwerkfehler → in Offline-Queue puffern statt Fehlerdialog
      await enqueueAction('leistungsnachweis_upload', payload)
      setSuccess('Kein Netz — Foto wurde lokal gespeichert und wird automatisch hochgeladen, sobald wieder Internet verfügbar ist.')
      setPhoto(null)
      setPreviewUri(null)
    } finally {
      setUploading(false)
    }
  }

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.cameraControls}>
          <GhostButton onPress={() => setShowCamera(false)} style={styles.cameraBtn}>
            Abbrechen
          </GhostButton>
          <GoldButton onPress={takePicture} style={styles.cameraBtn}>
            Foto aufnehmen
          </GoldButton>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Leistungsnachweis fotografieren</Text>
        <BodyText style={styles.intro}>
          Fotografieren Sie den unterschriebenen Papier-Leistungsnachweis oder wählen Sie ein Foto aus
          der Galerie.
        </BodyText>

        <Card>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <MutedText style={styles.placeholder}>Noch kein Foto ausgewählt</MutedText>
          )}

          <View style={styles.actionRow}>
            <GhostButton onPress={openCamera} style={styles.actionBtn}>
              Kamera
            </GhostButton>
            <GhostButton onPress={pickFromLibrary} style={styles.actionBtn}>
              Galerie
            </GhostButton>
          </View>

          {error !== '' && <Text style={styles.error}>{error}</Text>}
          {success !== '' && <Text style={styles.success}>{success}</Text>}

          <GoldButton onPress={uploadPhoto} disabled={!photo} loading={uploading} style={styles.uploadBtn}>
            Hochladen
          </GoldButton>
        </Card>

        <GhostButton onPress={() => router.back()} style={styles.closeBtn}>
          Schließen
        </GhostButton>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingTop: 28, gap: 16 },
  title: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 24 },
  intro: {},
  placeholder: { textAlign: 'center', paddingVertical: 40 },
  preview: { width: '100%', height: 220, borderRadius: 12, marginBottom: 12, backgroundColor: Colors.coal2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: { flex: 1 },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13, marginTop: 12 },
  success: { color: Colors.green, fontFamily: Fonts.medium, fontSize: 13, marginTop: 12, lineHeight: 19 },
  uploadBtn: { marginTop: 16 },
  closeBtn: { marginTop: 4 },
  cameraContainer: { flex: 1, backgroundColor: Colors.coal },
  camera: { flex: 1 },
  cameraControls: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    paddingBottom: 36,
    backgroundColor: Colors.coal,
  },
  cameraBtn: { flex: 1 },
})
