// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            // Forward /api/* from Vite (5173) to your Node API (3001)
            "/api": {
                target: "https://prereqvv.onrender.com",
                changeOrigin: true,
                // follow redirects just in case
                secure: false,
            },
        },
    },
});
