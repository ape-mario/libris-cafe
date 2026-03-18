import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base = (globalThis as any).process?.env?.GITHUB_ACTIONS ? '/libris' : '';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Libris',
				short_name: 'Libris',
				description: 'Your personal book collection',
				theme_color: '#faf6f1',
				background_color: '#faf6f1',
				display: 'standalone',
				scope: `${base}/`,
				start_url: `${base}/`,
				icons: [
					{ src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png' },
					{ src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}']
			}
		})
	]
});
