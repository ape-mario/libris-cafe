<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { t, setLocale, getLocale } from '$lib/i18n/index.svelte';
  import type { Locale } from '$lib/i18n/index.svelte';
  import { createClient } from '@supabase/supabase-js';

  let step = $state(1);
  let locale = $derived(getLocale());

  // Step 2: Database connection
  let dbUrl = $state('');
  let dbAnonKey = $state('');
  let testingConnection = $state(false);
  let connectionError = $state('');
  let connectionOk = $state(false);
  let showEnvInstructions = $state(false);

  // Step 3: Owner account
  let ownerName = $state('');
  let ownerEmail = $state('');
  let ownerPin = $state('');
  let creatingOwner = $state(false);
  let ownerError = $state('');

  function handleLanguage(lang: Locale) {
    setLocale(lang);
    step = 2;
  }

  async function testConnection() {
    testingConnection = true;
    connectionError = '';
    connectionOk = false;

    try {
      const client = createClient(dbUrl.trim(), dbAnonKey.trim());
      const { error } = await client.from('outlet').select('id').limit(1);
      if (error) {
        connectionError = error.message;
      } else {
        connectionOk = true;
        showEnvInstructions = true;
      }
    } catch (err: any) {
      connectionError = err.message ?? t('setup.connection_failed');
    } finally {
      testingConnection = false;
    }
  }

  function proceedToOwner() {
    step = 3;
  }

  async function createOwnerAccount() {
    if (!ownerName.trim() || !ownerEmail.trim() || !ownerPin) return;
    if (!/^\d{4,6}$/.test(ownerPin)) {
      ownerError = t('staff.pin_invalid');
      return;
    }

    creatingOwner = true;
    ownerError = '';

    try {
      // Use the credentials entered in the setup form to call the Edge Function.
      // Since there's no authenticated user yet, we create the first owner
      // by calling the Supabase Auth admin API via the Edge Function.
      // For the very first setup, the Edge Function needs a special bootstrap mode.
      const client = createClient(dbUrl.trim(), dbAnonKey.trim());

      // First, check if any staff exist (bootstrap mode)
      const { data: existingStaff } = await client
        .from('staff')
        .select('id')
        .limit(1);

      if (existingStaff && existingStaff.length > 0) {
        // Staff already exist — not first-time setup
        ownerError = t('setup.staff_exists');
        creatingOwner = false;
        return;
      }

      // Call the create-staff Edge Function without auth (bootstrap mode)
      const { data, error } = await client.functions.invoke('create-staff', {
        body: {
          name: ownerName.trim(),
          email: ownerEmail.trim(),
          pin: ownerPin,
          role: 'owner',
          outlet_id: 'default', // Will be created by the function or pre-existing
          bootstrap: true,
        },
      });

      if (error) {
        ownerError = error.message;
      } else {
        step = 4;
      }
    } catch (err: any) {
      ownerError = err.message ?? t('error.generic');
    } finally {
      creatingOwner = false;
    }
  }

  function completeSetup() {
    localStorage.setItem('libris_setup_done', '1');
    goto(`${base}/login`);
  }
</script>

<div class="min-h-screen bg-cream flex items-center justify-center p-6">
  <div class="w-full max-w-md">
    <!-- Progress dots -->
    <div class="flex justify-center gap-2 mb-8">
      {#each [1, 2, 3, 4] as s}
        <div class="w-2.5 h-2.5 rounded-full transition-colors
          {s === step ? 'bg-accent' : s < step ? 'bg-sage' : 'bg-warm-200'}"></div>
      {/each}
    </div>

    <!-- Step 1: Welcome + Language -->
    {#if step === 1}
      <div class="text-center animate-fade-in">
        <div class="w-20 h-20 rounded-2xl bg-accent/10 mx-auto mb-6 flex items-center justify-center">
          <span class="font-display text-3xl text-accent font-bold">L</span>
        </div>
        <h1 class="font-display text-2xl font-bold text-ink mb-2">{t('setup.welcome')}</h1>
        <p class="text-ink-muted mb-8">{t('setup.welcome_desc')}</p>

        <p class="text-sm font-medium text-ink-muted mb-4">{t('setup.choose_language')}</p>
        <div class="flex gap-3 justify-center">
          <button
            class="px-6 py-3 rounded-xl border-2 transition-colors font-medium
              {locale === 'id' ? 'border-accent bg-accent/5 text-accent' : 'border-warm-200 text-ink hover:border-warm-300'}"
            onclick={() => handleLanguage('id')}
          >
            Bahasa Indonesia
          </button>
          <button
            class="px-6 py-3 rounded-xl border-2 transition-colors font-medium
              {locale === 'en' ? 'border-accent bg-accent/5 text-accent' : 'border-warm-200 text-ink hover:border-warm-300'}"
            onclick={() => handleLanguage('en')}
          >
            English
          </button>
        </div>
      </div>

    <!-- Step 2: Database Connection -->
    {:else if step === 2}
      <div class="animate-fade-in">
        <h1 class="font-display text-2xl font-bold text-ink mb-2">{t('setup.connect_db')}</h1>
        <p class="text-ink-muted mb-6">{t('setup.connect_db_desc')}</p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-ink-light mb-1">{t('setup.supabase_url')}</label>
            <input
              type="url"
              bind:value={dbUrl}
              class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                     focus:ring-1 focus:ring-sage outline-none text-sm"
              placeholder="https://xxxxx.supabase.co"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-light mb-1">{t('setup.anon_key')}</label>
            <input
              type="password"
              bind:value={dbAnonKey}
              class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                     focus:ring-1 focus:ring-sage outline-none text-sm font-mono"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
            />
          </div>

          {#if connectionError}
            <p class="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{connectionError}</p>
          {/if}

          {#if connectionOk}
            <p class="text-sm text-sage bg-sage/10 p-3 rounded-lg">{t('setup.connection_success')}</p>
          {/if}

          {#if showEnvInstructions}
            <div class="bg-warm-50 border border-warm-200 rounded-lg p-4 text-sm">
              <p class="font-medium text-ink mb-2">Add these to your .env file and restart the app:</p>
              <pre class="bg-white rounded p-3 overflow-x-auto text-xs font-mono text-ink-light">VITE_SUPABASE_URL={dbUrl.trim()}
VITE_SUPABASE_ANON_KEY={dbAnonKey.trim()}</pre>
            </div>
          {/if}

          <div class="flex gap-3 pt-2">
            <button
              class="px-4 py-2 bg-warm-100 text-ink-light rounded-lg font-medium
                     hover:bg-warm-200 transition-colors"
              onclick={() => { step = 1; }}
            >
              {t('common.back')}
            </button>

            {#if !connectionOk}
              <button
                disabled={testingConnection || !dbUrl.trim() || !dbAnonKey.trim()}
                class="flex-1 px-4 py-2 bg-sage text-white rounded-lg font-medium
                       hover:bg-sage-600 transition-colors disabled:opacity-50"
                onclick={testConnection}
              >
                {testingConnection ? t('setup.testing') : t('setup.test_connection')}
              </button>
            {:else}
              <button
                class="flex-1 px-4 py-2 bg-accent text-white rounded-lg font-medium
                       hover:bg-accent/90 transition-colors"
                onclick={proceedToOwner}
              >
                {t('setup.next')}
              </button>
            {/if}
          </div>
        </div>
      </div>

    <!-- Step 3: Create Owner Account -->
    {:else if step === 3}
      <div class="animate-fade-in">
        <h1 class="font-display text-2xl font-bold text-ink mb-2">{t('setup.create_owner')}</h1>
        <p class="text-ink-muted mb-6">{t('setup.create_owner_desc')}</p>

        <form
          class="space-y-4"
          onsubmit={(e) => { e.preventDefault(); createOwnerAccount(); }}
        >
          <div>
            <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.name')}</label>
            <input
              type="text"
              bind:value={ownerName}
              required
              class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                     focus:ring-1 focus:ring-sage outline-none"
              placeholder={t('setup.owner_name_placeholder')}
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.email')}</label>
            <input
              type="email"
              bind:value={ownerEmail}
              required
              class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                     focus:ring-1 focus:ring-sage outline-none"
              placeholder="owner@cafe.com"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink-light mb-1">{t('staff.pin')}</label>
            <input
              type="password"
              bind:value={ownerPin}
              required
              inputmode="numeric"
              pattern="[0-9]{4,6}"
              maxlength="6"
              class="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-sage
                     focus:ring-1 focus:ring-sage outline-none"
              placeholder={t('auth.pin_placeholder')}
            />
          </div>

          {#if ownerError}
            <p class="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{ownerError}</p>
          {/if}

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              class="px-4 py-2 bg-warm-100 text-ink-light rounded-lg font-medium
                     hover:bg-warm-200 transition-colors"
              onclick={() => { step = 2; }}
            >
              {t('common.back')}
            </button>
            <button
              type="submit"
              disabled={creatingOwner || !ownerName.trim() || !ownerEmail.trim() || !ownerPin}
              class="flex-1 px-4 py-2 bg-sage text-white rounded-lg font-medium
                     hover:bg-sage-600 transition-colors disabled:opacity-50"
            >
              {creatingOwner ? t('app.loading') : t('setup.create_account')}
            </button>
          </div>
        </form>
      </div>

    <!-- Step 4: Complete -->
    {:else if step === 4}
      <div class="text-center animate-fade-in">
        <div class="w-20 h-20 rounded-full bg-sage/10 mx-auto mb-6 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" class="text-sage">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h1 class="font-display text-2xl font-bold text-ink mb-2">{t('setup.complete')}</h1>
        <p class="text-ink-muted mb-8">{t('setup.complete_desc')}</p>
        <button
          class="px-8 py-3 bg-accent text-white rounded-xl font-semibold
                 hover:bg-accent/90 transition-colors"
          onclick={completeSetup}
        >
          {t('setup.go_login')}
        </button>
      </div>
    {/if}
  </div>
</div>
