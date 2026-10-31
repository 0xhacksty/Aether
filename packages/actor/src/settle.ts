import { createHash } from 'node:crypto';
import type { CDPSession } from '@aether/cdp';

export class DOMSettleDetector {
  public static async waitForSettle(
    session: CDPSession,
    intervalMs = 150,
    timeoutMs = 2500,
  ): Promise<void> {
    const startTime = Date.now();
    let previousHash: string | null = null;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const axResult = await session.send<{
          nodes: Array<{ role?: { value?: unknown }; backendDOMNodeId?: number }>;
        }>('Accessibility.getFullAXTree', { depth: 4 });

        const rawSignature = (axResult.nodes || [])
          .map((n: { role?: { value?: unknown }; backendDOMNodeId?: number }) => `${n.role?.value}:${n.backendDOMNodeId}`)
          .join('|');

        const currentHash = createHash('sha1').update(rawSignature).digest('hex');

        if (previousHash !== null && currentHash === previousHash) {
          // Two consecutive samples match: DOM is settled
          return;
        }

        previousHash = currentHash;
      } catch {
        // AXTree might fail mid-navigation; keep waiting
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
