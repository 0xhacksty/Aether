import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { BridgeConfigSchema } from '@aether/shared';
import { LoopbackCdpBridge } from '../src/mcp/bridge.js';

describe('authenticated loopback bridge', () => {
  let bridge: LoopbackCdpBridge | undefined;
  let tempDirectory: string | undefined;

  afterEach(async () => {
    await bridge?.close();
    bridge = undefined;
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = undefined;
  });

  it('relays CDP requests, responses, and events between the MCP and extension sockets', async () => {
    tempDirectory = await mkdtemp(path.join(tmpdir(), 'aether-bridge-'));
    const configPath = path.join(tempDirectory, 'bridge.json');
    bridge = new LoopbackCdpBridge(configPath);
    await bridge.start();
    const config = BridgeConfigSchema.parse(JSON.parse(await readFile(configPath, 'utf8')));

    const extension = new WebSocket(`ws://127.0.0.1:${config.port}/extension`, {
      headers: {
        Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        Authorization: `Bearer ${config.token}`,
      },
    });
    const cdp = new WebSocket(`ws://127.0.0.1:${config.port}/cdp?token=${config.token}`);
    await Promise.all([waitForOpen(extension), waitForOpen(cdp)]);

    const forwardedRequest = nextMessage(extension);
    cdp.send(JSON.stringify({ id: 41, method: 'Page.enable' }));
    expect(JSON.parse(await forwardedRequest)).toMatchObject({ id: 41, method: 'Page.enable' });

    const forwardedResponse = nextMessage(cdp);
    extension.send(JSON.stringify({ id: 41, result: {} }));
    expect(JSON.parse(await forwardedResponse)).toMatchObject({ id: 41, result: {} });

    const forwardedEvent = nextMessage(cdp);
    extension.send(JSON.stringify({ method: 'Page.loadEventFired', params: {} }));
    expect(JSON.parse(await forwardedEvent)).toMatchObject({ method: 'Page.loadEventFired' });

    extension.close();
    cdp.close();
  });
});

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(data.toString()));
    socket.once('error', reject);
  });
}
