-- Tutorial & Help page editable content
CREATE TABLE IF NOT EXISTS public.tutorial_help_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_key TEXT UNIQUE NOT NULL DEFAULT 'default',
    hero_title TEXT NOT NULL DEFAULT 'Tutorial & Help',
    intro_text TEXT NOT NULL DEFAULT 'Use this page to guide your customers with setup instructions, warnings, and videos.',
    alert_title TEXT NOT NULL DEFAULT 'Important Warning',
    alert_text TEXT NOT NULL DEFAULT 'Write important caution details here.',
    steps_title TEXT NOT NULL DEFAULT 'Step-by-step guide',
    steps_text TEXT NOT NULL DEFAULT '1) First step\n2) Second step\n3) Third step',
    note_title TEXT NOT NULL DEFAULT 'Notes',
    note_text TEXT NOT NULL DEFAULT 'Write additional notes here.',
    video_title TEXT NOT NULL DEFAULT 'Video Tutorial',
    video_description TEXT NOT NULL DEFAULT 'Paste an embeddable video URL (YouTube) in admin panel.',
    video_embed_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutorial_help_content_active ON public.tutorial_help_content(is_active);

ALTER TABLE public.tutorial_help_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tutorial content"
ON public.tutorial_help_content
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage tutorial content"
ON public.tutorial_help_content
FOR ALL
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO public.tutorial_help_content (
    page_key,
    hero_title,
    intro_text,
    alert_title,
    alert_text,
    steps_title,
    steps_text,
    note_title,
    note_text,
    video_title,
    video_description,
    is_active
)
VALUES (
    'default',
    'Tutorial & Help',
    'এই পেইজ থেকে আপনি Adobe Account ব্যবহার করার গাইডলাইন, সতর্কতা, এবং ভিডিও টিউটোরিয়াল দেখতে পারবেন।',
    'গুরুত্বপূর্ণ সতর্কতা',
    'একাধিক ডিভাইসে একসাথে লগইন করলে আপনার এক্সেস ঝুঁকিতে পড়তে পারে। সবসময় নিয়ম মেনে ব্যবহার করুন।',
    'ধাপে ধাপে গাইড',
    '1) Adobe Email পেজে গিয়ে আপনার ইমেইল কপি করুন\n2) Desktop App থেকে লগইন করুন\n3) OTP লাগলে inbox থেকে কোড নিন\n4) কাজ শেষে account logout করুন',
    'নোট',
    'যদি কোনো সমস্যা হয়, তাহলে দ্রুত সাপোর্টে যোগাযোগ করুন এবং অপ্রয়োজনীয় ডিভাইস থেকে logout করে আবার চেষ্টা করুন।',
    'ভিডিও টিউটোরিয়াল',
    'নিচে ভিডিও যোগ করলে ইউজাররা সরাসরি দেখে নিতে পারবে।',
    true
)
ON CONFLICT (page_key) DO NOTHING;
