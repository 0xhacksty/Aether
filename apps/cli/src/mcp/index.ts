import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCPBrowserSession, type MCPBrowserSessionOptions } from './browser-session.js';
import { createAetherMcpServer } from './server.js';
import { LoopbackCdpBridge } from './bridge.js';

export interface MCPServerOptions extends MCPBrowserSessionOptions {
  direct?: boolean;
}

export async function runMcpServer(options: MCPServerOptions = {}): Promise<void> {
  const bridge = options.direct ? undefined : new LoopbackCdpBridge();
  await bridge?.start();
  let browser: MCPBrowserSession;
  try {
    if (options.direct) browser = await MCPBrowserSession.launch(options);
    else if (bridge) browser = await MCPBrowserSession.connect(bridge.cdpUrl);
    else throw new Error('MCP bridge failed to initialize');
  } catch (error) {
    await bridge?.close();
    throw error;
  }
  const server = createAetherMcpServer(browser);
  const transport = new StdioServerTransport();
  server.server.onclose = () => {
    void browser.close();
    void bridge?.close();
  };
  await server.connect(transport);
  process.once('SIGINT', () => {
    void server.close();
  });
  process.once('SIGTERM', () => {
    void server.close();
  });
}

export { MCPBrowserSession } from './browser-session.js';
export { createAetherMcpServer } from './server.js';
