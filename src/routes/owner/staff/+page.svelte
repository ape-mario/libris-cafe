<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n/index.svelte';
  import { base } from '$app/paths';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import { fetchAllStaff, deactivateStaff } from '$lib/modules/auth/admin';
  import { fetchOutlets } from '$lib/modules/outlet/service';
  import type { Staff } from '$lib/modules/auth/types';
  import type { Outlet } from '$lib/modules/outlet/types';

  let staff = $state<Staff[]>([]);
  let outlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let showInactive = $state(false);

  // Group staff by outlet
  let groupedStaff = $derived(() => {
    const filtered = showInactive ? staff : staff.filter(s => s.is_active);
    const groups: Record<string, { outlet: Outlet | null; members: Staff[] }> = {};

    for (const s of filtered) {
      if (!groups[s.outlet_id]) {
        const outlet = outlets.find(o => o.id === s.outlet_id) ?? null;
        groups[s.outlet_id] = { outlet, members: [] };
      }
      groups[s.outlet_id].members.push(s);
    }

    return Object.values(groups);
  });

  onMount(async () => {
    try {
      [staff, outlets] = await Promise.all([fetchAllStaff(), fetchOutlets()]);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  async function handleDeactivate(member: Staff) {
    const confirmed = await showConfirm(t('staff.deactivate_confirm', { name: member.name }));
    if (!confirmed) return;
    try {
      await deactivateStaff(member.id);
      showToast(t('staff.deactivated'), 'success');
      staff = await fetchAllStaff();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }
</script>

<div class="p-4 max-w-2xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-ink">{t('staff.title')}</h1>
    <a
      href="{base}/owner/staff/new"
      class="px-4 py-2 bg-sage text-white rounded-lg font-medium
             hover:bg-sage-600 transition-colors"
    >
      {t('staff.create')}
    </a>
  </div>

  <!-- Active/inactive toggle -->
  <label class="flex items-center gap-2 mb-4 text-sm text-ink-muted cursor-pointer">
    <input type="checkbox" bind:checked={showInactive} class="rounded border-warm-300" />
    {t('staff.show_inactive')}
  </label>

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if staff.length === 0}
    <div class="text-center py-12">
      <p class="text-warm-400 mb-4">{t('staff.no_staff')}</p>
      <a
        href="{base}/owner/staff/new"
        class="inline-block px-4 py-2 bg-sage text-white rounded-lg font-medium"
      >
        {t('staff.create')}
      </a>
    </div>
  {:else}
    {#each groupedStaff() as group}
      <div class="mb-6">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider px-1 mb-2">
          {group.outlet?.name ?? 'Unknown Outlet'}
        </h2>
        <div class="space-y-2">
          {#each group.members as member (member.id)}
            <div class="bg-surface rounded-xl border border-warm-200 p-4
                        {member.is_active ? '' : 'opacity-60'}">
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-semibold text-ink">{member.name}</h3>
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium
                      {member.role === 'owner' ? 'bg-accent/10 text-accent' : 'bg-sage/10 text-sage'}">
                      {member.role}
                    </span>
                    {#if !member.is_active}
                      <span class="text-xs px-2 py-0.5 rounded-full bg-warm-200 text-warm-500">
                        {t('staff.inactive')}
                      </span>
                    {/if}
                  </div>
                  {#if member.email}
                    <p class="text-sm text-ink-muted mt-0.5">{member.email}</p>
                  {/if}
                </div>
                {#if member.is_active}
                  <button
                    class="p-2 rounded-lg hover:bg-red-50 text-warm-400
                           hover:text-red-500 transition-colors"
                    title={t('staff.deactivate')}
                    onclick={() => handleDeactivate(member)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="m15 9-6 6"/><path d="m9 9 6 6"/>
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>
