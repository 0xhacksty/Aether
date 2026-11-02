import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'node:path';
import { startFixtureServers, type FixtureServers } from '@aether/fixtures';
import { MCPBrowserSession, createAetherMcpServer } from '../src/mcp/index.js';

describe('Step 3 MCP server connection', () => {
  let fixtures: FixtureServers;
  let browser: MCPBrowserSession;
  let server: McpServer;
  let client: Client;

  beforeAll(async () => {
    fixtures = await startFixtureServers(4105, 4106);
    browser = await MCPBrowserSession.launch({ headless: true });
    server = createAetherMcpServer(browser);
    client = new Client({ name: 'aether-mcp-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  }, 30000);

  afterAll(async () => {
    if (client) await client.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    if (browser) await browser.close();
    if (fixtures) await fixtures.close();
  });

  it('initializes, lists the seven tools, and calls them against a fixture', async () => {
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      'act',
      'ask',
      'done',
      'find',
      'navigate',
      'read',
      'screenshot',
    ]);

    const page = await client.callTool({
      name: 'navigate',
      arguments: { url: `${fixtures.mainBaseUrl}/form.html` },
    });
    const pageText = page.content.find((block) => block.type === 'text');
    expect(pageText?.type === 'text' ? pageText.text : '').toContain('<page untrusted>');
    const nameRef = (pageText?.type === 'text' ? pageText.text : '').match(/\[(e\d+)\] textbox "Full Name/);
    expect(nameRef).not.toBeNull();

    const findResult = await client.callTool({ name: 'find', arguments: { query: 'Full Name' } });
    const findText = findResult.content.find((block) => block.type === 'text');
    expect(findText?.type === 'text' ? findText.text : '').toContain(nameRef?.[1] ?? '');

    const readResult = await client.callTool({ name: 'read', arguments: { ref: nameRef?.[1] } });
    const readText = readResult.content.find((block) => block.type === 'text');
    expect(readText?.type === 'text' ? readText.text : '').toContain('textbox "Full Name');

    const action = await client.callTool({
      name: 'act',
      arguments: {
        actions: [{ ref: nameRef?.[1], op: 'type', value: 'MCP test' }],
        risk: 'reversible',
        why: 'Exercise the MCP browser action',
      },
    });
    const actionText = action.content.find((block) => block.type === 'text');
    expect(actionText?.type === 'text' ? actionText.text : '').toContain('<page untrusted>');

    const screenshot = await client.callTool({ name: 'screenshot', arguments: {} });
    expect(screenshot.content.some((block) => block.type === 'image')).toBe(true);

    const ask = await client.callTool({
      name: 'ask',
      arguments: { question: 'Choose a test option', options: ['A', 'B'] },
    });
    expect(ask.content.find((block) => block.type === 'text')).toMatchObject({ type: 'text' });

    const done = await client.callTool({
      name: 'done',
      arguments: { result: 'Form filled', evidence: 'Field value changed through CDP.' },
    });
    expect(done.content.find((block) => block.type === 'text')).toMatchObject({ type: 'text' });
  }, 45000);

  it('connects through the shipped stdio entry point', async () => {
    const stdioClient = new Client({ name: 'aether-stdio-test-client', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        path.resolve('node_modules/tsx/dist/cli.mjs'),
        path.resolve('apps/cli/src/index.ts'),
        'mcp',
        '--headless',
        '--direct',
      ],
      cwd: process.cwd(),
      stderr: 'inherit',
    });
    try {
      await stdioClient.connect(transport);
      const tools = await stdioClient.listTools();
      expect(tools.tools).toHaveLength(7);
      const page = await stdioClient.callTool({
        name: 'navigate',
        arguments: { url: `${fixtures.mainBaseUrl}/form.html` },
      });
      expect(page.content.find((block) => block.type === 'text')).toMatchObject({
        type: 'text',
        text: expect.stringContaining('<page untrusted>'),
      });
    } finally {
      await stdioClient.close().catch(() => {});
    }
  }, 45000);
});
