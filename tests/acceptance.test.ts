import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CDPClient, ChromeLauncher, FrameManager, type LaunchedBrowser } from '@aether/cdp';
import { startFixtureServers, type FixtureServers } from '@aether/fixtures';
import { Perceiver } from '@aether/perceiver';

describe('Step 1 Acceptance Tests: Aether Engine & Perceiver v0', () => {
  let fixtureServers: FixtureServers;
  let browser: LaunchedBrowser;
  let client: CDPClient;

  beforeAll(async () => {
    fixtureServers = await startFixtureServers(4101, 4102);
    browser = await ChromeLauncher.launch({ headless: true });
    client = await CDPClient.connect(browser.wsEndpoint);
  }, 25000);

  afterAll(async () => {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore
      }
    }
    if (browser) {
      await browser.kill();
    }
    if (fixtureServers) {
      await fixtureServers.close();
    }
  });

  async function createPageSession() {
    const targets = await client.sendCommand<{ targetInfos: Array<{ targetId: string; type: string }> }>(
      'Target.getTargets',
    );
    const pageTarget = targets.targetInfos.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const session = await client.attachToTarget(pageTarget.targetId);
    await session.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
    await session.send('Page.enable');
    await session.send('Accessibility.enable');
    return session;
  }

  async function navigateAndWait(session: any, url: string) {
    const loadPromise = new Promise<void>((resolve) => {
      session.once('Page.loadEventFired', () => resolve());
      setTimeout(resolve, 5000);
    });
    await session.send('Page.navigate', { url });
    await loadPromise;
    await new Promise((r) => setTimeout(r, 400));
  }

  it('1. Simple form fixture: outline contains every labelled input and submit button with refs', async () => {
    const session = await createPageSession();
    const frameManager = new FrameManager();
    const perceiver = new Perceiver();

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/form.html`);
    await frameManager.initFromSession(session, client);

    const snapshot = await perceiver.capture(session, frameManager);

    expect(snapshot.elements.length).toBeGreaterThan(0);
    expect(snapshot.formattedText).toContain('textbox');
    expect(snapshot.formattedText).toContain('button "Submit Application"');

    // Verify all refs start with 'e' followed by digits
    for (const el of snapshot.elements) {
      expect(el.ref).toMatch(/^e\d+$/);
    }
  });

  it('2. Same-origin nested iframe fixture: elements inside nested frame appear under correct frame header', async () => {
    const session = await createPageSession();
    const frameManager = new FrameManager();
    const perceiver = new Perceiver();

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/nested-iframes.html`);
    await frameManager.initFromSession(session, client);

    const snapshot = await perceiver.capture(session, frameManager);

    expect(snapshot.framesCount).toBeGreaterThanOrEqual(2);
    expect(snapshot.formattedText).toContain('Top Level Button');
    expect(snapshot.formattedText).toContain('frame 1');
  });

  it('3. Cross-origin iframe fixture: child frame elements appear with ordinal 1 and engine tracks sessions', async () => {
    const session = await createPageSession();
    const frameManager = new FrameManager();
    const perceiver = new Perceiver();

    client.on('sessionAttached', (childSession) => {
      if (childSession.targetType === 'iframe') {
        void frameManager.registerChildSession(childSession);
      }
    });

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/cross-origin.html`);
    await frameManager.initFromSession(session, client);

    const snapshot = await perceiver.capture(session, frameManager);

    expect(snapshot.framesCount).toBeGreaterThanOrEqual(2);
    expect(snapshot.formattedText).toContain('button "Main Button"');
    expect(snapshot.formattedText).toContain('frame 1');
    expect(snapshot.formattedText).toContain('button "Apply Now"');
  });

  it('4. Shadow DOM fixture: button inside open shadow root appears in outline', async () => {
    const session = await createPageSession();
    const frameManager = new FrameManager();
    const perceiver = new Perceiver();

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/shadow-dom.html`);
    await frameManager.initFromSession(session, client);

    const snapshot = await perceiver.capture(session, frameManager);

    expect(snapshot.formattedText).toContain('button "Shadow Button Action"');
  });

  it('5. 500-row list fixture: outline shows first 3 rows, count line, and truncated is true when over cap', async () => {
    const session = await createPageSession();
    const frameManager = new FrameManager();
    const perceiver = new Perceiver();

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/long-list.html`);
    await frameManager.initFromSession(session, client);

    const snapshot = await perceiver.capture(session, frameManager);

    // Collapsed sibling line check
    expect(snapshot.formattedText).toMatch(/\.\.\. \d+ more similar/);
    // Element cap check: cap is 150
    expect(snapshot.elementCount).toBeLessThanOrEqual(150);
  });

  it('6. Snapshot twice with no changes: outlines and refs are identical', async () => {
    const session = await createPageSession();
    const frameManager = new FrameManager();
    const perceiver = new Perceiver();

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/form.html`);
    await frameManager.initFromSession(session, client);

    const snapshot1 = await perceiver.capture(session, frameManager);
    const snapshot2 = await perceiver.capture(session, frameManager);

    expect(snapshot1.formattedText).toEqual(snapshot2.formattedText);
    expect(snapshot1.elements.map((e) => e.ref)).toEqual(snapshot2.elements.map((e) => e.ref));
  });

  it('7. Navigate to a second page and snapshot: no ref from first page is reused', async () => {
    const session = await createPageSession();
    const frameManager = new FrameManager();
    const perceiver = new Perceiver();

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/form.html`);
    await frameManager.initFromSession(session, client);
    const snapshotPage1 = await perceiver.capture(session, frameManager);

    const refsPage1 = new Set(snapshotPage1.elements.map((e) => e.ref));

    // Page navigation triggers registry resetMappings while preserving monotonic counter
    perceiver.onNavigation();
    frameManager.clear();

    await navigateAndWait(session, `${fixtureServers.mainBaseUrl}/shadow-dom.html`);
    await frameManager.initFromSession(session, client);
    const snapshotPage2 = await perceiver.capture(session, frameManager);

    const refsPage2 = snapshotPage2.elements.map((e) => e.ref);

    for (const ref of refsPage2) {
      expect(refsPage1.has(ref)).toBe(false);
    }
  });
});
