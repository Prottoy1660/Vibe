import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { AnimateIcon, CreativeCloudIcon, IllustratorIcon, PhotoshopIcon, PremiereIcon } from "./BrandIcons";

type Props = {
  primaryCtaHref: string;
};

export const Hero = ({ primaryCtaHref }: Props) => {
  const WORDS = useMemo(() => ["Creators", "Studios", "Agencies", "Dreamers"], []);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setWordIndex((p) => (p + 1) % WORDS.length), 2400);
    return () => window.clearInterval(t);
  }, [WORDS.length]);

  return (
    <section id="top" data-testid="hero-section" className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[#030303]" />
        <motion.div
          className="absolute -top-20 left-[-8rem] h-[22rem] w-[22rem] rounded-full bg-primary/25 blur-[110px]"
          animate={{ x: [0, 24, 0], y: [0, -16, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-4 right-[-8rem] h-[20rem] w-[20rem] rounded-full bg-secondary/14 blur-[105px]"
          animate={{ x: [0, -24, 0], y: [0, 18, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-24 left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-primary/16 blur-[120px]"
          animate={{ x: [0, 26, 0], y: [0, 14, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto max-w-[1260px] px-5 sm:px-6 lg:px-10 pt-24 sm:pt-28 lg:pt-32 pb-14 sm:pb-20">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] uppercase tracking-[0.22em] text-white/70"
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span>Vibe Access • Signature creative suite</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.05, ease: "easeOut" }}
              className="mt-5 text-[36px] leading-[1.06] tracking-tight sm:text-5xl lg:text-[62px]"
              style={{ fontFamily: "Clash Display" }}
            >
              Premium creative access,
              <span className="block">designed to feel iconic.</span>
              <span className="block mt-3 text-gradient-primary">
                Built for{" "}
                <AnimatePresence mode="wait">
                  <motion.span
                    key={WORDS[wordIndex]}
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="inline-block min-w-[8ch]"
                  >
                    {WORDS[wordIndex]}
                  </motion.span>
                </AnimatePresence>
                .
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-5 text-base leading-relaxed text-white/70 sm:text-lg max-w-xl"
            >
              A fully premium hero section with refined motion, strong visual hierarchy, and perfect responsiveness across phone, tablet and desktop.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24 }}
              className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center"
            >
              <Link
                to={primaryCtaHref}
                data-testid="hero-cta-primary"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-6 py-4 text-sm font-bold text-white shadow-[0_18px_60px_-30px_rgba(139,92,246,0.75)] active:scale-[0.99] transition-[transform,filter]"
              >
                Start with Vibe Access
                <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>

              <a
                href="#pricing"
                data-testid="hero-cta-secondary"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-6 py-4 text-sm font-semibold text-white/85 hover:bg-white/[0.07] transition-colors"
              >
                Explore plans
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          </div>

          <div className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.12 }}
              className="relative h-[420px] sm:h-[500px] lg:h-[510px] overflow-hidden"
            >
              <div aria-hidden className="absolute inset-0 pointer-events-none">
                <div className="absolute -left-16 -top-10 h-56 w-56 rounded-full bg-blue-500/18 blur-[90px]" />
                <div className="absolute -right-16 -top-8 h-56 w-56 rounded-full bg-fuchsia-500/16 blur-[95px]" />
                <div className="absolute left-1/2 bottom-[-3.5rem] h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/22 blur-[100px]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(3,3,3,0.65)_100%)]" />
              </div>

              <div className="absolute inset-0 z-10">
                <FloatingIcon className="left-[14%] top-[22%]" delay={0} glow="rgba(49,168,255,.45)">
                  <PhotoshopIcon size={58} />
                </FloatingIcon>
                <FloatingIcon className="right-[14%] top-[24%]" delay={0.2} glow="rgba(255,154,0,.45)">
                  <IllustratorIcon size={58} />
                </FloatingIcon>
                <FloatingIcon className="left-[20%] bottom-[15%]" delay={0.35} glow="rgba(153,153,255,.45)">
                  <PremiereIcon size={58} />
                </FloatingIcon>
                <FloatingIcon className="right-[20%] bottom-[14%]" delay={0.5} glow="rgba(153,153,255,.45)">
                  <AnimateIcon size={58} />
                </FloatingIcon>
              </div>

              <div className="absolute inset-0 flex items-center justify-center z-20">
                <motion.div
                  animate={{ y: [0, -6, 0], scale: [1, 1.015, 1] }}
                  transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                  className="relative w-[108px] h-[108px] sm:w-[126px] sm:h-[126px] rounded-[28px] border border-white/20 bg-black/40 backdrop-blur-md flex items-center justify-center shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_90px_-45px_rgba(139,92,246,0.8)]"
                >
                  <div className="absolute -inset-7 rounded-full bg-primary/35 blur-2xl" />
                  <CreativeCloudIcon size={80} className="relative" />
                </motion.div>
              </div>

              <div className="absolute inset-0 z-0 flex items-center justify-center">
                <div className="h-[210px] w-[210px] rounded-full border border-white/10" />
              </div>
              <div className="absolute inset-0 z-0 flex items-center justify-center">
                <div className="h-[270px] w-[270px] rounded-full border border-white/10" />
              </div>
              <div className="absolute inset-0 z-0 flex items-center justify-center">
                <div className="h-[330px] w-[330px] rounded-full border border-white/10" />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

const FloatingIcon = ({
  children,
  className,
  delay,
  glow,
}: {
  children: React.ReactNode;
  className: string;
  delay: number;
  glow: string;
}) => (
  <motion.div
    className={`absolute ${className}`}
    animate={{ y: [0, -8, 0], x: [0, 3, 0] }}
    transition={{ duration: 4.6, delay, repeat: Infinity, ease: "easeInOut" }}
  >
    <div
      className="relative h-[86px] w-[86px] sm:h-[94px] sm:w-[94px] rounded-[20px] border border-white/15 bg-black/45 p-3 flex items-center justify-center backdrop-blur-sm"
      style={{ boxShadow: `0 0 42px -18px ${glow}` }}
    >
      {children}
    </div>
  </motion.div>
);

