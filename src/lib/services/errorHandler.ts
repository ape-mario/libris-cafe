import { showToast } from '$lib/stores/toast.svelte';

/**
 * Wrap an async operation with error handling.
 * Shows a toast on failure and returns a fallback value.
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  fallback: T,
  errorMessage?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = errorMessage || getErrorMessage(error);
    showToast(message, 'error');
    console.error('[MyBooks Error]', error);
    return fallback;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return 'Storage full. Try exporting and clearing old data.';
    }
    if (error.name === 'AbortError') {
      return 'Operation was cancelled.';
    }
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Network error. Check your connection.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}

/**
 * Check if IndexedDB storage is getting low.
 * Returns estimated usage percentage (0-100) or null if API not available.
 */
export async function checkStorageQuota(): Promise<{ used: number; total: number; percent: number } | null> {
  if (!navigator.storage?.estimate) return null;

  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const total = estimate.quota || 0;
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;
    return { used, total, percent };
  } catch {
    return null;
  }
}
