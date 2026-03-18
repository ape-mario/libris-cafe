/**
 * Lightweight error logger.
 * Logs to console. Can be replaced with Sentry/LogRocket when needed.
 */

export const logError = (msg: string, ctx?: unknown) => console.error(`[Libris] ${msg}`, ctx ?? '');
export const logWarn = (msg: string, ctx?: unknown) => console.warn(`[Libris] ${msg}`, ctx ?? '');
export const logInfo = (msg: string, ctx?: unknown) => console.log(`[Libris] ${msg}`, ctx ?? '');

/**
 * Install global error handler to catch uncaught errors.
 * Call once on app startup.
 */
export function installGlobalErrorHandler() {
	if (typeof window === 'undefined') return;

	window.addEventListener('error', (event) => {
		logError('Uncaught error', {
			message: event.message,
			filename: event.filename,
			lineno: event.lineno
		});
	});

	window.addEventListener('unhandledrejection', (event) => {
		logError('Unhandled promise rejection', { reason: String(event.reason) });
	});
}
