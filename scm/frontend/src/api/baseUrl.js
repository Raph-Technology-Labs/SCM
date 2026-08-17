export const BASE_URL =
  (typeof window !== "undefined" && window.ipc?.apiBaseUrl) ||
  import.meta.env.VITE_BASE_URL ||
  "http://localhost:8011";