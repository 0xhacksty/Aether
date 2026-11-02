# Step 4: Connect an MCP host to Chrome

This setup uses the connected MCP host for model reasoning. Aether starts as an MCP stdio server, and the extension connects the selected Chrome tab through the native messaging host and an authenticated loopback WebSocket.

## Build

From the repository root in PowerShell:

```powershell
pnpm install
pnpm extension:build
pnpm native-host:build
```

## Load the unpacked extension

1. Open `chrome://extensions` in Chrome 125 or later.
2. Turn on **Developer mode** and choose **Load unpacked**.
3. Select `apps/extension/.output/chrome-mv3`.
4. Copy the extension ID shown on the extension card.

## Register the native host

Run PowerShell from the repository root. The registration is per-user and writes the native host manifest and Chrome registry entry under `HKCU`:

```powershell
powershell -ExecutionPolicy Bypass -File apps/native-host/install.ps1 -ExtensionId YOUR_32_CHARACTER_EXTENSION_ID
```

Rebuild the native host after changing its source, then reload the unpacked extension in Chrome.

## Add Aether to the MCP host

Configure the MCP client to start Aether using the repository's absolute path. For MCP clients that accept a command and arguments, use:

```json
{
  "mcpServers": {
    "aether": {
      "command": "pnpm",
      "args": ["--dir", "D:\\Agentic Browser\\aether", "mcp"]
    }
  }
}
```

Start or reconnect the MCP client. Aether creates `~/.aether/bridge.json` with a per-process token and loopback port. Open the Aether extension side panel from Chrome's toolbar; the panel shows the connection and recent browser actions. The seven MCP tools are `navigate`, `act`, `find`, `read`, `screenshot`, `ask`, and `done`.

For deterministic fixture tests, use `pnpm mcp --direct --headless`; that path starts an isolated Chrome instance instead of using the extension.

## Native messaging spike

Run `pnpm native-host:build` followed by:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/spikes/native-host-stdio.ps1
```

The spike checks that the Windows command launcher preserves a little-endian framed stdio message. It does not validate Chrome registry discovery or a real extension installation; those still need a smoke check on the target machine.
