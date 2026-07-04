/**
 * Velora — Auth-Context (Basis)
 * -----------------------------
 * Hält den Anmeldestatus app-weit und stellt `signIn` / `signUp` / `signOut`
 * bereit. Diese Implementierung ist bewusst Backend-agnostisch: Sie simuliert
 * die Anmeldung lokal und persistiert eine Session in AsyncStorage.
 *
 * Später wird der Rumpf von `signIn`/`signUp` gegen Supabase Auth getauscht
 * (siehe README „Technologie-Stack"). Die öffentliche API bleibt dabei stabil,
 * sodass Screens nicht angefasst werden müssen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const SESSION_KEY = 'velora.session';

/** Minimales Nutzerprofil, das die UI benötigt. */
export interface User {
  id: string;
  email: string;
  /** Anzeigename (Vorname) für die Begrüßung. */
  vorname: string;
}

interface AuthContextValue {
  /** Angemeldeter Nutzer oder `null`. */
  user: User | null;
  /** True, solange die gespeicherte Session beim Start geladen wird. */
  initializing: boolean;
  /** True, während eine Auth-Aktion läuft (für Button-Spinner). */
  pending: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  signOut: () => Promise<void>;
}

export interface SignUpParams {
  vorname: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [pending, setPending] = useState(false);

  // Gespeicherte Session beim App-Start wiederherstellen.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        if (active && raw) {
          setUser(JSON.parse(raw) as User);
        }
      })
      .catch(() => {
        /* Ungültige Session ignorieren – Nutzer landet im Login. */
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (next: User) => {
    setUser(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }, []);

  const signIn = useCallback(
    async (email: string, _password: string) => {
      setPending(true);
      try {
        // TODO(Supabase): supabase.auth.signInWithPassword(...) einsetzen.
        await fakeLatency();
        const vorname = deriveVorname(email);
        await persist({ id: makeLocalId(email), email, vorname });
      } finally {
        setPending(false);
      }
    },
    [persist],
  );

  const signUp = useCallback(
    async ({ vorname, email, password: _password }: SignUpParams) => {
      setPending(true);
      try {
        // TODO(Supabase): supabase.auth.signUp(...) + Profil anlegen.
        await fakeLatency();
        await persist({ id: makeLocalId(email), email, vorname: vorname.trim() });
      } finally {
        setPending(false);
      }
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, pending, signIn, signUp, signOut }),
    [user, initializing, pending, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Zugriff auf den Auth-Zustand. Muss innerhalb von <AuthProvider> stehen. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth muss innerhalb von <AuthProvider> stehen.');
  }
  return ctx;
}

// --- Hilfsfunktionen (Platzhalter bis zur Backend-Anbindung) ---------------

/** Simuliert eine kurze Netzwerk-Latenz für realistisches UI-Verhalten. */
function fakeLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 650));
}

/** Erzeugt eine deterministische Pseudo-ID aus der E-Mail (nur lokal). */
function makeLocalId(email: string): string {
  return `local:${email.trim().toLowerCase()}`;
}

/** Leitet einen anzeigbaren Vornamen aus dem E-Mail-Local-Part ab. */
function deriveVorname(email: string): string {
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[.\-_]/)[0] ?? local;
  if (!first) return 'willkommen';
  return first.charAt(0).toUpperCase() + first.slice(1);
}
