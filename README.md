# Vibe (VibeAccess)

Customer storefront and admin operations platform: subscriptions, digital products, wallet payments, referrals, support, and more — built as a **React + Vite** SPA with an **Express** API and **Supabase** (Postgres, Auth, Storage).

---

## Highlights

- **Store & checkout** — Products, orders, coupons, wallet (BDT), payment integration  
- **Accounts** — Supabase Auth (email/OAuth), profile, mandatory phone for OAuth users, default avatars with gender preference  
- **Admin** — Orders, users, emails pool, notices, analytics, subscription reminders, support tools  
- **PWA** — Installable client, optional web push  
- **Desktop / mobile apps** — Tauri 2 (Windows + Android) in-repo  

---

## Tech stack

| Layer | Stack |
|--------|--------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, Framer Motion |
| Backend | Node.js, Express (`api/`) |
| Data & auth | Supabase (PostgreSQL, RLS, Auth, Storage) |
| Desktop / APK | Tauri 2 (`src-tauri/`) |

---

## Prerequisites

- **Node.js** 20+ (recommended)  
- **npm**  
- A **Supabase** project (URL + anon key + service role for the API)  

---

## Quick start

```bash
git clone https://github.com/Prottoy1660/Vibe.git
cd Vibe
npm install
```

1. Copy environment template and fill secrets:

   ```bash
   cp .env.example .env
   ```

   Set at least `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FRONTEND_URL` / `VITE_APP_URL` as described in `.env.example`.

2. Run database migrations (from repo root, with Supabase CLI linked to your project):

   ```bash
   npx supabase db push
   ```

   Or apply SQL from `supabase/migrations/` in the Supabase SQL editor.

3. Start dev (Vite + API):

   ```bash
   npm run dev
   ```

   - Web app: typically `http://localhost:5173`  
   - API: port from `PORT` in `.env` (default `3001`)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server + API (nodemon) |
| `npm run client:dev` | Frontend only |
| `npm run server:dev` | API only |
| `npm run build` | Typecheck + production Vite build |
| `npm run preview` | Preview production build |
| `npm run check` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run start` | Serve built SPA + API (`SERVE_STATIC_SPA`) |
| `npm run desktop:dev` | Tauri desktop dev |
| `npm run android:build` | Android APK (after Tauri Android setup) |

---

## Repository layout

```
├── api/              Express routes & server logic
├── src/              React app (pages, components, contexts)
├── supabase/
│   ├── migrations/   SQL migrations (run against your project)
│   └── email-templates/  Optional HTML for Auth email customization
├── src-tauri/        Tauri desktop/Android shell
└── public/           Static assets
```

---

## Configuration notes

- **CORS** — `FRONTEND_URL` must include your deployed web origin (see `api/app.ts`).  
- **Email** — Supabase Auth templates can be copied from `supabase/email-templates/`.  
- **Web push** — VAPID keys and related vars in `.env.example`.  

### Self-hosted Supabase Auth templates

If you run Supabase Auth (GoTrue) on your own server and dashboard template editing is limited, this repo now exposes template URLs from your API:

- `GET /api/auth/email-templates/confirmation`
- `GET /api/auth/email-templates/invite`
- `GET /api/auth/email-templates/magic_link`
- `GET /api/auth/email-templates/recovery`
- `GET /api/auth/email-templates/email_change`
- `GET /api/auth/email-templates/reauthentication`

Point your GoTrue mailer template environment variables to these URLs. Example:

```env
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://your-domain.com/api/auth/email-templates/confirmation
GOTRUE_MAILER_TEMPLATES_INVITE=https://your-domain.com/api/auth/email-templates/invite
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=https://your-domain.com/api/auth/email-templates/magic_link
GOTRUE_MAILER_TEMPLATES_RECOVERY=https://your-domain.com/api/auth/email-templates/recovery
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=https://your-domain.com/api/auth/email-templates/email_change
GOTRUE_MAILER_TEMPLATES_REAUTHENTICATION=https://your-domain.com/api/auth/email-templates/reauthentication
```

Then restart your GoTrue container/service.

---

## License

Private / all rights reserved unless otherwise stated by the repository owner.

---

<p align="center">
  <strong>VibeAccess</strong> · Built with React, Supabase & Express
</p>
