// netlify/functions/gallery-fetch.js
//
// Securely returns a client's wedding photos — but ONLY if the booking ID
// and access code they provide match exactly. This runs on the server using
// the SERVICE ROLE key (never exposed to the browser), so there is no way
// for one client to see another client's photos, even by tampering with
// the website's code.
//
// Required environment variables:
//   SUPABASE_URL              - same project URL used elsewhere
//   SUPABASE_SERVICE_ROLE_KEY - from Supabase: Project Settings -> API -> service_role key
//                                (NOT the anon key — this one is secret)

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const bookingId = (body.bookingId || '').trim().toUpperCase();
  const code = (body.code || '').trim().toUpperCase();

  if (!bookingId || !code) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Booking ID and access code are required' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Verify the booking + code match exactly
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('booking_id, name, gallery_code')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (bookingErr || !booking || !booking.gallery_code || booking.gallery_code.toUpperCase() !== code) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Booking ID or access code is incorrect.' }) };
  }

  // Fetch this client's photos only
  const { data: photos, error: photosErr } = await supabase
    .from('gallery_photos')
    .select('id, file_path, selected')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (photosErr) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not load photos.' }) };
  }

  // Generate a temporary signed URL for each photo (expires in 1 hour)
  const withUrls = await Promise.all((photos || []).map(async (p) => {
    const { data: signed } = await supabase.storage
      .from('client-galleries')
      .createSignedUrl(p.file_path, 3600);
    return { id: p.id, url: signed?.signedUrl || null, selected: p.selected };
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, clientName: booking.name, photos: withUrls })
  };
};
