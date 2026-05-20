import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:5149",
                changeOrigin: true,
                secure: false,
                // remove the /api prefix when sending to the backend
                rewrite: (p) => p.replace(/^\/api/, ""),
            },
        },
    },
});