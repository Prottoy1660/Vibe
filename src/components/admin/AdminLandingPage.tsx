import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, Save, Settings, Info } from 'lucide-react'

const DEFAULT_CONTENT = {
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
    { title: 'Admin Controlled', text: 'Landing text and visuals are editable from this admin page.' },
  ],
  testimonialsTitle: 'What Clients Say',
  testimonials: [
    { name: 'Team Admin', role: 'Operations', rating: 5, text: 'Clean UI and fast access. Admin controls are easy.' },
    { name: 'Creative Lead', role: 'Design', rating: 5, text: 'Shared account works smoothly with clear warnings.' },
    { name: 'Project Owner', role: 'Management', rating: 5, text: 'Pricing is transparent and renewals are consistent.' },
  ],
  footerText: '© VibeAccess — All rights reserved.',
}

export const AdminLandingPage: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const storageKey = 'landing_page_content'

  const [enabled, setEnabled] = useState<boolean>(true)

  const [heroTitle, setHeroTitle] = useState(DEFAULT_CONTENT.heroTitle)
  const [heroSubtitle, setHeroSubtitle] = useState(DEFAULT_CONTENT.heroSubtitle)
  const [heroBadge, setHeroBadge] = useState(DEFAULT_CONTENT.heroBadge)

  const [pricingTitle, setPricingTitle] = useState(DEFAULT_CONTENT.pricingTitle)
  const [pricingSubtitle, setPricingSubtitle] = useState(DEFAULT_CONTENT.pricingSubtitle)

  const [whyTitle, setWhyTitle] = useState(DEFAULT_CONTENT.whyTitle)
  const [whyItems, setWhyItems] = useState(DEFAULT_CONTENT.whyItems)

  const [testimonialsTitle, setTestimonialsTitle] = useState(DEFAULT_CONTENT.testimonialsTitle)
  const [testimonials, setTestimonials] = useState(DEFAULT_CONTENT.testimonials)

  const [footerText, setFooterText] = useState(DEFAULT_CONTENT.footerText)

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', storageKey)
          .maybeSingle()

        if (error) throw error

        const v = (data?.value || {}) as any
        const merged = { ...DEFAULT_CONTENT, ...v }

        setEnabled(Boolean(merged.enabled ?? true))

        setHeroTitle(merged.heroTitle ?? DEFAULT_CONTENT.heroTitle)
        setHeroSubtitle(merged.heroSubtitle ?? DEFAULT_CONTENT.heroSubtitle)
        setHeroBadge(merged.heroBadge ?? DEFAULT_CONTENT.heroBadge)

        setPricingTitle(merged.pricingTitle ?? DEFAULT_CONTENT.pricingTitle)
        setPricingSubtitle(merged.pricingSubtitle ?? DEFAULT_CONTENT.pricingSubtitle)

        setWhyTitle(merged.whyTitle ?? DEFAULT_CONTENT.whyTitle)
        setWhyItems(Array.isArray(merged.whyItems) && merged.whyItems.length ? merged.whyItems : DEFAULT_CONTENT.whyItems)

        setTestimonialsTitle(merged.testimonialsTitle ?? DEFAULT_CONTENT.testimonialsTitle)
        setTestimonials(
          Array.isArray(merged.testimonials) && merged.testimonials.length
            ? merged.testimonials
            : DEFAULT_CONTENT.testimonials
        )

        setFooterText(merged.footerText ?? DEFAULT_CONTENT.footerText)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const clampRating = (r: any) => {
        const n = Number(r)
        if (!Number.isFinite(n)) return 5
        return Math.max(1, Math.min(5, Math.round(n)))
      }

      const payload = {
        enabled,
        heroTitle,
        heroSubtitle,
        heroBadge,
        pricingTitle,
        pricingSubtitle,
        whyTitle,
        whyItems: (whyItems || DEFAULT_CONTENT.whyItems).slice(0, 3),
        testimonialsTitle,
        testimonials: (testimonials || DEFAULT_CONTENT.testimonials).slice(0, 3).map((t: any) => ({
          ...t,
          rating: clampRating(t?.rating),
        })),
        footerText,
      }

      const { error } = await supabase.from('system_settings').upsert(
        {
          key: storageKey,
          value: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )

      if (error) throw error
      setMessage({ type: 'ok', text: 'Landing settings saved.' })
    } catch (e: any) {
      const msg = e?.message || 'Save failed'
      setMessage({ type: 'err', text: msg })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  const setWhyAt = (idx: number, patch: Partial<(typeof DEFAULT_CONTENT.whyItems)[number]>) => {
    setWhyItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  const setTestimonialAt = (idx: number, patch: Partial<(typeof DEFAULT_CONTENT.testimonials)[number]>) => {
    setTestimonials((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Landing page settings</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-indigo-500" />
          Edit hero / pricing intro / why / testimonials / footer. Pricing cards are generated from{' '}
          <span className="font-medium">Products</span> (active, non-personal).
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3 mb-5">
          <label className="inline-flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Enable landing page</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Hero badge</label>
            <input value={heroBadge} onChange={(e) => setHeroBadge(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Hero title</label>
            <input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Hero subtitle</label>
            <input value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Pricing intro</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Pricing title</label>
              <input value={pricingTitle} onChange={(e) => setPricingTitle(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Pricing subtitle</label>
              <textarea value={pricingSubtitle} onChange={(e) => setPricingSubtitle(e.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Why section</h3>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Why title</label>
          <input value={whyTitle} onChange={(e) => setWhyTitle(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 mb-4" />

          <div className="space-y-4">
            {(whyItems || []).slice(0, 3).map((it, idx) => (
              <div key={idx} className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/40 dark:bg-white/5 p-4">
                <div className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-3">Item {idx + 1}</div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Title</label>
                <input value={it.title} onChange={(e) => setWhyAt(idx, { title: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 mb-3" />
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Text</label>
                <textarea value={it.text} onChange={(e) => setWhyAt(idx, { text: e.target.value })} rows={3} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Testimonials</h3>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Testimonials title</label>
          <input value={testimonialsTitle} onChange={(e) => setTestimonialsTitle(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 mb-4" />

          <div className="space-y-4">
            {(testimonials || []).slice(0, 3).map((t: any, idx) => (
              <div key={idx} className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/40 dark:bg-white/5 p-4">
                <div className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-3">Testimonial {idx + 1}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Name</label>
                    <input value={t.name} onChange={(e) => setTestimonialAt(idx, { name: e.target.value } as any)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Role</label>
                    <input value={t.role} onChange={(e) => setTestimonialAt(idx, { role: e.target.value } as any)} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Rating (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={t.rating}
                    onChange={(e) => setTestimonialAt(idx, { rating: Number(e.target.value) } as any)}
                    className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Text</label>
                  <textarea value={t.text} onChange={(e) => setTestimonialAt(idx, { text: e.target.value } as any)} rows={3} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Footer</h3>
          <textarea value={footerText} onChange={(e) => setFooterText(e.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
        </div>

        {message && (
          <p
            className={`mt-3 text-sm ${
              message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEnabled(DEFAULT_CONTENT.enabled)
              setHeroTitle(DEFAULT_CONTENT.heroTitle)
              setHeroSubtitle(DEFAULT_CONTENT.heroSubtitle)
              setHeroBadge(DEFAULT_CONTENT.heroBadge)
              setPricingTitle(DEFAULT_CONTENT.pricingTitle)
              setPricingSubtitle(DEFAULT_CONTENT.pricingSubtitle)
              setWhyTitle(DEFAULT_CONTENT.whyTitle)
              setWhyItems(DEFAULT_CONTENT.whyItems)
              setTestimonialsTitle(DEFAULT_CONTENT.testimonialsTitle)
              setTestimonials(DEFAULT_CONTENT.testimonials)
              setFooterText(DEFAULT_CONTENT.footerText)
              setMessage(null)
            }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

