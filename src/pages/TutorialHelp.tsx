import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  Loader2,
  PlayCircle,
  ShieldAlert,
  Sparkles,
  ListOrdered,
} from 'lucide-react';

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
  hero_title: 'টিউটোরিয়াল ও সাহায্য (Adobe সাবস্ক্রিপশন ব্যবহার গাইড)',
  intro_text:
    'Vibe Access থেকে নেওয়া আপনার Adobe সাবস্ক্রিপশন কীভাবে ব্যবহার করবেন—এই পেজে সম্পূর্ণ গাইড দেওয়া আছে।\n\nপ্রথমবার লগইন করার আগে পুরোটা একবার পড়ে নিন।',
  alert_title: 'গুরুত্বপূর্ণ নিয়ম (অবশ্যই পড়ুন)',
  alert_text:
    '• Email/Password কারও সাথে শেয়ার করবেন না।\n• একই সময়ে একাধিক ডিভাইসে লগইন করবেন না।\n• অ্যাকাউন্টের Email/Password/Recovery/Security Setting পরিবর্তন করবেন না।\n• কোনো সমস্যা হলে সাপোর্টে যোগাযোগ করুন।',
  steps_title: 'ধাপে ধাপে: লগইন + OTP + সেফ ব্যবহার',
  steps_text:
    '1) Adobe Email পেজে যান\n2) Email/Password কপি করুন\n3) Adobe-তে Sign in করুন\n4) OTP লাগলে Inbox থেকে কোড নিন',
  note_title: 'নোটস ও সমস্যা সমাধান (Troubleshooting)',
  note_text: 'OTP দেরি হলে কিছুক্ষণ অপেক্ষা করুন এবং স্প্যাম করবেন না। সমস্যায় Order ID সহ সাপোর্টে যোগাযোগ করুন।',
  video_title: 'ভিডিও টিউটোরিয়াল',
  video_description: 'Admin প্যানেল থেকে YouTube লিংক যোগ করলে এখানে ভিডিও দেখা যাবে।',
  video_embed_url: null,
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

/** Readable bullets: lines starting with • - * or 1. */
function FormattedBlock({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n\n+/);
  return (
    <div className="space-y-3 text-[15px] sm:text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      {paragraphs.map((block, pi) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const isAllBullets =
          lines.length > 0 &&
          lines.every((l) => /^[•\-\*]\s*/.test(l) || /^\d+[\).\s]/.test(l));
        if (isAllBullets) {
          return (
            <ul key={pi} className="list-none space-y-2.5 pl-0">
              {lines.map((line, li) => (
                <li key={li} className="flex gap-3">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500 dark:bg-zinc-400"
                    aria-hidden
                  />
                  <span>{line.replace(/^[•\-\*]\s*/, '').replace(/^\d+[\).\s]+/, '')}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={pi} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

const sectionShell =
  'rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 shadow-sm dark:shadow-none overflow-hidden';

export const TutorialHelp = () => {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<TutorialContent>(FALLBACK_CONTENT);
  const [openRules, setOpenRules] = useState(true);
  const [openSteps, setOpenSteps] = useState(true);
  const [openNotes, setOpenNotes] = useState(true);

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
            video_embed_url: data.video_embed_url || null,
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
    () => content.steps_text.split('\n').map((s) => s.trim()).filter(Boolean),
    [content.steps_text],
  );

  const embedUrl = useMemo(() => normalizeEmbedUrl(content.video_embed_url), [content.video_embed_url]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 max-w-3xl mx-auto px-0">
      <div>
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          সাহায্য
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
          {content.hero_title}
        </h1>
        <div className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-900/50 px-4 py-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-line">
            {content.intro_text}
          </p>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
          নিচের বক্সগুলো ক্লিক করে বন্ধ বা খুলতে পারেন—লম্বা গাইড কম স্ক্রলে পড়তে সুবিধা।
        </p>
      </div>

      <div className="space-y-3">
        <section className={sectionShell}>
          <button
            type="button"
            onClick={() => setOpenRules(!openRules)}
            className="w-full flex items-center justify-between gap-3 text-left px-4 py-4 sm:px-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-amber-50/80 dark:bg-amber-950/35 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors"
            aria-expanded={openRules}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200/90 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-snug">
                {content.alert_title}
              </span>
            </span>
            <ChevronDown
              className={`w-5 h-5 shrink-0 text-zinc-500 transition-transform ${openRules ? 'rotate-180' : ''}`}
            />
          </button>
          {openRules && (
            <div className="px-4 py-4 sm:px-5 sm:py-5 bg-white dark:bg-zinc-950/40">
              <FormattedBlock text={content.alert_text} />
            </div>
          )}
        </section>

        <section className={sectionShell}>
          <button
            type="button"
            onClick={() => setOpenSteps(!openSteps)}
            className="w-full flex items-center justify-between gap-3 text-left px-4 py-4 sm:px-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/45 transition-colors"
            aria-expanded={openSteps}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-200/90 dark:bg-emerald-900/55 text-emerald-900 dark:text-emerald-100">
                <ListOrdered className="w-5 h-5" />
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-snug">
                {content.steps_title}
              </span>
            </span>
            <ChevronDown
              className={`w-5 h-5 shrink-0 text-zinc-500 transition-transform ${openSteps ? 'rotate-180' : ''}`}
            />
          </button>
          {openSteps && (
            <div className="px-4 py-4 sm:px-5 sm:py-5 bg-white dark:bg-zinc-950/40">
              <ol className="space-y-3 list-none">
                {steps.map((step, idx) => (
                  <li key={`${step}-${idx}`} className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white text-xs font-bold"
                      aria-hidden
                    >
                      {idx + 1}
                    </span>
                    <span className="text-[15px] sm:text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 pt-0.5">
                      {step.replace(/^\d+[\).\-\s]*/, '')}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section className={sectionShell}>
          <button
            type="button"
            onClick={() => setOpenNotes(!openNotes)}
            className="w-full flex items-center justify-between gap-3 text-left px-4 py-4 sm:px-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-indigo-50/80 dark:bg-indigo-950/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/45 transition-colors"
            aria-expanded={openNotes}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-200/90 dark:bg-indigo-900/55 text-indigo-900 dark:text-indigo-100">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-snug">
                {content.note_title}
              </span>
            </span>
            <ChevronDown
              className={`w-5 h-5 shrink-0 text-zinc-500 transition-transform ${openNotes ? 'rotate-180' : ''}`}
            />
          </button>
          {openNotes && (
            <div className="px-4 py-4 sm:px-5 sm:py-5 bg-white dark:bg-zinc-950/40">
              <FormattedBlock text={content.note_text} />
            </div>
          )}
        </section>
      </div>

      <div className={sectionShell}>
        <div className="px-4 py-4 sm:px-5 border-b border-zinc-100 dark:border-zinc-800 flex items-start gap-3 bg-zinc-50/80 dark:bg-zinc-900/50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100">
            <PlayCircle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{content.video_title}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed whitespace-pre-line">
              {content.video_description}
            </p>
          </div>
        </div>
        <div className="p-4 sm:p-5 bg-white dark:bg-zinc-950/30">
          {embedUrl ? (
            <div className="aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-black shadow-inner">
              <iframe
                src={embedUrl}
                title="Tutorial Video"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-8 text-center">
              <CircleHelp className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-700 dark:text-zinc-200 font-medium">ভিডিও এখনো যোগ করা হয়নি</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                Admin প্যানেল থেকে YouTube লিংক দিলে এখানে প্লেয়ার দেখা যাবে।
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
