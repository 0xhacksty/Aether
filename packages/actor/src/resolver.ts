import type { CDPSession, FrameManager } from '@aether/cdp';
import type { RefRegistry } from '@aether/perceiver';

export interface ResolvedTarget {
  ref: string;
  frameOrdinal: number;
  backendDOMNodeId: number;
  session: CDPSession;
}

export class NodeResolver {
  private registry: RefRegistry;
  private frameManager: FrameManager;
  private mainSession: CDPSession;

  constructor(
    registry: RefRegistry,
    frameManager: FrameManager,
    mainSession: CDPSession,
  ) {
    this.registry = registry;
    this.frameManager = frameManager;
    this.mainSession = mainSession;
  }

  public async resolve(ref: string): Promise<ResolvedTarget> {
    const mapping = this.registry.resolve(ref);
    if (!mapping) {
      throw new Error(`Ref "${ref}" is not registered or was invalidated after page navigation.`);
    }

    // Determine target session
    let targetSession = this.mainSession;
    if (mapping.frameOrdinal > 0) {
      const frame = this.frameManager.allFrames.find((f: { ordinal: number }) => f.ordinal === mapping.frameOrdinal);
      if (frame && frame.sessionId && frame.sessionId !== this.mainSession.sessionId) {
        const client = (this.mainSession as unknown as { client: { getSession: (id: string) => CDPSession | undefined } }).client;
        const childSession = client?.getSession(frame.sessionId);
        if (childSession && !childSession.isDetached) {
          targetSession = childSession;
        }
      }
    }

    // Verify node is still alive in DOM
    try {
      await targetSession.send('DOM.describeNode', {
        backendNodeId: mapping.backendDOMNodeId,
      });
      return {
        ref,
        frameOrdinal: mapping.frameOrdinal,
        backendDOMNodeId: mapping.backendDOMNodeId,
        session: targetSession,
      };
    } catch {
      // Node might have re-rendered; re-query frame AX tree fallback
      const recheckedId = await this.fallbackRequery(targetSession, mapping.backendDOMNodeId);
      if (recheckedId) {
        return {
          ref,
          frameOrdinal: mapping.frameOrdinal,
          backendDOMNodeId: recheckedId,
          session: targetSession,
        };
      }
      throw new Error(`Stale ref "${ref}": backend node ${mapping.backendDOMNodeId} no longer exists.`);
    }
  }

  private async fallbackRequery(
    session: CDPSession,
    _oldNodeId: number,
  ): Promise<number | null> {
    try {
      const axResult = await session.send<{ nodes: Array<{ backendDOMNodeId?: number }> }>(
        'Accessibility.getFullAXTree',
      );
      if (axResult.nodes && axResult.nodes.length > 0) {
        // If node exists in refreshed AX tree
        const match = axResult.nodes.find((n: { backendDOMNodeId?: number }) => n.backendDOMNodeId === _oldNodeId);
        if (match?.backendDOMNodeId) return match.backendDOMNodeId;
      }
    } catch {
      // Fallback failed
    }
    return null;
  }
}
