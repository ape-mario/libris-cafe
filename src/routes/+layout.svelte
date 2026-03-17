<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { getCurrentUser, restoreUser } from '$lib/stores/user.svelte';
  import ProfilePicker from '$lib/components/ProfilePicker.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';

  let { children } = $props();
  let loaded = $state(false);
  let user = $derived(getCurrentUser());

  onMount(async () => {
    await restoreUser();
    loaded = true;
  });
</script>

{#if !loaded}
  <div class="min-h-screen bg-slate-900 flex items-center justify-center text-white">
    Loading...
  </div>
{:else if !user}
  <ProfilePicker />
{:else}
  <TopBar />
  <main class="pt-16 pb-20 px-4 min-h-screen bg-slate-950 text-white">
    {@render children()}
  </main>
  <BottomNav />
{/if}
