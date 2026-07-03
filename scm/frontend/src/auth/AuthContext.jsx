import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);
const STORAGE_KEY = "mv_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setUser(JSON.parse(raw));
    setReady(true);
  }, []);

  async function login(username, password) {
    const result = await api.login(username, password);
    setUser(result);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    return result;
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  const ADMIN_ROLES = ["administrator", "superadministrator"];
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, ready, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
