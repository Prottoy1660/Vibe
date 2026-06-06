export const VIBE_SITE_ORIGIN = 'https://vibeaccessbd.com'
export const RESELLER_SITE_ORIGIN = 'https://superreseller.shop'

export type SpaSiteBrand = {
  title: string
  description: string
  siteName: string
  ogImage: string
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function stripSocialMeta(html: string): string {
  return html
    .replace(/<meta\s+property="og:[^"]+"[^>]*\/?>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]+"[^>]*\/?>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*\/?>\s*/gi, '')
}

function buildSocialMetaBlock(brand: SpaSiteBrand, canonicalUrl: string): string {
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(brand.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(brand.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(brand.description)}" />`,
    `<meta property="og:image" content="${brand.ogImage}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(brand.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(brand.description)}" />`,
    `<meta name="twitter:image" content="${brand.ogImage}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  ].join('\n    ')
}

/**
 * Rewrite index.html meta for social crawlers (WhatsApp, Facebook, etc.) that do not run JS.
 */
export function injectSpaSiteMeta(html: string, host: string, requestPath = '/'): string {
  const brand = brandForHost(host)
  const origin = originForHost(host)
  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  const canonicalUrl = `${origin}${path === '/' && isSuperResellerHost(host) ? '/reseller' : path}`

  let out = stripSocialMeta(html)

  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(brand.title)}</title>`)

  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(brand.description)}" />`,
  )

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

  const socialBlock = buildSocialMetaBlock(brand, canonicalUrl)
  out = out.replace('</head>', `    ${socialBlock}\n  </head>`)

  return out
}
