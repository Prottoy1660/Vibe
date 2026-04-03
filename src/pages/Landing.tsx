import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getStoredLanguage } from '../lib/language'
import { Sparkles, ArrowRight, CheckCircle2, ShieldCheck, Zap } from 'lucide-react'

type LandingContent = {
  enabled?: boolean
  heroTitle?: string
  heroSubtitle?: string
  heroBadge?: string
  pricingTitle?: string
  pricingSubtitle?: string
  whyTitle?: string
  whyItems?: Array<{ title: string; text: string }>
  testimonialsTitle?: string
  testimonials?: Array<{ name: string; role: string; rating: number; text: string }>
  footerText?: string
}

type Product = {
  id: string
  title: string
  title_bn?: string | null
  price: number
  duration: string
  description: string
  is_active: boolean
  is_personal?: boolean
}

const DEFAULT_CONTENT: Required<LandingContent> = {
  enabled: true,
  heroTitle: 'Boost Your Workflow With',
  heroSubtitle: 'Adobe Creative Cloud',
  heroBadge: 'Secure Access • Fast Delivery',
  pricingTitle: 'Clear and Straightforward Pricing',
  pricingSubtitle: 'Choose a plan that fits your workflow. Toggle plans anytime from the admin system.',
  whyTitle: 'Why Choose VibeAccess',
  whyItems: [
    { title: 'Instant Provisioning', text: 'Get access as soon as your order is processed.' },
    { title: 'Shared Team Friendly', text: 'Pooled logins for team plans with strict safety rules.' },
    { title: 'Admin Controlled', text: 'All landing text and pricing visuals are editable from the admin panel.' },
  ],
  testimonialsTitle: 'What Clients Say',
  testimonials: [
    { name: 'Team Admin', role: 'Operations', rating: 5, text: 'Clean UI and fast access. Admin controls are easy.' },
    { name: 'Creative Lead', role: 'Design', rating: 5, text: 'Shared account works smoothly with clear warnings.' },
    { name: 'Project Owner', role: 'Management', rating: 5, text: 'Pricing is transparent and renewals are consistent.' },
  ],
  footerText: '© VibeAccess — All rights reserved.',
}

function currency(amount: number) {
  // App uses BDT for products. Keep it simple.
  try {
    return new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT' }).format(amount)
  } catch {
    return `৳${amount.toFixed(2)}`
  }
}

export const Landing = () => {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [content, setContent] = useState<LandingContent>(DEFAULT_CONTENT)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const lang = getStoredLanguage() || 'en'

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: contentRow }, { data: productRows }] = await Promise.all([
          supabase.from('system_settings').select('value').eq('key', 'landing_page_content').maybeSingle(),
          supabase.from('products').select('id,title,title_bn,price,duration,description,is_active,is_personal').eq('is_active', true),
        ])

        const parsed = (contentRow?.value || {}) as LandingContent
        setContent({ ...DEFAULT_CONTENT, ...parsed })

        setProducts(((productRows || []) as Product[]).filter((p) => !(p as any).is_personal))
      } catch (e) {
        console.error('Landing load error:', e)
        setContent(DEFAULT_CONTENT)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const onBuy = (productId: string) => {
    // If user isn't logged in yet, send to login and let them continue.
    // (We can add redirect-after-login later if you want.)
    if (authLoading) return
    if (!user) {
      navigate('/login')
      return
    }
    navigate(`/checkout/${productId}`)
  }

  const whyIcon = useMemo(() => {
    return [<Zap key="a" />, <ShieldCheck key="b" />, <Sparkles key="c" />]
  }, [])

  const enabled = content.enabled ?? true

  if (!enabled && !loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] text-white flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold">Landing page is disabled by admin.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.25),transparent_60%),radial-gradient(circle_at_20%_30%,rgba(34,197,94,0.18),transparent_55%)]" />

      <div className="relative px-4 sm:px-8 lg:px-12 py-10 max-w-6xl mx-auto">
        {/* Hero */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-xs text-white/80">
              <Sparkles className="w-4 h-4 text-indigo-300" />
              <span>{content.heroBadge || DEFAULT_CONTENT.heroBadge}</span>
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
              {content.heroTitle || DEFAULT_CONTENT.heroTitle}
            </h1>
            <p className="mt-3 text-white/70 text-base sm:text-lg">
              {content.heroSubtitle || DEFAULT_CONTENT.heroSubtitle}
            </p>

            <p className="mt-6 text-sm sm:text-base text-white/75">
              {content.pricingSubtitle || DEFAULT_CONTENT.pricingSubtitle}
            </p>
          </div>

          <div className="w-full lg:max-w-md">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <p className="text-sm text-white/70">Selected plans</p>
              <div className="mt-3 space-y-2">
                {products.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 border border-white/10 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {lang === 'bn' && p.title_bn ? p.title_bn : p.title}
                      </p>
                      <p className="text-xs text-white/60 truncate">{p.duration}</p>
                    </div>
                    <div className="text-sm font-bold text-emerald-200 whitespace-nowrap">
                      {currency(Number(p.price))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const first = products[0]?.id
                    if (!first) return
                    onBuy(first)
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-400 text-gray-900 font-extrabold py-3 px-4 hover:opacity-95 transition"
                >
                  Get started
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-12">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">{content.pricingTitle || DEFAULT_CONTENT.pricingTitle}</h2>
            <p className="mt-2 text-white/70 max-w-2xl mx-auto">{content.pricingSubtitle || DEFAULT_CONTENT.pricingSubtitle}</p>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p, idx) => {
              const theme =
                idx % 3 === 0 ? 'from-indigo-500/30 to-emerald-400/20' :
                idx % 3 === 1 ? 'from-emerald-400/30 to-cyan-400/20' :
                'from-violet-500/30 to-pink-400/20'

              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden"
                >
                  <div className={`px-5 py-4 bg-gradient-to-r ${theme} border-b border-white/10`}>
                    <div className="text-sm font-semibold text-white/80">
                      Plan
                    </div>
                    <div className="mt-1 text-lg font-extrabold">
                      {lang === 'bn' && p.title_bn ? p.title_bn : p.title}
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-200">
                      {currency(Number(p.price))}
                    </div>
                    <div className="text-xs text-white/60 mt-1">{p.duration}</div>
                  </div>

                  <div className="px-5 py-4">
                    <p className="text-sm text-white/75 leading-relaxed min-h-[3.5rem]">
                      {p.description || ''}
                    </p>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        Strict shared-slot rules
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        Renewable by admin (Option A)
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/80">
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        Burned email inventory cleanup
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onBuy(p.id)}
                      className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-gray-900 font-extrabold py-3 hover:opacity-95 transition"
                    >
                      Choose plan
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Why Choose */}
        <div className="mt-12">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">{content.whyTitle || DEFAULT_CONTENT.whyTitle}</h2>
          </div>

          <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(content.whyItems || DEFAULT_CONTENT.whyItems).map((it, i) => (
              <div key={it.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-indigo-300">{whyIcon[i] || <Sparkles className="w-5 h-5" />}</div>
                <p className="mt-3 font-bold">{it.title}</p>
                <p className="mt-2 text-white/70 text-sm leading-relaxed">{it.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="mt-12">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">{content.testimonialsTitle || DEFAULT_CONTENT.testimonialsTitle}</h2>
          </div>
          <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(content.testimonials || DEFAULT_CONTENT.testimonials).map((t) => (
              <div key={t.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-emerald-200 font-bold">{"★".repeat(Math.max(1, Math.min(5, t.rating)))} </p>
                </div>
                <p className="text-xs text-white/60 mt-1">{t.role}</p>
                <p className="mt-3 text-sm text-white/75 leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pb-10">
          <div className="text-center text-white/60 text-xs">{content.footerText || DEFAULT_CONTENT.footerText}</div>
        </div>
      </div>
    </div>
  )
}

