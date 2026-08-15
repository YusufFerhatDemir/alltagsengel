import { describe, it, expect } from 'vitest'
import {
  cancelMessage,
  createDraftMessage,
  queueForSending,
  updateDraftMessage,
  validateCreateMessage,
  validateStatusTransition,
} from '@/lib/kim/message-service'
import { createFakeKimSupabase } from './_fake-supabase'

const ORG = 'org-1'
const USER = 'user-1'

function baseInput() {
  return {
    kim_address_from: 'praxis@kim.test',
    kim_address_to: 'kasse@kim.test',
    subject: 'Arztbrief',
    body_text: 'Sehr geehrte Damen und Herren, ...',
  }
}

describe('validateCreateMessage', () => {
  it('akzeptiert vollständige Eingabe', () => {
    expect(() => validateCreateMessage(baseInput())).not.toThrow()
  })

  it('wirft ohne Empfänger-Adresse', () => {
    expect(() => validateCreateMessage({ ...baseInput(), kim_address_to: '' })).toThrow('Empfänger-KIM-Adresse')
  })

  it('wirft bei ungültigem Adressformat', () => {
    expect(() => validateCreateMessage({ ...baseInput(), kim_address_to: 'keine-adresse' })).toThrow('Empfänger-KIM-Adresse')
  })

  it('wirft ohne Betreff', () => {
    expect(() => validateCreateMessage({ ...baseInput(), subject: '' })).toThrow('Betreff')
  })

  it('wirft ohne Text', () => {
    expect(() => validateCreateMessage({ ...baseInput(), body_text: undefined })).toThrow('Nachrichtentext')
  })
})

describe('validateStatusTransition', () => {
  it('erlaubt entwurf → wartend', () => {
    expect(() => validateStatusTransition('entwurf', 'wartend')).not.toThrow()
  })

  it('erlaubt keinen Rücksprung von gelesen', () => {
    expect(() => validateStatusTransition('gelesen', 'wartend')).toThrow('Ungültiger Statusübergang')
  })

  it('erlaubt Retry aus fehler zurück nach wartend', () => {
    expect(() => validateStatusTransition('fehler', 'wartend')).not.toThrow()
  })

  it('erlaubt storniert nicht mehr zu ändern', () => {
    expect(() => validateStatusTransition('storniert', 'wartend')).toThrow('Ungültiger Statusübergang')
  })
})

describe('Nachrichten-Workflow (Entwurf → Wartend → Storniert)', () => {
  it('erstellt einen Entwurf und protokolliert ihn im Audit-Log', async () => {
    const fake = createFakeKimSupabase()
    const created = await createDraftMessage(fake as any, ORG, USER, baseInput())
    expect(created.status).toBe('entwurf')
    expect(created.organization_id).toBe(ORG)
    expect(fake._table('kim_audit_log')).toHaveLength(1)
    expect(fake._table('kim_audit_log')[0].aktion).toBe('erstellt')
  })

  it('gibt einen vollständigen Entwurf zum Versand frei', async () => {
    const fake = createFakeKimSupabase()
    const created = await createDraftMessage(fake as any, ORG, USER, baseInput())
    const queued = await queueForSending(fake as any, ORG, created.id, USER)
    expect(queued.status).toBe('wartend')
  })

  it('lehnt Bearbeiten eines nicht-Entwurfs ab', async () => {
    const fake = createFakeKimSupabase()
    const created = await createDraftMessage(fake as any, ORG, USER, baseInput())
    await queueForSending(fake as any, ORG, created.id, USER)
    await expect(updateDraftMessage(fake as any, ORG, created.id, USER, { subject: 'Neu' }))
      .rejects.toThrow('Nur Entwürfe')
  })

  it('storniert einen wartenden Entwurf', async () => {
    const fake = createFakeKimSupabase()
    const created = await createDraftMessage(fake as any, ORG, USER, baseInput())
    await queueForSending(fake as any, ORG, created.id, USER)
    const cancelled = await cancelMessage(fake as any, ORG, created.id, USER)
    expect(cancelled.status).toBe('storniert')
  })

  it('respektiert die Mandantengrenze (organization_id)', async () => {
    const fake = createFakeKimSupabase()
    const created = await createDraftMessage(fake as any, ORG, USER, baseInput())
    await expect(queueForSending(fake as any, 'andere-org', created.id, USER)).rejects.toThrow('nicht gefunden')
  })
})
