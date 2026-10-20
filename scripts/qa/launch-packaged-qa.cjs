const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

function expectedExecutable(projectRoot) {
  return path.join(projectRoot, 'out', `RoofRoom Data Collector-darwin-${process.arch}`,
    'RoofRoom Data Collector.app', 'Contents', 'MacOS', 'RoofRoom Data Collector');
}

function verifyPackagedQaBuild(executable) {
  const receiptFile = path.resolve(path.dirname(executable), '../../../packaged-qa-build.json');
  const stat = fs.lstatSync(receiptFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o600 || stat.size > 4096) throw new Error('Invalid packaged QA digest receipt.');
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  const archive = path.resolve(path.dirname(executable), '../Resources/app.asar');
  if (fs.realpathSync(archive) !== archive) throw new Error('Unsafe packaged QA archive path.');
  const hash = (filename) => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  if (receipt.schema_version !== 1 || receipt.verified_isolation_entry !== true || receipt.executable !== executable
    || receipt.executable_sha256 !== hash(executable) || receipt.asar_sha256 !== hash(archive)) {
    throw new Error('Stale packaged QA build: executable/archive digest mismatch. Re-verify isolation before launch.');
  }
}

function launchPackagedQa(buildRoot, projectRoot, qa) {
  if (process.platform !== 'darwin') throw new Error('Packaged QA requires local macOS.');
  const helpers = require(path.join(buildRoot, 'main/app/packaged-qa-isolation.js'));
  const executable = helpers.validatePackagedQaExecutable(expectedExecutable(projectRoot), expectedExecutable(projectRoot));
  // A verified build receipt is external to launch; never bless an arbitrary/stale app here.
  verifyPackagedQaBuild(executable);
  const state = qa ?? helpers.createPackagedQaRoot(executable);
  helpers.validatePackagedQaRoot(state.root, state.token, executable);
  // Only retain OS launch essentials; never inherit Node/DYLD injection or provider credentials.
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'].filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]));
  Object.assign(env, { ROOFROOM_PACKAGED_QA_ROOT: state.root, ROOFROOM_PACKAGED_QA_TOKEN: state.token });
  const args = ['--roofroom-packaged-qa', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'];
  fs.writeFileSync(path.join(state.root, 'qa-launch.json'), JSON.stringify({ executable, args, root: state.root }, null, 2),
    { flag: 'wx', mode: 0o600 });
  const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  return { child, ...state };
}

module.exports = { launchPackagedQa, expectedExecutable, verifyPackagedQaBuild };

if (require.main === module) {
  const [buildRoot] = process.argv.slice(2);
  const projectRoot = path.resolve(__dirname, '../..');
  const result = launchPackagedQa(buildRoot, projectRoot);
  console.log(`Disposable QA root: ${result.root}`);
  for (const stream of [result.child.stdout, result.child.stderr]) stream.on('data', (chunk) => process.stderr.write(chunk));
  process.on('SIGINT', () => result.child.kill('SIGINT'));
  result.child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  result.child.on('exit', (code, signal) => { console.log(`Packaged QA exit: ${code ?? signal}`); process.exitCode = code ?? 1; });
}
