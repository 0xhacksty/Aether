import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { DEFAULT_CDP_TIMEOUT_MS } from '@aether/shared';
import { CDPSession } from './session.js';

interface PendingCommand {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: string;
  };
}

export class CDPClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCommand>();
  private sessions = new Map<string, CDPSession>();
  private closed = false;

  public static async connect(wsUrl: string): Promise<CDPClient> {
    const client = new CDPClient();
    await client.init(wsUrl);
    return client;
  }

  private async init(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.on('open', () => {
        resolve();
      });

      socket.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(data.toString());
      });

      socket.on('error', (err: Error) => {
        if (!this.closed) {
          reject(err);
        }
      });

      socket.on('close', () => {
        this.onClose();
      });
    });
  }

  private handleMessage(raw: string): void {
    let msg: CDPMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.id !== undefined) {
      const cmd = this.pending.get(msg.id);
      if (cmd) {
        this.pending.delete(msg.id);
        clearTimeout(cmd.timer);
        if (msg.error) {
          cmd.reject(
            new Error(`CDP Error in ${cmd.method}: ${msg.error.message} (${msg.error.code})`),
          );
        } else {
          cmd.resolve(msg.result);
        }
      }
      return;
    }

    if (msg.method) {
      // Session-specific event
      if (msg.sessionId) {
        const session = this.sessions.get(msg.sessionId);
        if (session) {
          session._dispatchSessionEvent(msg.method, msg.params);
        }
      }

      // Root level or auto-attach handling
      if (msg.method === 'Target.attachedToTarget' && msg.params) {
        const params = msg.params as {
          sessionId: string;
          targetInfo: { targetId: string; type: string };
          waitingForDebugger?: boolean;
        };
        const newSession = new CDPSession(
          this,
          params.sessionId,
          params.targetInfo.type,
          params.targetInfo.targetId,
        );
        this.sessions.set(params.sessionId, newSession);

        // Auto-attach is NOT recursive: re-issue setAutoAttach on every child session (e.g. for OOPIFs)
        newSession
          .send('Target.setAutoAttach', {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true,
          })
          .catch(() => {
            // Non-critical if child target does not support sub-attaching
          });

        this.emit('sessionAttached', newSession);
        if (msg.sessionId) {
          const parentSession = this.sessions.get(msg.sessionId);
          if (parentSession) {
            parentSession.emit('childSessionAttached', newSession);
          }
        }
      } else if (msg.method === 'Target.detachedFromTarget' && msg.params) {
        const params = msg.params as { sessionId: string };
        const session = this.sessions.get(params.sessionId);
        if (session) {
          session._onDetached();
          this.sessions.delete(params.sessionId);
          this.emit('sessionDetached', session);
        }
      }

      this.emit(msg.method, msg.params);
    }
  }

  public sendCommand<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    timeoutMs = DEFAULT_CDP_TIMEOUT_MS,
  ): Promise<T> {
    if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP connection is closed'));
    }

    const id = this.nextId++;
    const message: Record<string, unknown> = { id, method };
    if (params) message.params = params;
    if (sessionId) message.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `CDP command "${method}" timed out after ${timeoutMs}ms${
              sessionId ? ` (sessionId: ${sessionId})` : ''
            }`,
          ),
        );
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });

      this.ws?.send(JSON.stringify(message));
    });
  }

  public getSession(sessionId: string): CDPSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getAllSessions(): CDPSession[] {
    return Array.from(this.sessions.values());
  }

  public async attachToTarget(targetId: string): Promise<CDPSession> {
    const result = await this.sendCommand<{ sessionId: string }>(
      'Target.attachToTarget',
      { targetId, flatten: true },
    );
    let session = this.sessions.get(result.sessionId);
    if (!session) {
      session = new CDPSession(this, result.sessionId, 'page', targetId);
      this.sessions.set(result.sessionId, session);
    }
    return session;
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cmd of this.pending.values()) {
      clearTimeout(cmd.timer);
      cmd.reject(new Error('CDP connection closed'));
    }
    this.pending.clear();
    for (const session of this.sessions.values()) {
      session._onDetached();
    }
    this.sessions.clear();
    this.emit('close');
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.onClose();
  }
}
