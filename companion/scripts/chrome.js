import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

async function runChrome() {
  const extensionPath = path.resolve('dist');
  const tempProfileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-profile-'));
  const chromePath = process.argv[2];
  
  const fullChromeCommandArgs = [
    "--user-data-dir=" + tempProfileDir,
    "--load-extension=" + extensionPath,
  ];
  
  spawn(chromePath, fullChromeCommandArgs, {
    stdio: 'inherit',
    detached: true
  });
}

runChrome().catch(e => {
  console.error(e);
  process.exit(1);
});