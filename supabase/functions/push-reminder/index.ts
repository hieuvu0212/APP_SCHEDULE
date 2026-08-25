import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import webpush from 'npm:web-push';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // In a real scenario, this would query upcoming events in the next 15 minutes
    // and match them with the user's push subscriptions.
    
    // For demo purposes, we accept a subscription and a message to send immediately.
    if (req.method === 'POST') {
      const { subscription, payload } = await req.json();
      
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Only POST is supported', { status: 405 });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
})
