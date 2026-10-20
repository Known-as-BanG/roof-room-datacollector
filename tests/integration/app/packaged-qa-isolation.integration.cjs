const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const [buildRoot, projectRoot] = process.argv.slice(2);
const modulePath = path.join(buildRoot, 'main/app/packaged-qa-isolation.js');
const { createPackagedQaRoot, initializePackagedQaIsolation, validatePackagedQaRoot,
  validatePackagedQaExecutable } = require(modulePath);
const executableRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'qa-executable-'));
const executable = path.join(executableRoot, 'out', `RoofRoom Data Collector-darwin-${process.arch}`,
  'RoofRoom Data Collector.app/Contents/MacOS/RoofRoom Data Collector');
fs.mkdirSync(path.dirname(executable), { recursive: true });
fs.writeFileSync(executable, 'synthetic executable for safety validation only', { mode: 0o700 });
process.on('exit', () => fs.rmSync(executableRoot, { recursive: true, force: true }));

function fixture(t) {
  const qa = createPackagedQaRoot(executable);
  t.after(() => fs.rmSync(qa.root, { recursive: true, force: true }));
  const paths = { userData: '/forbidden-real-user-data', sessionData: '/forbidden-real-session',
    downloads: '/forbidden-real-downloads', exe: executable };
  const calls = [];
  const app = { isPackaged: true, isReady: () => false,
    whenReady: () => ({ then: () => Promise.resolve() }),
    getPath: (key) => paths[key], setPath: (key, value) => { calls.push(key); paths[key] = value; },
    setAppLogsPath: (value) => { paths.logs = value; },
    commandLine: { appendSwitch: (key, value) => calls.push([key, value]) } };
  const env = { ROOFROOM_PACKAGED_QA_ROOT: qa.root, ROOFROOM_PACKAGED_QA_TOKEN: qa.token };
  return { ...qa, app, paths, calls, env, argv: ['packaged-executable', '--roofroom-packaged-qa'] };
}

function runStartup(app, env, argv) {
  const entry = fs.readFileSync(path.join(buildRoot, 'main.js'), 'utf8');
  const startup = fs.readFileSync(path.join(buildRoot, 'main/app/packaged-qa-startup.js'), 'utf8');
  let subsequentImports = 0;
  const fakeProcess = { env, argv };
  const context = { process: fakeProcess, console, exports: {},
    require: (name) => {
      assert.equal(name, './main/app/packaged-qa-startup', 'Isolation must be the first runtime import');
      vm.runInNewContext(startup, { process: fakeProcess, console, exports: {}, require: (dependency) => {
        if (dependency === 'electron') return { app };
        return require(modulePath);
      } });
      subsequentImports += 1;
      throw new Error('STOP_AFTER_EARLY_HOOK');
    } };
  return { execute: () => vm.runInNewContext(entry, context), subsequentImports: () => subsequentImports };
}

test('ordinary launch leaves Electron paths and normal directory resolution unchanged', async () => {
  const calls = [];
  const app = { getPath: (key) => key === 'userData' ? '/ordinary/user-data' : '/ordinary/downloads',
    setPath: () => calls.push('setPath'), setAppLogsPath: (value) => calls.push(['logs', value]) };
  assert.equal(initializePackagedQaIsolation(app, {}, ['app']), null);
  assert.deepEqual(calls, []);
  // Actual entrypoint must take the same no-op hook before loading any application module.
  const entry = runStartup(app, {}, ['app']);
  assert.throws(entry.execute, /STOP_AFTER_EARLY_HOOK/);
  assert.deepEqual(calls, []);
  const directoryModule = path.join(buildRoot, 'main/app/application-directories.js');
  const exports = {};
  vm.runInNewContext(fs.readFileSync(directoryModule, 'utf8'), { exports, require: (name) => {
    if (name === 'electron') return { app };
    if (name === 'node:fs/promises') return { mkdir: async () => {} };
    return createRequire(directoryModule)(name);
  } });
  const directories = await exports.ensureApplicationDirectories();
  assert.equal(directories.app_data_root, '/ordinary/user-data/app-data');
  assert.equal(directories.database, '/ordinary/user-data/app-data/database');
  assert.equal(directories.public_downloads, '/ordinary/downloads/RoofRoom Data Collector');
});

test('QA hook assigns every Electron writable path before actual application imports, then native directories stay inside root', async (t) => {
  const f = fixture(t);
  const entry = runStartup(f.app, f.env, f.argv);
  assert.throws(entry.execute, /STOP_AFTER_EARLY_HOOK/);
  assert.equal(entry.subsequentImports(), 1);
  for (const key of ['appData', 'userData', 'sessionData', 'temp', 'logs', 'crashDumps', 'downloads']) {
    assert.ok(f.paths[key].startsWith(`${f.root}/`), key);
  }
  assert.ok(f.calls.some((call) => Array.isArray(call) && call[0] === 'disk-cache-dir' && call[1].startsWith(`${f.root}/`)));
  assert.equal(f.env.TMPDIR, f.paths.temp);
  const diagnostic = JSON.parse(fs.readFileSync(path.join(f.root, 'qa-paths.json')));
  assert.equal(diagnostic.paths.userData, f.paths.userData);
  assert.equal(JSON.stringify(diagnostic).includes(f.token), false);
  const directoryModule = path.join(buildRoot, 'main/app/application-directories.js');
  const code = fs.readFileSync(directoryModule, 'utf8');
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => name === 'electron' ? { app: f.app } : createRequire(directoryModule)(name) });
  const directories = await exports.ensureApplicationDirectories();
  for (const directory of Object.values(directories)) assert.ok(directory.startsWith(`${f.root}/`), directory);
  for (const suffix of ['database', 'credentials', 'browser-profiles', 'data/runs']) {
    assert.ok(path.join(directories.app_data_root, suffix).startsWith(`${f.root}/`));
  }
  assert.equal(fs.existsSync('/forbidden-real-user-data'), false);
});

test('missing, unsafe, symlinked, conflicting and unauthenticated QA configuration fails before bootstrap', (t) => {
  const cases = [
    (f) => { delete f.env.ROOFROOM_PACKAGED_QA_ROOT; },
    (f) => { delete f.env.ROOFROOM_PACKAGED_QA_TOKEN; },
    (f) => { f.argv = ['app']; },
    (f) => { f.argv.push('--roofroom-packaged-qa'); },
    (f) => { f.argv.push('--user-data-dir=/outside'); },
    (f) => { f.argv.push('--disk-cache-dir=/outside'); },
    (f) => { f.env.ROOFROOM_PACKAGED_QA_ROOT = ''; },
    (f) => { f.env.ROOFROOM_PACKAGED_QA_ROOT = '.'; },
    (f) => { f.env.ROOFROOM_PACKAGED_QA_ROOT = `${f.root}/../${path.basename(f.root)}`; },
    (f) => { f.env.ROOFROOM_PACKAGED_QA_TOKEN = 'incorrect'; },
    (f) => { f.app.isPackaged = false; },
    (f) => { f.app.isReady = () => true; },
    (f) => { f.paths.exe = '/unexpected/executable'; },
    (f) => { fs.chmodSync(f.root, 0o755); },
    (f) => { fs.unlinkSync(path.join(f.root, '.roofroom-packaged-qa.json')); },
    (f) => { fs.writeFileSync(path.join(f.root, '.roofroom-packaged-qa.json'), '{}'); },
    (f) => { fs.chmodSync(path.join(f.root, '.roofroom-packaged-qa.json'), 0o644); },
    (f) => { fs.symlinkSync(executableRoot, path.join(f.root, 'user-data')); },
    (f) => { fs.mkdirSync(path.join(f.root, 'user-data')); fs.symlinkSync(executableRoot, path.join(f.root, 'user-data/database')); },
    (f) => { const link = `${f.root}-link`; fs.symlinkSync(f.root, link); t.after(() => fs.unlinkSync(link)); f.env.ROOFROOM_PACKAGED_QA_ROOT = link; },
  ];
  for (const mutate of cases) {
    const f = fixture(t); mutate(f);
    const entry = runStartup({ ...f.app, exit: (code) => assert.equal(code, 1) }, f.env, f.argv);
    assert.throws(entry.execute);
    assert.equal(entry.subsequentImports(), 0, 'Rejected QA must not import normal bootstrap/database code');
    assert.deepEqual(f.calls, [], 'Rejected QA must not assign any path or initialize application state');
    assert.equal(fs.existsSync(path.join(f.root, 'qa-paths.json')), false);
  }
});

test('launcher verifies a canonical expected executable and private marker instead of arbitrary path overrides', (t) => {
  const f = fixture(t);
  assert.equal(validatePackagedQaExecutable(executable, executable), executable);
  assert.throws(() => validatePackagedQaExecutable(executable, '/unexpected/executable'));
  assert.throws(() => validatePackagedQaExecutable(`${executable}.missing`, `${executable}.missing`));
  const link = path.join(executableRoot, 'linked-executable'); fs.symlinkSync(executable, link);
  t.after(() => fs.unlinkSync(link));
  assert.throws(() => validatePackagedQaExecutable(link, link));
  assert.equal(validatePackagedQaRoot(f.root, f.token, executable), f.root);
  const { expectedExecutable } = require(path.join(projectRoot, 'scripts/qa/launch-packaged-qa.cjs'));
  assert.equal(expectedExecutable(projectRoot), path.join(projectRoot, 'out', `RoofRoom Data Collector-darwin-${process.arch}`,
    'RoofRoom Data Collector.app', 'Contents/MacOS/RoofRoom Data Collector'));
});

test('launcher rejects stale or unverified bundles before spawn and never stamps its own digest receipt', (t) => {
  const launchFile = path.join(projectRoot, 'scripts/qa/launch-packaged-qa.cjs');
  const archive = path.resolve(path.dirname(executable), '../Resources/app.asar');
  const receiptFile = path.resolve(path.dirname(executable), '../../../packaged-qa-build.json');
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.writeFileSync(archive, 'synthetic archive for digest validation only');
  const hash = (filename) => require('node:crypto').createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  const receipt = { schema_version: 1, executable, executable_sha256: hash(executable), asar_sha256: hash(archive), verified_isolation_entry: true };
  let spawned = 0;
  const exports = {};
  const localModule = { exports };
  const localRequire = (name) => name === 'node:child_process' ? { spawn: () => { spawned += 1; return {}; } } : require(name);
  localRequire.main = null;
  vm.runInNewContext(fs.readFileSync(launchFile, 'utf8'), { module: localModule, require: localRequire,
    __dirname: path.dirname(launchFile), process, console });
  const launch = () => localModule.exports.launchPackagedQa(buildRoot, executableRoot);
  assert.throws(launch, /receipt|ENOENT/i); assert.equal(spawned, 0);
  fs.writeFileSync(receiptFile, JSON.stringify(receipt), { mode: 0o600 });
  fs.appendFileSync(archive, 'stale');
  assert.throws(launch, /digest|stale|mismatch/i); assert.equal(spawned, 0);
  fs.writeFileSync(archive, 'synthetic archive for digest validation only');
  fs.appendFileSync(executable, 'changed');
  assert.throws(launch, /digest|stale|mismatch/i); assert.equal(spawned, 0);
  fs.writeFileSync(executable, 'synthetic executable for safety validation only');
  const result = launch(); t.after(() => fs.rmSync(result.root, { recursive: true, force: true }));
  assert.equal(spawned, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(receiptFile)), receipt, 'Launching cannot re-stamp a package');
});
