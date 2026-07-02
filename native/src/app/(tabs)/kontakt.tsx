import { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BodyText, Card, Chip, GoldButton, Input, MutedText } from '../../components/ui'
import { CONTACT } from '../../constants/config'
import { Colors, Fonts } from '../../constants/theme'
import { sendKontakt } from '../../lib/api'

// ═══════════════════════════════════════════════════════════
// KONTAKT — Telefon, WhatsApp, E-Mail, Adresse + Formular
// Formular sendet über die bestehende API-Route /api/kontakt.
// ═══════════════════════════════════════════════════════════

function ContactCard({
  icon,
  title,
  value,
  note,
  onPress,
}: {
  icon: string
  title: string
  value: string
  note: string
  onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <Card style={styles.contactCard}>
        <View style={styles.contactIcon}>
          <Text style={styles.contactIconText}>{icon}</Text>
        </View>
        <View style={styles.contactBody}>
          <Text style={styles.contactTitle}>{title}</Text>
          <Text style={styles.contactValue}>{value}</Text>
          <Text style={styles.contactNote}>{note}</Text>
        </View>
      </Card>
    </Pressable>
  )
}

export default function KontaktScreen() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [type, setType] = useState<'kunde' | 'engel'>('kunde')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const valid =
    form.name.trim().length > 0 && /\S+@\S+\.\S+/.test(form.email) && form.message.trim().length > 0

  async function submit() {
    if (!valid) return
    setStatus('sending')
    const res = await sendKontakt({ ...form, type })
    if (res.ok) {
      setStatus('sent')
      setForm({ name: '', email: '', phone: '', message: '' })
    } else {
      setErrorMsg(res.error || '')
      setStatus('error')
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Kontaktieren Sie uns</Text>
        <BodyText style={styles.intro}>
          Kostenlose Beratung zu Alltagsbegleitung, Entlastungsbetrag und allen unseren Services.
        </BodyText>

        <View style={styles.cards}>
          <ContactCard
            icon="📞"
            title="Telefon"
            value={CONTACT.phoneDisplay}
            note="Mo–Fr, 8:00–18:00 Uhr"
            onPress={() => Linking.openURL(`tel:${CONTACT.phone}`)}
          />
          <ContactCard
            icon="💬"
            title="WhatsApp"
            value="Direkt schreiben"
            note="Antwort innerhalb von 1 Stunde"
            onPress={() => Linking.openURL(CONTACT.whatsapp)}
          />
          <ContactCard
            icon="✉️"
            title="E-Mail"
            value={CONTACT.email}
            note="Antwort innerhalb von 24 Stunden"
            onPress={() => Linking.openURL(`mailto:${CONTACT.email}`)}
          />
          <ContactCard icon="📍" title="Adresse" value={CONTACT.address} note="Frankfurt Innenstadt" />
        </View>

        {status === 'sent' ? (
          <Card style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Nachricht gesendet!</Text>
            <BodyText style={styles.successText}>
              Wir melden uns innerhalb von 24 Stunden bei Ihnen.
            </BodyText>
          </Card>
        ) : (
          <Card>
            <Text style={styles.formTitle}>Nachricht senden</Text>
            <Text style={styles.formSub}>Wir antworten innerhalb von 24 Stunden.</Text>

            <View style={styles.typeRow}>
              <Chip active={type === 'kunde'} onPress={() => setType('kunde')} style={styles.typeChip}>
                Ich suche Hilfe
              </Chip>
              <Chip active={type === 'engel'} onPress={() => setType('engel')} style={styles.typeChip}>
                Ich möchte helfen
              </Chip>
            </View>

            <View style={styles.fields}>
              <Input
                placeholder="Ihr Name"
                value={form.name}
                onChangeText={name => setForm({ ...form, name })}
                autoComplete="name"
              />
              <Input
                placeholder="E-Mail Adresse"
                value={form.email}
                onChangeText={email => setForm({ ...form, email })}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <Input
                placeholder="Telefonnummer (optional)"
                value={form.phone}
                onChangeText={phone => setForm({ ...form, phone })}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Input
                placeholder="Ihre Nachricht..."
                value={form.message}
                onChangeText={message => setForm({ ...form, message })}
                multiline
                numberOfLines={4}
                style={styles.message}
              />
            </View>

            {status === 'error' && (
              <Text style={styles.error}>
                {errorMsg || 'Fehler beim Senden. Bitte versuchen Sie es erneut.'}
              </Text>
            )}

            <GoldButton
              onPress={submit}
              disabled={!valid}
              loading={status === 'sending'}
              style={styles.submit}
            >
              Nachricht senden
            </GoldButton>

            <MutedText style={styles.privacy}>
              Ihre Daten werden nur zur Bearbeitung Ihrer Anfrage verwendet — Details in der
              Datenschutzerklärung auf alltagsengel.care.
            </MutedText>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  title: {
    color: Colors.ink,
    fontFamily: Fonts.bold,
    fontSize: 26,
    marginTop: 8,
    marginBottom: 8,
  },
  intro: { marginBottom: 18 },
  cards: { gap: 12, marginBottom: 16 },
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(201, 150, 60, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactIconText: { fontSize: 22 },
  contactBody: { flex: 1 },
  contactTitle: { color: Colors.ink, fontFamily: Fonts.semibold, fontSize: 15, marginBottom: 2 },
  contactValue: { color: Colors.gold, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20 },
  contactNote: { color: Colors.ink4, fontFamily: Fonts.regular, fontSize: 12, marginTop: 2 },
  formTitle: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 18, marginBottom: 4 },
  formSub: { color: Colors.ink3, fontFamily: Fonts.regular, fontSize: 13, marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeChip: { flex: 1 },
  fields: { gap: 12 },
  message: { minHeight: 100, textAlignVertical: 'top' },
  error: { color: Colors.red, fontFamily: Fonts.regular, fontSize: 13, marginTop: 8 },
  submit: { marginTop: 16 },
  privacy: { textAlign: 'center', marginTop: 12 },
  successCard: {
    backgroundColor: 'rgba(45, 106, 79, 0.1)',
    borderColor: Colors.greenBorder,
    alignItems: 'center',
    paddingVertical: 32,
  },
  successIcon: { fontSize: 44, color: Colors.green, marginBottom: 10 },
  successTitle: { color: Colors.ink, fontFamily: Fonts.bold, fontSize: 20, marginBottom: 6 },
  successText: { textAlign: 'center' },
})
