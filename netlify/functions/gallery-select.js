// netlify/functions/gallery-select.js
//
// Securely saves which photos a client selected — again, only if their
// booking ID + access code match. Same security model as gallery-fetch.js.

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
  const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];

  if (!bookingId || !code) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Booking ID and access code are required' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('booking_id, gallery_code')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (bookingErr || !booking || !booking.gallery_code || booking.gallery_code.toUpperCase() !== code) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Booking ID or access code is incorrect.' }) };
  }

  // Mark selected photos true, all others for this booking false
  const { data: allPhotos, error: fetchErr } = await supabase
    .from('gallery_photos')
    .select('id')
    .eq('booking_id', bookingId);

  if (fetchErr) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not load photos.' }) };
  }

  const updates = (allPhotos || []).map(p =>
    supabase.from('gallery_photos').update({ selected: selectedIds.includes(p.id) }).eq('id', p.id)
  );
  await Promise.all(updates);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, count: selectedIds.length })
  };
};
