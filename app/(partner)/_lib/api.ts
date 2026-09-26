// Client for the partner portal API. Every rule about who may see what is enforced by the API;
// this file only carries the session token and turns failures into readable errors.

const API = process.env.NEXT_PUBLIC_PORTAL_API_URL ?? "https://eskay.sumitkumardas.xyz/v1/portal";
const TOKEN_KEY = "eskay.portal.session";
export const SIGNED_OUT_EVENT = "eskay:signed-out";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Storage can throw in private windows or when site data is blocked, so every access is guarded.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Without storage the session lasts only as long as this page.
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

type RequestOptions = { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string> };

async function request(path: string, { method = "GET", body, raw, headers = {} }: RequestOptions = {}) {
  const token = getToken();
  const init: RequestInit = { method, headers: { ...headers } };
  const initHeaders = init.headers as Record<string, string>;
  if (token) initHeaders.Authorization = `Bearer ${token}`;
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) {
    initHeaders["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, init);
  } catch {
    throw new ApiError(0, "We could not reach the ESKAY portal. Please check your connection and try again.");
  }
  if (response.status === 401 && token) {
    // The session has expired or been revoked: drop it and let the shell send the user to sign in.
    clearToken();
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, detail?.error ?? "Something went wrong. Please try again.");
  }
  return response;
}

export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await request(path, options)).json() as Promise<T>;
}

export async function apiBlob(path: string): Promise<Blob> {
  return (await request(path)).blob();
}

export type UploadedFile = { id: number; original_name: string; mime: string; size: number };

export async function uploadFile(file: File): Promise<UploadedFile> {
  const { file: uploaded } = await api<{ file: UploadedFile }>("/files", {
    method: "POST",
    raw: file,
    headers: { "X-File-Name": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" },
  });
  return uploaded;
}

// Files are served only with the session token, so a plain link cannot fetch them. The file is
// downloaded with the token and then handed to the browser to save.
export async function downloadFile(path: string, filename: string) {
  const url = URL.createObjectURL(await apiBlob(path));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
