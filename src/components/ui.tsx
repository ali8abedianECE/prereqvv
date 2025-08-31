import React from "react";

export const colors = {
    bg: "#0b0d10",
    panel: "#141820",
    stroke: "#1e242e",
    text: "#e8edf2",
    sub: "#9aa7b1",
    link: "#7ab7ff",
};

export function Card({ children, style }: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
    return <div style={{ background: colors.panel, border: `1px solid ${colors.stroke}`, borderRadius: 12, padding: 12, ...style }}>{children}</div>;
}
export function H({ children, right }: React.PropsWithChildren<{ right?: React.ReactNode }>) {
    return (
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{children}</h3>
            <div style={{ marginLeft: "auto" }}>{right}</div>
        </div>
    );
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${colors.stroke}`, background: "#141820", color: colors.text, ...(props.style||{}) }} />;
}
export function Button({ children, ...props }: any) {
    return <button {...props} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${colors.stroke}`, background: "#172033", color: colors.text, cursor: "pointer", ...(props.style||{}) }}>{children}</button>;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${colors.stroke}`, background: "#141820", color: colors.text, ...(props.style||{}) }} />;
}
export function Badge({ children }: React.PropsWithChildren) {
    return <span style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid ${colors.stroke}`, background: "#1a2231", fontSize: 12 }}>{children}</span>;
}
export function tinyFmt(n: number | null | undefined, digits = 1) {
    if (n == null || isNaN(+n)) return "—";
    return Number(n).toFixed(digits);
}
