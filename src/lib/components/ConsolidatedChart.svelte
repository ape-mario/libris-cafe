<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DailyTrendRow } from '$lib/modules/reporting/types';
  import { groupTrendByOutlet, formatRupiah } from '$lib/modules/reporting/consolidated';

  let {
    trendData,
    chartType = 'line',
  }: {
    trendData: DailyTrendRow[];
    chartType?: 'line' | 'bar';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: any = null;

  // Color palette for outlets
  const COLORS = [
    'rgb(107, 142, 35)',   // sage
    'rgb(70, 130, 180)',   // steel blue
    'rgb(218, 165, 32)',   // golden rod
    'rgb(178, 102, 178)',  // plum
    'rgb(205, 92, 92)',    // indian red
    'rgb(60, 179, 113)',   // medium sea green
  ];

  onMount(async () => {
    // Dynamic import to avoid SSR issues
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    renderChart(Chart);
  });

  onDestroy(() => {
    chart?.destroy();
  });

  function renderChart(Chart: any) {
    if (!canvas || !trendData.length) return;

    chart?.destroy();

    const grouped = groupTrendByOutlet(trendData);
    const datasets: any[] = [];
    let colorIndex = 0;

    for (const [, entry] of grouped) {
      datasets.push({
        label: entry.name,
        data: entry.totals,
        borderColor: COLORS[colorIndex % COLORS.length],
        backgroundColor: COLORS[colorIndex % COLORS.length] + '33',
        fill: chartType === 'line',
        tension: 0.3,
      });
      colorIndex++;
    }

    // Get dates from first outlet (they should all be the same)
    const firstEntry = grouped.values().next().value;
    const labels = firstEntry?.dates.map((d: string) =>
      new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    ) ?? [];

    chart = new Chart(canvas, {
      type: chartType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`,
            },
          },
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: any) => formatRupiah(value),
            },
          },
        },
      },
    });
  }

  // Re-render when data changes
  $effect(() => {
    if (trendData && canvas && chart) {
      import('chart.js').then(({ Chart }) => renderChart(Chart));
    }
  });
</script>

<div class="w-full h-64">
  <canvas bind:this={canvas}></canvas>
</div>
