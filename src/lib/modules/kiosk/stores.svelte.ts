import type { KioskConfig, KioskState } from './types';
import { DEFAULT_KIOSK_CONFIG } from './types';

let kioskMode = $state(false);
let kioskState = $state<KioskState>('idle');
let config = $state<KioskConfig>({ ...DEFAULT_KIOSK_CONFIG });
let countdownSeconds = $state<number | null>(null);

export function getKioskStore() {
  return {
    get isKioskMode() { return kioskMode; },
    get state() { return kioskState; },
    get config() { return config; },
    get countdownSeconds() { return countdownSeconds; },

    enable(overrides?: Partial<KioskConfig>) {
      kioskMode = true;
      kioskState = 'idle';
      if (overrides) {
        config = { ...DEFAULT_KIOSK_CONFIG, ...overrides };
      }
    },

    disable() {
      kioskMode = false;
      kioskState = 'idle';
      countdownSeconds = null;
    },

    setActive() {
      kioskState = 'active';
      countdownSeconds = null;
    },

    setIdle() {
      kioskState = 'idle';
      countdownSeconds = null;
    },

    setCountdown(seconds: number) {
      countdownSeconds = seconds;
    },

    setResetting() {
      kioskState = 'resetting';
    },

    updateConfig(overrides: Partial<KioskConfig>) {
      config = { ...config, ...overrides };
    },
  };
}
