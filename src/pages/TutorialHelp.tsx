import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, CircleHelp, Loader2, PlayCircle, ShieldAlert } from 'lucide-react';

interface TutorialContent {
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
  video_embed_url: string | null;
}

const FALLBACK_CONTENT: TutorialContent = {
  hero_title: 'Tutorial & Help',
  intro_text: 'Important setup instructions and safety notes will appear here.',
  alert_title: 'Important Warning',
  alert_text: 'Please read all instructions carefully before using your account.',
  steps_title: 'Step-by-step guide',
  steps_text: '1) Open Adobe section\n2) Copy your email credentials\n3) Sign in and complete OTP verification',
  note_title: 'Notes',
  note_text: 'For any issue, contact support with your order details.',
  video_title: 'Video Tutorial',
  video_description: 'Admin can add a YouTube embed link from the panel.',
  video_embed_url: null
};

const normalizeEmbedUrl = (url: string | null) => {
  if (!url) return null;
  const raw = url.trim();
  if (!raw) return null;

  if (raw.includes('youtube.com/embed/')) return raw;

  const shortMatch = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;

  const longMatch = raw.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (longMatch) return `https://www.youtube.com/embed/${longMatch[1]}`;

  return raw;
};

export const TutorialHelp = () => {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<TutorialContent>(FALLBACK_CONTENT);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const { data, error } = await supabase
          .from('tutorial_help_content')
          .select('*')
          .eq('page_key', 'default')
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setContent({
            hero_title: data.hero_title || FALLBACK_CONTENT.hero_title,
            intro_text: data.intro_text || FALLBACK_CONTENT.intro_text,
            alert_title: data.alert_title || FALLBACK_CONTENT.alert_title,
            alert_text: data.alert_text || FALLBACK_CONTENT.alert_text,
            steps_title: data.steps_title || FALLBACK_CONTENT.steps_title,
            steps_text: data.steps_text || FALLBACK_CONTENT.steps_text,
            note_title: data.note_title || FALLBACK_CONTENT.note_title,
            note_text: data.note_text || FALLBACK_CONTENT.note_text,
            video_title: data.video_title || FALLBACK_CONTENT.video_title,
            video_description: data.video_description || FALLBACK_CONTENT.video_description,
            video_embed_url: data.video_embed_url || null
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

  const steps = useMemo(
    () => content.steps_text.split('\n').map(s => s.trim()).filter(Boolean),
    [content.steps_text]
  );

  const embedUrl = useMemo(() => normalizeEmbedUrl(content.video_embed_url), [content.video_embed_url]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] shadow-soft dark:shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/5">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CircleHelp className="w-6 h-6 text-primary" />
            {content.hero_title}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-line">{content.intro_text}</p>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-4">
            <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {content.alert_title}
            </h2>
            <p className="text-sm text-amber-800/90 dark:text-amber-200/90 mt-2 whitespace-pre-line">{content.alert_text}</p>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-4">
            <h2 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{content.steps_title}</h2>
            <ul className="mt-3 space-y-2">
              {steps.map((step, idx) => (
                <li key={`${step}-${idx}`} className="text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                  <span className="mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                    {idx + 1}
                  </span>
                  <span>{step.replace(/^\d+[\).\-\s]*/, '')}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 p-4">
            <h2 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              {content.note_title}
            </h2>
            <p className="text-sm text-indigo-900 dark:text-indigo-200 mt-2 whitespace-pre-line">{content.note_text}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] shadow-soft dark:shadow-none overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-[#26262d]">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-primary" />
            {content.video_title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-line">{content.video_description}</p>
        </div>
        <div className="p-6">
          {embedUrl ? (
            <div className="aspect-video rounded-xl overflow-hidden border border-gray-200 dark:border-[#303038] bg-black">
              <iframe
                src={embedUrl}
                title="Tutorial Video"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-dashed border-gray-300 dark:border-[#303038]">
              No video added yet. Admin can add a YouTube URL from the panel.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

