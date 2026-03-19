<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { getCurrentStaff } from '$lib/modules/auth/stores.svelte';
  import {
    getNotifications as fetchNotifications,
    markAsRead,
    markAllAsRead,
  } from '$lib/modules/notification/service';
  import {
    getNotifications, setNotifications, getUnreadCount,
    setUnreadCount, markNotificationRead,
  } from '$lib/modules/notification/stores.svelte';
  import type { Notification } from '$lib/modules/notification/types';

  let loading = $state(true);
  let notifications = $derived(getNotifications());
  let unreadCount = $derived(getUnreadCount());

  const staff = getCurrentStaff();

  onMount(async () => {
    if (!staff) return;
    try {
      const list = await fetchNotifications(staff.id);
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    } finally {
      loading = false;
    }
  });

  async function handleMarkRead(notif: Notification) {
    if (notif.read) return;
    try {
      await markAsRead(notif.id);
      markNotificationRead(notif.id);
    } catch {}
  }

  async function handleMarkAllRead() {
    if (!staff) return;
    try {
      await markAllAsRead(staff.id);
      setNotifications(notifications.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  }

  function typeIcon(type: string): string {
    switch (type) {
      case 'low_stock': return '\u{1F4E6}';
      case 'out_of_stock': return '\u{1F6AB}';
      case 'po_received': return '\u{1F4EC}';
      case 'settlement_due': return '\u{1F4B0}';
      case 'payment_failed': return '\u{274C}';
      case 'daily_summary': return '\u{1F4CA}';
      case 'restock_suggestion': return '\u{1F504}';
      default: return '\u{1F514}';
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-xl font-bold text-ink">{t('notification.title')}</h1>
    {#if unreadCount > 0}
      <button onclick={handleMarkAllRead}
        class="text-xs text-accent font-medium hover:text-accent/80">
        {t('notification.mark_all_read')}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="py-8 text-center text-sm text-ink-muted">Loading...</div>
  {:else if notifications.length === 0}
    <div class="py-12 text-center text-sm text-ink-muted">{t('notification.empty')}</div>
  {:else}
    <div class="space-y-1">
      {#each notifications as notif}
        <button
          class="w-full text-left bg-surface rounded-xl border px-4 py-3 transition-colors
            {notif.read ? 'border-warm-100' : 'border-accent/20 bg-accent/5'}"
          onclick={() => handleMarkRead(notif)}
        >
          <div class="flex items-start gap-3">
            <span class="text-lg mt-0.5">{typeIcon(notif.type)}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-ink truncate {!notif.read ? 'font-semibold' : ''}">
                  {notif.title}
                </p>
                <span class="text-[10px] text-ink-muted ml-2 whitespace-nowrap">{formatTime(notif.created_at)}</span>
              </div>
              {#if notif.body}
                <p class="text-xs text-ink-muted mt-0.5 line-clamp-2">{notif.body}</p>
              {/if}
            </div>
            {#if !notif.read}
              <span class="w-2 h-2 rounded-full bg-accent mt-2 shrink-0"></span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
