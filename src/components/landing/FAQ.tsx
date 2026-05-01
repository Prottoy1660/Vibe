import React from "react";
import { motion } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { faqs } from "../../landing/adobeApps";

export const FAQ = () => {
  return (
    <section id="faq" data-testid="faq-section" className="relative py-24 md:py-32">
      <div className="max-w-[1100px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-16 lg:gap-20">
          <div className="md:col-span-5">
            <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">FAQ</span>
            <h2 className="mt-3 text-4xl sm:text-5xl leading-[1.05]">
              Answers,
              <br />
              <span className="text-white/45">if you need them.</span>
            </h2>
            <p className="mt-5 text-sm text-white/55 leading-relaxed max-w-sm">
              Still curious? Our team is online 24/7 to help you pick the right plan and get set up in minutes.
            </p>
          </div>

          <div className="md:col-span-7 md:pl-2 lg:pl-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="glass-panel rounded-2xl p-2"
            >
              <Accordion type="single" collapsible className="w-full" data-testid="faq-accordion">
                {faqs.map((f, i) => (
                  <AccordionItem
                    key={i}
                    value={`item-${i}`}
                    data-testid={`faq-item-${i}`}
                    className="border-white/10 px-4 last:border-b-0"
                  >
                    <AccordionTrigger className="text-left text-base text-white hover:no-underline py-5">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-white/60 leading-relaxed pb-5">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

