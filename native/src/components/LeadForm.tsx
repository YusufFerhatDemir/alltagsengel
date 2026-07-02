import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Colors, Fonts } from '../constants/theme'
import { sendLeadInquiry } from '../lib/api'
import { Card, GoldButton, Input, MutedText } from './ui'

// ═══════════════════════════════════════════════════════════
// LEAD CAPTURE FORM — Kostenlose Beratung anfragen
// Native Pendant zu components/LeadForm.tsx (Web); sendet über
// die bestehende API-Route /api/lead-inquiry.
// ═══════════════════════════════════════════════════════════

interface LeadFormProps {
  defaultService?: string
  source: string
}

export default function LeadForm({ defaultService, source }: LeadFormProps) {
  const [form, setForm] = useState({ name: '', phone: '', plz: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const valid = form.name.trim().length > 0 && form.phone.trim().length >= 6 && /^[0-9]{5}$/.test(form.plz)

  async function submit() {
    if (!valid) return
    setStatus('sending')
    const res = await sendLeadInquiry({
      ...form,
      service: defaultService || '',
      source,
    })
    if (res.ok) {
      setStatus('sent')
      setForm({ name: '', phone: '', plz: '', message: '' })
    } else {
      setErrorMsg(res.error || '')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <Card style={styles.successCard}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successTitle}>Vielen Dank!</Text>
        <Text style={styles.successText}>Wir melden uns innerhalb von 24 Stunden bei Ihnen.</Text>
      </Card>
    )
  }

  return (
    <Card>
      <Text style={styles.title}>Kostenlose Beratung anfragen</Text>
      <Text style={styles.sub}>Wir rufen Sie zurück — unverbindlich und kostenfrei.</Text>

      <View style={styles.fields}>
        <Input
          placeholder="Ihr Name *"
          value={form.name}
          onChangeText={name => setForm({ ...form, name })}
          autoComplete="name"
        />
        <View style={styles.row}>
          <Input
            placeholder="Telefonnummer *"
            value={form.phone}
            onChangeText={phone => setForm({ ...form, phone })}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={styles.phone}
          />
          <Input
            placeholder="PLZ *"
            value={form.plz}
            onChangeText={plz => setForm({ ...form, plz: plz.replace(/\D/g, '').slice(0, 5) })}
            keyboardType="number-pad"
            maxLength={5}
            style={styles.plz}
          />
        </View>
        <Input
          placeholder="Ihre Nachricht (optional)"
          value={form.message}
          onChangeText={message => setForm({ ...form, message })}
          multiline
          numberOfLines={3}
          style={styles.message}
        />
      </View>

      {status === 'error' && (
        <Text style={styles.error}>{errorMsg || 'Fehler beim Senden. Bitte versuchen Sie es erneut.'}</Text>
      )}

      <GoldButton onPress={submit} disabled={!valid} loading={status === 'sending'} style={styles.submit}>
        Jetzt Beratung anfragen
      </GoldButton>

      <MutedText style={styles.privacy}>Ihre Daten werden nur zur Kontaktaufnahme verwendet.</MutedText>
    </Card>
  )
}

const styles = StyleSheet.create({
  title: {
    color: Colors.ink,
    fontFamily: Fonts.bold,
    fontSize: 18,
    marginBottom: 4,
  },
  sub: {
    color: Colors.ink3,
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginBottom: 18,
  },
  fields: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  phone: { flex: 2 },
  plz: { flex: 1 },
  message: { minHeight: 80, textAlignVertical: 'top' },
  error: {
    color: Colors.red,
    fontFamily: Fonts.regular,
    fontSize: 13,
    marginTop: 8,
  },
  submit: { marginTop: 16 },
  privacy: { textAlign: 'center', marginTop: 12 },
  successCard: {
    backgroundColor: 'rgba(45, 106, 79, 0.1)',
    borderColor: Colors.greenBorder,
    alignItems: 'center',
    paddingVertical: 32,
  },
  successIcon: { fontSize: 44, color: Colors.green, marginBottom: 10 },
  successTitle: {
    color: Colors.ink,
    fontFamily: Fonts.bold,
    fontSize: 20,
    marginBottom: 6,
  },
  successText: {
    color: Colors.ink2,
    fontFamily: Fonts.regular,
    fontSize: 14,
    textAlign: 'center',
  },
})
