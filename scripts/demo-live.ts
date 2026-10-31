import { Actor } from '../packages/actor/src/index.js';
import { CDPClient, ChromeLauncher, FrameManager } from '../packages/cdp/src/index.js';
import { startFixtureServers } from '../fixtures/src/index.js';
import { Perceiver } from '../packages/perceiver/src/index.js';

async function runLiveDemo() {
  console.log('====================================================');
  console.log('       AETHER LIVE ACTION & PERCEPTION DEMO         ');
  console.log('====================================================');

  console.log('1. Starting local test fixture server...');
  const fixtureServers = await startFixtureServers(4101, 4102);

  console.log('2. Spawning Google Chrome with native CDP debugging (Headed)...');
  const browser = await ChromeLauncher.launch({ headless: false });

  let client: CDPClient | null = null;

  try {
    console.log('3. Connecting WebSocket client to DevToolsActivePort...');
    client = await CDPClient.connect(browser.wsEndpoint);

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

    const formUrl = `${fixtureServers.mainBaseUrl}/form.html`;
    console.log(`4. Navigating Chrome to ${formUrl}...`);
    const loadPromise = new Promise<void>((res) => {
      session.once('Page.loadEventFired', () => res());
      setTimeout(res, 5000);
    });
    await session.send('Page.navigate', { url: formUrl });
    await loadPromise;
    await new Promise((r) => setTimeout(r, 400));

    const frameManager = new FrameManager();
    await frameManager.initFromSession(session, client);

    const perceiver = new Perceiver();
    const actor = new Actor(session, frameManager, perceiver);

    // Initial Perception
    console.log('\n--- [STAGE 1: INITIAL PERCEPTION] ---');
    const t0 = performance.now();
    const initialSnapshot = await perceiver.capture(session, frameManager);
    const perceiveMs = (performance.now() - t0).toFixed(2);

    console.log(`Elements Extracted: ${initialSnapshot.elementCount}`);
    console.log(`Token Estimate: ~${initialSnapshot.tokenEstimate} tokens | Latency: ${perceiveMs} ms`);
    console.log('\nOutline seen by the AI:');
    console.log(initialSnapshot.formattedText);

    // Locate refs
    const nameInput = initialSnapshot.elements.find((e) => e.role === 'textbox' && e.name.includes('Full Name'))!;
    const emailInput = initialSnapshot.elements.find((e) => e.role === 'textbox' && e.name.includes('Email'))!;
    const countrySelect = initialSnapshot.elements.find((e) => e.role === 'combobox' || e.name.includes('Country'))!;
    const checkbox = initialSnapshot.elements.find((e) => e.role === 'checkbox')!;
    const submitBtn = initialSnapshot.elements.find((e) => e.role === 'button' && e.name.includes('Submit'))!;

    console.log('\n--- [STAGE 2: NATIVE CDP ACTION BATCH] ---');
    console.log('Executing 5 batched actions in a single turn via CDP Input dispatcher:');
    console.log(`  1. Type "Tony Stark" into [${nameInput.ref}] Full Name`);
    console.log(`  2. Type "tony@starkindustries.com" into [${emailInput.ref}] Email`);
    console.log(`  3. Select "IN" (India) in [${countrySelect.ref}] Country dropdown`);
    console.log(`  4. Click [${checkbox.ref}] Newsletter checkbox`);
    console.log(`  5. Click [${submitBtn.ref}] Submit Application button`);

    const actStart = performance.now();
    const actionResult = await actor.execute(
      {
        actions: [
          { ref: nameInput.ref, op: 'type', value: 'Tony Stark' },
          { ref: emailInput.ref, op: 'type', value: 'tony@starkindustries.com' },
          { ref: countrySelect.ref, op: 'select', value: 'IN' },
          { ref: checkbox.ref, op: 'click' },
          { ref: submitBtn.ref, op: 'click' },
        ],
        risk: 'reversible',
        why: 'Complete registration form',
      },
      initialSnapshot,
      1,
    );
    const actMs = (performance.now() - actStart).toFixed(2);

    console.log(`\nActions Executed: ${actionResult.executedCount}/5 | Success: ${actionResult.success} | Total Time: ${actMs} ms`);

    console.log('\n--- [STAGE 3: DELTA OBSERVATION] ---');
    console.log('Notice: We do NOT re-send the whole page. Only this compact delta is sent back to the model:');
    console.log('----------------------------------------------------');
    console.log(actionResult.delta.formattedText);
    console.log('----------------------------------------------------');
    console.log(`Delta Token Cost: ~${actionResult.delta.tokenEstimate} tokens (90%+ savings vs full re-send)\n`);

    console.log('[Headed Display] Look at the Chrome window on your screen!');
    console.log('Notice that the form has been physically filled out with native trusted events.');
    console.log('Keeping Chrome open for 7 seconds before closing...');

    for (let i = 7; i > 0; i--) {
      process.stdout.write(`Closing in ${i} seconds...\r`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log('\nDone! Closing Chrome cleanly.');
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore
      }
    }
    await browser.kill();
    await fixtureServers.close();
  }
}

runLiveDemo().catch(console.error);
