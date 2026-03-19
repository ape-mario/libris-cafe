export type IdleCallback = () => void;

/**
 * Idle timer for kiosk mode.
 * Monitors user interaction events and fires callback after timeout.
 * Resets on any touch, click, scroll, or keypress event.
 */
export class IdleTimer {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private countdownId: ReturnType<typeof setInterval> | null = null;
  private timeoutMs: number;
  private onIdle: IdleCallback;
  private onCountdown?: (secondsLeft: number) => void;
  private warningMs: number;
  private isRunning = false;
  private lastActivity = Date.now();

  /** Events that reset the idle timer. */
  private static EVENTS: (keyof DocumentEventMap)[] = [
    'touchstart',
    'touchmove',
    'click',
    'mousemove',
    'scroll',
    'keydown',
  ];

  constructor(options: {
    timeoutMs: number;
    onIdle: IdleCallback;
    /** Callback fired every second during the warning period (last 10s). */
    onCountdown?: (secondsLeft: number) => void;
    /** How long before timeout to start countdown warning (ms). Default: 10000. */
    warningMs?: number;
  }) {
    this.timeoutMs = options.timeoutMs;
    this.onIdle = options.onIdle;
    this.onCountdown = options.onCountdown;
    this.warningMs = options.warningMs ?? 10000;
    this.handleActivity = this.handleActivity.bind(this);
  }

  /** Start monitoring idle state. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastActivity = Date.now();

    // Attach event listeners
    for (const event of IdleTimer.EVENTS) {
      document.addEventListener(event, this.handleActivity, { passive: true });
    }

    this.scheduleTimeout();
  }

  /** Stop monitoring idle state. */
  stop(): void {
    this.isRunning = false;

    for (const event of IdleTimer.EVENTS) {
      document.removeEventListener(event, this.handleActivity);
    }

    this.clearTimers();
  }

  /** Reset the timer (called on user activity). */
  reset(): void {
    this.lastActivity = Date.now();
    this.clearTimers();
    if (this.isRunning) {
      this.scheduleTimeout();
    }
  }

  /** Get milliseconds remaining until idle. */
  getTimeRemaining(): number {
    return Math.max(0, this.timeoutMs - (Date.now() - this.lastActivity));
  }

  private handleActivity(): void {
    this.reset();
  }

  private scheduleTimeout(): void {
    this.clearTimers();

    // Schedule the warning countdown (starts warningMs before timeout)
    const warningDelay = Math.max(0, this.timeoutMs - this.warningMs);

    if (this.onCountdown && warningDelay > 0) {
      this.timeoutId = setTimeout(() => {
        // Start countdown
        let secondsLeft = Math.ceil(this.warningMs / 1000);
        this.onCountdown?.(secondsLeft);

        this.countdownId = setInterval(() => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            this.clearTimers();
            this.onIdle();
          } else {
            this.onCountdown?.(secondsLeft);
          }
        }, 1000);
      }, warningDelay);
    } else {
      // No countdown, just fire after full timeout
      this.timeoutId = setTimeout(() => {
        this.onIdle();
      }, this.timeoutMs);
    }
  }

  private clearTimers(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.countdownId !== null) {
      clearInterval(this.countdownId);
      this.countdownId = null;
    }
  }
}
