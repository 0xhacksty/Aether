import type { FrameInfo } from '@aether/shared';
import type { CDPClient } from './client.js';
import type { CDPSession } from './session.js';

interface RawFrame {
  id: string;
  parentId?: string;
  url: string;
}

interface RawFrameTree {
  frame: RawFrame;
  childFrames?: RawFrameTree[];
}

export class FrameManager {
  private frames = new Map<string, FrameInfo>();
  private mainFrameId: string | null = null;
  private nextOrdinal = 1;
  private sessionToFrameId = new Map<string, string>();

  public get mainFrame(): FrameInfo | undefined {
    return this.mainFrameId ? this.frames.get(this.mainFrameId) : undefined;
  }

  public get allFrames(): FrameInfo[] {
    return Array.from(this.frames.values()).sort((a, b) => a.ordinal - b.ordinal);
  }

  public getFrame(frameId: string): FrameInfo | undefined {
    return this.frames.get(frameId);
  }

  public getFrameBySession(sessionId: string): FrameInfo | undefined {
    const frameId = this.sessionToFrameId.get(sessionId);
    if (frameId) {
      return this.frames.get(frameId);
    }
    return undefined;
  }

  public mapSessionToFrame(sessionId: string, frameId: string): void {
    this.sessionToFrameId.set(sessionId, frameId);
    const frame = this.frames.get(frameId);
    if (frame) {
      frame.sessionId = sessionId;
    }
  }

  public async initFromSession(session: CDPSession, client?: CDPClient): Promise<void> {
    try {
      const result = await session.send<{ frameTree: RawFrameTree }>('Page.getFrameTree');
      this.processFrameTree(result.frameTree, session.sessionId);
    } catch {
      // Main frame might still be loading
    }

    if (client) {
      // Register all existing child sessions
      for (const childSession of client.getAllSessions()) {
        if (childSession.targetType === 'iframe' && childSession.sessionId !== session.sessionId) {
          await this.registerChildSession(childSession);
        }
      }
    }
  }

  public async registerChildSession(childSession: CDPSession): Promise<FrameInfo | undefined> {
    try {
      await childSession.send('Page.enable').catch(() => {});
      const result = await childSession.send<{ frameTree: RawFrameTree }>('Page.getFrameTree');
      const childFrame = result.frameTree.frame;

      let frame = this.frames.get(childFrame.id);
      if (!frame) {
        frame = {
          frameId: childFrame.id,
          parentId: childFrame.parentId,
          ordinal: this.nextOrdinal++,
          url: childFrame.url,
          sessionId: childSession.sessionId,
        };
        this.frames.set(childFrame.id, frame);
      } else {
        frame.sessionId = childSession.sessionId;
        frame.url = childFrame.url;
      }
      this.sessionToFrameId.set(childSession.sessionId, childFrame.id);
      return frame;
    } catch {
      return undefined;
    }
  }

  public processFrameTree(tree: RawFrameTree, mainSessionId: string): void {
    this.mainFrameId = tree.frame.id;
    this.frames.set(tree.frame.id, {
      frameId: tree.frame.id,
      parentId: undefined,
      ordinal: 0,
      url: tree.frame.url,
      sessionId: mainSessionId,
    });
    this.sessionToFrameId.set(mainSessionId, tree.frame.id);

    if (tree.childFrames && tree.childFrames.length > 0) {
      this.walkChildFrames(tree.childFrames);
    }
  }

  private walkChildFrames(children: RawFrameTree[]): void {
    for (const child of children) {
      if (!this.frames.has(child.frame.id)) {
        this.frames.set(child.frame.id, {
          frameId: child.frame.id,
          parentId: child.frame.parentId,
          ordinal: this.nextOrdinal++,
          url: child.frame.url,
        });
      }
      if (child.childFrames && child.childFrames.length > 0) {
        this.walkChildFrames(child.childFrames);
      }
    }
  }

  public removeFrame(frameId: string): void {
    this.frames.delete(frameId);
    for (const [sId, fId] of this.sessionToFrameId.entries()) {
      if (fId === frameId) {
        this.sessionToFrameId.delete(sId);
      }
    }
  }

  public clear(): void {
    this.frames.clear();
    this.mainFrameId = null;
    this.nextOrdinal = 1;
    this.sessionToFrameId.clear();
  }
}
