<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser } from '$lib/stores/user.svelte';
  import { getReadingStats, getAvailableYears, type ReadingStats } from '$lib/services/stats';
  import { getGoal, setGoal, getBooksReadThisYear } from '$lib/services/goals';
  import { getRecommendations, type Recommendation } from '$lib/services/recommendations';
  import { q } from '$lib/db';
  import { t } from '$lib/i18n/index.svelte';

  let user = $derived(getCurrentUser());
  let stats = $state<ReadingStats | null>(null);
  let loading = $state(true);

  // Year filter
  const currentYear = new Date().getFullYear();
  let availableYears = $state<number[]>([]);
  let selectedYear = $state<number>(currentYear);
  let isAllTime = $derived(selectedYear === 0);
  let isCurrentYear = $derived(selectedYear === currentYear);

  // Reading goal
  let goalTarget = $state('');
  let goalRead = $state(0);
  let hasGoal = $state(false);
  let editingGoal = $state(false);

  // Recommendations
  let recs = $state<Recommendation[]>([]);
  let loadingRecs = $state(false);

  function loadStats() {
    if (!user) return;
    const year = isAllTime ? undefined : selectedYear;
    stats = getReadingStats(user.id, year);

    // Load goal for selected year
    const goalYear = isAllTime ? currentYear : selectedYear;
    const goal = getGoal(user.id, goalYear);
    if (goal) {
      goalTarget = goal.target.toString();
      hasGoal = true;
    } else {
      goalTarget = '';
      hasGoal = false;
    }
    editingGoal = false;
    goalRead = isAllTime
      ? getBooksReadThisYear(user.id)
      : (stats?.totalRead ?? 0);
  }

  // Custom dropdown
  let dropdownOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  function selectYear(year: number) {
    selectedYear = year;
    dropdownOpen = false;
    loadStats();
  }

  function handleDropdownKeydown(e: KeyboardEvent) {
    if (!dropdownOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        dropdownOpen = true;
      }
      return;
    }
    const items = [0, ...availableYears];
    const idx = items.indexOf(selectedYear);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < items.length - 1) selectYear(items[idx + 1]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) selectYear(items[idx - 1]);
    } else if (e.key === 'Escape') {
      dropdownOpen = false;
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      dropdownOpen = false;
    }
  }

  let unsubStats: (() => void)[] = [];

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    if (user) {
      availableYears = getAvailableYears(user.id);
      // Ensure current year is in the list
      if (!availableYears.includes(currentYear)) {
        availableYears = [currentYear, ...availableYears];
      }
      loadStats();

      // Load recommendations in background (still async - external API)
      loadingRecs = true;
      getRecommendations(6).then(r => {
        recs = r;
        loadingRecs = false;
      }).catch(() => { loadingRecs = false; });

      unsubStats = [q.observe('userBookData', () => loadStats()), q.observe('books', () => loadStats())];
    }
    loading = false;
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', handleClickOutside);
    }
    unsubStats.forEach(f => f());
  });

  function saveGoal() {
    if (!user) return;
    const target = parseInt(goalTarget);
    if (!target || target < 1) return;
    setGoal(user.id, target, isAllTime ? currentYear : selectedYear);
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
  <div class="flex items-end justify-between mb-6">
    <h1 class="font-display text-2xl font-bold text-ink tracking-tight">{t('stats.title')}</h1>
    {#if availableYears.length > 0}
      <div class="relative" bind:this={dropdownRef}>
        <button
          class="year-dropdown-trigger"
          onclick={() => dropdownOpen = !dropdownOpen}
          onkeydown={handleDropdownKeydown}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
        >
          <span class="font-display font-semibold">{isAllTime ? t('stats.year.all') : selectedYear}</span>
          <svg class="year-dropdown-chevron" class:rotate-180={dropdownOpen} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        {#if dropdownOpen}
          <ul class="year-dropdown-menu animate-scale-in" role="listbox">
            <li>
              <button
                class="year-dropdown-item"
                class:year-dropdown-item-active={isAllTime}
                onclick={() => selectYear(0)}
                role="option"
                aria-selected={isAllTime}
              >{t('stats.year.all')}</button>
            </li>
            <li class="year-dropdown-divider"></li>
            {#each availableYears as year}
              <li>
                <button
                  class="year-dropdown-item"
                  class:year-dropdown-item-active={selectedYear === year}
                  onclick={() => selectYear(year)}
                  role="option"
                  aria-selected={selectedYear === year}
                >{year}</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>

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
            {#if isCurrentYear || isAllTime}
              <button class="text-xs text-ink-muted hover:text-accent transition-colors" aria-label={t('stats.goal.edit')} onclick={() => editingGoal = true}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
            {/if}
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
      {:else if !hasGoal && !isCurrentYear && !isAllTime}
        <!-- No goal set for past year — show nothing -->
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

<style>
  .year-dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 9999px;
    border: 1.5px solid var(--color-warm-200);
    background: var(--color-surface);
    color: var(--color-ink);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .year-dropdown-trigger:hover {
    border-color: var(--color-warm-400);
  }
  .year-dropdown-trigger:focus-visible {
    outline: none;
    border-color: var(--color-accent);
  }
  .year-dropdown-chevron {
    color: var(--color-ink-muted);
    transition: transform 0.2s ease;
  }
  .year-dropdown-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.375rem);
    min-width: 9rem;
    padding: 0.375rem;
    border-radius: 0.875rem;
    background: var(--color-surface);
    border: 1px solid var(--color-warm-100);
    box-shadow:
      0 4px 16px rgba(44, 24, 16, 0.1),
      0 1px 3px rgba(44, 24, 16, 0.06);
    z-index: 50;
    list-style: none;
    transform-origin: top right;
  }
  :global(html.dark) .year-dropdown-menu {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.3),
      0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .year-dropdown-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-ink-light);
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
    background: none;
  }
  .year-dropdown-item:hover {
    background: var(--color-warm-100);
    color: var(--color-ink);
  }
  .year-dropdown-item-active {
    background: var(--color-ink);
    color: var(--color-cream);
  }
  .year-dropdown-item-active:hover {
    background: var(--color-ink-light);
    color: var(--color-cream);
  }
  .year-dropdown-divider {
    height: 1px;
    margin: 0.25rem 0.5rem;
    background: var(--color-warm-100);
  }
</style>
