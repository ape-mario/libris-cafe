interface DialogState {
  open: boolean;
  type: 'confirm' | 'prompt';
  title: string;
  message: string;
  placeholder: string;
  confirmLabel: string;
  confirmStyle: 'primary' | 'danger';
  inputValue: string;
  resolve: ((value: string | boolean | null) => void) | null;
}

let dialog = $state<DialogState>({
  open: false,
  type: 'confirm',
  title: '',
  message: '',
  placeholder: '',
  confirmLabel: 'Confirm',
  confirmStyle: 'primary',
  inputValue: '',
  resolve: null
});

export const dialogStore = { get state() { return dialog; } };

export function getDialog(): DialogState {
  return dialog;
}

export function setDialogInput(value: string) {
  dialog.inputValue = value;
}

export function showConfirm(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.open = true;
    dialog.type = 'confirm';
    dialog.title = opts.title;
    dialog.message = opts.message || '';
    dialog.placeholder = '';
    dialog.confirmLabel = opts.confirmLabel || 'Confirm';
    dialog.confirmStyle = opts.danger ? 'danger' : 'primary';
    dialog.inputValue = '';
    dialog.resolve = (v) => resolve(v as boolean);
  });
}

export function showPrompt(opts: {
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    dialog.open = true;
    dialog.type = 'prompt';
    dialog.title = opts.title;
    dialog.message = opts.message || '';
    dialog.placeholder = opts.placeholder || '';
    dialog.confirmLabel = opts.confirmLabel || 'OK';
    dialog.confirmStyle = 'primary';
    dialog.inputValue = '';
    dialog.resolve = (v) => resolve(v as string | null);
  });
}

export function confirmDialog() {
  if (dialog.type === 'prompt') {
    if (!dialog.inputValue.trim()) return;
    dialog.resolve?.(dialog.inputValue.trim());
  } else {
    dialog.resolve?.(true);
  }
  dialog.open = false;
}

export function cancelDialog() {
  dialog.resolve?.(dialog.type === 'prompt' ? null : false);
  dialog.open = false;
}
