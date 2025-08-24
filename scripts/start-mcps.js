const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function readMcpConfig() {
  const cfgPath = path.join(__dirname, '..', 'mcp-config.json');
  return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
}

function startServer(command, args, name) {
  const child = spawn(command, args, { stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    console.log(`${name} exited with code ${code}`);
  });
  child.on('error', (err) => {
    console.error(`${name} failed:`, err);
  });
  return child;
}

function main() {
  const cfg = readMcpConfig();
  const procs = [];
  for (const mcp of cfg.mcps) {
    if (mcp.server && mcp.server.command) {
      const cmd = mcp.server.command;
      const args = Array.isArray(mcp.server.args) ? mcp.server.args : [];
      console.log(`Starting MCP: ${mcp.name} -> ${cmd} ${args.join(' ')}`);
      procs.push(startServer(cmd, args, mcp.name));
    } else if (mcp.package) {
      // fallback: run package via npx
      console.log(`Starting MCP via npx: ${mcp.name} -> npx -y ${mcp.package}`);
      procs.push(startServer('npx', ['-y', mcp.package], mcp.name));
    } else {
      console.log(`No start command for MCP: ${mcp.name}`);
    }
  }

  process.on('SIGINT', () => {
    console.log('Stopping MCPs...');
    for (const p of procs) {
      try { p.kill('SIGINT'); } catch (e) {}
    }
    process.exit();
  });
}

main();

// NEXT: Add more robust logging and restart logic per PRD Section 4.1


