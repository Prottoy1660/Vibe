/**
 * Regenerate supabase/reseller-email-templates/*.html (light inbox-friendly layout).
 * Run: node scripts/generate-reseller-email-templates.mjs
 */
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildResellerEmailHtml } from '../api/lib/resellerEmailLayout.ts';

const SITE = '{{ .SiteURL }}';
const URL = '{{ .ConfirmationURL }}';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'reseller-email-templates');

const templates = [
  {
    file: 'confirm-signup.html',
    pageTitle: 'Verify your email',
    title: 'Verify your email',
    body: 'Welcome to Super Reseller! Tap the button below to confirm your email address and activate your account.',
    ctaLabel: 'Verify email address',
    footerNote: "If you didn't create a Super Reseller account, you can safely ignore this email.",
    expiryNote: 'This link expires in 24 hours.',
  },
  {
    file: 'reset-password.html',
    pageTitle: 'Reset password',
    title: 'Reset your password',
    body: 'We received a request to reset the password for your Super Reseller account. Tap the button below to choose a new password.',
    ctaLabel: 'Reset password',
    footerNote: "If you didn't request this, ignore this email — your password won't change.",
    expiryNote: 'This link expires in 1 hour for security.',
  },
  {
    file: 'magic-link.html',
    pageTitle: 'Log in to Super Reseller',
    title: 'Sign in to your account',
    body: 'Tap the button below to securely sign in to your Super Reseller account. No password required.',
    ctaLabel: 'Sign in now',
    footerNote: "If you didn't request this link, you can safely ignore this email.",
    expiryNote: 'This link expires in 24 hours.',
  },
  {
    file: 'invite-user.html',
    pageTitle: 'Invitation',
    title: "You're invited",
    body: 'You have been invited to join Super Reseller. Tap the button below to accept and set up your account.',
    ctaLabel: 'Accept invitation',
    footerNote: "If you weren't expecting this invitation, you can ignore this email.",
    expiryNote: 'This invitation link expires in 7 days.',
  },
  {
    file: 'confirm-email-change.html',
    pageTitle: 'Confirm email change',
    title: 'Confirm email change',
    body: 'We received a request to change the email address on your Super Reseller account. Confirm below to continue.',
    ctaLabel: 'Confirm new email',
    footerNote: "If you didn't request this change, contact support immediately.",
    expiryNote: 'This link expires in 24 hours.',
  },
  {
    file: 'confirm-reauthentication.html',
    pageTitle: 'Verify your identity',
    title: 'Verify your identity',
    body: 'We noticed a sensitive action on your Super Reseller account. Tap the button below to verify it is you.',
    ctaLabel: 'Verify identity',
    footerNote: "If this wasn't you, secure your account and contact support.",
    expiryNote: 'This link expires in 15 minutes.',
  },
];

for (const t of templates) {
  const html = buildResellerEmailHtml(
    {
      pageTitle: t.pageTitle,
      title: t.title,
      body: t.body,
      ctaLabel: t.ctaLabel,
      ctaHref: URL,
      footerNote: t.footerNote,
      expiryNote: t.expiryNote,
    },
    SITE,
  );
  writeFileSync(path.join(dir, t.file), html, 'utf8');
  console.log('wrote', t.file);
}
