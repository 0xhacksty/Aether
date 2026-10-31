import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Actor } from '@aether/actor';
import { CDPClient, ChromeLauncher, FrameManager, type LaunchedBrowser } from '@aether/cdp';
import { startFixtureServers, type FixtureServers } from '@aether/fixtures';
import { Perceiver } from '@aether/perceiver';

describe('Step 2 Actor Tests: Trusted CDP Input Dispatch & DOM Settle', () => {
  let fixtureServers: FixtureServers;
  let browser: LaunchedBrowser;
  let client: CDPClient;

  beforeAll(async () => {
    fixtureServers = await startFixtureServers(4103, 4104);
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

  async function setupSession(url: string) {
    const targets = await client.sendCommand<{ targetInfos: Array<{ targetId: string; type: string }> }>(
      'Target.getTargets',
    );
    const pageTarget = targets.targetInfos.find((t) => t.type === 'page')!;
    const session = await client.attachToTarget(pageTarget.targetId);

    await session.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
    await session.send('Page.enable');
    await session.send('DOM.enable');
    await session.send('Accessibility.enable');

    const loadPromise = new Promise<void>((res) => {
      session.once('Page.loadEventFired', () => res());
      setTimeout(res, 5000);
    });
    await session.send('Page.navigate', { url });
    await loadPromise;
    await new Promise((r) => setTimeout(r, 400));

    const frameManager = new FrameManager();
    await frameManager.initFromSession(session, client);

    const perceiver = new Perceiver();
    const actor = new Actor(session, frameManager, perceiver);

    return { session, frameManager, perceiver, actor };
  }

  it('1. Types text into form fields using native CDP insertText', async () => {
    const { session, actor, perceiver, frameManager } = await setupSession(
      `${fixtureServers.mainBaseUrl}/form.html`,
    );

    const initialSnapshot = await perceiver.capture(session, frameManager);
    const nameInput = initialSnapshot.elements.find((e) => e.role === 'textbox' && e.name.includes('Full Name'));
    expect(nameInput).toBeDefined();

    const result = await actor.execute(
      {
        actions: [{ ref: nameInput!.ref, op: 'type', value: 'Jane Doe' }],
        risk: 'reversible',
        why: 'Fill user name',
      },
      initialSnapshot,
      1,
    );

    expect(result.success).toBe(true);
    expect(result.executedCount).toBe(1);

    // Verify DOM value in browser
    const evalRes = await session.send<{ result: { value: string } }>('Runtime.evaluate', {
      expression: 'document.getElementById("username").value',
      returnByValue: true,
    });
    expect(evalRes.result.value).toBe('Jane Doe');
  });

  it('2. Changes select dropdown value via select operation', async () => {
    const { session, actor, perceiver, frameManager } = await setupSession(
      `${fixtureServers.mainBaseUrl}/form.html`,
    );

    const initialSnapshot = await perceiver.capture(session, frameManager);
    const selectElem = initialSnapshot.elements.find((e) => e.role === 'combobox' || e.name.includes('Country'));
    expect(selectElem).toBeDefined();

    const result = await actor.execute(
      {
        actions: [{ ref: selectElem!.ref, op: 'select', value: 'IN' }],
        risk: 'reversible',
        why: 'Select country India',
      },
      initialSnapshot,
      1,
    );

    expect(result.success).toBe(true);

    const evalRes = await session.send<{ result: { value: string } }>('Runtime.evaluate', {
      expression: 'document.getElementById("country").value',
      returnByValue: true,
    });
    expect(evalRes.result.value).toBe('IN');
  });

  it('3. Batches multiple form actions (type + select + click) in a single turn', async () => {
    const { session, actor, perceiver, frameManager } = await setupSession(
      `${fixtureServers.mainBaseUrl}/form.html`,
    );

    const initialSnapshot = await perceiver.capture(session, frameManager);
    const nameInput = initialSnapshot.elements.find((e) => e.role === 'textbox' && e.name.includes('Full Name'))!;
    const emailInput = initialSnapshot.elements.find((e) => e.role === 'textbox' && e.name.includes('Email'))!;
    const checkbox = initialSnapshot.elements.find((e) => e.role === 'checkbox')!;

    const result = await actor.execute(
      {
        actions: [
          { ref: nameInput.ref, op: 'type', value: 'Alice Smith' },
          { ref: emailInput.ref, op: 'type', value: 'alice@example.com' },
          { ref: checkbox.ref, op: 'click' },
        ],
        risk: 'reversible',
        why: 'Batch fill registration form',
      },
      initialSnapshot,
      1,
    );

    expect(result.success).toBe(true);
    expect(result.executedCount).toBe(3);

    const evalRes = await session.send<{ result: { value: any } }>('Runtime.evaluate', {
      expression: `({
        name: document.getElementById('username').value,
        email: document.getElementById('email').value,
        newsletter: document.getElementById('newsletter').checked
      })`,
      returnByValue: true,
    });

    expect(evalRes.result.value.name).toBe('Alice Smith');
    expect(evalRes.result.value.email).toBe('alice@example.com');
    expect(evalRes.result.value.newsletter).toBe(true);
  });

  it('4. Returns compact delta with modified element values', async () => {
    const { actor, perceiver, session, frameManager } = await setupSession(
      `${fixtureServers.mainBaseUrl}/form.html`,
    );

    const initialSnapshot = await perceiver.capture(session, frameManager);
    const nameInput = initialSnapshot.elements.find((e) => e.role === 'textbox' && e.name.includes('Full Name'))!;

    const result = await actor.execute(
      {
        actions: [{ ref: nameInput.ref, op: 'type', value: 'Delta Test' }],
        risk: 'reversible',
        why: 'Test delta reflection',
      },
      initialSnapshot,
      1,
    );

    expect(result.delta.formattedText).toContain('step 1 ok');
    expect(result.delta.formattedText).toContain(nameInput.ref);
  });

  it('5. Handles invalid / stale ref gracefully without crashing', async () => {
    const { actor, perceiver, session, frameManager } = await setupSession(
      `${fixtureServers.mainBaseUrl}/form.html`,
    );

    const initialSnapshot = await perceiver.capture(session, frameManager);

    const result = await actor.execute(
      {
        actions: [{ ref: 'e9999', op: 'click' }],
        risk: 'read',
        why: 'Click non-existent ref',
      },
      initialSnapshot,
      1,
    );

    expect(result.success).toBe(false);
    expect(result.executedCount).toBe(0);
    expect(result.error).toContain('e9999');
  });
});
