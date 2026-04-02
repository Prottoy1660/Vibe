import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CircleHelp, Loader2, Save } from 'lucide-react';

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
  is_active: true
};

export const AdminTutorialHelp = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TutorialForm>(DEFAULT_FORM);

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
            is_active: data.is_active ?? true
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
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('tutorial_help_content')
        .upsert(payload, { onConflict: 'page_key' });

      if (error) throw error;
      alert('Tutorial & Help content updated successfully.');
    } catch (err: any) {
      console.error('Failed to save tutorial content:', err);
      alert(err.message || 'Failed to save content.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/60 dark:bg-white/5">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CircleHelp className="w-5 h-5 text-primary" />
          Tutorial & Help Page Builder
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Everything below is fully editable and will be shown to customers on the Tutorial & Help page.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Page Title</label>
            <input
              value={form.hero_title}
              onChange={(e) => setForm({ ...form, hero_title: e.target.value })}
              className="w-full p-2.5 border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Intro Text</label>
            <textarea
              value={form.intro_text}
              onChange={(e) => setForm({ ...form, intro_text: e.target.value })}
              className="w-full p-3 min-h-[90px] border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Alert Title</label>
            <input
              value={form.alert_title}
              onChange={(e) => setForm({ ...form, alert_title: e.target.value })}
              className="w-full p-2.5 border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Steps Section Title</label>
            <input
              value={form.steps_title}
              onChange={(e) => setForm({ ...form, steps_title: e.target.value })}
              className="w-full p-2.5 border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Alert Text</label>
            <textarea
              value={form.alert_text}
              onChange={(e) => setForm({ ...form, alert_text: e.target.value })}
              className="w-full p-3 min-h-[80px] border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Steps (one line per step)
            </label>
            <textarea
              value={form.steps_text}
              onChange={(e) => setForm({ ...form, steps_text: e.target.value })}
              className="w-full p-3 min-h-[120px] border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
              placeholder={'1) First step\n2) Second step\n3) Third step'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Note Title</label>
            <input
              value={form.note_title}
              onChange={(e) => setForm({ ...form, note_title: e.target.value })}
              className="w-full p-2.5 border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Video Title</label>
            <input
              value={form.video_title}
              onChange={(e) => setForm({ ...form, video_title: e.target.value })}
              className="w-full p-2.5 border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Note Text</label>
            <textarea
              value={form.note_text}
              onChange={(e) => setForm({ ...form, note_text: e.target.value })}
              className="w-full p-3 min-h-[90px] border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Video Description</label>
            <textarea
              value={form.video_description}
              onChange={(e) => setForm({ ...form, video_description: e.target.value })}
              className="w-full p-3 min-h-[80px] border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Video Embed URL (YouTube embed or watch link)
            </label>
            <input
              value={form.video_embed_url}
              onChange={(e) => setForm({ ...form, video_embed_url: e.target.value })}
              className="w-full p-2.5 border border-gray-300 dark:border-[#303038] rounded-lg bg-white dark:bg-[#111113] dark:text-gray-100"
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>

          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-gray-300 dark:border-[#303038] text-primary focus:ring-primary"
              />
              Show this page to users
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-[#26262d]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Tutorial Content
          </button>
        </div>
      </div>
    </div>
  );
};

