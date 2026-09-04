/**
 * Onboarding — mehrstufige Abläufe für Bewerber, Kundschaft und Angehörige.
 *
 * Schichten:
 *   schritte.ts       Die Schrittfolgen je Ablaufart (rein)
 *   triggers.ts       Ereignisse und Erinnerungsregeln (rein)
 *   notifications.ts  Nachrichtenvorlagen (rein)
 *   assistent.ts      Regelbasierte Auskunft zum eigenen Ablauf (rein)
 *   anleitung.ts      Personalisierte Anleitung: erledigt / erforderlich / offen (rein)
 *   uebersicht.ts     Betriebssicht der Verwaltung: Auswertung und Filter (rein)
 *   wizard-logik.ts   Ablaufsteuerung des Wizards (rein)
 *   einreichung.ts    Bewerbung aus dem Fortschritt bauen (rein)
 *   service.ts        onboarding_progress lesen und fortschreiben (Datenbank)
 *
 * NICHT zu verwechseln mit:
 *   app/onboarding/            Mandanten-Einrichtung (Organisation, IK, ITSG)
 *   profiles.onboarding_completed / components/OnboardingFlow.tsx
 *                              Begrüßungs-Overlay in /kunde/home
 */
export * from './schritte'
export * from './triggers'
export * from './notifications'
export * from './assistent'
export * from './anleitung'
export * from './uebersicht'
export * from './wizard-logik'
export * from './service'
export * from './einreichung'
