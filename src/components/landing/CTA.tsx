import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

type Props = { primaryCtaHref: string };

export const CTA = ({ primaryCtaHref }: Props) => {
  return (
    <section data-testid="final-cta-section" className="relative overflow-hidden py-20 md:py-28">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[#050507]" />
        <div className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-[160px]" />
      </div>
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative p-2 md:p-4"
        >
          <div className="relative grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-12">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl leading-[1.05]" style={{ fontFamily: "Clash Display" }}>
                Ready to make
                <br />
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(135deg, #FF0080 0%, #FFB400 50%, #00C2FF 100%)" }}
                >
                  something incredible?
                </span>
              </h2>
              <p className="mt-5 max-w-lg text-base text-white/65 leading-relaxed">
                Get started in minutes. Full access. No commitment. Cancel anytime.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={primaryCtaHref} data-testid="final-cta-buy" className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-white text-black">
                  <span className="text-[11px] uppercase tracking-[0.24em] font-semibold" style={{ fontFamily: "Clash Display" }}>
                    Start now
                  </span>
                  <ArrowUpRight size={16} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
                <a
                  href="#pricing"
                  data-testid="final-cta-compare"
                  className="inline-flex items-center px-6 py-4 rounded-full border border-white/15 text-[11px] uppercase tracking-[0.24em] text-white/80 hover:border-white/30 hover:text-white transition-colors"
                >
                  Compare plans
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

