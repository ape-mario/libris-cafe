<script lang="ts">
  import { page } from '$app/state';

  const tabs = [
    { href: '/', label: 'Library', icon: '📚' },
    { href: '/browse', label: 'Browse', icon: '📂' },
    { href: '/mine', label: 'Mine', icon: '⭐' }
  ];
</script>

<nav class="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 flex justify-around py-2 z-50">
  {#each tabs as tab}
    <a
      href={tab.href}
      class="flex flex-col items-center gap-1 px-4 py-1 text-xs transition {page.url.pathname === tab.href ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'}"
    >
      <span class="text-lg">{tab.icon}</span>
      <span>{tab.label}</span>
    </a>
  {/each}
</nav>
