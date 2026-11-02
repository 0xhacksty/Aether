import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { BridgeConfigSchema, BridgeMessageSchema } from '@aether/shared';
import WebSocket from 'ws';

const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;
const MAX_BUFFER_BYTES = MAX_NATIVE_MESSAGE_BYTES + 4;

async function main(): Promise<void> {
  const origin = process.argv[2];
  if (!origin || !/^chrome-extension:\/\/[a-p]{32}\/?$/.test(origin)) {
    throw new Error('Chrome extension origin is missing or invalid');
  }
  const extensionOrigin = origin.replace(/\/$/, '');

  const configPath = process.env.AETHER_BRIDGE_CONFIG
    ?? path.join(homedir(), '.aether', 'bridge.json');
  await mkdir(path.dirname(configPath), { recursive: true });
  const rawConfig = await readFile(configPath, 'utf8');
  const config = BridgeConfigSchema.parse(JSON.parse(rawConfig));
  const socket = new WebSocket(`ws://127.0.0.1:${config.port}/extension`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Origin: extensionOrigin,
    },
    maxPayload: MAX_NATIVE_MESSAGE_BYTES,
  });

  let input = Buffer.alloc(0);
  const queuedMessages: string[] = [];
  socket.on('open', () => {
    for (const message of queuedMessages.splice(0)) socket.send(message);
  });
  process.stdin.on('data', (chunk: Buffer) => {
    input = Buffer.concat([input, chunk]);
    if (input.length > MAX_BUFFER_BYTES) {
      process.exitCode = 1;
      socket.close(1009, 'Native message is too large');
      process.stdin.destroy();
      return;
    }

    while (input.length >= 4) {
      const messageLength = input.readUInt32LE(0);
      if (messageLength > MAX_NATIVE_MESSAGE_BYTES) {
        process.exitCode = 1;
        socket.close(1009, 'Native message is too large');
        process.stdin.destroy();
        return;
      }
      if (input.length < messageLength + 4) return;
      const payload = input.subarray(4, messageLength + 4).toString('utf8');
      input = input.subarray(messageLength + 4);
      try {
        const message = BridgeMessageSchema.parse(JSON.parse(payload));
        const encoded = JSON.stringify(message);
        if (socket.readyState === WebSocket.OPEN) socket.send(encoded);
        else if (socket.readyState === WebSocket.CONNECTING) queuedMessages.push(encoded);
        else throw new Error('MCP bridge is disconnected');
      } catch {
        process.exitCode = 1;
        socket.close(1003, 'Invalid native bridge message');
        process.stdin.destroy();
        return;
      }
    }
  });

  socket.on('message', (data) => {
    try {
      const message = BridgeMessageSchema.parse(JSON.parse(data.toString()));
      writeNativeMessage(JSON.stringify(message));
    } catch {
      socket.close(1003, 'Invalid bridge message');
    }
  });
  socket.on('error', () => { process.exitCode = 1; });
  socket.on('close', () => process.stdin.destroy());
  process.stdin.on('end', () => socket.close(1000, 'Extension disconnected'));
}

function writeNativeMessage(message: string): void {
  const payload = Buffer.from(message, 'utf8');
  if (payload.length > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error('Bridge response exceeds Chrome Native Messaging 1 MiB limit');
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
