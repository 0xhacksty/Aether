import type { CDPSession, FrameManager } from '@aether/cdp';
import type { Perceiver } from '@aether/perceiver';
import { ActParamsSchema, type ActParams, type Delta, type OutlineSnapshot } from '@aether/shared';
import { InputDispatcher } from './input.js';
import { NodeResolver } from './resolver.js';
import { DOMSettleDetector } from './settle.js';

export interface ActionResult {
  success: boolean;
  executedCount: number;
  delta: Delta;
  snapshot: OutlineSnapshot;
  error?: string;
}

export class Actor {
  private resolver: NodeResolver;
  private mainSession: CDPSession;
  private frameManager: FrameManager;
  private perceiver: Perceiver;

  constructor(
    mainSession: CDPSession,
    frameManager: FrameManager,
    perceiver: Perceiver,
  ) {
    this.mainSession = mainSession;
    this.frameManager = frameManager;
    this.perceiver = perceiver;
    this.resolver = new NodeResolver(perceiver.registry, frameManager, mainSession);
  }

  public async execute(
    rawParams: unknown,
    previousSnapshot?: OutlineSnapshot,
    stepNumber = 1,
  ): Promise<ActionResult> {
    const params: ActParams = ActParamsSchema.parse(rawParams);
    let executedCount = 0;

    for (const action of params.actions) {
      try {
        const target = await this.resolver.resolve(action.ref);

        switch (action.op) {
          case 'click':
            await InputDispatcher.click(target.session, target.backendDOMNodeId);
            break;
          case 'type':
            await InputDispatcher.type(
              target.session,
              target.backendDOMNodeId,
              action.value || '',
            );
            break;
          case 'select':
            await InputDispatcher.select(
              target.session,
              target.backendDOMNodeId,
              action.value || '',
            );
            break;
          case 'hover':
            await InputDispatcher.hover(target.session, target.backendDOMNodeId);
            break;
          case 'key':
            await InputDispatcher.key(target.session, action.value || 'Enter');
            break;
          case 'scroll': {
            const dy = Number.parseInt(action.value || '300', 10);
            await InputDispatcher.scroll(target.session, 0, Number.isNaN(dy) ? 300 : dy);
            break;
          }
        }

        executedCount++;
        // Small interval between batched actions
        await new Promise((r) => setTimeout(r, 60));
      } catch (err) {
        // Stop batch execution on first failure
        const errorMsg = err instanceof Error ? err.message : String(err);
        await DOMSettleDetector.waitForSettle(this.mainSession);
        const snapshot = await this.perceiver.capture(this.mainSession, this.frameManager);
        const delta = this.perceiver.computeDelta(snapshot, previousSnapshot, stepNumber);
        return {
          success: false,
          executedCount,
          delta,
          snapshot,
          error: errorMsg,
        };
      }
    }

    // Wait for DOM to settle
    await DOMSettleDetector.waitForSettle(this.mainSession);

    // Capture new state
    const snapshot = await this.perceiver.capture(this.mainSession, this.frameManager);
    const delta = this.perceiver.computeDelta(snapshot, previousSnapshot, stepNumber);

    return {
      success: true,
      executedCount,
      delta,
      snapshot,
    };
  }
}
