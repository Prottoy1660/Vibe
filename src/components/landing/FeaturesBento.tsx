import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CloudUpload, Globe, GraduationCap, Layers, Sparkles, Type } from "lucide-react";

export const FeaturesBento = () => {
  return (
    <section id="features" data-testid="features-section" className="relative py-24 md:py-32">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="max-w-3xl mb-16">
          <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">What's inside</span>
          <h2 className="mt-3 text-4xl sm:text-5xl lg:text-6xl leading-[1.05]">
            More than apps. <span className="text-white/45">An entire creative ecosystem.</span>
          </h2>
        </div>

        <div className="grid grid-cols-12 gap-5 auto-rows-[minmax(180px,auto)]">
          <FeatureCard
            data-testid="feature-firefly-large"
            className="col-span-12 lg:col-span-7 lg:row-span-2"
            accent="#FF61F6"
            image="https://images.unsplash.com/photo-1772053971355-08a5cf6e322a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwzfHx2aWJyYW50JTIwM0QlMjBhYnN0cmFjdCUyMGFydHxlbnwwfHx8fDE3Nzc1MjkwNjB8MA&ixlib=rb-4.1.0&q=85"
          >
            <div className="relative z-10 max-w-md">
              <span className="inline-block text-[10px] uppercase tracking-[0.3em] text-white/70 mb-4">Adobe Firefly</span>
              <h3 className="text-3xl lg:text-4xl leading-tight" style={{ fontFamily: "Clash Display" }}>
                Generative AI made
                <br /> for creators.
              </h3>
              <p className="mt-4 text-sm text-white/70 leading-relaxed">
                Generate images, vectors, text effects and 3D from a single prompt — built to be commercially safe and embedded directly inside Photoshop,
                Illustrator and Express.
              </p>
              <a
                href="#pricing"
                className="mt-6 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/80 hover:text-white"
                data-testid="feature-firefly-link"
              >
                Try Firefly <ArrowUpRight size={14} />
              </a>
            </div>
          </FeatureCard>

          <FeatureCard className="col-span-12 sm:col-span-6 lg:col-span-5" accent="#00C8FF" data-testid="feature-cloud-sync">
            <FeatureContent
              icon={<CloudUpload size={20} />}
              title="Cloud Sync"
              copy="100GB+ of secure storage keeps every file in sync across desktop, web and mobile."
              accent="#00C8FF"
            />
          </FeatureCard>

          <FeatureCard className="col-span-12 sm:col-span-6 lg:col-span-5" accent="#9999FF" data-testid="feature-fonts">
            <FeatureContent icon={<Type size={20} />} title="30,000 Adobe Fonts" copy="Activate licensed fonts from a vast library across desktop and web instantly." accent="#9999FF" />
          </FeatureCard>

          <FeatureCard className="col-span-12 sm:col-span-6 lg:col-span-4" accent="#FF9A00" data-testid="feature-stock">
            <FeatureContent icon={<Layers size={20} />} title="200M+ Stock Assets" copy="Royalty-free images, video, 3D, audio and templates inside every app." accent="#FF9A00" />
          </FeatureCard>

          <FeatureCard className="col-span-12 sm:col-span-6 lg:col-span-4" accent="#E661FE" data-testid="feature-portfolio">
            <FeatureContent icon={<Globe size={20} />} title="Behance & Portfolio" copy="Show your work to 50M+ creatives or build a stunning portfolio site in minutes." accent="#E661FE" />
          </FeatureCard>

          <FeatureCard
            className="col-span-12 lg:col-span-4"
            accent="#31C5F0"
            data-testid="feature-tutorials"
            image="https://images.pexels.com/photos/33866372/pexels-photo-33866372.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
          >
            <FeatureContent icon={<GraduationCap size={20} />} title="Live tutorials" copy="Thousands of tutorials and live workshops from world-class creators — free." accent="#31C5F0" />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
};

const FeatureCard = ({
  children,
  className = "",
  accent = "#00C8FF",
  image,
  "data-testid": dataTestId,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
  image?: string;
  "data-testid"?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.6, ease: "easeOut" }}
    className={`relative overflow-hidden rounded-2xl glass-panel p-8 md:p-10 hover:border-white/20 transition-colors group ${className}`}
    data-testid={dataTestId}
  >
    {image && (
      <>
        <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-60 group-hover:scale-105 transition-all duration-700" loading="lazy" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(3,3,3,0.55) 0%, rgba(3,3,3,0.85) 100%)" }} />
      </>
    )}
    <div aria-hidden className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-30 group-hover:opacity-60 transition-opacity" style={{ background: accent, filter: "blur(80px)" }} />
    <div className="relative z-10 h-full flex flex-col justify-between">{children}</div>
  </motion.div>
);

const FeatureContent = ({ icon, title, copy, accent }: { icon: React.ReactNode; title: string; copy: string; accent: string }) => (
  <div className="flex flex-col h-full justify-between gap-8">
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: accent,
        boxShadow: `0 0 24px ${accent}33`,
      }}
    >
      {icon}
    </div>
    <div>
      <h3 className="text-xl text-white" style={{ fontFamily: "Clash Display" }}>
        {title}
      </h3>
      <p className="mt-2 text-sm text-white/60 leading-relaxed">{copy}</p>
    </div>
  </div>
);

