import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

export const sendReportEmail = async (
  to: string,
  pdfBuffer: Buffer,
  brandName: string,
  platform: string,
  reportUrl?: string,
): Promise<void> => {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;">

  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Your reputation score is in. You might be surprised. 👀</div>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f1a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- TOP BADGE -->
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="display:inline-block;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:6px 16px;border-radius:100px;">
            ✦ AI Reputation Intelligence
          </span>
        </td></tr>

        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#4338ca 100%);border-radius:20px 20px 0 0;padding:48px 40px 40px;text-align:center;position:relative;">
          <div style="width:64px;height:64px;background:rgba(255,255,255,0.1);border-radius:16px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:64px;text-align:center;">📊</div>
          <h1 style="color:#ffffff;font-size:30px;margin:0 0 8px;font-weight:800;letter-spacing:-0.8px;line-height:1.2;">Reputation Return</h1>
          <p style="color:rgba(165,180,252,0.9);font-size:14px;margin:0;letter-spacing:0.02em;">Your report is ready — here's what we found</p>
        </td></tr>

        <!-- HERO SCORE BANNER -->
        <tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 40px;text-align:center;">
          <p style="color:rgba(255,255,255,0.7);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">AI Analysis Complete for</p>
          <p style="color:#ffffff;font-size:22px;font-weight:800;margin:0;letter-spacing:-0.3px;">${brandName}</p>
          <p style="color:rgba(199,210,254,0.8);font-size:13px;margin:6px 0 0;">${platform} · ${date}</p>
        </td></tr>

        <!-- MAIN BODY -->
        <tr><td style="background:#ffffff;padding:44px 40px;">

          <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px;">
            Hi there,<br><br>
            Your full AI-powered reputation report for <strong style="color:#111827;">${brandName}</strong> has finished generating. We scanned hundreds of social signals, analysed audience sentiment, benchmarked your competitors, and built you a personalised action plan.
          </p>

          <!-- DOWNLOAD BUTTON -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 40px;">
            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#4F46E5,#7C3AED);border-radius:12px;box-shadow:0 8px 24px rgba(79,70,229,0.4);">
                    <a href="${reportUrl || '#'}" target="_blank" style="display:block;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:18px 48px;letter-spacing:-0.2px;white-space:nowrap;">
                      &nbsp;&nbsp;&#x1F4E5;&nbsp; Download Your Full Report &nbsp;&#x2192;&nbsp;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:10px 0 0;">&#x1F512; Secure link &nbsp;·&nbsp; Expires in 7 days</p>
            </td></tr>
          </table>

          <!-- DIVIDER -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
            <tr>
              <td style="border-top:1px solid #f3f4f6;"></td>
            </tr>
          </table>

          <!-- WHAT'S INSIDE -->
          <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 20px;">What's inside your report</p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${[
              ['📊', 'Reputation Score', 'Your overall score out of 10 based on real social data', '#EEF2FF', '#4338CA'],
              ['🧠', 'Sentiment Analysis', 'Positive, neutral & negative breakdown across platforms', '#F0FDF4', '#15803D'],
              ['📈', '12-Month Trends', 'See how your reputation has moved over the past year', '#FFF7ED', '#C2410C'],
              ['🏆', 'Competitor Benchmarking', 'How you stack up against your top competitors', '#FDF4FF', '#9333EA'],
              ['🗺️', '30/60/90-Day Action Plan', 'Concrete steps to protect and grow your reputation', '#F0F9FF', '#0369A1'],
            ].map(([emoji, title, desc, bg, accent]) => `
            <tr><td style="padding:0 0 12px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};border-radius:10px;border-left:3px solid ${accent};">
                <tr>
                  <td style="width:52px;padding:14px 0 14px 16px;font-size:22px;vertical-align:middle;">${emoji}</td>
                  <td style="padding:14px 16px 14px 8px;vertical-align:middle;">
                    <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${title}</p>
                    <p style="margin:2px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">${desc}</p>
                  </td>
                </tr>
              </table>
            </td></tr>`).join('')}
          </table>

        </td></tr>

        <!-- BOTTOM CTA STRIP -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:32px 40px;text-align:center;">
          <p style="color:#374151;font-size:15px;font-weight:600;margin:0 0 6px;">Want to improve your score?</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;line-height:1.6;">Our team helps businesses fix, protect, and grow their online reputation.</p>
          <table cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              <td align="center" style="background:#111827;border-radius:8px;">
                <a href="https://reputationreturn.com" target="_blank" style="display:block;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;white-space:nowrap;">
                  Visit Reputation Return &nbsp;&#x2192;
                </a>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#0f0f1a;border-radius:0 0 20px 20px;padding:28px 40px;text-align:center;">
          <p style="color:#4b5563;font-size:12px;margin:0 0 8px;line-height:1.7;">
            <strong style="color:#6b7280;">Reputation Return</strong> · AI-Powered Reputation Intelligence<br>
            You received this because you requested a reputation report.
          </p>
          <p style="color:#374151;font-size:11px;margin:0;">© ${new Date().getFullYear()} Reputation Return. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const mailOptions: any = {
    from: `"Reputation Return" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Your ${platform} Reputation Report is Ready — ${brandName} 📊`,
    html,
  };

  if (!reportUrl) {
    mailOptions.attachments = [{
      filename: `${brandName.replace(/[^a-z0-9]/gi, '_')}_reputation_report.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }];
  }

  await transporter.sendMail(mailOptions);
};

// Fire-and-forget wrapper — never blocks the HTTP response
export const sendReportEmailSilent = (
  to: string | undefined,
  pdfBuffer: Buffer,
  brandName: string,
  platform: string
): void => {
  if (!to || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) return;
  sendReportEmail(to, pdfBuffer, brandName, platform).catch(err => {
    console.error('[Email] Failed to send report email:', err.message);
  });
};

// Create/update contact in GHL, add rep-radar-lead tag, and set report_url custom field
export const triggerGHLWorkflow = async (
  email: string,
  name?: string,
  platform?: string,
  reportUrl?: string,
): Promise<void> => {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId || !email) return;

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`,
      { headers }
    );
    const searchText = await searchRes.text();
    const searchData = searchRes.ok ? JSON.parse(searchText) : null;
    const existingId = searchData?.contact?.id;

    if (existingId) {
      const updateBody: any = { tags: ['rep-radar-lead'] };
      if (reportUrl) updateBody.website = reportUrl;
      await fetch(`https://services.leadconnectorhq.com/contacts/${existingId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateBody),
      });
      console.log('[GHL] Existing contact updated:', email);
    } else {
      const body: any = {
        locationId,
        email,
        tags: ['rep-radar-lead'],
        source: 'Repredar',
      };
      if (name) body.name = name;
      if (reportUrl) body.website = reportUrl;

      const createRes = await fetch('https://services.leadconnectorhq.com/contacts/', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!createRes.ok) {
        console.error('[GHL] Create contact failed:', createRes.status, await createRes.text());
      } else {
        console.log('[GHL] New contact created and tagged:', email);
      }
    }
  } catch (err: any) {
    console.error('[GHL] API error:', err.message);
  }
};

// Fire-and-forget GHL trigger
export const triggerGHLWorkflowSilent = (
  email: string | undefined,
  name?: string,
  platform?: string,
  reportUrl?: string,
): void => {
  if (!email) return;
  triggerGHLWorkflow(email, name, platform, reportUrl).catch(() => {});
};

export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<void> => {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset Request',
        html: `
            <h1>Password Reset Request</h1>
            <p>You are receiving this email because you (or someone else) has requested a password reset for your account.</p>
            <p>Please click on the following link and enter the token provided along witht the new password to reset your password:</p>
            <a href="${resetUrl}">${resetUrl}</a>
            <p>TOKEN: ${resetToken}</p>
            <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
            <p>This link will expire in 1 hour.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send password reset email');
    }
}; 