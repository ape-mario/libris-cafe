<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.svelte';
</script>

<div class="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
  <div class="w-16 h-16 rounded-2xl bg-warm-100 mb-4 flex items-center justify-center">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-warm-400">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
    </svg>
  </div>
  <h1 class="font-display text-xl font-bold text-ink mb-2">
    {page.status === 404 ? t('error.not_found') : t('error.generic')}
  </h1>
  <p class="text-sm text-ink-muted mb-6">{page.error?.message || t('error.unexpected')}</p>
  <a href="/" class="btn-primary inline-block">{t('error.back')}</a>
</div>
