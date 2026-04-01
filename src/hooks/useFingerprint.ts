import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

// Parse user-agent string into browser name + version
function parseBrowser(ua: string): { name: string; version: string } {
  const browsers = [
    { name: 'Edge', pattern: /Edg\/([0-9.]+)/ },
    { name: 'Chrome', pattern: /Chrome\/([0-9.]+)/ },
    { name: 'Firefox', pattern: /Firefox\/([0-9.]+)/ },
    { name: 'Safari', pattern: /Version\/([0-9.]+).*Safari/ },
    { name: 'Opera', pattern: /OPR\/([0-9.]+)/ },
  ];
  for (const b of browsers) {
    const m = ua.match(b.pattern);
    if (m) return { name: b.name, version: m[1] };
  }
  return { name: 'Unknown', version: '' };
}

// Parse OS from user-agent
function parseOS(ua: string, platform: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6.1/.test(ua)) return 'Windows 7';
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X ([0-9_]+)/);
    return `macOS ${m ? m[1].replace(/_/g, '.') : ''}`;
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android ([0-9.]+)/);
    return `Android ${m ? m[1] : ''}`;
  }
  if (/iPhone|iPad/.test(ua)) {
    const m = ua.match(/OS ([0-9_]+)/);
    return `iOS ${m ? m[1].replace(/_/g, '.') : ''}`;
  }
  if (/Linux/.test(ua)) return 'Linux';
  return platform || 'Unknown';
}

// Compute canvas fingerprint hash
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Fingerprint ABC 🔒', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Canvas Fingerprint', 4, 35);
    const data = canvas.toDataURL();
    // Simple hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  } catch {
    return '';
  }
}

// Get GPU info via WebGL
function getGPUInfo(): { renderer: string; vendor: string; version: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) return { renderer: 'Unavailable', vendor: 'Unavailable', version: '' };
    const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Unavailable';
    const vendor = ext ? (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'Unavailable';
    const version = (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VERSION) || '';
    return { renderer, vendor, version };
  } catch {
    return { renderer: 'Unavailable', vendor: 'Unavailable', version: '' };
  }
}

export function useFingerprint(user: User | null) {
  // Track WHICH user we last captured — not just 'did we fire'
  // This ensures every distinct user (admin, customer, etc.) gets captured
  // when they log into this browser session.
  const capturedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Already captured data for this exact user in this session
    if (capturedUserId.current === user.id) return;
    capturedUserId.current = user.id;

    const collect = async () => {
      try {
        const ua = navigator.userAgent;
        const browser = parseBrowser(ua);
        const os = parseOS(ua, navigator.platform);
        const gpu = getGPUInfo();
        const canvasFingerprint = getCanvasFingerprint();

        // Screen info
        const screenWidth = screen.width;
        const screenHeight = screen.height;
        const colorDepth = screen.colorDepth;
        const pixelRatio = window.devicePixelRatio;

        // Device info
        const cpuCores = navigator.hardwareConcurrency || null;
        const deviceMemory = (navigator as any).deviceMemory || null;
        const touchSupport = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const cookiesEnabled = navigator.cookieEnabled;
        const doNotTrack = navigator.doNotTrack || '';
        const language = navigator.language;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const darkMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? null;

        // Connection info
        const conn = (navigator as any).connection;
        const connectionType = conn?.effectiveType || conn?.type || null;
        const downlink = conn?.downlink || null;
        const rtt = conn?.rtt || null;

        // Battery info (non-blocking)
        let batteryLevel: number | null = null;
        let batteryCharging: boolean | null = null;
        try {
          if ('getBattery' in navigator) {
            const battery = await (navigator as any).getBattery();
            batteryLevel = Math.round(battery.level * 100);
            batteryCharging = battery.charging;
          }
        } catch { /* battery api not available */ }

        // IP / Geo via free public API
        let ipAddress = '';
        let country = '';
        let city = '';
        let region = '';
        let isp = '';
        let latitude: number | null = null;
        let longitude: number | null = null;
        try {
          // Use AbortController for wider browser compatibility
          const geoController = new AbortController();
          const geoTimeout = setTimeout(() => geoController.abort(), 5000);
          const geoRes = await fetch('https://ipapi.co/json/', { signal: geoController.signal });
          clearTimeout(geoTimeout);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            ipAddress = geo.ip || '';
            country = geo.country_name || '';
            city = geo.city || '';
            region = geo.region || '';
            isp = geo.org || '';
            latitude = geo.latitude || null;
            longitude = geo.longitude || null;
          }
        } catch { /* geo api failed - proceed without geo data */ }

        const sessionData = {
          user_id: user.id,
          ip_address: ipAddress,
          country,
          city,
          region,
          isp,
          latitude,
          longitude,
          browser_name: browser.name,
          browser_version: browser.version,
          user_agent: ua,
          language,
          timezone,
          cookies_enabled: cookiesEnabled,
          do_not_track: doNotTrack,
          os,
          platform: navigator.platform,
          cpu_cores: cpuCores,
          device_memory: deviceMemory,
          touch_support: touchSupport,
          screen_width: screenWidth,
          screen_height: screenHeight,
          color_depth: colorDepth,
          pixel_ratio: pixelRatio,
          gpu_renderer: gpu.renderer,
          gpu_vendor: gpu.vendor,
          webgl_version: gpu.version,
          connection_type: connectionType,
          downlink,
          rtt,
          battery_level: batteryLevel,
          battery_charging: batteryCharging,
          dark_mode: darkMode,
          page_url: window.location.href,
          referrer: document.referrer || null,
          canvas_fingerprint: canvasFingerprint,
        };

        const { error: insertError } = await supabase.from('user_sessions').insert(sessionData);
        if (insertError) {
          // Log clearly so admin can diagnose
          console.error('[Intelligence] Insert failed:', insertError.message, insertError.code);
        }
      } catch (err) {
        console.error('[Intelligence] Collection error:', err);
      }
    };

    // Small delay so it doesn't compete with page rendering
    const timer = setTimeout(collect, 2000);
    return () => clearTimeout(timer);
  }, [user?.id]);
}
