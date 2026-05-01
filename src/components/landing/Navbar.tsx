import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const BRAND_LOGO_URL =
  "https://exavfdgevoflictkdfak.supabase.co/storage/v1/object/public/product-images/products/favicon.png";

const links = [
  { label: "Apps", href: "#apps" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

type Props = {
  signInHref: string;
  primaryCtaHref: string;
};

export const Navbar = ({ signInHref, primaryCtaHref }: Props) => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      data-testid="site-navbar"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 inset-x-0 z-50 transition-all ${
        scrolled ? "bg-black/60 backdrop-blur-2xl border-b border-white/[0.08]" : "bg-transparent"
      }`}
    >
      <nav className="max-w-[1400px] mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
        <a href="#top" data-testid="nav-brand-link" className="flex items-center gap-2.5 group">
          <div className="relative w-9 h-9 transform transition-transform group-hover:scale-[1.03]">
            <div
              aria-hidden
              className="absolute -inset-2 rounded-full blur-xl opacity-60 transition-opacity group-hover:opacity-85 bg-white/6 mix-blend-overlay"
            />
            <div className="relative w-9 h-9 rounded-full overflow-hidden bg-black ring-1 ring-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.45)]">
              <img
                src={BRAND_LOGO_URL}
                alt="Vibe Access logo"
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
              />
            </div>
          </div>
          <span className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/65">
            Vibe<span className="font-light">Access</span>
          </span>
        </a>

        <ul className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                data-testid={`nav-link-${l.label.toLowerCase()}`}
                className="text-sm text-white/65 hover:text-white transition-colors tracking-wide"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <Link to={signInHref} data-testid="nav-signin-link" className="hidden sm:inline-flex text-sm text-white/65 hover:text-white">
            Login
          </Link>
          <Link
            to="/register"
            data-testid="nav-register-button"
            className="relative inline-flex items-center gap-2 rounded-full px-5 py-2 text-[11px] uppercase tracking-[0.22em] font-medium overflow-hidden transition-colors"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset",
            }}
          >
            <span className="relative z-10 text-white">Register</span>
          </Link>
        </div>
      </nav>
    </motion.header>
  );
};

