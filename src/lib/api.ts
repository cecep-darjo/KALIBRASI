/*
  Klien REST untuk backend Express + SQL Server.
  Menggantikan @supabase/supabase-js. Token JWT disimpan di localStorage dan
  dilampirkan otomatis pada setiap permintaan.
*/

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)
  ?? 'http://localhost:4000/api';

const TOKEN_KEY = 'kalibrasi.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Error dari API, membawa status HTTP agar pemanggil bisa membedakan 401. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value === '[object Object]' ? undefined : value;
  }
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail']) {
      const candidate = data[key];
      if (typeof candidate === 'string' && candidate !== '[object Object]') {
        return candidate;
      }
    }
  }
  return undefined;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Set true untuk endpoint yang mengembalikan berkas (PDF). */
  raw?: boolean;
  signal?: AbortSignal;
}

/**
 * Panggil API. Melempar ApiError bila respons tidak OK.
 * Setiap respons 401 memicu pembersihan token (sesi dianggap berakhir).
 */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, raw = false, signal } = options;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError(0, 'Tidak dapat menghubungi server. Periksa koneksi Anda.');
  }

  if (res.status === 401) {
    setToken(null);
  }

  if (!res.ok) {
    let message = `Permintaan gagal (${res.status}).`;
    try {
      const data = await res.json();
      message = readErrorMessage(data?.error) ?? readErrorMessage(data) ?? message;
    } catch {
      // Respons bukan JSON — pakai pesan bawaan.
    }
    throw new ApiError(res.status, message);
  }

  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Unduh berkas dari API (mis. PDF) lalu picu penyimpanan di peramban. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Bentuk standar respons error untuk ditampilkan di formulir. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Terjadi kesalahan yang tidak diketahui.';
}
