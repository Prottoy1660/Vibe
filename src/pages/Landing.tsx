import React from "react";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { useMaintenanceMode } from "../contexts/MaintenanceModeContext";
import { PublicMaintenancePage } from "./PublicMaintenancePage";
import { Navbar } from "../components/landing/Navbar";
import { Hero } from "../components/landing/Hero";
import { AppShowcase } from "../components/landing/AppShowcase";
import { FeaturesBento } from "../components/landing/FeaturesBento";
import { Pricing } from "../components/landing/Pricing";
import { Testimonials } from "../components/landing/Testimonials";
import { FAQ } from "../components/landing/FAQ";
import { CTA } from "../components/landing/CTA";
import { Footer } from "../components/landing/Footer";

const PageLoader = () => (
  <div className="min-h-[100dvh] bg-[#030303] flex items-center justify-center text-white">
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-7 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_20px_60px_-35px_rgba(255,255,255,0.25)] backdrop-blur-sm">
      <Loader2 className="h-8 w-8 animate-spin text-white/80 mx-auto" />
      <div className="mt-3 text-center text-sm text-white/70 font-medium">Loading landing…</div>
    </div>
  </div>
);

export const Landing = () => {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { platform: maintPlatform, ready: maintReady } = useMaintenanceMode();

  const primaryCtaHref = user ? (isAdmin ? "/admin" : "/store") : "/login";
  const signInHref = user ? (isAdmin ? "/admin" : "/app") : "/login";

  if (user && !authLoading) return <Navigate to="/app" replace />;

  const effectiveLoading = authLoading || !maintReady;
  if (effectiveLoading) return <PageLoader />;

  if (maintPlatform.lock_public_site) {
    return <PublicMaintenancePage message={maintPlatform.message} />;
  }

  return (
    <MotionConfig reducedMotion="never">
      <main data-testid="landing-page" className="relative bg-[#030303] text-white overflow-x-hidden">
        <Navbar signInHref={signInHref} primaryCtaHref={primaryCtaHref} />
        <Hero primaryCtaHref={primaryCtaHref} />
        <AppShowcase />
        <FeaturesBento />
        <Pricing primaryCtaHref={primaryCtaHref} />
        <Testimonials />
        <FAQ />
        <CTA primaryCtaHref={primaryCtaHref} />
        <Footer />
      </main>
    </MotionConfig>
  );
};

