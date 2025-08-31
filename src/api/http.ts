// Small fetch helper that guarantees JSON (and throws on HTML errors)
export const API_BASE =
    (import.meta as any).env?.VITE_API_BASE?.replace(/\/+$/, "") || "http://localhost:3001";

export async function getJSON<T>(url: string): Promise<T> {
    const r = await fetch(`${API_BASE}${url}`, {
        headers: { Accept: "application/json" },
        credentials: "omit",
    });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const text = await r.text();
        throw new Error(`Expected JSON, got "${ct || "unknown"}". First bytes:\n${text.slice(0, 200)}`);
    }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
    const r = await fetch(`${API_BASE}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
    });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const text = await r.text();
        throw new Error(`Expected JSON, got "${ct || "unknown"}". First bytes:\n${text.slice(0, 200)}`);
    }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}
