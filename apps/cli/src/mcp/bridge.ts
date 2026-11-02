import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { BridgeConfigSchema, BridgeMessageSchema, CdpWireMessageSchema } from '@aether/shared';

const MAX_FRAME_BYTES = 10 * 1024 * 1024;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export class LoopbackCdpBridge extends EventEmitter {
  private readonly token = randomBytes(32).toString('hex');
  private readonly configPath: string;
  private readonly server = createServer();
  private readonly webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  private readonly pending = new Map<number, WebSocket>();
  private readonly cdpClients = new Set<WebSocket>();
  private extensionSocket?: WebSocket;
  private port?: number;
  private closed = false;

  constructor(configPath = path.join(homedir(), '.aether', 'bridge.json')) {
    super();
    this.configPath = configPath;
    this.server.on('upgrade', (request, socket, head) => this.handleUpgrade(request, socket, head));
    this.webSocketServer.on('connection', (socket, request) => this.handleConnection(socket, request));
  }

  public get cdpUrl(): string {
    if (!this.port) throw new Error('MCP WebSocket bridge is not listening');
    return `ws://127.0.0.1:${this.port}/cdp?token=${this.token}`;
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });

    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to read local bridge address');
    this.port = address.port;
    const config = BridgeConfigSchema.parse({ port: this.port, token: this.token });
    await mkdir(path.dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.extensionSocket?.close(1001, 'MCP server closed');
    for (const client of this.cdpClients) client.close(1001, 'MCP server closed');
    this.webSocketServer.close();
    if (this.server.listening) {
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }
    try {
      const config = BridgeConfigSchema.parse(JSON.parse(await readFile(this.configPath, 'utf8')));
      if (config.token === this.token) await unlink(this.configPath);
    } catch {
      // Another local MCP process may have replaced the bridge config.
    }
  }

  private handleUpgrade(
    request: IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ): void {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/cdp' && url.pathname !== '/extension') {
      socket.destroy();
      return;
    }

    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      socket.destroy();
      return;
    }

    if (url.pathname === '/cdp' && !this.isTokenValid(url.searchParams.get('token'))) {
      socket.destroy();
      return;
    }

    if (url.pathname === '/extension') {
      const origin = request.headers.origin;
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
      if (!origin || !EXTENSION_ORIGIN.test(origin) || !this.isTokenValid(token)) {
        socket.destroy();
        return;
      }
    }

    this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      this.webSocketServer.emit('connection', webSocket, request);
    });
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/extension') {
      this.extensionSocket?.close(1013, 'A newer extension host connected');
      this.extensionSocket = socket;
      this.emit('extensionConnected');
      socket.on('message', (data) => this.onExtensionMessage(socket, data.toString()));
      socket.on('close', () => {
        if (this.extensionSocket === socket) this.extensionSocket = undefined;
        this.emit('extensionDisconnected');
      });
      return;
    }

    this.cdpClients.add(socket);
    socket.on('message', (data) => this.onCdpMessage(socket, data.toString()));
    socket.on('close', () => {
      this.cdpClients.delete(socket);
      for (const [requestId, client] of this.pending) {
        if (client === socket) this.pending.delete(requestId);
      }
    });
  }

  private onCdpMessage(socket: WebSocket, raw: string): void {
    let message: unknown;
    try {
      message = CdpWireMessageSchema.parse(JSON.parse(raw));
    } catch {
      socket.close(1003, 'Invalid CDP message');
      return;
    }

    if (!isCdpRequest(message)) return;
    if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: message.id, error: { code: -32000, message: 'Aether extension is disconnected' } }));
      return;
    }
    this.pending.set(message.id, socket);
    this.extensionSocket.send(JSON.stringify(message));
  }

  private onExtensionMessage(socket: WebSocket, raw: string): void {
    let message: unknown;
    try {
      message = BridgeMessageSchema.parse(JSON.parse(raw));
    } catch {
      socket.close(1003, 'Invalid bridge message');
      return;
    }

    if (isCdpResponse(message)) {
      const target = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (target?.readyState === WebSocket.OPEN) target.send(JSON.stringify(message));
      return;
    }

    if (isCdpEvent(message)) {
      for (const client of this.cdpClients) {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
      }
      return;
    }

    this.emit('status', message);
  }

  private isTokenValid(candidate: string | null | undefined): boolean {
    if (!candidate || candidate.length !== this.token.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(this.token));
  }
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isCdpRequest(message: unknown): message is { id: number; method: string } {
  return typeof message === 'object' && message !== null && 'id' in message && 'method' in message;
}

function isCdpResponse(message: unknown): message is { id: number } {
  return typeof message === 'object' && message !== null && 'id' in message && !('method' in message);
}

function isCdpEvent(message: unknown): message is { method: string } {
  return typeof message === 'object' && message !== null && 'method' in message && !('id' in message);
}
