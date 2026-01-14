import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const resendApiKey = defineSecret('RESEND_API_KEY');

const TO_EMAIL = 'support@braveheartinnovations.com';
const FROM_EMAIL = 'support@braveheartinnovations.com';

const ALLOWED_ORIGINS = [
  'https://braveheartinnovations.com',
  'https://www.braveheartinnovations.com',
  'https://braveheart-innovations.web.app',
  'http://localhost:5173',
];

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

export const contactForm = onRequest(
  { secrets: [resendApiKey], cors: ALLOWED_ORIGINS },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const apiKey = resendApiKey.value();
    if (!apiKey) {
      console.error('RESEND_API_KEY not configured');
      response.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const data = request.body as ContactFormData;

    if (!data.name || !data.email || !data.subject || !data.message) {
      response.status(400).json({ error: 'All fields are required' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      response.status(400).json({ error: 'Invalid email address' });
      return;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Braveheart Contact Form <${FROM_EMAIL}>`,
          to: TO_EMAIL,
          reply_to: data.email,
          subject: `[Contact Form] ${data.subject}`,
          html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #00CED1; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0;">New Contact Form Submission</h2>
  </div>
  <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
    <p><strong>Name:</strong> ${escapeHtml(data.name)}</p>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></p>
    <p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>
    <p><strong>Message:</strong></p>
    <div style="background: white; padding: 15px; border-radius: 4px; border: 1px solid #eee; white-space: pre-wrap;">${escapeHtml(data.message)}</div>
  </div>
</div>`,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        console.error('Resend error:', error);
        response.status(500).json({ error: 'Failed to send email' });
        return;
      }

      response.status(200).json({ success: true });
    } catch (error) {
      console.error('Failed to send email:', error);
      response.status(500).json({ error: 'Failed to send email' });
    }
  }
);
