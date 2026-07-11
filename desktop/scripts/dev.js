/**
 * Dev launcher: removes ELECTRON_RUN_AS_NODE before spawning electron-vite.
 * VS Code terminal inherits ELECTRON_RUN_AS_NODE=1 from VS Code's own Electron
 * process. Electron checks for variable *existence*, not value, so cross-env
 * setting it to "" isn't enough — we must delete it entirely.
 */
const { spawn } = require('child_process')

delete process.env.ELECTRON_RUN_AS_NODE

// Use npx so Node resolves the binary — avoids spaces-in-path issues on Windows
const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
