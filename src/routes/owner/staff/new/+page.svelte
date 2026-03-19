<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createStaffAccount } from '$lib/modules/auth/admin';
  import { fetchOutlets } from '$lib/modules/outlet/service';
  import type { Outlet } from '$lib/modules/outlet/types';

  let outlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let creating = $state(false);

  let name = $state('');
  let email = $state('');
  let pin = $state('');
  let role = $state<'staff' | 'owner'>('staff');
  let outletId = $state('');

  let pinError = $state('');

  function validatePin(value: string): boolean {
    if (!/^\d{4,6}$/.test(value)) {
      pinError = t('staff.pin_invalid');
      return false;
    }
    pinError = '';
    return true;
  }

  onMount(async () => {
    try {
      outlets = await fetchOutlets();
      if (outlets.length > 0) {
        outletId = outlets[0].id;
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !pin || !outletId) return;
    if (!validatePin(pin)) return;

    creating = true;
    try {
      await createStaffAccount(name.trim(), email.trim(), pin, role, outletId);
      showToast(t('staff.created'), 'success');
      goto(`${base}/owner/staff`);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      creating = false;
    }
  }
</script>

<div class="p-4 max-w-lg mx-auto">
  <div class="flex items-center gap-3 mb-6">
    <a
      href="{base}/owner/staff"
      class="p-2 -ml-2 rounded-lg hover:bg-warm-100 text-ink-muted transition-colors"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m15 18-6-6 6-6"/>
      </svg>
    </a>
    <h1 class="text-2xl font-bold text-ink">{t('staff.create')}</h1>
  </div>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else}
    <form
      class="space-y-4"
      onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
    >
      <!-- Name -->
      <div>
        <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.name')}</label>
        <input
          type="text"
          bind:value={name}
          required
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none"
          placeholder="Andi Pratama"
        />
      </div>

      <!-- Email -->
      <div>
        <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.email')}</label>
        <input
          type="email"
          bind:value={email}
          required
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none"
          placeholder="andi@cafe.com"
        />
      </div>

      <!-- PIN -->
      <div>
        <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.pin')}</label>
        <input
          type="password"
          bind:value={pin}
          required
          inputmode="numeric"
          pattern="[0-9]{4,6}"
          maxlength="6"
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none
                 {pinError ? 'border-red-400' : ''}"
          placeholder={t('auth.pin_placeholder')}
          oninput={() => { if (pinError) validatePin(pin); }}
        />
        {#if pinError}
          <p class="text-xs text-red-500 mt-1">{pinError}</p>
        {/if}
      </div>

      <!-- Role -->
      <div>
        <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.role')}</label>
        <select
          bind:value={role}
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none bg-white"
        >
          <option value="staff">{t('staff.role_staff')}</option>
          <option value="owner">{t('staff.role_owner')}</option>
        </select>
      </div>

      <!-- Outlet -->
      <div>
        <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.outlet')}</label>
        <select
          bind:value={outletId}
          required
          class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                 focus:ring-1 focus:ring-sage outline-none bg-white"
        >
          {#each outlets as outlet (outlet.id)}
            <option value={outlet.id}>{outlet.name}</option>
          {/each}
        </select>
      </div>

      <!-- Submit -->
      <div class="pt-2">
        <button
          type="submit"
          disabled={creating || !name.trim() || !email.trim() || !pin || !outletId}
          class="w-full px-4 py-3 bg-sage text-white rounded-lg font-medium
                 hover:bg-sage-600 transition-colors disabled:opacity-50"
        >
          {creating ? t('app.loading') : t('staff.create')}
        </button>
      </div>
    </form>
  {/if}
</div>
