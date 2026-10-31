import type { CDPSession } from '@aether/cdp';

export interface Point {
  x: number;
  y: number;
}

export class InputDispatcher {
  public static async getElementCenter(
    session: CDPSession,
    backendNodeId: number,
  ): Promise<Point> {
    // Scroll element into view first
    try {
      await session.send('DOM.scrollIntoViewIfNeeded', { backendNodeId });
      await new Promise((r) => setTimeout(r, 60));
    } catch {
      // Non-critical if already visible
    }

    const box = await session.send<{
      model: {
        content: number[];
        width: number;
        height: number;
      };
    }>('DOM.getBoxModel', { backendNodeId });

    const quad = box.model.content;
    if (!quad || quad.length < 8) {
      throw new Error(`Invalid box model quad for backendNodeId ${backendNodeId}`);
    }

    // quad is [x1, y1, x2, y2, x3, y3, x4, y4]
    const x = Math.round(((quad[0] ?? 0) + (quad[4] ?? 0)) / 2);
    const y = Math.round(((quad[1] ?? 0) + (quad[5] ?? 0)) / 2);

    return { x, y };
  }

  public static async click(
    session: CDPSession,
    backendNodeId: number,
  ): Promise<Point> {
    const pt = await InputDispatcher.getElementCenter(session, backendNodeId);

    // 1. Move to element
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pt.x,
      y: pt.y,
    });

    // 2. Press mouse button
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: pt.x,
      y: pt.y,
      button: 'left',
      clickCount: 1,
    });

    await new Promise((r) => setTimeout(r, 40));

    // 3. Release mouse button
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: pt.x,
      y: pt.y,
      button: 'left',
      clickCount: 1,
    });

    return pt;
  }

  public static async hover(
    session: CDPSession,
    backendNodeId: number,
  ): Promise<Point> {
    const pt = await InputDispatcher.getElementCenter(session, backendNodeId);
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pt.x,
      y: pt.y,
    });
    return pt;
  }

  public static async type(
    session: CDPSession,
    backendNodeId: number,
    text: string,
    clearExisting = true,
  ): Promise<void> {
    // Click element to focus
    await InputDispatcher.click(session, backendNodeId);
    await new Promise((r) => setTimeout(r, 40));

    if (clearExisting) {
      // Ctrl+A (or Cmd+A) + Backspace
      const isMac = process.platform === 'darwin';
      const modifier = isMac ? 4 : 2; // 4 = Meta, 2 = Ctrl

      await session.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        commands: ['selectAll'],
        modifiers: modifier,
      }).catch(() => {});

      await session.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'Backspace',
        windowsVirtualKeyCode: 8,
      });
      await session.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Backspace',
        windowsVirtualKeyCode: 8,
      });
    }

    // Insert text directly via CDP Input
    await session.send('Input.insertText', { text });
  }

  public static async select(
    session: CDPSession,
    backendNodeId: number,
    value: string,
  ): Promise<void> {
    const resolveResult = await session.send<{
      object: { objectId: string };
    }>('DOM.resolveNode', { backendNodeId });

    if (!resolveResult.object?.objectId) {
      throw new Error(`Failed to resolve node object for select element ${backendNodeId}`);
    }

    await session.send('Runtime.callFunctionOn', {
      objectId: resolveResult.object.objectId,
      functionDeclaration: `function(val) {
        this.value = val;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
      }`,
      arguments: [{ value }],
    });
  }

  public static async key(
    session: CDPSession,
    key: string,
  ): Promise<void> {
    let keyCode = 0;
    if (key === 'Enter') keyCode = 13;
    else if (key === 'Escape') keyCode = 27;
    else if (key === 'Tab') keyCode = 9;
    else if (key === 'Backspace') keyCode = 8;
    else if (key === 'ArrowDown') keyCode = 40;
    else if (key === 'ArrowUp') keyCode = 38;

    await session.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key,
      windowsVirtualKeyCode: keyCode || undefined,
    });
    await new Promise((r) => setTimeout(r, 30));
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      windowsVirtualKeyCode: keyCode || undefined,
    });
  }

  public static async scroll(
    session: CDPSession,
    deltaX: number,
    deltaY: number,
    pt?: Point,
  ): Promise<void> {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: pt?.x || 200,
      y: pt?.y || 200,
      deltaX,
      deltaY,
    });
  }
}
