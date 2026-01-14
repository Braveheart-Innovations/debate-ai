import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const resendApiKey = defineSecret('RESEND_API_KEY');

const TO_EMAIL = 'support@braveheartinnovations.com';
const FROM_EMAIL = 'support@braveheartinnovations.com';

const ALLOWED_ORIGINS = [
  'https://symposiumai.app',
  'https://www.symposiumai.app',
  'http://localhost:3000',
];

interface FeedbackRequest {
  category: 'bug' | 'feature' | 'question' | 'other';
  subject: string;
  message: string;
  email?: string;
  page?: string;
  userAgent?: string;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

const categoryLabels: Record<string, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  question: 'Question',
  other: 'Other Feedback',
};

export const symposiumFeedback = onRequest(
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

    const data = request.body as FeedbackRequest;

    // Validate category
    if (!data.category || !['bug', 'feature', 'question', 'other'].includes(data.category)) {
      response.status(400).json({ error: 'Invalid category' });
      return;
    }

    // Validate subject
    if (!data.subject || typeof data.subject !== 'string' || data.subject.trim().length === 0) {
      response.status(400).json({ error: 'Subject is required' });
      return;
    }

    // Validate message
    if (!data.message || typeof data.message !== 'string' || data.message.trim().length === 0) {
      response.status(400).json({ error: 'Message is required' });
      return;
    }

    // Validate email if provided
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      response.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const clientIP = request.headers['x-forwarded-for'] || request.ip || 'unknown';

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Symposium AI Feedback <${FROM_EMAIL}>`,
          to: TO_EMAIL,
          reply_to: data.email || undefined,
          subject: `[${categoryLabels[data.category]}] ${data.subject}`,
          html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #6366f1; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0;">Symposium AI Feedback</h2>
    <p style="margin: 8px 0 0; opacity: 0.9;">${categoryLabels[data.category]}</p>
  </div>
  <div style="background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
    <p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>
    <p><strong>Category:</strong> ${categoryLabels[data.category]}</p>
    ${data.email ? `<p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></p>` : '<p><strong>Email:</strong> Not provided</p>'}
    ${data.page ? `<p><strong>Page:</strong> ${escapeHtml(data.page)}</p>` : ''}
    <p><strong>Message:</strong></p>
    <div style="background: white; padding: 15px; border-radius: 4px; border: 1px solid #eee; white-space: pre-wrap;">${escapeHtml(data.message)}</div>
    <p style="margin-top: 20px; font-size: 12px; color: #666;">
      IP: ${clientIP}<br>
      ${data.userAgent ? `User Agent: ${escapeHtml(data.userAgent.substring(0, 200))}` : ''}
    </p>
  </div>
</div>`,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        console.error('Resend error:', error);
        response.status(500).json({ error: 'Failed to send feedback' });
        return;
      }

      console.log(`Symposium feedback sent: ${data.category} - ${data.subject}`);
      response.status(200).json({ success: true });
    } catch (error) {
      console.error('Failed to send feedback:', error);
      response.status(500).json({ error: 'Failed to send feedback' });
    }
  }
);
