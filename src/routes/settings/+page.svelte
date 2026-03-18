<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { exportData, importData } from '$lib/services/backup';
  import { importGoodreadsCSV } from '$lib/services/goodreads';
  import { showToast } from '$lib/stores/toast.svelte';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getLocale, setLocale, type Locale } from '$lib/i18n/index.svelte';
  import { getTheme, setTheme, type Theme } from '$lib/stores/theme.svelte';
  import { base } from '$app/paths';
  import { isValidRoomCode, formatRoomCode, getRoomLink } from '$lib/sync/room';
  import {
    getSyncStatus,
    getRoomCode,
    onSyncStatusChange,
    createRoom,
    joinRoom,
    leaveRoom
  } from '$lib/sync/manager';
  import { getSyncConfig, saveSyncConfig, type SyncStatus, type ProviderType } from '$lib/sync/provider';
  import { showConfirm } from '$lib/stores/dialog.svelte';

  let importing = $state(false);
  let exporting = $state(false);
  let currentTheme = $derived(getTheme());
  let importingGoodreads = $state(false);
  let locale = $derived(getLocale());
  let user = $derived(getCurrentUser());

  // Sync state
  let syncStatus = $state<SyncStatus>('disconnected');
  let roomCode = $state<string | null>(null);
  let joinInput = $state('');
  let selectedProvider = $state<ProviderType>('webrtc');
  let serverUrl = $state('');
  let showJoinInput = $state(false);
  let unsubSync: (() => void) | null = null;

  onMount(() => {
    syncStatus = getSyncStatus();
    roomCode = getRoomCode();
    const config = getSyncConfig();
    selectedProvider = config.provider;
    serverUrl = config.serverUrl || '';
    unsubSync = onSyncStatusChange((status) => {
      syncStatus = status;
    });

    // Check for pending join from /join/[code] route
    const pending = sessionStorage.getItem('libris_pending_join');
    if (pending) {
      sessionStorage.removeItem('libris_pending_join');
      handleJoinRoom(pending);
    }
  });

  function handleProviderChange(provider: ProviderType) {
    selectedProvider = provider;
    saveSyncConfig({ provider, serverUrl: serverUrl || undefined });
    // If already in a room, reconnect with new provider
    if (roomCode) {
      leaveRoom();
      joinRoom(roomCode);
      roomCode = getRoomCode();
    }
  }

  function handleServerUrlSave() {
    saveSyncConfig({ provider: selectedProvider, serverUrl: serverUrl.trim() || undefined });
  }

  onDestroy(() => {
    unsubSync?.();
  });

  function handleLocale(newLocale: Locale) {
    setLocale(newLocale);
  }

  function handleCreateRoom() {
    const code = createRoom();
    roomCode = code;
    showToast(t('toast.sync_joined'), 'success');
  }

  function handleJoinRoom(code?: string) {
    const input = code || formatRoomCode(joinInput);
    if (!isValidRoomCode(input)) {
      showToast(t('toast.sync_invalid_code'), 'error');
      return;
    }
    joinRoom(input);
    roomCode = input;
    joinInput = '';
    showJoinInput = false;
    showToast(t('toast.sync_joined'), 'success');
  }

  async function handleLeaveRoom() {
    const confirmed = await showConfirm({
      title: t('settings.sync_leave_confirm'),
      message: t('settings.sync_leave_confirm_message'),
      confirmLabel: t('settings.sync_leave_room'),
      danger: true
    });
    if (!confirmed) return;
    leaveRoom();
    roomCode = null;
    showToast(t('toast.sync_left'), 'info');
  }

  async function handleCopyLink() {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(getRoomLink(roomCode, base));
      showToast(t('settings.sync_copied'), 'success');
    } catch {
      // Fallback
      showToast(getRoomLink(roomCode, base), 'info');
    }
  }

  async function handleExport() {
    exporting = true;
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `libris-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('toast.exported'), 'success');
    } catch {
      showToast(t('toast.export_failed'), 'error');
    }
    exporting = false;
  }

  async function handleImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const confirmed = await showConfirm({
      title: t('settings.import_confirm'),
      message: t('settings.import_confirm_message'),
      confirmLabel: t('settings.import_title')
    });
    if (!confirmed) {
      input.value = '';
      return;
    }
    importing = true;
    try {
      const json = await file.text();
      await importData(json);
      showToast(t('toast.imported'), 'success');
    } catch {
      showToast(t('toast.import_failed'), 'error');
    }
    importing = false;
  }

  async function handleGoodreads(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !user) return;
    importingGoodreads = true;
    try {
      const csv = await file.text();
      const count = importGoodreadsCSV(csv, user.id);
      showToast(t('toast.goodreads_imported', { count: count.toString() }), 'success');
    } catch {
      showToast(t('toast.goodreads_failed'), 'error');
    }
    importingGoodreads = false;
    input.value = '';
  }

  const statusColors: Record<SyncStatus, string> = {
    connected: 'bg-sage',
    connecting: 'bg-gold animate-pulse',
    disconnected: 'bg-warm-300',
    offline: 'bg-warm-400'
  };

  function statusLabel(status: SyncStatus): string {
    const map: Record<SyncStatus, string> = {
      connected: t('settings.sync_connected'),
      connecting: t('settings.sync_connecting'),
      disconnected: t('settings.sync_disconnected'),
      offline: t('settings.sync_offline')
    };
    return map[status];
  }
</script>

<div class="max-w-lg mx-auto animate-fade-up">
  <button onclick={() => history.back()} class="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4 transition-colors">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    {t('common.back')}
  </button>

  <h1 class="font-display text-2xl font-bold text-ink tracking-tight mb-6">{t('settings.title')}</h1>

  <div class="space-y-4">
    <!-- Language -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-3">{t('settings.language')}</h2>
      <div class="flex gap-2">
        <button
          class="tab-pill {locale === 'en' ? 'tab-pill-active' : 'tab-pill-inactive'}"
          onclick={() => handleLocale('en')}
        >English</button>
        <button
          class="tab-pill {locale === 'id' ? 'tab-pill-active' : 'tab-pill-inactive'}"
          onclick={() => handleLocale('id')}
        >Bahasa Indonesia</button>
      </div>
    </div>

    <!-- Theme -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-3">{t('settings.theme')}</h2>
      <div class="flex gap-2">
        {#each [
          { key: 'light', label: t('settings.theme.light'), icon: '☀' },
          { key: 'dark', label: t('settings.theme.dark'), icon: '🌙' },
          { key: 'system', label: t('settings.theme.system'), icon: '⚙' }
        ] as opt}
          <button
            class="tab-pill {currentTheme === opt.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
            onclick={() => setTheme(opt.key as Theme)}
          >{opt.label}</button>
        {/each}
      </div>
    </div>

    <!-- Device Sync -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.sync_title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{t('settings.sync_desc')}</p>

      <!-- Provider selection -->
      <div class="mb-4">
        <span class="text-xs font-semibold text-ink-muted uppercase tracking-wider">{t('settings.sync_provider')}</span>
        <div class="flex gap-1.5 mt-2">
          {#each [
            { key: 'webrtc' as ProviderType, label: t('settings.sync_provider_webrtc') },
            { key: 'partykit' as ProviderType, label: t('settings.sync_provider_partykit') },
            { key: 'hocuspocus' as ProviderType, label: t('settings.sync_provider_hocuspocus') }
          ] as opt}
            <button
              class="tab-pill !py-1 !px-3 !text-xs {selectedProvider === opt.key ? 'tab-pill-active' : 'tab-pill-inactive'}"
              onclick={() => handleProviderChange(opt.key)}
            >{opt.label}</button>
          {/each}
        </div>
        {#if selectedProvider === 'webrtc'}
          <p class="text-[11px] text-warm-400 mt-2">{t('settings.sync_webrtc_hint')}</p>
        {/if}
        {#if selectedProvider === 'hocuspocus'}
          <div class="mt-2 flex gap-2">
            <input
              type="url"
              bind:value={serverUrl}
              placeholder={t('settings.sync_server_url_placeholder')}
              class="input-field flex-1 font-mono text-xs"
            />
            <button class="btn-secondary !py-1.5 !px-3 !text-xs" onclick={handleServerUrlSave}>OK</button>
          </div>
        {/if}
      </div>

      {#if roomCode}
        <!-- Connected to a room -->
        <div class="flex flex-col gap-3">
          <!-- Status -->
          <div class="flex items-center gap-2.5">
            <div class="w-2 h-2 rounded-full {statusColors[syncStatus]}"></div>
            <span class="text-sm text-ink">{statusLabel(syncStatus)}</span>
          </div>

          <!-- Room code display -->
          <div class="flex items-center gap-3 bg-warm-50 rounded-xl p-3">
            <div class="flex-1">
              <span class="text-xs text-ink-muted uppercase tracking-wider font-semibold">{t('settings.sync_room_code')}</span>
              <p class="font-mono text-lg font-bold text-ink tracking-widest mt-0.5">{roomCode}</p>
            </div>
            <button
              class="btn-secondary !py-1.5 !px-3 !text-xs"
              onclick={handleCopyLink}
            >{t('settings.sync_share_link')}</button>
          </div>

          <!-- Leave room -->
          <button
            class="text-xs text-warm-400 hover:text-berry transition-colors self-start mt-1"
            onclick={handleLeaveRoom}
          >{t('settings.sync_leave_room')}</button>
        </div>
      {:else}
        <!-- Not in a room -->
        <div class="flex flex-col gap-3">
          <div class="flex gap-2">
            <button class="btn-primary flex-1" onclick={handleCreateRoom}>
              {t('settings.sync_create_room')}
            </button>
            <button class="btn-secondary flex-1" onclick={() => showJoinInput = !showJoinInput}>
              {t('settings.sync_join_room')}
            </button>
          </div>

          {#if showJoinInput}
            <form class="flex gap-2 animate-fade-up" onsubmit={(e) => { e.preventDefault(); handleJoinRoom(); }}>
              <input
                type="text"
                bind:value={joinInput}
                placeholder={t('settings.sync_room_code_placeholder')}
                class="input-field flex-1 font-mono text-center tracking-widest uppercase"
                maxlength="9"
              />
              <button type="submit" class="btn-primary"
                disabled={joinInput.replace(/-/g, '').length !== 8}
              >{t('settings.sync_join_room')}</button>
            </form>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Goodreads Import -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.goodreads_title')}</h2>
      <p class="text-sm text-ink-muted mb-2">{t('settings.goodreads_desc')}</p>
      <p class="text-[11px] text-warm-400 mb-4 font-mono">{t('settings.goodreads_help')}</p>
      <input type="file" accept=".csv" onchange={handleGoodreads} disabled={importingGoodreads}
        class="text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-warm-100 file:text-ink-light file:font-medium file:text-xs file:cursor-pointer" />
    </div>

    <!-- Export -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.export_title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{t('settings.export_desc')}</p>
      <button class="btn-primary" onclick={handleExport} disabled={exporting}>
        {exporting ? '...' : t('settings.export_btn')}
      </button>
    </div>

    <!-- Import -->
    <div class="card p-5">
      <h2 class="font-display font-semibold text-ink mb-1">{t('settings.import_title')}</h2>
      <p class="text-sm text-ink-muted mb-4">{t('settings.import_desc')}</p>
      <input type="file" accept=".json" onchange={handleImport} disabled={importing}
        class="text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-warm-100 file:text-ink-light file:font-medium file:text-xs file:cursor-pointer" />
    </div>
  </div>
</div>
