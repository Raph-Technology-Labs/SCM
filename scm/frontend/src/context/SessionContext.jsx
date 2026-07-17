import React, { createContext, useContext, useState } from "react";

const SessionContext = createContext(null);

/**
 * Tracks whichever Counting/Defect Detection/Measurement session is
 * currently RUNNING, app-wide — mirrors the old project's CountingContext,
 * generalized to all three modes.
 *
 * shape of activeSession: { sessionId, mode: "Counting" | "Defect Detection" | "Measurement" } | null
 */
export function SessionProvider({ children }) {
  const [activeSession, setActiveSessionState] = useState(null);

  const setActiveSession = (session) => setActiveSessionState(session);
  const clearActiveSession = () => setActiveSessionState(null);

  return (
    <SessionContext.Provider value={{ activeSession, setActiveSession, clearActiveSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}