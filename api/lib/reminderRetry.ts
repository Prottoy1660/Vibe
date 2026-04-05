import type { ChannelSendResult } from './reminderOutbound.js';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** One retry after a short delay; skips are not retried. */
export async function sendChannelWithRetry(
  send: () => Promise<ChannelSendResult>,
  opts: { delayMs?: number } = {},
): Promise<ChannelSendResult> {
  const delayMs = opts.delayMs ?? 2200;
  const first = await send();
  if (first.skipped || first.ok) return first;
  await sleep(delayMs);
  return send();
}
