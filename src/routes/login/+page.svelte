<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { loginWithPin } from '$lib/modules/auth/service';
  import { setCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import { showToast } from '$lib/stores/toast.svelte';

  let email = $state('');
  let pin = $state('');
  let loading = $state(false);
  let error = $state('');
  let attempts = $state(0);
  let lockedUntil = $state<number | null>(null);

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000;

  let isLocked = $derived(lockedUntil !== null && Date.now() < lockedUntil);

  async function handleLogin() {
    if (isLocked || loading) return;
    error = '';
    loading = true;
    try {
      const session = await loginWithPin(email, pin);
      setCurrentStaff(session.staff);
      showToast(t('auth.welcome', { name: session.staff.name }), 'success');
      goto(`${base}/staff/pos`);
    } catch (e) {
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        lockedUntil = Date.now() + LOCKOUT_MS;
        error = 'Too many attempts. Try again in 5 minutes.';
        setTimeout(() => { lockedUntil = null; attempts = 0; }, LOCKOUT_MS);
      } else {
        error = t('auth.login_error');
      }
    } finally {
      loading = false;
    }
  }

  function continueAsGuest() {
    goto(`${base}/`);
  }
</script>

<div class="min-h-screen bg-cream flex items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <h1 class="font-display text-3xl text-ink font-bold">Libris Cafe</h1>
      <p class="text-sm text-ink-muted mt-2">{t('auth.login')}</p>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-4">
      <div>
        <label for="email" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('auth.email')}
        </label>
        <input
          id="email"
          type="email"
          bind:value={email}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          required
          disabled={isLocked}
        />
      </div>

      <div>
        <label for="pin" class="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">
          {t('auth.pin')}
        </label>
        <input
          id="pin"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          minlength="6"
          maxlength="20"
          bind:value={pin}
          placeholder={t('auth.pin_placeholder')}
          class="w-full px-4 py-3 rounded-xl bg-surface border border-warm-100 text-ink text-sm tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          required
          disabled={isLocked}
        />
      </div>

      {#if error}
        <p class="text-sm text-berry text-center">{error}</p>
      {/if}

      <button
        type="submit"
        class="w-full py-3 rounded-xl bg-accent text-cream font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
        disabled={loading || isLocked}
      >
        {loading ? '...' : t('auth.login_button')}
      </button>
    </form>

    <div class="mt-6 text-center">
      <button
        class="text-sm text-ink-muted hover:text-accent transition-colors"
        onclick={continueAsGuest}
      >
        {t('auth.guest_mode')}
      </button>
    </div>
  </div>
</div>
