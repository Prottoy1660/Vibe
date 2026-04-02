-- Update default Tutorial & Help content (safe upsert).
-- This sets better Bangla guidance as the initial content.
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
  video_embed_url,
  is_active,
  updated_at
)
VALUES (
  'default',
  'টিউটোরিয়াল ও সাহায্য (Adobe সাবস্ক্রিপশন ব্যবহার গাইড)',
  'Vibe Access থেকে নেওয়া আপনার Adobe সাবস্ক্রিপশন কীভাবে ব্যবহার করবেন—এই পেজে সম্পূর্ণ গাইড দেওয়া আছে।\n\nএখানে পাবেন: কোথায় Email/Password পাবেন, OTP (Verification Code) কীভাবে নেবেন, কী কী করলে এক্সেস বন্ধ হতে পারে—সব কিছু।\n\nপ্রথমবার লগইন করার আগে পুরোটা একবার পড়ে নিন।',
  'গুরুত্বপূর্ণ নিয়ম (অবশ্যই পড়ুন)',
  '• Email/Password কারও সাথে শেয়ার করবেন না। শেয়ার করলে এক্সেস সাসপেন্ড হতে পারে।\n• একই সময়ে একাধিক ডিভাইসে লগইন করবেন না (বিশেষ করে Single Device প্ল্যান হলে)।\n• Adobe যদি Team / Organization / Company সিলেক্ট করতে বলে, সাধারণত Team/Organization অপশন সিলেক্ট করবেন (যদি আপনার ক্ষেত্রে আসে)।\n• অ্যাকাউন্টের Email/Password/Recovery/Security Setting পরিবর্তন করবেন না।\n• বারবার ভুল পাসওয়ার্ড/OTP রিকোয়েস্ট স্প্যাম করলে অ্যাকাউন্ট লক হতে পারে।\n• কোনো সমস্যা হলে “নিজে নিজে অনেক কিছু ট্রাই” না করে সাপোর্টে যোগাযোগ করুন।',
  'ধাপে ধাপে: লগইন + OTP + সেফ ব্যবহার',
  '1) আপনার Vibe Access অ্যাকাউন্টে লগইন করে Adobe Email পেজে যান।\n2) সেখানে থাকা Email এবং Password কপি করুন।\n3) Adobe Creative Cloud Desktop App ইনস্টল করুন (অথবা অফিসিয়াল Adobe ওয়েবসাইট ব্যবহার করুন)।\n4) কপি করা Email/Password দিয়ে Adobe-তে Sign in করুন।\n5) যদি Adobe Verification Code / OTP চায়, Vibe Access → Adobe Email → Inbox খুলে কোড কপি করুন।\n6) Adobe-তে কোড বসিয়ে Verification সম্পন্ন করুন।\n7) কাজ শেষ হলে সম্ভব হলে Adobe থেকে Logout করুন (ভাল অভ্যাস)।\n8) মেয়াদ শেষ হলে Renew করুন। Wallet ব্যবহার করলে Auto Renew চালু রাখতে পারেন।',
  'নোটস ও সমস্যা সমাধান (Troubleshooting)',
  '• OTP আসছে না? ১–২ মিনিট অপেক্ষা করুন, Inbox রিফ্রেশ করুন, তারপর আবার OTP নিন (স্প্যাম করবেন না)।\n• Login failed / Wrong password? কপি করার সময় অতিরিক্ত স্পেস/লাইন যেন না থাকে। তবুও না হলে সাপোর্টে জানান।\n• অন্য ডিভাইসে লগইন আছে? অন্য ডিভাইস/ব্রাউজার থেকে Logout করে আবার চেষ্টা করুন।\n• Account locked / Too many attempts? বারবার চেষ্টা বন্ধ করুন—সাপোর্টে যোগাযোগ করুন।\n\nদ্রুত সাপোর্ট পেতে পাঠান: Order ID + যে Email দেখাচ্ছে + Error Screenshot।',
  'ভিডিও টিউটোরিয়াল',
  'এই ভিডিওতে দেখানো আছে কোথা থেকে Email/Password কপি করবেন, কীভাবে লগইন করবেন, OTP কীভাবে Inbox থেকে নেবেন এবং কোন নিয়মগুলো মানতে হবে।',
  NULL,
  true,
  NOW()
)
ON CONFLICT (page_key) DO UPDATE SET
  hero_title = EXCLUDED.hero_title,
  intro_text = EXCLUDED.intro_text,
  alert_title = EXCLUDED.alert_title,
  alert_text = EXCLUDED.alert_text,
  steps_title = EXCLUDED.steps_title,
  steps_text = EXCLUDED.steps_text,
  note_title = EXCLUDED.note_title,
  note_text = EXCLUDED.note_text,
  video_title = EXCLUDED.video_title,
  video_description = EXCLUDED.video_description,
  -- keep existing video_embed_url if admin already set it
  video_embed_url = COALESCE(public.tutorial_help_content.video_embed_url, EXCLUDED.video_embed_url),
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

