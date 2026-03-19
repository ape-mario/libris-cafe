/**
 * Midtrans Snap.js loader and wrapper.
 * Loads the Snap.js script dynamically, provides a typed interface
 * for calling snap.pay().
 */

declare global {
  interface Window {
    snap: {
      pay(
        token: string,
        options: {
          onSuccess: (result: Record<string, string>) => void;
          onPending: (result: Record<string, string>) => void;
          onError: (result: Record<string, string>) => void;
          onClose: () => void;
        }
      ): void;
    };
  }
}

const SNAP_SANDBOX_URL = 'https://app.sandbox.midtrans.com/snap/snap.js';
const SNAP_PRODUCTION_URL = 'https://app.midtrans.com/snap/snap.js';

let loaded = false;
let loading: Promise<void> | null = null;

/**
 * Load Snap.js script into the page.
 * Safe to call multiple times — only loads once.
 */
export function loadSnapJs(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;

  const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY as string;
  const isProduction = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true';

  if (!clientKey) {
    return Promise.reject(new Error('VITE_MIDTRANS_CLIENT_KEY not configured'));
  }

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = isProduction ? SNAP_PRODUCTION_URL : SNAP_SANDBOX_URL;
    script.setAttribute('data-client-key', clientKey);
    script.async = true;

    script.onload = () => {
      loaded = true;
      loading = null;
      resolve();
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Failed to load Midtrans Snap.js'));
    };

    document.head.appendChild(script);
  });

  return loading;
}

export interface SnapPayResult {
  success: boolean;
  pending: boolean;
  result: Record<string, string> | null;
  error: string | null;
}

/**
 * Open Snap.js payment popup.
 * Returns a promise that resolves when the payment completes, is pending, errors, or the user closes.
 */
export function openSnapPayment(token: string): Promise<SnapPayResult> {
  return new Promise((resolve) => {
    if (!window.snap) {
      resolve({ success: false, pending: false, result: null, error: 'Snap.js not loaded' });
      return;
    }

    window.snap.pay(token, {
      onSuccess(result) {
        resolve({ success: true, pending: false, result, error: null });
      },
      onPending(result) {
        resolve({ success: false, pending: true, result, error: null });
      },
      onError(result) {
        resolve({
          success: false,
          pending: false,
          result,
          error: result.status_message || 'Payment failed',
        });
      },
      onClose() {
        resolve({ success: false, pending: false, result: null, error: 'Payment popup closed' });
      },
    });
  });
}

/**
 * Check if Snap.js is loaded and available.
 */
export function isSnapReady(): boolean {
  return loaded && typeof window !== 'undefined' && !!window.snap;
}
