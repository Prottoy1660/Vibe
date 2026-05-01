import React, { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { LandingApp } from "../../landing/adobeApps";

type Props = {
  app: LandingApp;
  size?: number;
  showLabel?: boolean;
  floatDelay?: number;
  className?: string;
};

export const AdobeAppCube = ({
  app,
  size = 120,
  showLabel = false,
  floatDelay = 0,
  className = "",
}: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [14, -14]), {
    stiffness: 200,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-16, 16]), {
    stiffness: 200,
    damping: 18,
  });

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(px);
    y.set(py);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const Icon = app.Icon;

  return (
    <motion.div
      ref={ref}
      data-testid={`adobe-app-cube-${app.id}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 900,
        width: size,
        height: size,
      }}
      animate={{ y: [0, -12, 0] }}
      transition={{
        duration: 6 + floatDelay * 0.4,
        delay: floatDelay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={`relative shrink-0 ${className}`}
    >
      <div
        className="absolute -inset-2 rounded-[28%] blur-2xl opacity-60 pointer-events-none"
        style={{ background: app.glow }}
      />

      {Icon ? (
        <div
          className="relative w-full h-full rounded-[22%] overflow-hidden"
          style={{
            boxShadow: `0 18px 50px ${app.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          <Icon size={size} className="w-full h-full" />
          <div
            className="absolute inset-x-0 top-0 h-1/2 rounded-t-[22%] pointer-events-none"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.10), transparent)",
            }}
          />
        </div>
      ) : (
        <div
          className="relative w-full h-full rounded-[22%] flex items-center justify-center overflow-hidden"
          style={{
            background: app.gradient,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 18px 50px ${app.glow}`,
          }}
        >
          <div className="absolute inset-0 rounded-[22%] border border-white/10" />
          <div
            className="absolute -top-1/3 -left-1/3 w-2/3 h-2/3 rounded-full opacity-30"
            style={{
              background: "rgba(255,255,255,0.6)",
              filter: "blur(20px)",
            }}
          />
          <span
            style={{
              fontFamily: "Clash Display, sans-serif",
              fontSize: size * 0.42,
              lineHeight: 1,
            }}
            className="relative font-bold text-white tracking-tight"
          >
            {app.abbr}
          </span>
        </div>
      )}

      {showLabel && (
        <div className="absolute -bottom-7 left-0 right-0 text-center text-[11px] uppercase tracking-[0.18em] text-white/60">
          {app.name}
        </div>
      )}
    </motion.div>
  );
};

