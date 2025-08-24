# Bogaz_Harita

Setup done for local development and MCP stubs.

## MCP Configuration

### Available MCPs:
- **Context 7**: Up-to-date code documentation
- **Filesystem**: File operations with project access
- **Serena**: Coding agent with semantic retrieval
- **Playwright**: Browser testing framework
- **Git**: Version control system

### Usage:

#### Local Development
```bash
# Run tests
npx playwright test

# Start all MCPs
npm run mcp:start
```

#### Cursor Setup
1. Copy `cursor-mcp-config.json` content to Cursor's MCP settings
2. Or use the config directly in Cursor's MCP configuration

#### Claude Code Setup
1. MCP config automatically copied to `~/.claude-code/mcp-servers.json`
2. Restart Claude Code to load MCPs
3. Available MCPs: Context 7, Filesystem, Serena

### MCP Details:
- **Context 7**: API key configured, provides code documentation
- **Filesystem**: Project directory access enabled
- **Serena**: Python 3.11 with uv package manager
- **Playwright**: Testing framework ready
- **Git**: Repository initialized

// NEXT: Document Context 7 and Memory integration steps per PRD Section 3.2


