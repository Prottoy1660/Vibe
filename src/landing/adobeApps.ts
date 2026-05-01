import type { ComponentType } from "react";
import {
  CreativeCloudIcon,
  PhotoshopIcon,
  IllustratorIcon,
  PremiereIcon,
  AnimateIcon,
} from "../components/landing/BrandIcons";

export type LandingApp = {
  id: string;
  abbr: string;
  name: string;
  tagline: string;
  gradient: string;
  glow: string;
  category: string;
  Icon?: ComponentType<{ size?: number; className?: string }>;
};

export const BrandCloudIcon = CreativeCloudIcon;

export const adobeApps: LandingApp[] = [
  {
    id: "ps",
    abbr: "Ps",
    name: "Photoshop",
    tagline: "The world's best imaging & graphic design app",
    gradient: "linear-gradient(135deg, #001E36 0%, #31A8FF 100%)",
    glow: "rgba(49, 168, 255, 0.55)",
    category: "Photo",
    Icon: PhotoshopIcon,
  },
  {
    id: "ai",
    abbr: "Ai",
    name: "Illustrator",
    tagline: "The industry-standard vector graphics software",
    gradient: "linear-gradient(135deg, #330000 0%, #FF9A00 100%)",
    glow: "rgba(255, 154, 0, 0.55)",
    category: "Design",
    Icon: IllustratorIcon,
  },
  {
    id: "pr",
    abbr: "Pr",
    name: "Premiere Pro",
    tagline: "Industry-leading video editing software",
    gradient: "linear-gradient(135deg, #00005B 0%, #9999FF 100%)",
    glow: "rgba(153, 153, 255, 0.55)",
    category: "Video",
    Icon: PremiereIcon,
  },
  {
    id: "an",
    abbr: "An",
    name: "Animate",
    tagline: "Design interactive animations for games, TV and the web",
    gradient: "linear-gradient(135deg, #00005B 0%, #9999FF 100%)",
    glow: "rgba(153, 153, 255, 0.55)",
    category: "Motion",
    Icon: AnimateIcon,
  },
  {
    id: "ae",
    abbr: "Ae",
    name: "After Effects",
    tagline: "Industry-standard motion graphics and visual effects",
    gradient: "linear-gradient(135deg, #130324 0%, #9f77ff 100%)",
    glow: "rgba(159, 119, 255, 0.55)",
    category: "VFX",
  },
  {
    id: "lr",
    abbr: "Lr",
    name: "Lightroom",
    tagline: "Powerful photo editing and color grading workflow",
    gradient: "linear-gradient(135deg, #00192f 0%, #3aa7ff 100%)",
    glow: "rgba(58, 167, 255, 0.5)",
    category: "Photo",
  },
  {
    id: "xd",
    abbr: "Xd",
    name: "Adobe XD",
    tagline: "Design and prototype modern web and mobile experiences",
    gradient: "linear-gradient(135deg, #2b0128 0%, #ff61f6 100%)",
    glow: "rgba(255, 97, 246, 0.5)",
    category: "UX/UI",
  },
  {
    id: "id",
    abbr: "Id",
    name: "InDesign",
    tagline: "Professional layout for print, digital, and publishing",
    gradient: "linear-gradient(135deg, #2b0011 0%, #ff5f8f 100%)",
    glow: "rgba(255, 95, 143, 0.5)",
    category: "Publishing",
  },
];

export const pricingTiers = [
  {
    id: "photo",
    name: "Photography",
    price: "$9.99",
    period: "/mo",
    description: "Lightroom + Photoshop + 20GB cloud storage",
    apps: ["Photoshop", "Lightroom", "Lightroom Classic"],
    perks: [
      "20GB cloud storage",
      "Adobe Portfolio website",
      "Adobe Fonts library",
      "Lightroom mobile + desktop",
    ],
    cta: "Buy now",
    featured: false,
    accent: "#31C5F0",
  },
  {
    id: "single",
    name: "Single App",
    price: "$22.99",
    period: "/mo",
    description: "Pick any single Creative Cloud app",
    apps: ["Choose 1 app"],
    perks: [
      "100GB cloud storage",
      "Adobe Portfolio + Behance",
      "Adobe Fonts (full library)",
      "Spark + 1,000 Firefly credits",
    ],
    cta: "Buy now",
    featured: false,
    accent: "#9999FF",
  },
  {
    id: "all",
    name: "All Apps",
    price: "$59.99",
    period: "/mo",
    description: "Photoshop + Illustrator + Premiere Pro + Animate",
    apps: ["4 apps"],
    perks: [
      "100GB cloud storage",
      "Firefly generative AI credits",
      "Adobe Express premium",
      "Adobe Stock 10 free assets/mo",
      "Priority customer support",
    ],
    cta: "Get All Apps",
    featured: true,
    accent: "#E661FE",
  },
  {
    id: "biz",
    name: "Business",
    price: "$89.99",
    period: "/mo per license",
    description: "All four creative apps for teams with admin & licensing tools",
    apps: ["4 apps for teams"],
    perks: [
      "1TB cloud storage per user",
      "Admin Console & user management",
      "Centralized license deployment",
      "24/7 enterprise tech support",
      "Advanced security & SSO",
    ],
    cta: "Talk to sales",
    featured: false,
    accent: "#FF9A00",
  },
];

export const testimonials = [
  {
    name: "Sasha Lin",
    role: "Senior Motion Designer · Pentagram",
    quote:
      "Creative Cloud is the connective tissue between every project I touch. Round-tripping from Illustrator to After Effects feels like a single fluid surface.",
    image:
      "https://images.unsplash.com/photo-1770896689034-770c5d284163?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwzfHxjaW5lbWF0aWMlMjBwb3J0cmFpdCUyMG5lb24lMjBsaWdodGluZ3xlbnwwfHx8fDE3Nzc1MjkwNjB8MA&ixlib=rb-4.1.0&q=85",
  },
  {
    name: "Mateo Reyes",
    role: "Photographer · National Geographic contributor",
    quote:
      "Lightroom's AI masking saved me hundreds of hours this season. My catalog is in the cloud, my edits are everywhere — it just works.",
    image:
      "https://images.unsplash.com/photo-1770657749245-490c4cb233e5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwyfHxjaW5lbWF0aWMlMjBwb3J0cmFpdCUyMG5lb24lMjBsaWdodGluZ3xlbnwwfHx8fDE3Nzc1MjkwNjB8MA&ixlib=rb-4.1.0&q=85",
  },
  {
    name: "Iris Adeyemi",
    role: "Brand Director · Ogilvy",
    quote:
      "Firefly turned what used to be a week of mood-boarding into an afternoon. We pitch concepts that feel finished, not sketched.",
    image:
      "https://images.pexels.com/photos/10040315/pexels-photo-10040315.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  },
];

export const faqs = [
  {
    q: "What is Adobe Creative Cloud?",
    a: "Creative Cloud is a collection of 20+ desktop and mobile apps and services for photography, design, video, web, UX, generative AI and more. Membership includes the apps plus Adobe Fonts, cloud storage, Behance and Portfolio.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes. Annual plans paid monthly can be cancelled — within 14 days for a full refund, or after with a small early cancellation fee. Monthly plans cancel any time without a fee.",
  },
  {
    q: "How many devices can I install on?",
    a: "You can install Creative Cloud apps on up to two devices. You can be signed in on both, but the apps can only be actively used on one at a time.",
  },
  {
    q: "Do students and teachers get a discount?",
    a: "Yes. Eligible students and teachers save over 60% on All Apps for the first year — that's $19.99/month with full access to every Creative Cloud app.",
  },
  {
    q: "What's included with Adobe Firefly?",
    a: "Every plan includes Generative Credits for using Firefly-powered features like Generative Fill, Text to Image, and Text Effects across Photoshop, Illustrator, Express and Firefly web.",
  },
  {
    q: "Is my work safe in the cloud?",
    a: "Yes. Adobe encrypts all files in transit and at rest, with enterprise-grade security and version history. You retain full ownership of everything you create.",
  },
];

