import type { IncomingHttpHeaders } from 'node:http'

export const VIBE_SITE_ORIGIN = 'https://vibeaccessbd.com'
export const RESELLER_SITE_ORIGIN = 'https://superreseller.shop'

export type SpaSiteBrand = {
  title: string
  description: string
  siteName: string
  ogImage: string
  ogImageWidth: number
  ogImageHeight: number
  ogImageType: string
  favicon16: string
  favicon32: string
  favicon: string
  faviconType: string
  appleTouchIcon: string
  themeColor: string
}

export const VIBE_BRAND: SpaSiteBrand = {
  title: 'Vibe Access - Digital Marketplace',
  description: 'Premium digital accounts management platform',
  siteName: 'Vibe Access',
  ogImage: `${VIBE_SITE_ORIGIN}/apple-touch-icon.png`,
  ogImageWidth: 180,
  ogImageHeight: 180,
  ogImageType: 'image/png',
  favicon16: '/favicon-16.png',
  favicon32: '/favicon-32.png',
  favicon: '/favicon.png',
  faviconType: 'image/png',
  appleTouchIcon: '/apple-touch-icon.png',
  themeColor: '#09090b',
}

export const RESELLER_BRAND: SpaSiteBrand = {
  title: 'Super Reseller - Premium Dashboard',
  description: 'Premium reseller dashboard for managing digital subscriptions',
  siteName: 'Super Reseller',
  ogImage: `${RESELLER_SITE_ORIGIN}/super.png`,
  ogImageWidth: 512,
  ogImageHeight: 512,
  ogImageType: 'image/png',
  favicon16: '/super-favicon.svg',
  favicon32: '/super-favicon.svg',
  favicon: '/super-favicon.svg',
  faviconType: 'image/svg+xml',
  appleTouchIcon: '/super.png',
  themeColor: '#09090b',
}

export function isSuperResellerHost(host: string): boolean {
  const h = (host || '').toLowerCase().split(':')[0]
  return h === 'superreseller.shop' || h === 'www.superreseller.shop' || h.includes('superreseller')
}

export function brandForHost(host: string): SpaSiteBrand {
  return isSuperResellerHost(host) ? RESELLER_BRAND : VIBE_BRAND
}

export function originForHost(host: string): string {
  return isSuperResellerHost(host) ? RESELLER_SITE_ORIGIN : VIBE_SITE_ORIGIN
}

/** Resolve the public hostname behind reverse proxies (Coolify, Cloudflare, etc.). */
export function resolveRequestHost(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>,
): string {
  const pick = (value: string | string[] | undefined): string => {
    if (!value) return ''
    const raw = Array.isArray(value) ? value[0] : String(value).split(',')[0]
    return raw.trim().toLowerCase()
  }

  const forwardedHost = pick(headers['x-forwarded-host'])
  if (forwardedHost) return forwardedHost

  const originalHost = pick(headers['x-original-host'])
  if (originalHost) return originalHost

  return pick(headers['host'])
}

export function brandForHostAndPath(host: string, requestPath = '/'): SpaSiteBrand {
  const base = brandForHost(host)
  const pathOnly = (requestPath.split('?')[0] || '/').replace(/\/+$/, '') || '/'

  if (!isSuperResellerHost(host)) {
    return base
  }

  if (pathOnly.startsWith('/reseller/search')) {
    return {
      ...base,
      title: 'Check Subscription Status | Super Reseller',
      description: 'Look up Adobe subscription status by email on the Super Reseller panel.',
    }
  }

  if (pathOnly === '/reseller/login' || pathOnly === '/reseller/signup') {
    return {
      ...base,
      title: 'Super Reseller — Reseller Login',
      description: 'Sign in to the Super Reseller dashboard to manage subscriptions and customers.',
    }
  }

  return base
}

export function canonicalUrlForRequest(host: string, requestPath = '/'): string {
  const origin = originForHost(host)
  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  const pathOnly = path.split('?')[0] || '/'

  if (pathOnly === '/' && isSuperResellerHost(host)) {
    return `${origin}/reseller`
  }

  return `${origin}${pathOnly}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function stripSocialMeta(html: string): string {
  return html
    .replace(/<meta[^>]*property=["']og:[^"']*["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]*name=["']twitter:[^"']*["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]*name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]*name=["']application-name["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]*name=["']apple-mobile-web-app-title["'][^>]*>\s*/gi, '')
    .replace(/<link[^>]*rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*data-site-brand[^>]*>[\s\S]*?<\/script>\s*/gi, '')
}

function buildSocialMetaBlock(brand: SpaSiteBrand, canonicalUrl: string, siteOrigin: string): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand.siteName,
    url: siteOrigin,
    description: brand.description,
  }

  return [
    `<meta name="description" content="${escapeHtml(brand.description)}" />`,
    `<meta name="application-name" content="${escapeHtml(brand.siteName)}" />`,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(brand.siteName)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:site_name" content="${escapeHtml(brand.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(brand.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(brand.description)}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${brand.ogImage}" />`,
    `<meta property="og:image:secure_url" content="${brand.ogImage}" />`,
    `<meta property="og:image:type" content="${brand.ogImageType}" />`,
    `<meta property="og:image:width" content="${brand.ogImageWidth}" />`,
    `<meta property="og:image:height" content="${brand.ogImageHeight}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(brand.siteName)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(brand.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(brand.description)}" />`,
    `<meta name="twitter:image" content="${brand.ogImage}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(brand.siteName)}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<script type="application/ld+json" data-site-brand="1">${JSON.stringify(jsonLd)}</script>`,
  ].join('\n    ')
}

/**
 * Rewrite index.html meta for social crawlers (WhatsApp, Facebook, Telegram, iMessage, Slack, etc.)
 * that fetch HTML without running JavaScript.
 */
export function injectSpaSiteMeta(html: string, host: string, requestPath = '/'): string {
  const brand = brandForHostAndPath(host, requestPath)
  const origin = originForHost(host)
  const canonicalUrl = canonicalUrlForRequest(host, requestPath)

  let out = stripSocialMeta(html)

  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(brand.title)}</title>`)

  out = out.replace(
    /<meta\s+name="theme-color"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="theme-color" content="${brand.themeColor}" />`,
  )

  out = out.replace(
    /<link\s+rel="icon"\s+type="[^"]*"\s+sizes="32x32"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="icon" type="${brand.faviconType}" sizes="32x32" href="${brand.favicon32}" />`,
  )
  out = out.replace(
    /<link\s+rel="icon"\s+type="[^"]*"\s+sizes="16x16"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="icon" type="${brand.faviconType}" sizes="16x16" href="${brand.favicon16}" />`,
  )
  out = out.replace(
    /<link\s+rel="icon"\s+type="[^"]*"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="icon" type="${brand.faviconType}" href="${brand.favicon}" />`,
  )
  out = out.replace(
    /<link\s+rel="apple-touch-icon"\s+sizes="180x180"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="apple-touch-icon" sizes="180x180" href="${brand.appleTouchIcon}" />`,
  )

  const socialBlock = buildSocialMetaBlock(brand, canonicalUrl, origin)
  out = out.replace('</head>', `    ${socialBlock}\n  </head>`)

  return out
}

/** Pre-render branded index.html variants at build time (fallback when runtime injection misses). */
export function buildBrandedSpaIndexVariants(rawIndexHtml: string): {
  vibe: string
  superReseller: string
} {
  return {
    vibe: injectSpaSiteMeta(rawIndexHtml, 'vibeaccessbd.com', '/'),
    superReseller: injectSpaSiteMeta(rawIndexHtml, 'superreseller.shop', '/reseller'),
  }
}
