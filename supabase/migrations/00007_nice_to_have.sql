-- Schedule materialized view refreshes using pg_cron (if available)
-- Note: pg_cron must be enabled in Supabase dashboard (Database > Extensions)
DO $$
BEGIN
  -- Try to use pg_cron if available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Refresh dashboard views every 5 minutes
    PERFORM cron.schedule(
      'refresh-dashboard-views',
      '*/5 * * * *',
      $$SELECT refresh_dashboard_views()$$
    );
    -- Refresh sales velocity every hour
    PERFORM cron.schedule(
      'refresh-sales-velocity',
      '0 * * * *',
      $$SELECT refresh_sales_velocity()$$
    );
  END IF;
END $$;

-- Fallback: manual refresh function that can be called from app
CREATE OR REPLACE FUNCTION refresh_all_views()
RETURNS void AS $$
BEGIN
  PERFORM refresh_dashboard_views();
  BEGIN
    PERFORM refresh_sales_velocity();
  EXCEPTION WHEN OTHERS THEN
    -- sales velocity view may not exist yet
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lending stats in single query
CREATE OR REPLACE FUNCTION get_lending_stats(p_outlet_id uuid)
RETURNS json AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'active_count', COUNT(*) FILTER (WHERE rs.status = 'active'),
      'overdue_count', COUNT(*) FILTER (WHERE rs.status = 'active' AND rs.expected_return_at < now()),
      'today_checkin', COUNT(*) FILTER (WHERE DATE(rs.checked_in_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE),
      'today_checkout', COUNT(*) FILTER (WHERE rs.status = 'returned' AND DATE(rs.checked_out_at AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE),
      'avg_duration_minutes', ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(rs.checked_out_at, now()) - rs.checked_in_at)) / 60) FILTER (WHERE rs.status = 'returned'), 0)
    )
    FROM reading_session rs
    JOIN inventory i ON i.id = rs.inventory_id
    WHERE i.outlet_id = p_outlet_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
