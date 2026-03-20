interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  leaving: boolean;
}

let toasts = $state<ToastItem[]>([]);
let nextId = 0;

export const toastStore = { get list() { return toasts; } };

export function getToasts(): ToastItem[] {
  return toasts;
}

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const id = nextId++;
  toasts.push({ id, message, type, leaving: false });

  setTimeout(() => {
    const t = toasts.find(t => t.id === id);
    if (t) t.leaving = true;
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
    }, 300);
  }, 2800);
}
