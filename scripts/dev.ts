export {} // make this a module so top-level await works
// Use the same bun binary that's running this script
const bunBin = process.execPath

// Runs both the API server and Vite dev server concurrently
const api = Bun.spawn([bunBin, '--hot', 'src/server/index.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
  env: { ...process.env, PORT: '3001' },
})

const client = Bun.spawn([bunBin, 'x', '--bun', 'vite'], {
  stdout: 'inherit',
  stderr: 'inherit',
})

process.on('SIGINT', () => {
  api.kill()
  client.kill()
  process.exit(0)
})

await Promise.all([api.exited, client.exited])
