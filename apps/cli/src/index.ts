#!/usr/bin/env node
import { runProbe } from './probe.js';
import { runMcpServer } from './mcp/index.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'probe') {
    const url = args[1];
    if (!url) {
      console.error('Usage: aether probe <url> [--headed]');
      process.exit(1);
    }
    const isHeaded = args.includes('--headed') || args.includes('--visible');
    try {
      await runProbe(url, true, !isHeaded);
    } catch (err) {
      console.error('Probe failed:', err);
      process.exit(1);
    }
  } else if (command === 'mcp') {
    try {
      await runMcpServer({ headless: args.includes('--headless'), direct: args.includes('--direct') });
    } catch (err) {
      console.error('MCP server failed:', err);
      process.exit(1);
    }
  } else {
    console.log(`Aether: Authentic Agentic Browser Engine
Commands:
  probe <url> [--headed]    Inspect a web page outline, element refs, tokens and frames
  mcp [--direct] [--headless]  Start MCP over the extension bridge (or Direct CDP for tests)
`);
  }
}

void main();
