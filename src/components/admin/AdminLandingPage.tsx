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

  const [enabled, setEnabled] = useState<boolean>(true)
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(DEFAULT_CONTENT, null, 2))

  const storageKey = 'landing_page_content'

  const normalizedJson = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText)
      return parsed
    } catch {
      return null
    }
  }, [jsonText])

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
        setJsonText(JSON.stringify(merged, null, 2))
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
      const parsed = JSON.parse(jsonText)
      const merged = { ...DEFAULT_CONTENT, ...parsed, enabled }

      const { error } = await supabase.from('system_settings').upsert(
        {
          key: storageKey,
          value: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )

      if (error) throw error
      setMessage({ type: 'ok', text: 'Landing settings saved.' })
    } catch (e: any) {
      const msg = e?.message || 'Save failed. Check JSON format.'
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Landing page settings</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-indigo-500" />
          This editor controls hero text / section text. Pricing cards are generated from <span className="font-medium">Products</span> (active, non-personal).
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3 mb-4">
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

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Landing content JSON ({storageKey})
        </label>

        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={18}
          className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono"
        />

        {normalizedJson === null ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">Invalid JSON. Fix the format before saving.</p>
        ) : (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            JSON is valid. You can change any text shown on the landing page.
          </p>
        )}

        {message && (
          <p
            className={`mt-3 text-sm ${
              message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setJsonText(JSON.stringify(DEFAULT_CONTENT, null, 2))
              setEnabled(true)
              setMessage(null)
            }}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={saving || normalizedJson === null}
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

