import React from "react";
import { Link } from "react-router-dom";

const BRAND_LOGO_URL =
  "https://supabase.vibeaccessbd.com/storage/v1/object/public/product-images/products/favicon.png";

type FooterItem =
  | { label: string; kind: "route"; to: string }
  | { label: string; kind: "anchor"; href: string };

const cols: { title: string; items: FooterItem[] }[] = [
  {
    title: "Product",
    items: [
      { label: "Store", kind: "route", to: "/store" },
      { label: "Pricing", kind: "anchor", href: "#pricing" },
      { label: "Downloads", kind: "route", to: "/downloads" },
      { label: "Status", kind: "route", to: "/status" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Login", kind: "route", to: "/login" },
      { label: "Register", kind: "route", to: "/register" },
      { label: "Dashboard", kind: "route", to: "/app" },
      { label: "Orders", kind: "route", to: "/orders" },
    ],
  },
  {
    title: "Help",
    items: [
      { label: "Support", kind: "route", to: "/support" },
      { label: "Tutorial Help", kind: "route", to: "/tutorial-help" },
      { label: "Redeem Code", kind: "route", to: "/redeem" },
      { label: "Referral", kind: "route", to: "/refer" },
    ],
  },
];

export const Footer = () => (
  <footer data-testid="site-footer" className="relative border-t border-white/[0.06] pt-16 pb-10 mt-16">
    <div className="max-w-[1400px] mx-auto px-6 md:px-12">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-10">
        <div className="col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="relative w-9 h-9">
              <div aria-hidden className="absolute -inset-2 rounded-full blur-xl opacity-55 bg-white/6 mix-blend-overlay" />
              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-black ring-1 ring-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.45)]">
                <img
                  src={BRAND_LOGO_URL}
                  alt="Vibe Access logo"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
            <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/65">
              Vibe<span className="font-light">Access</span>
            </span>
          </div>
          <p className="text-sm text-white/55 max-w-xs leading-relaxed">
            Premium creative access — connected to your Store, Orders, Downloads, and Support.
          </p>
        </div>

        {cols.map((col) => (
          <div key={col.title}>
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-4">{col.title}</div>
            <ul className="space-y-3">
              {col.items.map((it) => (
                <li key={it.label}>
                  {it.kind === "route" ? (
                    <Link to={it.to} className="text-sm text-white/70 hover:text-white transition-colors">
                      {it.label}
                    </Link>
                  ) : (
                    <a href={it.href} className="text-sm text-white/70 hover:text-white transition-colors">
                      {it.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-14 pt-8 border-t border-white/[0.06] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="text-xs text-white/40">© {new Date().getFullYear()} Vibe Access</div>
        <div className="flex flex-wrap gap-5 text-xs text-white/45">
          <Link to="/status" className="hover:text-white">Status</Link>
          <Link to="/support" className="hover:text-white">Support</Link>
        </div>
      </div>
    </div>
  </footer>
);

