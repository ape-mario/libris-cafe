import type { ReportConfig, ExportProgress } from './types';
import { exportReport } from './service';

let progress = $state<ExportProgress>({ status: 'idle', progress: 0 });

export function getReportsStore() {
  return {
    get progress() { return progress; },

    async export(config: ReportConfig, lang: 'en' | 'id' = 'en'): Promise<void> {
      progress = { status: 'fetching', progress: 20 };
      try {
        progress = { status: 'generating', progress: 50 };
        await exportReport(config, lang);
        progress = { status: 'downloading', progress: 80 };
        // Small delay so user sees the "downloading" state
        await new Promise(r => setTimeout(r, 300));
        progress = { status: 'done', progress: 100 };
      } catch (e) {
        progress = {
          status: 'error',
          progress: 0,
          error: e instanceof Error ? e.message : 'Export failed',
        };
      }
    },

    reset() {
      progress = { status: 'idle', progress: 0 };
    },
  };
}
