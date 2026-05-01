import React from "react";
import { motion } from "framer-motion";
import { AdobeAppCube } from "./AdobeAppCube";
import { adobeApps } from "../../landing/adobeApps";

export const AppShowcase = () => {
  const featuredApps = adobeApps.filter((app) => Boolean(app.Icon)).slice(0, 4);

  return (
    <section id="apps" data-testid="apps-section" className="relative py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-10 h-52 w-52 rounded-full bg-primary/20 blur-[90px]" />
        <div className="absolute right-[6%] bottom-8 h-56 w-56 rounded-full bg-secondary/10 blur-[95px]" />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">Signature apps</span>
            <h2 className="mt-3 text-4xl sm:text-5xl lg:text-6xl leading-[1.05]">
              Four core tools.
              <span className="text-white/45"> One premium ecosystem.</span>
            </h2>
          </div>
          <p className="text-base text-white/55 max-w-md leading-relaxed">
            Only your approved icon set is shown here. Cleaner visuals, better hierarchy, and perfect consistency with the rest of the landing design.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {featuredApps.map((app, i) => (
            <motion.div
              key={app.id}
              data-testid={`app-card-${app.id}`}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: "easeOut" }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-6 hover:border-white/20 hover:-translate-y-1 transition-all"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  background: `radial-gradient(circle at 20% 8%, ${app.glow}, transparent 58%)`,
                }}
              />
              <div
                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background: `radial-gradient(circle at 80% 100%, ${app.glow}, transparent 60%)`,
                }}
              />

              <div className="relative flex items-start justify-between mb-7">
                <AdobeAppCube app={app} size={62} floatDelay={i * 0.16} />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">{app.category}</span>
              </div>

              <div className="relative">
                <h3 className="text-[22px] leading-tight text-white" style={{ fontFamily: "Clash Display" }}>
                  {app.name}
                </h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{app.tagline}</p>
              </div>

              <div className="relative mt-5 h-px w-full bg-gradient-to-r from-white/20 via-white/5 to-transparent" />
              <div className="relative mt-4 text-[11px] uppercase tracking-[0.18em] text-white/50">Included in Vibe Access</div>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/60">
          Curated icon lineup: Photoshop, Illustrator, Premiere Pro, and Animate.
        </div>
      </div>
    </section>
  );
};

