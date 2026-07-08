// netlify/functions/notify-booking.js
//
// Sends booking confirmations via Email (Resend), SMS (Twilio) and
// WhatsApp (Twilio) when the booking form on the website is submitted.
//
// Required environment variables (set these in Netlify, NOT in this file):
//   RESEND_API_KEY          - from resend.com
//   FROM_EMAIL              - e.g. "Vision Mixing Centre <booking@yourdomain.com>"
//                              (must be a domain you've verified in Resend)
//   ADMIN_EMAIL              - where the studio gets notified, e.g. muneer@yourdomain.com
//   TWILIO_ACCOUNT_SID       - from twilio.com console
//   TWILIO_AUTH_TOKEN        - from twilio.com console
//   TWILIO_SMS_NUMBER        - your Twilio phone number, e.g. +1415XXXXXXX
//   TWILIO_WHATSAPP_NUMBER   - "whatsapp:+14155238886" (Twilio sandbox) or your
//                              approved WhatsApp Business sender once you have one
//   ADMIN_PHONE              - studio's own phone number to receive SMS alerts, e.g. +91XXXXXXXXXX
//
// How the front end calls this:
//   fetch('/.netlify/functions/notify-booking', {
//     method: 'POST',
//     headers: {'Content-Type':'application/json'},
//     body: JSON.stringify({ name, phone, whatsapp, email, service, date, venue, budget, advance, bookingId })
//   })

const twilio = require('twilio');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    name, phone, whatsapp, email, service, date, venue, budget, advance, bookingId
  } = data;

  if (!name || !email || !phone || !service || !date) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required booking fields' }) };
  }

  const results = { email: null, sms: null, whatsapp: null };

  // ---------- EMAIL (Resend) ----------
  if (process.env.RESEND_API_KEY) {
    try {
      const customerEmailBody = `
        <div style="font-family:sans-serif; color:#222;">
          <h2 style="color:#B8912E;">Booking Received — ${bookingId}</h2>
          <p>Hi ${name},</p>
          <p>Thanks for booking with Vision Mixing Centre. Here's what we've noted:</p>
          <ul>
            <li><b>Service:</b> ${service}</li>
            <li><b>Date:</b> ${date}</li>
            <li><b>Venue:</b> ${venue || 'Not specified'}</li>
            <li><b>Budget:</b> ${budget ? '₹' + budget : 'Not specified'}</li>
            <li><b>Advance:</b> ${advance ? '₹' + advance : 'Not specified'}</li>
          </ul>
          <p>Status: <b>Pending confirmation</b>. Our team will contact you within 24 hours.</p>
          <p>— Vision Mixing Centre, Nowshera, Srinagar</p>
        </div>`;

      const adminEmailBody = `
        <div style="font-family:sans-serif; color:#222;">
          <h2>New Booking Request — ${bookingId}</h2>
          <ul>
            <li><b>Name:</b> ${name}</li>
            <li><b>Phone:</b> ${phone}</li>
            <li><b>WhatsApp:</b> ${whatsapp || '—'}</li>
            <li><b>Email:</b> ${email}</li>
            <li><b>Service:</b> ${service}</li>
            <li><b>Date:</b> ${date}</li>
            <li><b>Venue:</b> ${venue || '—'}</li>
            <li><b>Budget:</b> ${budget ? '₹' + budget : '—'}</li>
            <li><b>Advance:</b> ${advance ? '₹' + advance : '—'}</li>
          </ul>
        </div>`;

      // Send to customer
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL,
          to: email,
          subject: `Your booking with Vision Mixing Centre — ${bookingId}`,
          html: customerEmailBody
        })
      });

      // Notify admin
      if (process.env.ADMIN_EMAIL) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.FROM_EMAIL,
            to: process.env.ADMIN_EMAIL,
            subject: `New booking — ${name} (${bookingId})`,
            html: adminEmailBody
          })
        });
      }

      results.email = 'sent';
    } catch (err) {
      results.email = 'failed: ' + err.message;
    }
  } else {
    results.email = 'skipped: RESEND_API_KEY not set';
  }

  // ---------- SMS + WhatsApp (Twilio) ----------
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const smsText = `VMC Booking ${bookingId}: ${service} on ${date}. Status: Pending. We'll confirm within 24 hrs.`;

    // SMS to customer
    try {
      if (process.env.TWILIO_SMS_NUMBER) {
        await client.messages.create({
          body: smsText,
          from: process.env.TWILIO_SMS_NUMBER,
          to: phone
        });
        results.sms = 'sent';
      } else {
        results.sms = 'skipped: TWILIO_SMS_NUMBER not set';
      }
    } catch (err) {
      results.sms = 'failed: ' + err.message;
    }

    // SMS alert to admin/studio phone
    try {
      if (process.env.TWILIO_SMS_NUMBER && process.env.ADMIN_PHONE) {
        await client.messages.create({
          body: `New booking from ${name} (${phone}) — ${service} on ${date}. ID: ${bookingId}`,
          from: process.env.TWILIO_SMS_NUMBER,
          to: process.env.ADMIN_PHONE
        });
      }
    } catch (err) {
      console.error('Admin SMS alert failed:', err.message);
    }

    // WhatsApp to customer (only if they gave a WhatsApp number)
    try {
      if (whatsapp && process.env.TWILIO_WHATSAPP_NUMBER) {
        await client.messages.create({
          body: smsText,
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          to: `whatsapp:${whatsapp}`
        });
        results.whatsapp = 'sent';
      } else {
        results.whatsapp = 'skipped: no whatsapp number provided or TWILIO_WHATSAPP_NUMBER not set';
      }
    } catch (err) {
      results.whatsapp = 'failed: ' + err.message;
    }
  } else {
    results.sms = 'skipped: Twilio credentials not set';
    results.whatsapp = 'skipped: Twilio credentials not set';
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, bookingId, results })
  };
};
