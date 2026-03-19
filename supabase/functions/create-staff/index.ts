import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser, unauthorizedResponse } from '../_shared/auth.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify authenticated caller
  const caller = await getAuthenticatedUser(req);
  if (!caller) return unauthorizedResponse(corsHeaders);

  // Verify caller is owner
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: callerStaff } = await adminClient
    .from('staff')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (!callerStaff || callerStaff.role !== 'owner') {
    return new Response(
      JSON.stringify({ error: 'Only owners can create staff accounts' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { name, email, pin, role, outlet_id } = await req.json();

    // Validate required fields
    if (!name || !email || !pin || !role || !outlet_id) {
      return new Response(
        JSON.stringify({ error: 'name, email, pin, role, and outlet_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate PIN minimum length
    if (!pin || pin.length < 6) {
      return new Response(
        JSON.stringify({ error: 'PIN must be at least 6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate PIN format (6+ digits)
    if (!/^\d{6,}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: 'PIN must contain only digits (minimum 6)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // MED-7: Rate limit staff creation (max 50 per outlet)
    const { count } = await adminClient
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('outlet_id', outlet_id);

    if (count && count >= 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum staff limit reached (50 per outlet)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate role
    if (!['staff', 'owner'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Role must be staff or owner' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase Auth user with service_role key
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: authError?.message ?? 'Failed to create auth user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert staff record with the auth user's UUID
    const { data: staff, error: staffError } = await adminClient
      .from('staff')
      .insert({
        id: authData.user.id,
        name,
        email,
        role,
        outlet_id,
        is_active: true,
      })
      .select('id, name, email, role, outlet_id, is_active, created_at')
      .single();

    if (staffError) {
      // Cleanup: delete the auth user if staff insert fails
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: staffError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ staff }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('create-staff error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
