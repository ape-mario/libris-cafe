<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType } from 'chart.js';
  import type { SalesTrendPoint } from '$lib/modules/dashboard/types';

  interface Props {
    data: SalesTrendPoint[];
  }

  let { data }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: ChartType | null = null;
  let ChartCtor: typeof ChartType | null = null;

  function buildChart() {
    if (chart) chart.destroy();
    if (!canvas || !ChartCtor || data.length === 0) return;

    const labels = data.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    });

    chart = new ChartCtor(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Penjualan',
          data: data.map(d => d.total_sales),
          borderColor: '#d4763c',
          backgroundColor: 'rgba(212, 118, 60, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#d4763c',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Rp ${ctx.parsed.y.toLocaleString('id-ID')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10, family: 'Source Sans 3' },
              color: '#8a857e',
            },
          },
          y: {
            grid: { color: '#f0ebe4' },
            ticks: {
              font: { size: 10, family: 'Source Sans 3' },
              color: '#8a857e',
              callback: (val) => `Rp ${(Number(val) / 1000).toFixed(0)}k`,
            },
          },
        },
      },
    });
  }

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    ChartCtor = Chart;
    buildChart();
  });

  $effect(() => {
    // Rebuild chart when data changes
    if (data) buildChart();
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<div class="bg-surface rounded-xl border border-warm-100 p-4">
  <div style="height: 200px;">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>
