import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getStoredLanguage, pickLocalized } from "../../lib/language";
import {
  isProductHiddenFromStore,
  parseHiddenProductIds,
  parseProductDescriptionBullets,
  PRODUCT_STORE_VISIBILITY_SETTINGS_KEY,
} from "../../lib/productStoreDisplay";

type Props = { primaryCtaHref: string };

type StoreProduct = {
  id: string;
  title: string;
  title_bn?: string | null;
  price: number;
  duration: string;
  description: string;
  list_price?: number | null;
  is_personal?: boolean;
  is_active?: boolean;
};

export const Pricing = ({ primaryCtaHref }: Props) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiddenProductIds, setHiddenProductIds] = useState<Set<string>>(new Set());
  const language = getStoredLanguage() || "en";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [{ data, error }, visibilityRes] = await Promise.all([
          supabase.from("products").select("*").eq("is_active", true),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", PRODUCT_STORE_VISIBILITY_SETTINGS_KEY)
            .maybeSingle(),
        ]);
        if (error) throw error;
        if (visibilityRes.error) throw visibilityRes.error;
        const rows = (data || []) as StoreProduct[];
        setHiddenProductIds(new Set(parseHiddenProductIds(visibilityRes.data?.value)));
        const filtered = rows.filter((p) => !p.is_personal && !isProductHiddenFromStore(p.id, parseHiddenProductIds(visibilityRes.data?.value)));
        const sorted = [...filtered].sort((a, b) => Number(a.price) - Number(b.price));
        if (!cancelled) setProducts(sorted);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleProducts = useMemo(
    () => products.filter((product) => !isProductHiddenFromStore(product.id, hiddenProductIds)),
    [hiddenProductIds, products],
  );

  return (
    <section id="pricing" data-testid="pricing-section" className="relative py-24 md:py-32">
      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 top-20 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full opacity-30 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(230,97,254,0.35) 0%, rgba(0,200,255,0.15) 40%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[11px] uppercase tracking-[0.3em] text-white/45">Pricing</span>
          <h2 className="mt-3 text-4xl sm:text-5xl lg:text-6xl leading-[1.05]">
            Choose the plan
            <br />
            <span className="text-white/45">that fits your craft.</span>
          </h2>

          <div className="mt-8 inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] p-1">
            <span className="rounded-full bg-white px-5 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-black">
              Monthly
            </span>
          </div>
          <p className="mt-4 text-sm text-white/50">Plans are synced directly from your Store packages.</p>
        </div>

        {loading ? (
          <div className="mt-10 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading plans...
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-5">
            {visibleProducts.map((product, i) => (
              <div key={product.id} className="w-full max-w-[340px]">
                <PricingCard
                  product={product}
                  index={i}
                  primaryCtaHref={primaryCtaHref}
                  featured={i === Math.min(1, visibleProducts.length - 1)}
                  language={language}
                />
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-white/40">
          Live pricing synced from your Store section. Any package updates there appear here automatically.
        </p>
      </div>
    </section>
  );
};

const PricingCard = ({
  product,
  index,
  primaryCtaHref,
  featured,
  language,
}: {
  product: StoreProduct;
  index: number;
  primaryCtaHref: string;
  featured: boolean;
  language: "bn" | "en";
}) => {
  const perks = parseProductDescriptionBullets(product.description).slice(0, 5);
  const priceValue = Number(product.price || 0);
  const localizedName = pickLocalized(product.title, product.title_bn ?? undefined, language);

  const cardClass = featured ? "gradient-border p-[1px]" : "glass-panel rounded-2xl";

  return (
    <motion.div
      data-testid={`pricing-card-${product.id}`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: index * 0.06 }}
      className={`relative ${cardClass}`}
    >
      <div className={`relative h-full rounded-2xl p-8 md:p-10 flex flex-col ${featured ? "bg-[#0A0A0A]" : ""}`}>
        {featured && (
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.24em] font-medium"
            style={{
              background: "linear-gradient(135deg, #FF0080 0%, #FFB400 50%, #00C2FF 100%)",
              color: "#0a0a0a",
            }}
          >
            <Sparkles size={11} /> Most popular
          </div>
        )}

        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" style={{ boxShadow: "0 0 12px rgba(139,92,246,0.9)" }} />
            <h3 className="text-xl text-white" style={{ fontFamily: "Clash Display" }}>
              {localizedName}
            </h3>
          </div>
          <p className="mt-3 text-sm text-white/55 min-h-[3rem]">{product.description.split("\n")[0] || "Store package"}</p>
        </div>

        <div className="mt-7 mb-7">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl tracking-tight" style={{ fontFamily: "Clash Display", fontWeight: 600 }}>
              ৳{Number.isFinite(priceValue) ? priceValue.toLocaleString() : "0"}
            </span>
            <span className="text-sm text-white/45">{product.duration || "/mo"}</span>
          </div>
        </div>

        <ul className="space-y-3 mb-10">
          {(perks.length ? perks : ["Package benefits available from Store"]).map((perk) => (
            <li key={perk} className="flex items-start gap-3 text-sm text-white/75">
              <span
                className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.45)" }}
              >
                <Check size={10} style={{ color: "#a78bfa" }} />
              </span>
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        <Link
          to={primaryCtaHref}
          data-testid={`pricing-cta-${product.id}`}
          className={`mt-auto group relative inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-[11px] uppercase tracking-[0.24em] transition-all overflow-hidden ${
            featured ? "bg-white text-black hover:scale-[1.02]" : "border border-white/15 text-white/85 hover:border-white/30 hover:text-white"
          }`}
        >
          <span className="relative z-10">{featured ? "Get started" : "Choose plan"}</span>
          {featured && (
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"
              style={{ background: "linear-gradient(120deg, transparent 0%, rgba(0,0,0,0.15) 50%, transparent 100%)" }}
            />
          )}
        </Link>
      </div>
    </motion.div>
  );
};
