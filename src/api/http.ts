// src/api/http.ts
type Json = Record<string, any> | any[];

async function attempt<T>(base: string, path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(base + path, { credentials: 'omit', ...init });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();
    if (!res.ok) throw new Error(text || `${res.status} ${res.statusText}`);
    if (!ct.includes('application/json')) {
        throw new Error(`Expected JSON, got "${ct || 'unknown'}". First bytes:\n${text.slice(0, 140)}`);
    }
    return JSON.parse(text) as T;
}

/** GET that tries: VITE_API_BASE → same-origin → http://localhost:3001 (dev) */
export async function getJSON2<T = Json>(path: string): Promise<T> {
    const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
    const candidates = [
        ...(envBase ? [envBase] : []),
        '', // same-origin (works if Vite proxy is configured)
        ...(location.port === '5173' && !envBase ? ['http://localhost:3001'] : []),
    ];
    let last: any;
    for (const base of candidates) {
        try { return await attempt<T>(base, path); } catch (e) { last = e; }
    }
    throw last;
}

/** POST with the same fallback behavior */
export async function postJSON2<T = Json>(path: string, body: any): Promise<T> {
    const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
    const candidates = [
        ...(envBase ? [envBase] : []),
        '',
        ...(location.port === '5173' && !envBase ? ['http://localhost:3001'] : []),
    ];
    let last: any;
    for (const base of candidates) {
        try {
            return await attempt<T>(base, path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch (e) { last = e; }
    }
    throw last;
}
