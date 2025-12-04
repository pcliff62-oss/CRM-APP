import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Use VITE_API_BASE to point at your main API (e.g., Next.js app).
// In dev, prefer Next.js on 3000 (or configured VITE_NEXT_PORT) so relative calls stay same-origin via proxy and carry cookies.
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '')
	const NEXT_BASE = env.VITE_NEXT_BASE || env.NEXT_BASE || ''
	const NEXT_PORT = env.NEXT_PORT || env.VITE_NEXT_PORT || '3000'
	const API_TARGET = env.VITE_API_BASE || NEXT_BASE || `http://127.0.0.1:${NEXT_PORT}`
	const FILES_TARGET = env.VITE_FILES_BASE || NEXT_BASE || `http://127.0.0.1:${NEXT_PORT}`
	return {
		plugins: [react()],
		server: {
			port: 5173,
			proxy: {
				// Ensure images hit Next.js which serves /api/files
				'/api/files': {
					target: FILES_TARGET,
					changeOrigin: true,
					secure: false,
				},
						// Proxy measurement images and other public assets served by Next.js
						'/uploads': {
							target: FILES_TARGET,
							changeOrigin: true,
							secure: false,
						},
				'/api': {
					target: API_TARGET,
					changeOrigin: true,
					secure: false,
				},
          // Proposal app embedding (assets + index)
          '/proposal-app': { target: API_TARGET, changeOrigin: true, secure: false },
          // Short path alias if used anywhere
          '/p': { target: API_TARGET, changeOrigin: true, secure: false },
			},
		},
	}
});
