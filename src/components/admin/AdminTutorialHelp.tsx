import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  Save,
  Sparkles,
  BookOpen,
  AlertTriangle,
  ListOrdered,
  MessageSquareText,
  Video,
  Eye,
  Info,
} from 'lucide-react';
import { toast } from '../../lib/toast';

interface TutorialForm {
  hero_title: string;
  intro_text: string;
  alert_title: string;
  alert_text: string;
  steps_title: string;
  steps_text: string;
  note_title: string;
  note_text: string;
  video_title: string;
  video_description: string;
  video_embed_url: string;
  is_active: boolean;
}

const DEFAULT_FORM: TutorialForm = {
  hero_title: 'Tutorial & Help',
  intro_text: '',
  alert_title: 'Important Warning',
  alert_text: '',
  steps_title: 'Step-by-step guide',
  steps_text: '',
  note_title: 'Notes',
  note_text: '',
  video_title: 'Video Tutorial',
  video_description: '',
  video_embed_url: '',
  is_active: true,
};

type TabId = 'intro' | 'guides' | 'media';

export const AdminTutorialHelp = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TutorialForm>(DEFAULT_FORM);
  const [activeTab, setActiveTab] = useState<TabId>('intro');

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const { data, error } = await supabase
          .from('tutorial_help_content')
          .select('*')
          .eq('page_key', 'default')
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setForm({
            hero_title: data.hero_title || '',
            intro_text: data.intro_text || '',
            alert_title: data.alert_title || '',
            alert_text: data.alert_text || '',
            steps_title: data.steps_title || '',
            steps_text: data.steps_text || '',
            note_title: data.note_title || '',
            note_text: data.note_text || '',
            video_title: data.video_title || '',
            video_description: data.video_description || '',
            video_embed_url: data.video_embed_url || '',
            is_active: data.is_active ?? true,
          });
        }
      } catch (err) {
        console.error('Failed to load tutorial content:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        page_key: 'default',
        ...form,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('tutorial_help_content').upsert(payload, { onConflict: 'page_key' });

      if (error) throw error;
      toast.success('Tutorial page saved. Customers will see the updated content on the next visit.');
    } catch (err: any) {
      console.error('Failed to save tutorial content:', err);
      toast.error(err.message || 'Failed to save content.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: TabId; label: string; sub: string; icon: React.ElementType }[] = [
    { id: 'intro', label: 'Page intro', sub: 'Title & welcome', icon: BookOpen },
    { id: 'guides', label: 'Rules & steps', sub: 'Warnings & checklist', icon: ListOrdered },
    { id: 'media', label: 'Notes & video', sub: 'Troubleshooting & embed', icon: Video },
  ];

  const inputClass =
    'w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#111113] dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 outline-none';
  const textareaClass = `${inputClass} min-h-[100px] resize-y`;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Tutorial &amp; Help</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Edit what customers see on{' '}
                <span className="font-medium text-gray-800 dark:text-gray-200">/tutorial-help</span>. Work by section so
                the form stays easy to scan—you can write in any language your customers use.
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2 p-1 rounded-xl bg-white/60 dark:bg-black/20 border border-gray-200/80 dark:border-[#303038]">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 min-w-[150px] flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-left">
                  <span className="block">{t.label}</span>
                  <span className={`block text-[11px] font-normal ${isActive ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518]">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm text-gray-500">Loading current content…</p>
        </div>
      ) : (
        <>
          {activeTab === 'intro' && (
            <SectionCard
              step={1}
              title="Page intro"
              hint="Large headline and short paragraph at the top of the public page."
              icon={BookOpen}
            >
              <Field label="Page title (hero)" hint="Shown as the main H1 on the tutorial page.">
                <input
                  value={form.hero_title}
                  onChange={(e) => setForm({ ...form, hero_title: e.target.value })}
                  className={inputClass}
                  placeholder="Tutorial & Help"
                />
              </Field>
              <Field
                label="Intro text"
                hint="Supporting text under the title. Line breaks are preserved when displayed."
              >
                <textarea
                  value={form.intro_text}
                  onChange={(e) => setForm({ ...form, intro_text: e.target.value })}
                  className={textareaClass}
                  rows={5}
                  placeholder="Welcome message and what this page covers…"
                />
              </Field>
            </SectionCard>
          )}

          {activeTab === 'guides' && (
            <div className="space-y-6">
              <SectionCard
                step={1}
                title="Important notice"
                hint="Callout block for rules, security, or must-read warnings."
                icon={AlertTriangle}
                variant="amber"
              >
                <Field label="Notice title" hint="Short heading above the alert body.">
                  <input
                    value={form.alert_title}
                    onChange={(e) => setForm({ ...form, alert_title: e.target.value })}
                    className={inputClass}
                    placeholder="Important rules"
                  />
                </Field>
                <Field
                  label="Notice body"
                  hint="Use bullet lines with • or - if you like; plain paragraphs work too."
                >
                  <textarea
                    value={form.alert_text}
                    onChange={(e) => setForm({ ...form, alert_text: e.target.value })}
                    className={textareaClass}
                    rows={5}
                  />
                </Field>
              </SectionCard>

              <SectionCard
                step={2}
                title="Step-by-step instructions"
                hint="Customers usually see this as a numbered or line-by-line checklist."
                icon={ListOrdered}
              >
                <Field label="Section heading" hint="Title above the steps list.">
                  <input
                    value={form.steps_title}
                    onChange={(e) => setForm({ ...form, steps_title: e.target.value })}
                    className={inputClass}
                    placeholder="How to log in and use your account"
                  />
                </Field>
                <Field
                  label="Steps (one line per step)"
                  hint="Each line becomes one step. You can prefix with 1. 2. or use plain lines."
                >
                  <textarea
                    value={form.steps_text}
                    onChange={(e) => setForm({ ...form, steps_text: e.target.value })}
                    className={textareaClass}
                    rows={8}
                    placeholder={'1) Open Creative Cloud\n2) Sign in with the shared email\n3) …'}
                  />
                </Field>
              </SectionCard>
            </div>
          )}

          {activeTab === 'media' && (
            <div className="space-y-6">
              <SectionCard
                step={1}
                title="Notes & troubleshooting"
                hint="Extra help text—OTP issues, FAQs, or support hints."
                icon={MessageSquareText}
              >
                <Field label="Notes heading">
                  <input
                    value={form.note_title}
                    onChange={(e) => setForm({ ...form, note_title: e.target.value })}
                    className={inputClass}
                    placeholder="Troubleshooting"
                  />
                </Field>
                <Field label="Notes body" hint="Optional secondary block below the main steps.">
                  <textarea
                    value={form.note_text}
                    onChange={(e) => setForm({ ...form, note_text: e.target.value })}
                    className={textareaClass}
                    rows={5}
                  />
                </Field>
              </SectionCard>

              <SectionCard
                step={2}
                title="Video block"
                hint="Heading, description, and a YouTube watch or embed URL."
                icon={Video}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Video section title">
                    <input
                      value={form.video_title}
                      onChange={(e) => setForm({ ...form, video_title: e.target.value })}
                      className={inputClass}
                      placeholder="Video tutorial"
                    />
                  </Field>
                  <Field
                    label="Embed URL"
                    hint="Paste a youtube.com/watch or youtu.be link—the customer page normalizes it."
                  >
                    <input
                      value={form.video_embed_url}
                      onChange={(e) => setForm({ ...form, video_embed_url: e.target.value })}
                      className={`${inputClass} font-mono text-xs`}
                      placeholder="https://www.youtube.com/watch?v=…"
                    />
                  </Field>
                </div>
                <Field label="Video description" hint="Shown under the title, above the player.">
                  <textarea
                    value={form.video_description}
                    onChange={(e) => setForm({ ...form, video_description: e.target.value })}
                    className={textareaClass}
                    rows={4}
                  />
                </Field>
              </SectionCard>
            </div>
          )}

          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sticky bottom-4 shadow-lg dark:shadow-none">
            <label className="inline-flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="mt-1 rounded border-gray-300 dark:border-[#303038] text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-500" />
                  Published
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">
                  When off, hide the tutorial page from customers (admins can still edit here).
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm font-semibold shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>

          <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 px-1">
            <Info className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
            Preview the live page from the sidebar: <strong className="font-medium text-gray-700 dark:text-gray-300">Tutorial &amp; Help</strong> (customer route).
          </p>
        </>
      )}
    </div>
  );
};

function SectionCard({
  step,
  title,
  hint,
  icon: Icon,
  variant = 'default',
  children,
}: {
  step: number;
  title: string;
  hint: string;
  icon: React.ElementType;
  variant?: 'default' | 'amber';
  children: React.ReactNode;
}) {
  const ring =
    variant === 'amber'
      ? 'border-amber-200/80 dark:border-amber-500/20'
      : 'border-gray-100 dark:border-[#26262d]';
  return (
    <div className={`rounded-2xl border ${ring} bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none`}>
      <div className="flex items-start gap-3 mb-5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
            variant === 'amber'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
          }`}
        >
          {step}
        </span>
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{hint}</p>
          </div>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">{hint}</p> : null}
    </div>
  );
}
