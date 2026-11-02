import { randomUUID } from 'node:crypto';
import { CDPClient, ChromeLauncher, FrameManager, type CDPSession, type LaunchedBrowser } from '@aether/cdp';
import { AXExtractor, Perceiver, type RawAXNode } from '@aether/perceiver';
import { Actor } from '@aether/actor';
import {
  MAX_ELEMENTS_PER_SNAPSHOT,
  MAX_NAME_LENGTH,
  MAX_VALUE_LENGTH,
  ActParamsSchema,
  ScreenshotParamsSchema,
  type Delta,
  type OutlineSnapshot,
  type ParsedElement,
} from '@aether/shared';
import { wrapUntrustedPageText } from './untrusted.js';

const NAVIGATION_TIMEOUT_MS = 8000;
const RISKY_ACTION_NAME = /\b(buy|pay|place order|send|post|publish|delete|remove|submit|confirm|transfer|subscribe)\b/i;

interface BoxModelResult {
  model: { border: number[] };
}

interface ScreenshotResult {
  data: string;
}

interface LayoutMetricsResult {
  cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number };
}

export interface MCPBrowserSessionOptions {
  headless?: boolean;
}

export class MCPBrowserSession {
  private browser?: LaunchedBrowser;
  private client: CDPClient;
  private mainSession?: CDPSession;
  private frameManager = new FrameManager();
  private perceiver: Perceiver;
  private actor?: Actor;
  private previousSnapshot?: OutlineSnapshot;
  private stepNumber = 0;
  private closed = false;

  private constructor(
    client: CDPClient,
    browser?: LaunchedBrowser,
  ) {
    this.browser = browser;
    this.client = client;
    this.perceiver = new Perceiver();
  }

  public static async launch(options: MCPBrowserSessionOptions = {}): Promise<MCPBrowserSession> {
    const browser = await ChromeLauncher.launch({ headless: options.headless ?? false });
    let client: CDPClient | undefined;

    try {
      client = await CDPClient.connect(browser.wsEndpoint);
      const session = new MCPBrowserSession(client, browser);
      await session.ensureReady();
      return session;
    } catch (error) {
      if (client) await client.close().catch(() => {});
      await browser.kill();
      throw error;
    }
  }

  public static async connect(wsEndpoint: string): Promise<MCPBrowserSession> {
    const client = await CDPClient.connect(wsEndpoint);
    return new MCPBrowserSession(client);
  }

  public async navigate(url: string): Promise<OutlineSnapshot> {
    await this.ensureReady();
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) && url !== 'about:blank') {
      throw new Error('Navigation is limited to http, https, and about:blank');
    }

    this.perceiver.onNavigation();
    const loadEvent = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, NAVIGATION_TIMEOUT_MS);
      this.mainSession?.once('Page.loadEventFired', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await this.mainSession?.send('Page.navigate', { url });
    await loadEvent;
    this.frameManager.clear();
    await this.frameManager.initFromSession(this.requireMainSession(), this.client);
    return this.capture();
  }

  public async capture(): Promise<OutlineSnapshot> {
    await this.ensureReady();
    const snapshot = await this.perceiver.capture(this.requireMainSession(), this.frameManager);
    this.previousSnapshot = snapshot;
    return snapshot;
  }

  public async act(rawParams: unknown): Promise<{
    success: boolean;
    error?: string;
    delta: Delta;
    snapshot: OutlineSnapshot;
  }> {
    await this.ensureReady();
    const actor = this.actor;
    if (!actor) throw new Error('Chrome tab is not attached');
    const result = await actor.execute(
      rawParams,
      this.previousSnapshot,
      ++this.stepNumber,
    );
    this.previousSnapshot = result.snapshot;
    return {
      success: result.success,
      error: result.error,
      delta: result.delta,
      snapshot: result.snapshot,
    };
  }

  public async find(query: string): Promise<string> {
    await this.ensureReady();
    const elements = await this.captureAllElements();
    const lowerQuery = query.toLocaleLowerCase();
    const matches = elements.filter((element) =>
      `${element.name} ${element.value ?? ''}`.toLocaleLowerCase().includes(lowerQuery),
    );
    return matches.map((element) => element.ref).join('\n') || 'No matching refs.';
  }

  public async read(ref: string): Promise<string> {
    await this.ensureReady();
    const elements = await this.captureAllElements();
    const target = elements.find((element) => element.ref === ref);
    if (!target) throw new Error(`Unknown or stale ref: ${ref}`);
    const lines: string[] = [];
    let count = 0;
    const render = (element: ParsedElement, depth: number): void => {
      if (count >= MAX_ELEMENTS_PER_SNAPSHOT) return;
      count++;
      const value = element.value === undefined ? '' : ` value="${element.value}"`;
      lines.push(`${'  '.repeat(depth)}[${element.ref}] ${element.role} "${element.name}"${value}`);
      for (const child of element.children ?? []) render(child, depth + 1);
    };
    render(target, 0);
    return lines.join('\n').slice(0, MAX_ELEMENTS_PER_SNAPSHOT * (MAX_NAME_LENGTH + MAX_VALUE_LENGTH));
  }

  public async screenshot(rawParams: unknown): Promise<string> {
    await this.ensureReady();
    const params = ScreenshotParamsSchema.parse(rawParams);
    const session = params.ref ? this.sessionForRef(params.ref) : this.requireMainSession();
    let clip: { x: number; y: number; width: number; height: number; scale: number };

    if (params.ref) {
      const mapping = this.perceiver.registry.resolve(params.ref);
      if (!mapping) throw new Error(`Unknown or stale ref: ${params.ref}`);
      const box = await session.send<BoxModelResult>('DOM.getBoxModel', {
        backendNodeId: mapping.backendDOMNodeId,
      });
      const border = box.model.border;
      const xs = [border[0], border[2], border[4], border[6]].filter((n): n is number => n !== undefined);
      const ys = [border[1], border[3], border[5], border[7]].filter((n): n is number => n !== undefined);
      if (xs.length !== 4 || ys.length !== 4) throw new Error(`No visible box for ref ${params.ref}`);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      clip = {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
        scale: 0.5,
      };
    } else {
      const metrics = await this.requireMainSession().send<LayoutMetricsResult>('Page.getLayoutMetrics');
      const viewport = metrics.cssVisualViewport;
      clip = {
        x: viewport.pageX,
        y: viewport.pageY,
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        scale: 0.5,
      };
    }

    const result = await session.send<ScreenshotResult>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip,
    });
    return result.data;
  }

  public async ensureActionAllowed(rawParams: unknown): Promise<void> {
    await this.ensureReady();
    const parsed = ActParamsSchema.parse(rawParams);
    if (parsed.risk === 'irreversible') {
      throw new Error('needs_approval: irreversible actions require human approval');
    }

    const elements = await this.captureAllElements();
    for (const action of parsed.actions) {
      const target = elements.find((element) => element.ref === action.ref);
      if (!target) throw new Error(`Unknown or stale ref: ${action.ref}`);
      if (RISKY_ACTION_NAME.test(`${target.name} ${target.value ?? ''}`)) {
        throw new Error(`needs_approval: action target ${action.ref} appears irreversible`);
      }
      if (action.op === 'type' && (await this.isPasswordField(action.ref))) {
        throw new Error(`human_must_perform: password field ${action.ref} cannot be typed by the agent`);
      }
    }
  }

  public newHandoffId(): string {
    return randomUUID();
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.client.close().catch(() => {});
    await this.browser?.kill();
  }

  public async pageResultText(): Promise<string> {
    const snapshot = this.previousSnapshot ?? await this.capture();
    return wrapUntrustedPageText(snapshot.formattedText);
  }

  private async isPasswordField(ref: string): Promise<boolean> {
    const mapping = this.perceiver.registry.resolve(ref);
    if (!mapping) throw new Error(`Unknown or stale ref: ${ref}`);
    const session = this.sessionForRef(ref);
    const description = await session.send<{ node: { attributes?: string[] } }>('DOM.describeNode', {
      backendNodeId: mapping.backendDOMNodeId,
    });
    const attributes = description.node.attributes ?? [];
    const values = new Map<string, string>();
    for (let index = 0; index + 1 < attributes.length; index += 2) {
      const key = attributes[index];
      const value = attributes[index + 1];
      if (key !== undefined && value !== undefined) values.set(key.toLowerCase(), value.toLowerCase());
    }
    return values.get('type') === 'password' || values.get('autocomplete') === 'current-password';
  }

  private sessionForRef(ref: string): CDPSession {
    const mainSession = this.requireMainSession();
    const mapping = this.perceiver.registry.resolve(ref);
    if (!mapping) throw new Error(`Unknown or stale ref: ${ref}`);
    if (mapping.frameOrdinal === 0) return mainSession;
    const frame = this.frameManager.allFrames.find((item) => item.ordinal === mapping.frameOrdinal);
    const session = frame?.sessionId ? this.client.getSession(frame.sessionId) : undefined;
    if (!session || session.isDetached) throw new Error(`Frame for ref ${ref} is no longer attached`);
    return session;
  }

  private async captureAllElements(): Promise<ParsedElement[]> {
    await this.ensureReady();
    const mainSession = this.requireMainSession();
    const frameElements: ParsedElement[] = [];
    for (const frame of this.frameManager.allFrames) {
      const session = frame.ordinal === 0
        ? mainSession
        : frame.sessionId ? this.client.getSession(frame.sessionId) ?? mainSession : mainSession;
      try {
        const result = await session.send<{ nodes: RawAXNode[] }>(
          'Accessibility.getFullAXTree',
          frame.ordinal > 0 && session === mainSession ? { frameId: frame.frameId } : undefined,
        );
        frameElements.push(...AXExtractor.extractFrameElements(
          result.nodes ?? [],
          frame.ordinal,
          this.perceiver.registry,
        ));
      } catch {
        // A detached or navigating frame is unavailable for this query.
      }
    }
    return flattenElements(frameElements);
  }

  private async ensureReady(): Promise<void> {
    if (this.mainSession && !this.mainSession.isDetached) return;
    const targets = await this.client.sendCommand<{
      targetInfos: Array<{ targetId: string; type: string }>;
    }>('Target.getTargets');
    const pageTarget = targets.targetInfos.find((target) => target.type === 'page');
    if (!pageTarget) throw new Error('No Chrome page is available through the extension bridge');

    const mainSession = await this.client.attachToTarget(pageTarget.targetId);
    await mainSession.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
    await mainSession.send('Page.enable');
    await mainSession.send('DOM.enable');
    await mainSession.send('Accessibility.enable');
    this.mainSession = mainSession;
    this.actor = new Actor(mainSession, this.frameManager, this.perceiver);
    this.client.on('sessionAttached', (childSession: CDPSession) => {
      this.frameManager.mapSessionToFrame(childSession.sessionId, childSession.targetId);
    });
    await this.frameManager.initFromSession(mainSession, this.client);
  }

  private requireMainSession(): CDPSession {
    if (!this.mainSession) throw new Error('Chrome tab is not attached');
    return this.mainSession;
  }
}

function flattenElements(elements: ParsedElement[]): ParsedElement[] {
  const result: ParsedElement[] = [];
  const visit = (element: ParsedElement): void => {
    result.push(element);
    for (const child of element.children ?? []) visit(child);
  };
  for (const element of elements) visit(element);
  return result;
}
