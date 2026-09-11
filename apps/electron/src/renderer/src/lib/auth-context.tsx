import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CloudUser } from "../../../shared/cloud-user";
import { agicyDeviceSignInUrl } from "./agicy-device-url";
import { getClient, initApiBase, refreshApiBase } from "./api";
import { resetBrainCache } from "./brain-fs";
import { queryKeys } from "./query";

function resetAccountCaches(queryClient: QueryClient): void {
  resetBrainCache();
  queryClient.clear();
}

function formatSignInError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Sign-in failed";
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return "Could not reach the local UPDATED service. Quit UPDATED completely from the tray, reopen it, and try Sign in again.";
  }
  return message;
}

/** Shared sign-in state machine for soft-auth strip + Settings AccountCard. */
export type AuthPhase =
  | "idle"
  | "starting"
  | "waiting"
  | "approved"
  | "signed_in";

const APPROVED_HOLD_MS = 1600;

export interface UseCloudAuth {
  user: CloudUser | null;
  loading: boolean;
  /** True while starting, waiting, or showing the brief approved celebration. */
  signingIn: boolean;
  phase: AuthPhase;
  /** Device user code, surfaced while a sign-in is pending. */
  userCode: string | null;
  error: string | null;
  sessionExpired: boolean;
  refresh: () => Promise<CloudUser | null>;
  signIn: () => Promise<CloudUser | null>;
  /** Re-focus / reopen the auth BrowserWindow with the current code. */
  continueInBrowser: () => Promise<void>;
  /** Abort an in-flight sign-in (driven from the pending modal). */
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
}

const CloudAuthContext = createContext<UseCloudAuth | null>(null);

/** Renderer-side state for AGICY account sign-in (device flow in main). */
function useCloudAuthState(): UseCloudAuth {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [approved, setApproved] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const wasSignedInRef = useRef(false);
  const cancelledRef = useRef(false);
  const signInPromiseRef = useRef<Promise<CloudUser | null> | null>(null);
  const signInAttemptRef = useRef(0);
  // Collapses concurrent status checks into one in-flight request. On a fresh
  // window the mount retry-loop and the `focus` listener (fired the moment the
  // just-shown window focuses) both call refreshInternal within the same tick —
  // without this they'd hit /api/auth/status twice back-to-back.
  const refreshInFlightRef = useRef<Promise<{
    user: CloudUser | null;
    reached: boolean;
  }> | null>(null);

  const refreshInternal = useCallback(async (): Promise<{
    user: CloudUser | null;
    reached: boolean;
  }> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const run = (async () => {
      let reached = false;
      const user = await getClient()
        .api.auth.agicy.status.$get()
        .then(async (res) => {
          if (!res.ok) return null;
          reached = true;
          const data = await res.json();
          return data.user ?? null;
        })
        .catch(() => null);
      if (reached) {
        if (!user && wasSignedInRef.current) {
          setSessionExpired(true);
          queryClient.removeQueries({
            queryKey: queryKeys.connectors.all,
          });
        }
        if (user) setSessionExpired(false);
        wasSignedInRef.current = !!user;
        setUser(user);
      }
      return { user, reached };
    })();
    refreshInFlightRef.current = run;
    try {
      return await run;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [queryClient]);

  const refresh = useCallback(
    async (): Promise<CloudUser | null> => (await refreshInternal()).user,
    [refreshInternal],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 15 && !cancelled; attempt++) {
        const { reached } = await refreshInternal();
        if (reached) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshInternal]);

  useEffect(() => {
    const revalidate = (): void => {
      void refreshInternal();
    };
    window.addEventListener("focus", revalidate);
    const timer = setInterval(revalidate, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", revalidate);
      clearInterval(timer);
    };
  }, [refreshInternal]);

  const signIn = useCallback(async (): Promise<CloudUser | null> => {
    if (signInPromiseRef.current) return signInPromiseRef.current;

    cancelledRef.current = false;
    const attempt = ++signInAttemptRef.current;
    setSigningIn(true);
    setApproved(false);
    setError(null);
    setUserCode(null);

    const run = async (): Promise<CloudUser | null> => {
      await initApiBase();
      const healthy = await refreshApiBase();
      if (!healthy) {
        throw new Error(
          "Could not reach the local UPDATED service. Quit UPDATED completely from the tray, reopen it, and try Sign in again.",
        );
      }
      const codeRes = await getClient().api.auth.agicy.device.code.$post();
      if (!codeRes.ok) {
        const body = (await codeRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ??
            `AGICY cloud sign-in is unavailable (${codeRes.status}). You can keep working locally and retry later.`,
        );
      }
      const code = await codeRes.json();
      setUserCode(code.user_code);
      const opened = await window.api.openExternal(
        agicyDeviceSignInUrl(code.user_code),
      );
      if (!opened) {
        throw new Error(
          `Could not open the sign-in page. Open https://agicy.ai/updated/my_device and enter ${code.user_code}.`,
        );
      }

      const deadline = Date.now() + code.expires_in * 1000;
      let intervalMs = Math.max(1, code.interval) * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        if (cancelledRef.current) return null;
        if (attempt !== signInAttemptRef.current) return null;
        const tokenRes = await getClient().api.auth.agicy.device.token.$post({
          json: { device_code: code.device_code },
        });
        if (tokenRes.status === 202) continue;
        if (tokenRes.status === 429) {
          intervalMs += 5000;
          continue;
        }
        if (!tokenRes.ok) {
          const body = (await tokenRes.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Sign-in failed (${tokenRes.status})`);
        }
        const data = await tokenRes.json();
        if (attempt !== signInAttemptRef.current) return null;
        resetAccountCaches(queryClient);
        wasSignedInRef.current = true;
        setSessionExpired(false);
        setUser(data.user);
        setApproved(true);
        void window.api.closeAuthWindow();
        await new Promise((resolve) => setTimeout(resolve, APPROVED_HOLD_MS));
        if (cancelledRef.current || attempt !== signInAttemptRef.current) {
          return data.user;
        }
        return data.user;
      }
      throw new Error("Sign-in timed out. Please try again.");
    };

    signInPromiseRef.current = run()
      .catch((err) => {
        if (!cancelledRef.current) {
          setError(formatSignInError(err));
        }
        return null;
      })
      .finally(() => {
        if (attempt === signInAttemptRef.current) {
          signInPromiseRef.current = null;
          setSigningIn(false);
          setApproved(false);
          setUserCode(null);
          void window.api.closeAuthWindow();
        }
      });

    return signInPromiseRef.current;
  }, [queryClient]);

  const continueInBrowser = useCallback(async (): Promise<void> => {
    if (!userCode) return;
    await window.api.openExternal(agicyDeviceSignInUrl(userCode));
  }, [userCode]);

  const cancelSignIn = useCallback((): void => {
    cancelledRef.current = true;
    signInAttemptRef.current += 1;
    signInPromiseRef.current = null;
    setSigningIn(false);
    setApproved(false);
    setUserCode(null);
    void window.api.closeAuthWindow();
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await getClient()
      .api.auth.agicy["sign-out"].$post()
      .catch(() => {});
    wasSignedInRef.current = false;
    setSessionExpired(false);
    setUser(null);
    resetAccountCaches(queryClient);
  }, [queryClient]);

  const phase: AuthPhase = useMemo(() => {
    if (user && !signingIn) return "signed_in";
    if (approved) return "approved";
    if (signingIn && userCode) return "waiting";
    if (signingIn) return "starting";
    return "idle";
  }, [user, signingIn, approved, userCode]);

  return {
    user,
    loading,
    signingIn,
    phase,
    userCode,
    error,
    sessionExpired,
    refresh,
    signIn,
    continueInBrowser,
    cancelSignIn,
    signOut,
  };
}

export function CloudAuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const value = useCloudAuthState();
  return (
    <CloudAuthContext.Provider value={value}>
      {children}
    </CloudAuthContext.Provider>
  );
}

export function useCloudAuth(): UseCloudAuth {
  const ctx = useContext(CloudAuthContext);
  if (!ctx) {
    throw new Error("useCloudAuth must be used within a CloudAuthProvider");
  }
  return ctx;
}
