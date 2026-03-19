import type {
  SalesVelocity,
  RestockRecommendation,
  PredictionSummary,
  DemandForecast,
} from './types';
import {
  getSalesVelocity,
  getRestockRecommendations,
  refreshVelocityData,
  computeDemandForecast,
  computeSummary,
} from './engine';

let velocityData = $state<SalesVelocity[]>([]);
let recommendations = $state<RestockRecommendation[]>([]);
let forecasts = $state<DemandForecast[]>([]);
let summary = $state<PredictionSummary | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);

export function getPredictionStore() {
  return {
    get velocityData() { return velocityData; },
    get recommendations() { return recommendations; },
    get forecasts() { return forecasts; },
    get summary() { return summary; },
    get isLoading() { return isLoading; },
    get error() { return error; },

    async refresh(outletId: string, leadTimeDays: number = 7): Promise<void> {
      isLoading = true;
      error = null;
      try {
        // Refresh materialized view first
        await refreshVelocityData();

        // Fetch updated data
        const [vel, recs] = await Promise.all([
          getSalesVelocity(outletId),
          getRestockRecommendations(outletId, leadTimeDays),
        ]);

        velocityData = vel;
        recommendations = recs;
        forecasts = computeDemandForecast(vel);
        summary = computeSummary(vel, recs);
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to load prediction data';
      } finally {
        isLoading = false;
      }
    },
  };
}
