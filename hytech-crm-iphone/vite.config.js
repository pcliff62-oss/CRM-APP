import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use VITE_API_BASE to point at deployed API if desired.
// In local dev, proxy /api to Next.js dev server.
const API_TARGET = process.env.VITE_API_BASE || 'http://127.0.0.1:3000';

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: API_TARGET,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
