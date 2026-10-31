import { CDPClient, ChromeLauncher, FrameManager, type CDPSession } from '@aether/cdp';
import { Perceiver } from '@aether/perceiver';

export interface ProbeResult {
  url: string;
  title: string;
  framesCount: number;
  elementCount: number;
  tokenEstimate: number;
  truncated: boolean;
  captureTimeMs: number;
  outlineText: string;
}

export async function runProbe(
  url: string,
  verbose = true,
  headless = true,
): Promise<ProbeResult> {
  const browser = await ChromeLauncher.launch({ headless });
  let client: CDPClient | null = null;

  try {
    client = await CDPClient.connect(browser.wsEndpoint);

    // Discover page target
    const targetsResult = await client.sendCommand<{ targetInfos: Array<{ targetId: string; type: string }> }>(
      'Target.getTargets',
    );
    const pageTarget = targetsResult.targetInfos.find((t) => t.type === 'page');
    if (!pageTarget) {
      throw new Error('No page target found in Chrome');
    }

    // Attach to page target
    const session = await client.attachToTarget(pageTarget.targetId);

    // Setup auto attach for child frames/OOPIFs
    await session.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });

    await session.send('Page.enable');
    await session.send('Accessibility.enable');

    const frameManager = new FrameManager();

    // Listen to session attach events
    client.on('sessionAttached', (childSession: CDPSession) => {
      frameManager.mapSessionToFrame(childSession.sessionId, childSession.targetId);
    });

    // Navigate to URL and wait for load
    const loadPromise = new Promise<void>((resolve) => {
      const handler = () => {
        resolve();
      };
      session.once('Page.loadEventFired', handler);
      // Fallback timeout in case loadEvent already fired or delayed
      setTimeout(resolve, 8000);
    });

    await session.send('Page.navigate', { url });
    await loadPromise;

    // Small delay for DOM/AX tree to settle
    await new Promise((r) => setTimeout(r, 400));

    // Initialize frame tree
    await frameManager.initFromSession(session, client);

    // Capture with Perceiver
    const perceiver = new Perceiver();
    const startTime = performance.now();
    const snapshot = await perceiver.capture(session, frameManager);
    const captureTimeMs = Number((performance.now() - startTime).toFixed(2));

    const result: ProbeResult = {
      url: snapshot.url,
      title: snapshot.title,
      framesCount: snapshot.framesCount,
      elementCount: snapshot.elementCount,
      tokenEstimate: snapshot.tokenEstimate,
      truncated: snapshot.truncated,
      captureTimeMs,
      outlineText: snapshot.formattedText,
    };

    if (verbose) {
      console.log('----------------------------------------------------');
      console.log(`URL: ${result.url}`);
      console.log(`Title: "${result.title}"`);
      console.log(`Frames: ${result.framesCount} | Elements: ${result.elementCount} | Truncated: ${result.truncated}`);
      console.log(`Token Estimate: ~${result.tokenEstimate} tokens | Capture Time: ${result.captureTimeMs} ms`);
      console.log('----------------------------------------------------');
      console.log(result.outlineText);
      console.log('----------------------------------------------------');
    }

    if (!headless) {
      console.log('[Headed mode] Browser is open on screen. Waiting 5 seconds before closing...');
      await new Promise((r) => setTimeout(r, 5000));
    }

    return result;
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close error
      }
    }
    await browser.kill();
  }
}
