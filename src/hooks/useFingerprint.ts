import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { postJsonWithFallback } from '../lib/apiClient';

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

async function parseOSFromUAData(): Promise<string | null> {
  try {
    const uad = (navigator as any).userAgentData;
    if (!uad?.getHighEntropyValues) return null;

    // Some browsers may reject this promise; fall back safely.
    const values = await uad.getHighEntropyValues(['platform', 'platformVersion']);
    const platform = (values?.platform || '').toString();
    const platformVersion = (values?.platformVersion || '').toString();

    if (!platformVersion) return null;
    if (platform.toLowerCase().includes('android')) return `Android ${platformVersion}`;
    if (platform.toLowerCase().includes('ios')) return `iOS ${platformVersion}`;

    return platformVersion;
  } catch {
    return null;
  }
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
        // Skip admins — only capture regular customer data
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        if (userData?.role === 'admin') return;

        const ua = navigator.userAgent;
        const browser = parseBrowser(ua);
        // Prefer client hints for OS version when available; fall back to UA parsing.
        const osFromHints = await parseOSFromUAData();
        const os = osFromHints || parseOS(ua, navigator.platform);
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
        // IMPORTANT: On many mobile browsers `effectiveType` can be misleading on WiFi
        // (e.g. reporting "4g" even when `type` is "wifi"). Prefer `type` when available.
        const connectionKind = conn?.type || null; // e.g. "wifi" | "cellular" | "none"
        const effectiveConnectionType = conn?.effectiveType || null; // e.g. "4g" | "3g" | "2g"
        let connectionType: string | null = null;
        if (connectionKind === 'wifi') connectionType = 'wifi';
        else if (connectionKind === 'cellular') connectionType = effectiveConnectionType || 'cellular';
        else connectionType = effectiveConnectionType || connectionKind || null;
        const downlink = conn?.downlink || null;
        const rtt = conn?.rtt || null;

        // Basic sanity-check to avoid obviously wrong values (mobile browsers sometimes report spikes).
        // We intentionally keep this lightweight to not reject real-world high-speed values.
        const safeDownlink =
          typeof downlink === 'number' ? (downlink >= 0 && downlink <= 5000 ? downlink : null) : downlink;
        const safeRtt =
          typeof rtt === 'number' ? (rtt >= 0 && rtt <= 100000 ? rtt : null) : rtt;

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

        // IP / Geo via server endpoint (more reliable than client-side public geo APIs)
        let ipAddress = '';
        let country = '';
        let city = '';
        let region = '';
        let isp = '';
        let latitude: number | null = null;
        let longitude: number | null = null;
        try {
          const serverGeo = await postJsonWithFallback('/api/telemetry/geo-context', {});
          ipAddress = serverGeo?.ip_address || '';
          country = serverGeo?.country || '';
          city = serverGeo?.city || '';
          region = serverGeo?.region || '';
          isp = serverGeo?.isp || '';
          latitude = typeof serverGeo?.latitude === 'number' ? serverGeo.latitude : null;
          longitude = typeof serverGeo?.longitude === 'number' ? serverGeo.longitude : null;
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
          downlink: safeDownlink,
          rtt: safeRtt,
          battery_level: batteryLevel,
          battery_charging: batteryCharging,
          dark_mode: darkMode,
          page_url: window.location.href,
          referrer: document.referrer || null,
          canvas_fingerprint: canvasFingerprint,
        };

        // Deduplication: avoid spamming logs, but never suppress session logging
        // when we cannot observe network context reliably (WiFi/4G switching case).
        if (canvasFingerprint) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

          const hasAnyNetworkContext = Boolean(ipAddress || connectionType);
          if (!hasAnyNetworkContext) {
            // No network context -> do not early-return; let this session be logged.
          } else {
          let query = supabase
            .from('user_sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('canvas_fingerprint', canvasFingerprint)
            .gte('created_at', sevenDaysAgo);

          // Make dedup network-aware for better accuracy in WiFi/4G switching scenarios.
          if (ipAddress) query = query.eq('ip_address', ipAddress);
          if (connectionType) query = query.eq('connection_type', connectionType);

          const { data: existingSession } = await query
            .limit(1)
            .single();

          if (existingSession) {
            // Same device, same user, recent session exists — nothing new to capture
            return;
          }
          }
        }

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
