import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  try {
    // Supabase will send the user and email data to this function
    const payload = await req.json();
    const { user, email_data } = payload;

    // Check if the user is a reseller (from user_metadata)
    const isReseller = user.user_metadata?.role === 'reseller';

    // If the user is NOT a reseller (i.e., normal VibeAccess user),
    // we bypass Resend and let Supabase handle it via its default Namecheap SMTP.
    if (!isReseller) {
      // By returning an empty object or not calling Resend, Supabase's native SMTP
      // (Namecheap) will automatically take over and send the default template.
      return new Response(JSON.stringify({ message: 'Bypassed Resend for VibeAccess user. Falling back to native SMTP.' }), { 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // Set the appropriate brand details ONLY for Super Reseller
    const senderEmail = 'noreply@superreseller.shop';
    const brandName = 'Super Reseller';
    const logoUrl = 'https://superreseller.shop/super.png';

    let subject = 'Confirm your email';
    let htmlContent = '';

    // Generate HTML based on the action type (signup, recovery, etc.)
    // Note: In Custom Auth Hooks, we send OTPs (tokens) instead of direct magic links for security.
    if (email_data.email_action_type === 'signup') {
      subject = `Welcome to ${brandName} - Verify Email`;
      htmlContent = `
        <div style="font-family: sans-serif; background: #050505; color: #fff; padding: 40px; text-align: center;">
          <img src="${logoUrl}" width="64" style="border-radius: 12px; margin-bottom: 20px;" />
          <h2>Welcome to ${brandName}!</h2>
          <p style="color: #a1a1aa;">Use the verification code below to verify your email address:</p>
          <div style="font-size: 32px; font-weight: bold; margin: 30px 0; letter-spacing: 4px;">${email_data.token}</div>
        </div>
      `;
    } else if (email_data.email_action_type === 'recovery') {
      subject = `Reset your ${brandName} password`;
      htmlContent = `
        <div style="font-family: sans-serif; background: #050505; color: #fff; padding: 40px; text-align: center;">
          <img src="${logoUrl}" width="64" style="border-radius: 12px; margin-bottom: 20px;" />
          <h2>Reset Password</h2>
          <p style="color: #a1a1aa;">Use the code below to reset your password:</p>
          <div style="font-size: 32px; font-weight: bold; margin: 30px 0; letter-spacing: 4px;">${email_data.token}</div>
        </div>
      `;
    }

    // Send the email via Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `${brandName} <${senderEmail}>`,
        to: [user.email],
        subject: subject,
        html: htmlContent
      })
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), { 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
