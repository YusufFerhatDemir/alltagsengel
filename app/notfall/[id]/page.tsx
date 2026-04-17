'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface NotfallInfo {
  id: string;
  user_id: string;
  // notfall_pin wird serverseitig rausgefiltert (RLS-P0-Fix 2026-04-17):
  // Der PIN verlässt niemals die DB — RPC liefert Response ohne diese Spalte.
  blutgruppe?: string;
  allergien?: string;
  vorerkrankungen?: string;
  notfallkontakt_name?: string;
  notfallkontakt_telefon?: string;
  notfallkontakt_beziehung?: string;
  versicherung?: string;
  versicherungsnummer?: string;
  hausarzt_name?: string;
  hausarzt_telefon?: string;
}

interface EmergencyRpcSuccess {
  notfall: NotfallInfo;
  medikamente: Medication[];
  profile: Profile;
}

interface EmergencyRpcError {
  error: 'invalid_pin' | 'rate_limited';
  retry_after?: number;
}

type EmergencyRpcResult = EmergencyRpcSuccess | EmergencyRpcError | null;

interface Medication {
  id: string;
  medikament_name: string;
  dosierung?: number;
  einheit?: string;
  einnahme_morgens?: boolean;
  einnahme_mittags?: boolean;
  einnahme_abends?: boolean;
  einnahme_nachts?: boolean;
  einnahme_hinweis?: string;
}

interface Profile {
  id: string;
  first_name?: string;
  last_name?: string;
}

export default function NotfallPage() {
  const params = useParams();
  const id = params?.id as string;

  const [stage, setStage] = useState<'pin' | 'info'>('pin');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notfallInfo, setNotfallInfo] = useState<NotfallInfo | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shake, setShake] = useState(false);

  const supabase = createClient();

  const handlePinSubmit = async () => {
    if (pinInput.length !== 4) {
      setError('PIN muss 4 Ziffern sein');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // RLS-P0-Fix 2026-04-17: PIN-Prüfung läuft serverseitig via RPC.
      // Der PIN wird in keinem Szenario an den Client zurückgegeben —
      // bei Match kommen Notfall-Daten (ohne notfall_pin), bei Mismatch
      // kommt {error:'invalid_pin'}, bei Brute-Force {error:'rate_limited'}.
      const { data, error: rpcError } = await supabase.rpc(
        'get_emergency_info_with_pin',
        { p_user_id: id, p_pin: pinInput }
      );

      if (rpcError) {
        setError('Fehler beim Abrufen der Daten');
        setLoading(false);
        return;
      }

      const result = data as EmergencyRpcResult;

      if (!result) {
        setError('Keine Notfallinformationen hinterlegt');
        setLoading(false);
        return;
      }

      if ('error' in result) {
        if (result.error === 'rate_limited') {
          setError('Zu viele Versuche. Bitte in einer Stunde erneut versuchen.');
        } else {
          setError('Falscher PIN');
        }
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setLoading(false);
        return;
      }

      if (!result.notfall) {
        setError('Keine Notfallinformationen hinterlegt');
        setLoading(false);
        return;
      }

      setNotfallInfo(result.notfall);
      setProfile(result.profile || null);
      setMedications(result.medikamente || []);
      setStage('info');
    } catch (err) {
      console.error('Error:', err);
      setError('Fehler beim Abrufen der Daten');
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (value: string) => {
    if (/^\d{0,4}$/.test(value)) {
      setPinInput(value);
    }
  };

  const handlePinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePinSubmit();
    }
  };

  const formatMedicationTimes = (med: Medication): string => {
    const times: string[] = [];
    if (med.einnahme_morgens) times.push('Morgens');
    if (med.einnahme_mittags) times.push('Mittags');
    if (med.einnahme_abends) times.push('Abends');
    if (med.einnahme_nachts) times.push('Nachts');
    return times.length > 0 ? times.join(', ') : '';
  };

  const formatDosage = (med: Medication): string => {
    if (med.dosierung && med.einheit) {
      return `${med.dosierung} ${med.einheit}`;
    }
    return med.dosierung ? `${med.dosierung}` : '';
  };

  if (!id) {
    return (
      <div className="phone" style={{ position: 'relative', width: '375px', height: '812px', margin: '0 auto' }}>
        <div className="screen" style={{ backgroundColor: '#1A1612', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#F5F0E8', fontSize: '16px', textAlign: 'center', padding: '20px' }}>
            Ungültige Anfrage
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'pin') {
    return (
      <div className="phone" style={{ position: 'relative', width: '375px', height: '812px', margin: '0 auto' }}>
        <div className="screen" style={{ backgroundColor: '#1A1612', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          {/* Logo/Emoji */}
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>🚨</div>

          {/* Title */}
          <h1 style={{ color: '#E53E3E', fontSize: '28px', fontWeight: 'bold', textAlign: 'center', margin: '0 0 10px 0' }}>
            Notfall-Zugang
          </h1>

          {/* Subtitle */}
          <p style={{ color: '#DBA84A', fontSize: '14px', textAlign: 'center', margin: '0 0 40px 0' }}>
            Alltagsengel Medizinische Notfallinformationen
          </p>

          {/* PIN Input */}
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => handlePinChange(e.target.value)}
            onKeyDown={handlePinKeyDown}
            placeholder="••••"
            maxLength={4}
            style={{
              fontSize: '48px',
              fontWeight: 'bold',
              textAlign: 'center',
              color: '#C9963C',
              backgroundColor: '#252118',
              border: '2px solid #C9963C',
              padding: '20px',
              borderRadius: '8px',
              width: '150px',
              marginBottom: '20px',
              letterSpacing: '20px',
              transition: shake ? 'transform 0.1s' : 'none',
              transform: shake ? 'translateX(-10px)' : 'translateX(0)',
            }}
          />

          {/* Error Message */}
          {error && (
            <p style={{ color: '#E53E3E', fontSize: '14px', textAlign: 'center', margin: '0 0 20px 0' }}>
              {error}
            </p>
          )}

          {/* Submit Button */}
          <button
            onClick={handlePinSubmit}
            disabled={loading || pinInput.length !== 4}
            style={{
              backgroundColor: '#C9963C',
              color: '#1A1612',
              border: 'none',
              padding: '16px 32px',
              fontSize: '16px',
              fontWeight: 'bold',
              borderRadius: '8px',
              cursor: loading || pinInput.length !== 4 ? 'not-allowed' : 'pointer',
              opacity: loading || pinInput.length !== 4 ? 0.6 : 1,
              marginTop: '20px',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Wird geladen...' : 'Zugang anfordern'}
          </button>

          {/* Footer */}
          <p style={{ color: '#8B7355', fontSize: '12px', textAlign: 'center', marginTop: 'auto', paddingBottom: '20px' }}>
            Alltagsengel.care — Notfall-Zugang
          </p>
        </div>
      </div>
    );
  }

  if (stage === 'info' && notfallInfo) {
    return (
      <div className="phone" style={{ position: 'relative', width: '375px', height: '812px', margin: '0 auto', overflow: 'auto' }}>
        <div className="screen" style={{ backgroundColor: '#1A1612', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Red Header Banner */}
          <div style={{ backgroundColor: '#E53E3E', padding: '16px 20px', textAlign: 'center' }}>
            <h1 style={{ color: '#F5F0E8', fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
              NOTFALL-INFORMATIONEN
            </h1>
            <p style={{ color: '#F5F0E8', fontSize: '16px', margin: 0 }}>
              {profile?.first_name} {profile?.last_name}
            </p>
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            {/* Section 1: Medikamente */}
            {medications.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ color: '#DBA84A', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', marginTop: 0 }}>
                  💊 Medikamente
                </h2>
                {medications.map((med) => (
                  <div
                    key={med.id}
                    style={{
                      backgroundColor: '#252118',
                      border: '2px solid #C9963C',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '10px',
                    }}
                  >
                    <p style={{ color: '#DBA84A', fontSize: '16px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
                      {med.medikament_name}
                    </p>
                    {formatDosage(med) && (
                      <p style={{ color: '#F5F0E8', fontSize: '14px', margin: '4px 0' }}>
                        <span style={{ color: '#C9963C', fontWeight: 'bold' }}>Dosierung:</span> {formatDosage(med)}
                      </p>
                    )}
                    {formatMedicationTimes(med) && (
                      <p style={{ color: '#F5F0E8', fontSize: '14px', margin: '4px 0' }}>
                        <span style={{ color: '#C9963C', fontWeight: 'bold' }}>Einnahmezeiten:</span> {formatMedicationTimes(med)}
                      </p>
                    )}
                    {med.einnahme_hinweis && (
                      <p style={{ color: '#E53E3E', fontSize: '13px', margin: '6px 0 0 0', fontStyle: 'italic' }}>
                        ⚠️ {med.einnahme_hinweis}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Section 2: Gesundheitsdaten */}
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#DBA84A', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', marginTop: 0 }}>
                🏥 Gesundheitsdaten
              </h2>

              {/* Blutgruppe */}
              {notfallInfo.blutgruppe && (
                <div
                  style={{
                    backgroundColor: '#E53E3E',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '12px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ color: '#F5F0E8', fontSize: '12px', margin: '0 0 6px 0', fontWeight: 'bold' }}>
                    BLUTGRUPPE
                  </p>
                  <p style={{ color: '#F5F0E8', fontSize: '32px', fontWeight: 'bold', margin: 0 }}>
                    {notfallInfo.blutgruppe}
                  </p>
                </div>
              )}

              {/* Allergien */}
              {notfallInfo.allergien && (
                <div
                  style={{
                    backgroundColor: '#252118',
                    border: '2px solid #E53E3E',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <p style={{ color: '#E53E3E', fontSize: '14px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
                    ⚠️ ALLERGIEN
                  </p>
                  <p style={{ color: '#F5F0E8', fontSize: '14px', margin: 0 }}>
                    {notfallInfo.allergien}
                  </p>
                </div>
              )}

              {/* Vorerkrankungen */}
              {notfallInfo.vorerkrankungen && (
                <div
                  style={{
                    backgroundColor: '#252118',
                    border: '2px solid #C9963C',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                >
                  <p style={{ color: '#DBA84A', fontSize: '14px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
                    Vorerkrankungen
                  </p>
                  <p style={{ color: '#F5F0E8', fontSize: '14px', margin: 0 }}>
                    {notfallInfo.vorerkrankungen}
                  </p>
                </div>
              )}
            </div>

            {/* Section 3: Notfallkontakt */}
            {notfallInfo.notfallkontakt_name && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ color: '#DBA84A', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', marginTop: 0 }}>
                  📞 Notfallkontakt
                </h2>
                <div
                  style={{
                    backgroundColor: '#252118',
                    border: '2px solid #C9963C',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                >
                  <p style={{ color: '#DBA84A', fontSize: '16px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
                    {notfallInfo.notfallkontakt_name}
                  </p>
                  {notfallInfo.notfallkontakt_beziehung && (
                    <p style={{ color: '#C9963C', fontSize: '13px', margin: '0 0 6px 0' }}>
                      {notfallInfo.notfallkontakt_beziehung}
                    </p>
                  )}
                  {notfallInfo.notfallkontakt_telefon && (
                    <a
                      href={`tel:${notfallInfo.notfallkontakt_telefon}`}
                      style={{
                        color: '#DBA84A',
                        fontSize: '14px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        display: 'block',
                        marginTop: '6px',
                      }}
                    >
                      📱 {notfallInfo.notfallkontakt_telefon}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Section 4: Versicherung & Hausarzt */}
            <div>
              <h2 style={{ color: '#DBA84A', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', marginTop: 0 }}>
                📋 Versicherung & Hausarzt
              </h2>

              {/* Versicherung */}
              {notfallInfo.versicherung && (
                <div
                  style={{
                    backgroundColor: '#252118',
                    border: '2px solid #C9963C',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <p style={{ color: '#C9963C', fontSize: '13px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                    Versicherung
                  </p>
                  <p style={{ color: '#DBA84A', fontSize: '15px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                    {notfallInfo.versicherung}
                  </p>
                  {notfallInfo.versicherungsnummer && (
                    <p style={{ color: '#F5F0E8', fontSize: '13px', margin: 0 }}>
                      Nr: {notfallInfo.versicherungsnummer}
                    </p>
                  )}
                </div>
              )}

              {/* Hausarzt */}
              {notfallInfo.hausarzt_name && (
                <div
                  style={{
                    backgroundColor: '#252118',
                    border: '2px solid #C9963C',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                >
                  <p style={{ color: '#C9963C', fontSize: '13px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                    Hausarzt
                  </p>
                  <p style={{ color: '#DBA84A', fontSize: '15px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                    {notfallInfo.hausarzt_name}
                  </p>
                  {notfallInfo.hausarzt_telefon && (
                    <a
                      href={`tel:${notfallInfo.hausarzt_telefon}`}
                      style={{
                        color: '#DBA84A',
                        fontSize: '13px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        display: 'block',
                        marginTop: '4px',
                      }}
                    >
                      📱 {notfallInfo.hausarzt_telefon}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #252118', textAlign: 'center' }}>
            <p style={{ color: '#8B7355', fontSize: '12px', margin: 0 }}>
              Alltagsengel.care — Notfall-Zugang
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="phone" style={{ position: 'relative', width: '375px', height: '812px', margin: '0 auto' }}>
      <div className="screen" style={{ backgroundColor: '#1A1612', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#F5F0E8', fontSize: '16px', textAlign: 'center', padding: '20px' }}>
          Keine Notfallinformationen hinterlegt
        </div>
      </div>
    </div>
  );
}
