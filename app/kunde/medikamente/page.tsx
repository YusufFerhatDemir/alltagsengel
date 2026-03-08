'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Medikament {
  id: string;
  medikament_name: string;
  wirkstoff?: string;
  dosierung: number;
  einheit: string;
  einnahme_morgens: boolean;
  einnahme_mittags: boolean;
  einnahme_abends: boolean;
  einnahme_nachts: boolean;
  einnahme_hinweis?: string;
  verordnet_von?: string;
  dauermedikation: boolean;
  beginn_datum?: string;
  end_datum?: string;
  notizen?: string;
  aktiv: boolean;
  user_id: string;
}

interface FormData {
  medikament_name: string;
  wirkstoff: string;
  dosierung: string;
  einheit: string;
  einnahme_morgens: boolean;
  einnahme_mittags: boolean;
  einnahme_abends: boolean;
  einnahme_nachts: boolean;
  einnahme_hinweis: string;
  verordnet_von: string;
  dauermedikation: boolean;
  beginn_datum: string;
  end_datum: string;
  notizen: string;
}

const colors = {
  gold: '#C9963C',
  gold2: '#DBA84A',
  coal: '#1A1612',
  coal2: '#252118',
  text: '#F5F0E8',
};

export default function MedikamentePage() {
  const router = useRouter();
  const supabase = createClient();

  const [medications, setMedications] = useState<Medikament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');

  const [formData, setFormData] = useState<FormData>({
    medikament_name: '',
    wirkstoff: '',
    dosierung: '',
    einheit: 'mg',
    einnahme_morgens: false,
    einnahme_mittags: false,
    einnahme_abends: false,
    einnahme_nachts: false,
    einnahme_hinweis: '',
    verordnet_von: '',
    dauermedikation: true,
    beginn_datum: '',
    end_datum: '',
    notizen: '',
  });

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/');
        return;
      }

      setUserId(session.user.id);
      await fetchMedications(session.user.id);
    };

    getSession();
  }, []);

  const fetchMedications = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('medikamentenplan')
        .select('*')
        .eq('user_id', userId)
        .eq('aktiv', true)
        .order('medikament_name', { ascending: true });

      if (error) throw error;
      setMedications(data || []);
    } catch (error) {
      console.error('Error fetching medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setFormData({
      medikament_name: '',
      wirkstoff: '',
      dosierung: '',
      einheit: 'mg',
      einnahme_morgens: false,
      einnahme_mittags: false,
      einnahme_abends: false,
      einnahme_nachts: false,
      einnahme_hinweis: '',
      verordnet_von: '',
      dauermedikation: true,
      beginn_datum: '',
      end_datum: '',
      notizen: '',
    });
    setShowModal(true);
  };

  const handleEdit = (med: Medikament) => {
    setEditingId(med.id);
    setFormData({
      medikament_name: med.medikament_name,
      wirkstoff: med.wirkstoff || '',
      dosierung: med.dosierung.toString(),
      einheit: med.einheit,
      einnahme_morgens: med.einnahme_morgens,
      einnahme_mittags: med.einnahme_mittags,
      einnahme_abends: med.einnahme_abends,
      einnahme_nachts: med.einnahme_nachts,
      einnahme_hinweis: med.einnahme_hinweis || '',
      verordnet_von: med.verordnet_von || '',
      dauermedikation: med.dauermedikation,
      beginn_datum: med.beginn_datum || '',
      end_datum: med.end_datum || '',
      notizen: med.notizen || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.medikament_name.trim() || !formData.dosierung.trim()) {
      alert('Medikamentenname und Dosierung sind erforderlich!');
      return;
    }

    try {
      const dataToSave = {
        medikament_name: formData.medikament_name,
        wirkstoff: formData.wirkstoff || null,
        dosierung: parseFloat(formData.dosierung),
        einheit: formData.einheit,
        einnahme_morgens: formData.einnahme_morgens,
        einnahme_mittags: formData.einnahme_mittags,
        einnahme_abends: formData.einnahme_abends,
        einnahme_nachts: formData.einnahme_nachts,
        einnahme_hinweis: formData.einnahme_hinweis || null,
        verordnet_von: formData.verordnet_von || null,
        dauermedikation: formData.dauermedikation,
        beginn_datum: formData.dauermedikation ? null : formData.beginn_datum || null,
        end_datum: formData.dauermedikation ? null : formData.end_datum || null,
        notizen: formData.notizen || null,
        aktiv: true,
        user_id: userId,
      };

      if (editingId) {
        const { error } = await supabase
          .from('medikamentenplan')
          .update(dataToSave)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('medikamentenplan')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setShowModal(false);
      await fetchMedications(userId);
    } catch (error) {
      console.error('Error saving medication:', error);
      alert('Fehler beim Speichern');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('medikamentenplan')
        .update({ aktiv: false })
        .eq('id', id);

      if (error) throw error;

      setDeleteConfirmId(null);
      await fetchMedications(userId);
    } catch (error) {
      console.error('Error deleting medication:', error);
      alert('Fehler beim Löschen');
    }
  };

  const einheiten = ['mg', 'ml', 'Tabletten', 'Tropfen', 'IE', 'µg'];

  return (
    <div className="phone">
      <div
        className="screen"
        style={{
          backgroundColor: colors.coal,
          color: colors.text,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: colors.coal2,
          }}
        >
          <button
            onClick={() => router.push('/kunde/home')}
            style={{
              background: 'none',
              border: 'none',
              color: colors.gold,
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ←
          </button>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
            Medikamentenplan
          </h1>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 16px 80px',
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              Wird geladen...
            </div>
          ) : medications.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 16px',
                color: 'rgba(245,240,232,0.6)',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>💊</div>
              <p>Noch keine Medikamente eingetragen</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {medications.map((med) => (
                <div
                  key={med.id}
                  style={{
                    backgroundColor: colors.coal2,
                    border: `2px solid ${colors.gold}`,
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h3
                        style={{
                          margin: '0 0 4px 0',
                          fontSize: '18px',
                          fontWeight: '600',
                          color: colors.gold,
                        }}
                      >
                        {med.medikament_name}
                      </h3>
                      {med.wirkstoff && (
                        <p
                          style={{
                            margin: '0 0 6px 0',
                            fontSize: '12px',
                            color: 'rgba(245,240,232,0.6)',
                          }}
                        >
                          {med.wirkstoff}
                        </p>
                      )}
                      <p
                        style={{
                          margin: '0 0 8px 0',
                          fontSize: '14px',
                          color: colors.text,
                        }}
                      >
                        {med.dosierung} {med.einheit}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEdit(med)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '18px',
                          cursor: 'pointer',
                          color: colors.gold2,
                          padding: '4px',
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(med.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '18px',
                          cursor: 'pointer',
                          color: '#FF6B6B',
                          padding: '4px',
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Einnahmezeiten */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {med.einnahme_morgens && (
                      <span
                        style={{
                          backgroundColor: colors.gold,
                          color: colors.coal,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}
                      >
                        Morgens
                      </span>
                    )}
                    {med.einnahme_mittags && (
                      <span
                        style={{
                          backgroundColor: colors.gold,
                          color: colors.coal,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}
                      >
                        Mittags
                      </span>
                    )}
                    {med.einnahme_abends && (
                      <span
                        style={{
                          backgroundColor: colors.gold,
                          color: colors.coal,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}
                      >
                        Abends
                      </span>
                    )}
                    {med.einnahme_nachts && (
                      <span
                        style={{
                          backgroundColor: colors.gold,
                          color: colors.coal,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}
                      >
                        Nachts
                      </span>
                    )}
                  </div>

                  {/* Hinweis */}
                  {med.einnahme_hinweis && (
                    <p
                      style={{
                        margin: '0 0 6px 0',
                        fontSize: '12px',
                        color: 'rgba(245,240,232,0.7)',
                        fontStyle: 'italic',
                      }}
                    >
                      {med.einnahme_hinweis}
                    </p>
                  )}

                  {/* Verordnet von */}
                  {med.verordnet_von && (
                    <p
                      style={{
                        margin: '0 0 6px 0',
                        fontSize: '12px',
                        color: 'rgba(245,240,232,0.6)',
                      }}
                    >
                      Von: {med.verordnet_von}
                    </p>
                  )}

                  {/* Dauermedikation oder Datum */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {med.dauermedikation ? (
                      <span
                        style={{
                          backgroundColor: 'rgba(201,150,60,0.2)',
                          color: colors.gold2,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500',
                        }}
                      >
                        Dauermedikation
                      </span>
                    ) : (
                      <span
                        style={{
                          backgroundColor: 'rgba(201,150,60,0.2)',
                          color: colors.gold2,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                        }}
                      >
                        {med.beginn_datum} {med.end_datum ? `bis ${med.end_datum}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating + Button */}
        <button
          onClick={handleAddNew}
          style={{
            position: 'fixed',
            bottom: '90px',
            right: '20px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: colors.gold,
            color: colors.coal,
            border: 'none',
            fontSize: '28px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(201,150,60,0.3)',
          }}
        >
          +
        </button>

        {/* Bottom Navigation */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.coal,
            borderTop: `1px solid rgba(255,255,255,0.06)`,
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            height: '70px',
            padding: '8px 0',
          }}
        >
          <Link href="/kunde/home" style={{ textDecoration: 'none', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '12px',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '20px' }}>🏠</span>
              <span>Home</span>
            </div>
          </Link>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: colors.gold,
              fontSize: '12px',
              gap: '4px',
              flex: 1,
            }}
          >
            <span style={{ fontSize: '20px' }}>💊</span>
            <span>Medikamente</span>
          </div>

          <Link href="/kunde/notfall" style={{ textDecoration: 'none', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '12px',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '20px' }}>🚨</span>
              <span>Notfall</span>
            </div>
          </Link>

          <Link href="/kunde/buchungen" style={{ textDecoration: 'none', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '12px',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '20px' }}>📋</span>
              <span>Buchungen</span>
            </div>
          </Link>

          <Link href="/kunde/profil" style={{ textDecoration: 'none', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '12px',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '20px' }}>👤</span>
              <span>Profil</span>
            </div>
          </Link>
        </div>

        {/* Modal */}
        {showModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'flex-end',
              zIndex: 1000,
            }}
            onClick={() => setShowModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: colors.coal2,
                borderRadius: '16px 16px 0 0',
                padding: '24px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                animation: 'slideUp 0.3s ease-out',
              }}
            >
              <style>{`
                @keyframes slideUp {
                  from {
                    transform: translateY(100%);
                  }
                  to {
                    transform: translateY(0);
                  }
                }
              `}</style>

              <h2 style={{ margin: '0 0 16px 0', color: colors.gold }}>
                {editingId ? 'Medikament bearbeiten' : 'Neues Medikament'}
              </h2>

              {/* Form Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Medikament Name */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontSize: '12px',
                      color: 'rgba(245,240,232,0.7)',
                    }}
                  >
                    Medikamentenname *
                  </label>
                  <input
                    type="text"
                    value={formData.medikament_name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        medikament_name: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: colors.coal,
                      border: `1px solid ${colors.gold}`,
                      borderRadius: '4px',
                      color: colors.text,
                      boxSizing: 'border-box',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Wirkstoff */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontSize: '12px',
                      color: 'rgba(245,240,232,0.7)',
                    }}
                  >
                    Wirkstoff
                  </label>
                  <input
                    type="text"
                    value={formData.wirkstoff}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        wirkstoff: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: colors.coal,
                      border: `1px solid ${colors.gold}`,
                      borderRadius: '4px',
                      color: colors.text,
                      boxSizing: 'border-box',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Dosierung + Einheit */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '4px',
                        fontSize: '12px',
                        color: 'rgba(245,240,232,0.7)',
                      }}
                    >
                      Dosierung *
                    </label>
                    <input
                      type="number"
                      value={formData.dosierung}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          dosierung: e.target.value,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: colors.coal,
                        border: `1px solid ${colors.gold}`,
                        borderRadius: '4px',
                        color: colors.text,
                        boxSizing: 'border-box',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '4px',
                        fontSize: '12px',
                        color: 'rgba(245,240,232,0.7)',
                      }}
                    >
                      Einheit
                    </label>
                    <select
                      value={formData.einheit}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          einheit: e.target.value,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: colors.coal,
                        border: `1px solid ${colors.gold}`,
                        borderRadius: '4px',
                        color: colors.text,
                        boxSizing: 'border-box',
                        fontSize: '14px',
                      }}
                    >
                      {einheiten.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Einnahmezeiten */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '12px',
                      color: 'rgba(245,240,232,0.7)',
                    }}
                  >
                    Einnahmezeiten
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      {
                        key: 'einnahme_morgens',
                        label: 'Morgens',
                      },
                      {
                        key: 'einnahme_mittags',
                        label: 'Mittags',
                      },
                      {
                        key: 'einnahme_abends',
                        label: 'Abends',
                      },
                      {
                        key: 'einnahme_nachts',
                        label: 'Nachts',
                      },
                    ].map((time) => (
                      <label
                        key={time.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            formData[time.key as keyof FormData] as boolean
                          }
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [time.key]: e.target.checked,
                            })
                          }
                          style={{
                            cursor: 'pointer',
                            width: '16px',
                            height: '16px',
                          }}
                        />
                        {time.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Einnahme Hinweis */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontSize: '12px',
                      color: 'rgba(245,240,232,0.7)',
                    }}
                  >
                    Einnahmehinweis (z.B. "vor dem Essen")
                  </label>
                  <input
                    type="text"
                    value={formData.einnahme_hinweis}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        einnahme_hinweis: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: colors.coal,
                      border: `1px solid ${colors.gold}`,
                      borderRadius: '4px',
                      color: colors.text,
                      boxSizing: 'border-box',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Verordnet von */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontSize: '12px',
                      color: 'rgba(245,240,232,0.7)',
                    }}
                  >
                    Verordnet von
                  </label>
                  <input
                    type="text"
                    value={formData.verordnet_von}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        verordnet_von: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: colors.coal,
                      border: `1px solid ${colors.gold}`,
                      borderRadius: '4px',
                      color: colors.text,
                      boxSizing: 'border-box',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Dauermedikation Toggle */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.dauermedikation}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        dauermedikation: e.target.checked,
                      })
                    }
                    style={{
                      cursor: 'pointer',
                      width: '16px',
                      height: '16px',
                    }}
                  />
                  Dauermedikation
                </label>

                {/* Beginn- und End-Datum */}
                {!formData.dauermedikation && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '4px',
                          fontSize: '12px',
                          color: 'rgba(245,240,232,0.7)',
                        }}
                      >
                        Beginn
                      </label>
                      <input
                        type="date"
                        value={formData.beginn_datum}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            beginn_datum: e.target.value,
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '10px',
                          backgroundColor: colors.coal,
                          border: `1px solid ${colors.gold}`,
                          borderRadius: '4px',
                          color: colors.text,
                          boxSizing: 'border-box',
                          fontSize: '14px',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '4px',
                          fontSize: '12px',
                          color: 'rgba(245,240,232,0.7)',
                        }}
                      >
                        Ende
                      </label>
                      <input
                        type="date"
                        value={formData.end_datum}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            end_datum: e.target.value,
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '10px',
                          backgroundColor: colors.coal,
                          border: `1px solid ${colors.gold}`,
                          borderRadius: '4px',
                          color: colors.text,
                          boxSizing: 'border-box',
                          fontSize: '14px',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Notizen */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontSize: '12px',
                      color: 'rgba(245,240,232,0.7)',
                    }}
                  >
                    Notizen
                  </label>
                  <textarea
                    value={formData.notizen}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        notizen: e.target.value,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: colors.coal,
                      border: `1px solid ${colors.gold}`,
                      borderRadius: '4px',
                      color: colors.text,
                      boxSizing: 'border-box',
                      fontSize: '14px',
                      minHeight: '80px',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Buttons */}
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: '16px',
                  }}
                >
                  <button
                    onClick={() => setShowModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${colors.gold}`,
                      color: colors.gold,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                    }}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: colors.gold,
                      border: 'none',
                      color: colors.coal,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                    }}
                  >
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmId && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
            }}
            onClick={() => setDeleteConfirmId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: colors.coal2,
                padding: '24px',
                borderRadius: '8px',
                minWidth: '280px',
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  color: colors.text,
                }}
              >
                Medikament löschen?
              </h3>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '14px',
                  color: 'rgba(245,240,232,0.7)',
                }}
              >
                Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${colors.gold}`,
                    color: colors.gold,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#FF6B6B',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
