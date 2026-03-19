export interface KioskConfig {
  /** Idle timeout in milliseconds before auto-reset. Default: 120000 (2 min). */
  idle_timeout_ms: number;

  /** Whether to show QR codes on book cards. */
  show_qr_codes: boolean;

  /** Custom welcome message displayed on idle overlay. */
  welcome_message_en: string;
  welcome_message_id: string;

  /** Cafe branding */
  cafe_name: string;
  cafe_logo_url?: string;

  /** Auto-enter fullscreen on mount. */
  auto_fullscreen: boolean;
}

export const DEFAULT_KIOSK_CONFIG: KioskConfig = {
  idle_timeout_ms: 2 * 60 * 1000, // 2 minutes
  show_qr_codes: false,
  welcome_message_en: 'Touch to browse our collection',
  welcome_message_id: 'Sentuh untuk menjelajahi koleksi kami',
  cafe_name: 'Libris Cafe',
  auto_fullscreen: true,
};

export type KioskState = 'active' | 'idle' | 'resetting';
