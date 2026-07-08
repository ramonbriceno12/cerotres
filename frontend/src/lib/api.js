import { supabase } from "./supabaseClient";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Error ${res.status}`);
  }
  return json;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),
  // For endpoints that return a file (PDF receipts) instead of JSON.
  async openFile(path) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const res = await fetch(`${BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  },
};
