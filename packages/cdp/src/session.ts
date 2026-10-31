import { EventEmitter } from 'node:events';
import type { CDPClient } from './client.js';

export interface CDPSessionEvents {
  [event: string]: (...args: unknown[]) => void;
}

export class CDPSession extends EventEmitter {
  public readonly sessionId: string;
  public readonly targetType: string;
  public readonly targetId: string;
  private readonly client: CDPClient;
  private detached = false;

  constructor(
    client: CDPClient,
    sessionId: string,
    targetType: string,
    targetId: string,
  ) {
    super();
    this.client = client;
    this.sessionId = sessionId;
    this.targetType = targetType;
    this.targetId = targetId;
  }

  public get isDetached(): boolean {
    return this.detached;
  }

  public async send<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (this.detached) {
      throw new Error(`Cannot send command "${method}" on detached session ${this.sessionId}`);
    }
    return this.client.sendCommand<T>(method, params, this.sessionId);
  }

  public async detach(): Promise<void> {
    if (this.detached) return;
    this.detached = true;
    try {
      await this.client.sendCommand('Target.detachFromTarget', { sessionId: this.sessionId });
    } catch {
      // Ignore detach errors if target already closed
    }
    this.emit('detached');
    this.removeAllListeners();
  }

  /**
   * Internal dispatcher for CDP events targeted to this session
   */
  public _dispatchSessionEvent(method: string, params: unknown): void {
    this.emit(method, params);
  }

  /**
   * Internal notification when target detached
   */
  public _onDetached(): void {
    this.detached = true;
    this.emit('detached');
  }
}
