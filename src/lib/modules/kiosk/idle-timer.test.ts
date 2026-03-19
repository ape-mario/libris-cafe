import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleTimer } from './idle-timer';

// Provide a minimal document mock for the node test environment
const mockDocument = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

vi.stubGlobal('document', mockDocument);

describe('IdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockDocument.addEventListener.mockReset();
    mockDocument.removeEventListener.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fire onIdle callback after timeout', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledOnce();

    timer.stop();
  });

  it('should not fire onIdle before timeout', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    vi.advanceTimersByTime(4999);
    expect(onIdle).not.toHaveBeenCalled();

    timer.stop();
  });

  it('should reset timer on reset() call', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    vi.advanceTimersByTime(3000);
    timer.reset();
    vi.advanceTimersByTime(3000);
    // Should NOT have fired — reset pushed it out
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(onIdle).toHaveBeenCalledOnce();

    timer.stop();
  });

  it('should fire countdown callback during warning period', () => {
    const onIdle = vi.fn();
    const onCountdown = vi.fn();
    const timer = new IdleTimer({
      timeoutMs: 5000,
      onIdle,
      onCountdown,
      warningMs: 3000,
    });

    timer.start();

    // After 2s (warningDelay = 5000 - 3000 = 2000), countdown starts
    vi.advanceTimersByTime(2000);
    expect(onCountdown).toHaveBeenCalledWith(3); // 3 seconds left

    vi.advanceTimersByTime(1000);
    expect(onCountdown).toHaveBeenCalledWith(2);

    vi.advanceTimersByTime(1000);
    expect(onCountdown).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalledOnce();

    timer.stop();
  });

  it('should register event listeners on start and remove on stop', () => {
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle: vi.fn() });

    timer.start();
    expect(mockDocument.addEventListener).toHaveBeenCalled();

    timer.stop();
    expect(mockDocument.removeEventListener).toHaveBeenCalled();
  });

  it('should not start twice', () => {
    const onIdle = vi.fn();
    const timer = new IdleTimer({ timeoutMs: 5000, onIdle });

    timer.start();
    timer.start(); // Second call should be no-op

    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledOnce(); // Only one timeout fired

    timer.stop();
  });
});
