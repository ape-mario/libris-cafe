import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const base = process.env.GITHUB_ACTIONS ? '/libris' : '';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),
		paths: {
			base
		},
		csp: {
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://app.sandbox.midtrans.com', 'https://app.midtrans.com'],
				'connect-src': ['self', 'https://*.supabase.co', 'wss://*.supabase.co', 'https://api.fonnte.com', 'wss://*.partykit.dev'],
				'frame-src': ['https://app.sandbox.midtrans.com', 'https://app.midtrans.com'],
				'img-src': ['self', 'https://covers.openlibrary.org', 'data:', 'blob:'],
				'style-src': ['self', 'unsafe-inline']
			}
		}
	}
};

export default config;
