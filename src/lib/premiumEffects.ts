export function fireMiniConfetti(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '120';
  document.body.appendChild(host);

  const colors = ['#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#06b6d4'];
  const burstCount = 54;

  for (let i = 0; i < burstCount; i += 1) {
    const piece = document.createElement('span');
    const left = 20 + Math.random() * 60;
    const delayMs = Math.floor(Math.random() * 260);
    const durationMs = 900 + Math.floor(Math.random() * 700);
    const drift = -120 + Math.random() * 240;
    const rotate = -280 + Math.random() * 560;
    const size = 5 + Math.floor(Math.random() * 6);
    const hue = colors[Math.floor(Math.random() * colors.length)];

    piece.style.position = 'absolute';
    piece.style.left = `${left}%`;
    piece.style.top = '18%';
    piece.style.width = `${size}px`;
    piece.style.height = `${size + 4}px`;
    piece.style.borderRadius = '2px';
    piece.style.background = hue;
    piece.style.opacity = '0.95';
    piece.style.transform = 'translate3d(0,0,0) rotate(0deg)';
    piece.style.animation = `vibe-mini-confetti ${durationMs}ms cubic-bezier(.18,.78,.22,1) ${delayMs}ms forwards`;
    piece.style.setProperty('--drift-x', `${drift}px`);
    piece.style.setProperty('--spin', `${rotate}deg`);
    host.appendChild(piece);
  }

  if (!document.getElementById('vibe-mini-confetti-style')) {
    const style = document.createElement('style');
    style.id = 'vibe-mini-confetti-style';
    style.textContent = `
      @keyframes vibe-mini-confetti {
        0% {
          transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          opacity: 0.98;
        }
        100% {
          transform: translate3d(var(--drift-x), 78vh, 0) rotate(var(--spin)) scale(0.75);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  window.setTimeout(() => {
    host.remove();
  }, 2100);
}
