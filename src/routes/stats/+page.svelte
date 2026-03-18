<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { getReadingStats, type ReadingStats } from '$lib/services/stats';
  import { getGoal, setGoal, getBooksReadThisYear } from '$lib/services/goals';
  import { getRecommendations, type Recommendation } from '$lib/services/recommendations';
  import { t } from '$lib/i18n/index.svelte';

  let user = $derived(getCurrentUser());
  let stats = $state<ReadingStats | null>(null);
  let loading = $state(true);

  // Reading goal
  let goalTarget = $state('');
  let goalRead = $state(0);
  let hasGoal = $state(false);
  let editingGoal = $state(false);

  // Recommendations
  let recs = $state<Recommendation[]>([]);
  let loadingRecs = $state(false);

  onMount(async () => {
    if (user) {
      stats = await getReadingStats(user.id);

      // Load goal
      const goal = getGoal(user.id);
      if (goal) {
        goalTarget = goal.target.toString();
        hasGoal = true;
      }
      goalRead = await getBooksReadThisYear(user.id);

      // Load recommendations in background
      loadingRecs = true;
      getRecommendations(6).then(r => {
        recs = r;
        loadingRecs = false;
      }).catch(() => { loadingRecs = false; });
    }
    loading = false;
  });

  function saveGoal() {
    if (!user) return;
    const target = parseInt(goalTarget);
    if (!target || target < 1) return;
    setGoal(user.id, target);
    hasGoal = true;
    editingGoal = false;
  }

  function maxCount(arr: { count: number }[]): number {
    return Math.max(1, ...arr.map(a => a.count));
  }

  let goalPercent = $derived(
    hasGoal && parseInt(goalTarget) > 0
      ? Math.min(100, Math.round((goalRead / parseInt(goalTarget)) * 100))
      : 0
  );

  let goalStatus = $derived.by(() => {
    if (!hasGoal) return '';
    const target = parseInt(goalTarget);
    if (goalRead >= target) return t('stats.goal.completed');
    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    const expectedProgress = (dayOfYear / 365) * target;
    return goalRead >= expectedProgress ? t('stats.goal.on_track') : t('stats.goal.behind');
  });
</script>

<div class="max-w-lg mx-auto animate-fade-up">
  <h1 class="font-display text-2xl font-bold text-ink tracking-tight mb-6">{t('stats.title')}</h1>

  {#if loading}
    <div class="flex justify-center py-16">
      <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse"></div>
    </div>
  {:else if !stats || stats.totalBooks === 0}
    <div class="text-center py-16">
      <div class="w-16 h-16 rounded-2xl bg-warm-100 mx-auto mb-4 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-warm-400"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
      </div>
      <p class="text-sm text-ink-muted">{t('stats.no_data')}</p>
    </div>
  {:else}
    <!-- Reading Goal -->
    <div class="mb-8">
      <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">{t('stats.reading_goal')}</h2>
      {#if hasGoal && !editingGoal}
        <div class="card p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="font-display text-lg font-bold text-ink">
              {t('stats.goal.progress', { read: goalRead.toString(), goal: goalTarget })}
            </span>
            <button class="text-xs text-ink-muted hover:text-accent transition-colors" aria-label={t('stats.goal.edit')} onclick={() => editingGoal = true}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
          </div>
          <div class="h-3 rounded-full bg-warm-100 overflow-hidden mb-2">
            <div
              class="h-full rounded-full transition-all duration-700 ease-out {goalPercent >= 100 ? 'bg-sage' : 'bg-accent'}"
              style="width: {goalPercent}%"
            ></div>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-xs text-ink-muted">{goalPercent}%</span>
            <span class="text-xs font-medium {goalPercent >= 100 ? 'text-sage' : goalRead >= (parseInt(goalTarget) * new Date().getMonth() / 12) ? 'text-accent' : 'text-warm-400'}">
              {goalStatus}
            </span>
          </div>
        </div>
      {:else}
        <div class="card p-4">
          <form class="flex gap-3 items-end" onsubmit={(e) => { e.preventDefault(); saveGoal(); }}>
            <label class="flex-1 flex flex-col gap-1.5">
              <span class="text-xs text-ink-muted">{t('stats.goal.books_this_year')}</span>
              <input type="number" min="1" bind:value={goalTarget} placeholder="24" class="input-field text-center" />
            </label>
            <button type="submit" class="btn-primary">{t('stats.goal.set')}</button>
            {#if hasGoal}
              <button type="button" class="btn-secondary" onclick={() => editingGoal = false}>{t('dialog.cancel')}</button>
            {/if}
          </form>
        </div>
      {/if}
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-2 gap-3 mb-8">
      <div class="card p-4 text-center">
        <div class="font-display text-2xl font-bold text-ink">{stats.totalBooks}</div>
        <div class="text-xs text-ink-muted uppercase tracking-wider mt-1">{t('stats.total_books')}</div>
      </div>
      <div class="card p-4 text-center">
        <div class="font-display text-2xl font-bold text-sage">{stats.totalRead}</div>
        <div class="text-xs text-ink-muted uppercase tracking-wider mt-1">{t('stats.books_read')}</div>
      </div>
      <div class="card p-4 text-center">
        <div class="font-display text-2xl font-bold text-accent">{stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}</div>
        <div class="text-xs text-ink-muted uppercase tracking-wider mt-1">{t('stats.avg_rating')}</div>
      </div>
      <div class="card p-4 text-center">
        <div class="font-display text-2xl font-bold text-warm-600">{stats.totalPages > 0 ? stats.totalPages.toLocaleString() : '—'}</div>
        <div class="text-xs text-ink-muted uppercase tracking-wider mt-1">{t('stats.pages_read')}</div>
      </div>
    </div>

    <!-- Books per month chart -->
    <div class="mb-8">
      <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">{t('stats.books_per_month')}</h2>
      <div class="card p-4">
        <div class="flex items-end gap-1.5 h-28">
          {#each stats.booksPerMonth as item}
            {@const height = item.count > 0 ? Math.max(8, (item.count / maxCount(stats.booksPerMonth)) * 100) : 0}
            <div class="flex-1 flex flex-col items-center gap-1.5">
              <span class="text-xs text-ink-muted font-medium">{item.count || ''}</span>
              <div
                class="w-full rounded-t transition-all duration-500 {item.count > 0 ? 'bg-accent' : 'bg-warm-100'}"
                style="height: {item.count > 0 ? height : 4}%"
              ></div>
              <span class="text-[8px] text-warm-400 whitespace-nowrap">{item.month.split(' ')[0]}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Rating distribution -->
    {#if stats.ratingDistribution.some(c => c > 0)}
      <div class="mb-8">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">{t('stats.rating_distribution')}</h2>
        <div class="card p-4 flex flex-col gap-2.5">
          {#each [5, 4, 3, 2, 1] as star}
            {@const count = stats.ratingDistribution[star - 1]}
            {@const max = Math.max(1, ...stats.ratingDistribution)}
            <div class="flex items-center gap-3">
              <span class="text-xs text-gold w-5 text-right font-medium">{star}★</span>
              <div class="flex-1 h-3 rounded-full bg-warm-100 overflow-hidden">
                <div
                  class="h-full rounded-full bg-gold transition-all duration-500"
                  style="width: {count > 0 ? (count / max) * 100 : 0}%"
                ></div>
              </div>
              <span class="text-xs text-ink-muted w-6 text-right">{count}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Genre breakdown -->
    {#if stats.genreBreakdown.length > 0}
      <div class="mb-8">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">{t('stats.genre_breakdown')}</h2>
        <div class="card p-4 flex flex-col gap-2.5">
          {#each stats.genreBreakdown as genre}
            {@const max = stats.genreBreakdown[0].count}
            <div class="flex items-center gap-3">
              <span class="text-xs text-ink capitalize w-20 truncate font-medium">{genre.name}</span>
              <div class="flex-1 h-3 rounded-full bg-warm-100 overflow-hidden">
                <div
                  class="h-full rounded-full bg-accent transition-all duration-500"
                  style="width: {(genre.count / max) * 100}%"
                ></div>
              </div>
              <span class="text-xs text-ink-muted w-6 text-right">{genre.count}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Top authors -->
    {#if stats.topAuthors.length > 0}
      <div class="mb-8">
        <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">{t('stats.top_authors')}</h2>
        <div class="flex flex-col gap-2">
          {#each stats.topAuthors as author, i}
            <div class="card flex items-center gap-3 p-3">
              <span class="w-6 h-6 rounded-full bg-warm-100 flex items-center justify-center text-xs font-bold text-ink-muted flex-shrink-0">{i + 1}</span>
              <span class="text-sm font-medium text-ink flex-1 truncate">{author.name}</span>
              <span class="text-xs text-ink-muted bg-warm-100 px-2.5 py-0.5 rounded-full">{author.count}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Recommendations -->
    <div class="mb-8">
      <h2 class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">{t('stats.recommendations')}</h2>
      {#if loadingRecs}
        <div class="card p-6 text-center">
          <div class="w-8 h-0.5 bg-warm-300 rounded-full animate-pulse mx-auto mb-2"></div>
          <p class="text-xs text-ink-muted">{t('stats.recommendations.loading')}</p>
        </div>
      {:else if recs.length === 0}
        <p class="text-sm text-ink-muted text-center py-4">{t('stats.recommendations.none')}</p>
      {:else}
        <div class="flex flex-col gap-2.5">
          {#each recs as rec, i}
            <div class="card flex gap-3 p-3 animate-fade-up" style="animation-delay: {i * 40}ms">
              {#if rec.coverUrl}
                <img src={rec.coverUrl} alt={rec.title} class="w-10 h-14 object-cover rounded book-shadow flex-shrink-0" />
              {:else}
                <div class="w-10 h-14 bg-warm-100 rounded flex items-center justify-center text-warm-300 flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                </div>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="font-display text-sm font-semibold text-ink truncate">{rec.title}</div>
                <div class="text-xs text-ink-muted truncate">{rec.authors.join(', ')}</div>
                <div class="text-xs text-warm-400 mt-1">{t('stats.recommendations.based_on', { title: rec.basedOn })}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
