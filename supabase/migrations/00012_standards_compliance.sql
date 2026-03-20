-- =============================================================
-- Migration 00012: Standards compliance fixes
-- =============================================================

-- CRITICAL-4a: Add outlet access check to get_lending_stats
CREATE OR REPLACE FUNCTION get_lending_stats(p_outlet_id uuid)
RETURNS json AS $$
BEGIN
  -- Verify caller has access to this outlet
  PERFORM check_outlet_access(p_outlet_id);

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

-- CRITICAL-4b: Restrict refresh_all_views to owner only
CREATE OR REPLACE FUNCTION refresh_all_views()
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = auth.uid() AND role = 'owner' AND is_active = true) THEN
    RAISE EXCEPTION 'Access denied: owner role required';
  END IF;
  PERFORM refresh_dashboard_views();
  BEGIN PERFORM refresh_sales_velocity(); EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
