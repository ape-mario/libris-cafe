<script lang="ts">
  let { welcomeMessage, cafeName, ontap }: {
    welcomeMessage: string;
    cafeName: string;
    ontap: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-cream/95 backdrop-blur-sm"
  onclick={ontap}
  ontouchstart={ontap}
>
  <div class="text-center space-y-6 animate-pulse-slow">
    <h2 class="text-4xl font-bold text-accent">{cafeName}</h2>
    <p class="text-xl text-ink-muted">{welcomeMessage}</p>
    <div class="mt-8">
      <svg class="w-16 h-16 mx-auto text-accent/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
      </svg>
    </div>
  </div>
</div>

<style>
  @keyframes pulse-slow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.8; }
  }
  .animate-pulse-slow {
    animation: pulse-slow 3s ease-in-out infinite;
  }
</style>
