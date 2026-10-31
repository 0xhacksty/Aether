#!/usr/bin/env node
import { runProbe } from './probe.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'probe') {
    const url = args[1];
    if (!url) {
      console.error('Usage: aether probe <url>');
      process.exit(1);
    }
    try {
      await runProbe(url, true);
    } catch (err) {
      console.error('Probe failed:', err);
      process.exit(1);
    }
  } else {
    console.log(`Aether: Authentic Agentic Browser Engine
Commands:
  probe <url>    Inspect a web page outline, element refs, tokens and frames
`);
  }
}

void main();
