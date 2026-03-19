<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import { t } from '$lib/i18n/index.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { showConfirm } from '$lib/stores/dialog.svelte';
  import {
    fetchOutlet,
    fetchStaffByOutlet,
    fetchOutlets,
    reassignStaff,
  } from '$lib/modules/outlet/service';
  import type { Outlet } from '$lib/modules/outlet/types';

  let outlet = $state<Outlet | null>(null);
  let staffList = $state<any[]>([]);
  let allOutlets = $state<Outlet[]>([]);
  let loading = $state(true);
  let reassigning = $state<string | null>(null);  // staff id being reassigned

  const outletId = $derived(page.params.id);

  onMount(async () => {
    try {
      const [o, staff, outlets] = await Promise.all([
        fetchOutlet(outletId),
        fetchStaffByOutlet(outletId),
        fetchOutlets(),
      ]);
      outlet = o;
      staffList = staff;
      allOutlets = outlets;
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  });

  async function handleReassign(staffId: string, staffName: string, newOutletId: string) {
    const destOutlet = allOutlets.find(o => o.id === newOutletId);
    const confirmed = await showConfirm(
      `Move ${staffName} to ${destOutlet?.name ?? 'another outlet'}?`
    );
    if (!confirmed) return;

    reassigning = staffId;
    try {
      await reassignStaff(staffId, newOutletId);
      showToast(t('outlet.staff.reassigned'), 'success');
      // Reload staff list
      staffList = await fetchStaffByOutlet(outletId);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      reassigning = null;
    }
  }

  let otherOutlets = $derived(allOutlets.filter(o => o.id !== outletId));
</script>

<div class="p-4 max-w-2xl mx-auto">
  <a href="{base}/owner/outlets/{outletId}" class="text-sm text-warm-400 hover:text-ink-light mb-4 inline-block">
    &larr; {outlet?.name ?? t('outlet.title')}
  </a>

  <h1 class="text-2xl font-bold text-ink mb-2">{t('outlet.staff.title')}</h1>
  {#if outlet}
    <p class="text-ink-muted mb-6">{outlet.name}</p>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-warm-400">{t('app.loading')}</div>
  {:else if staffList.length === 0}
    <div class="text-center py-12">
      <p class="text-warm-400">{t('outlet.staff.no_staff')}</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each staffList as staff (staff.id)}
        <div class="bg-surface rounded-xl border border-warm-200 p-4
                    flex items-center justify-between">
          <div>
            <div class="font-medium text-ink">{staff.name}</div>
            <div class="text-sm text-warm-400">{staff.email}</div>
            <span class="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium
                         {staff.role === 'owner' ? 'bg-gold/20 text-gold-700' : 'bg-warm-100 text-ink-muted'}">
              {staff.role}
            </span>
          </div>

          {#if staff.role !== 'owner' && otherOutlets.length > 0}
            <div class="flex items-center gap-2">
              <label class="text-xs text-warm-400" for="reassign-{staff.id}">
                {t('outlet.staff.reassign_to')}:
              </label>
              <select
                id="reassign-{staff.id}"
                class="text-sm px-2 py-1.5 rounded-lg border border-warm-200
                       focus:border-sage outline-none"
                disabled={reassigning === staff.id}
                onchange={(e) => {
                  const target = e.target as HTMLSelectElement;
                  if (target.value) {
                    handleReassign(staff.id, staff.name, target.value);
                    target.value = '';
                  }
                }}
              >
                <option value="">{t('outlet.staff.reassign')}</option>
                {#each otherOutlets as dest (dest.id)}
                  <option value={dest.id}>{dest.name}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
