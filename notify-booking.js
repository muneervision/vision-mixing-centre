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
      const GOLD = '#D4AF37';
      const DARK = '#0D0D0D';
      const CREAM = '#FBF8F1';

      const row = (label, value) => `
        <tr>
          <td style="padding:10px 0; border-bottom:1px solid #eee; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#888; width:130px; vertical-align:top;">${label}</td>
          <td style="padding:10px 0; border-bottom:1px solid #eee; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#222; font-weight:bold; vertical-align:top;">${value || '—'}</td>
        </tr>`;

      const emailShell = (innerContent) => `
      <div style="background:#f2f2f2; padding:32px 12px; font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:4px; overflow:hidden;">
          <tr>
            <td style="background:${DARK}; padding:32px 36px 26px;">
              <div style="font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:24px; color:#ffffff; letter-spacing:0.5px;">Vision Mixing Centre</div>
              <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:2px; color:${GOLD}; margin-top:6px; text-transform:uppercase;">Wedding Photography &amp; Cinematic Films</div>
            </td>
          </tr>
          <tr><td style="height:4px; background:${GOLD}; font-size:0; line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:34px 36px;">
              ${innerContent}
            </td>
          </tr>
          <tr>
            <td style="background:${DARK}; padding:20px 36px; text-align:center;">
              <div style="font-family:Georgia,'Times New Roman',serif; font-style:italic; color:${GOLD}; font-size:13px;">Capturing memories that outlive the moment.</div>
              <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#888; margin-top:8px;">Nowshera, Srinagar, Jammu &amp; Kashmir, India &nbsp;·&nbsp; +91 77808 63589</div>
            </td>
          </tr>
        </table>
      </div>`;

      const customerInner = `
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:1.5px; color:${GOLD}; text-transform:uppercase; margin-bottom:6px;">Booking Received</div>
        <div style="font-family:Georgia,'Times New Roman',serif; font-size:22px; color:#111; margin-bottom:4px;">Thank you, ${name.split(' ')[0]}.</div>
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#666; margin-bottom:22px;">Your story is in good hands — here's what we've noted.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
          ${row('Booking ID', bookingId)}
          ${row('Service', service)}
          ${row('Date', date)}
          ${row('Venue', venue)}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}; border:1px solid ${GOLD}; border-radius:4px;">
          <tr>
            <td style="padding:18px 20px;">
              <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:1.5px; color:#8a6d1f; text-transform:uppercase; margin-bottom:10px; font-weight:bold;">Budget &amp; Advance</div>
              <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#333; line-height:1.9;">
                Total Budget: <b>${budget ? '₹' + Number(budget).toLocaleString('en-IN') : 'Not specified'}</b><br>
                Advance to Pay: <b>${advance ? '₹' + Number(advance).toLocaleString('en-IN') : 'Not specified'}</b><br>
                UPI: <b style="color:#8a6d1f;">7780863589@yapl</b>
              </div>
            </td>
          </tr>
        </table>
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#888; font-style:italic; margin-top:22px;">
          Status: <b style="color:#8a6d1f;">Pending confirmation</b> — our team will reach out within 24 hours to finalize details.
        </div>`;

      const adminInner = `
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:1.5px; color:${GOLD}; text-transform:uppercase; margin-bottom:6px;">New Booking Alert</div>
        <div style="font-family:Georgia,'Times New Roman',serif; font-size:22px; color:#111; margin-bottom:22px;">${name}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Booking ID', bookingId)}
          ${row('Phone', phone)}
          ${row('WhatsApp', whatsapp)}
          ${row('Email', email)}
          ${row('Service', service)}
          ${row('Date', date)}
          ${row('Venue', venue)}
          ${row('Budget', budget ? '₹' + Number(budget).toLocaleString('en-IN') : null)}
          ${row('Advance', advance ? '₹' + Number(advance).toLocaleString('en-IN') : null)}
        </table>`;

      const customerEmailBody = emailShell(customerInner);
      const adminEmailBody = emailShell(adminInner);

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
      // don't fail the whole request if just the admin alert fails
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
