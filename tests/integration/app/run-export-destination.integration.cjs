const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const [build, work] = process.argv.slice(2);
const fixture = require('../export/general-raw-evidence-fixture.cjs');
const load = (name) => require(path.join(build, name));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parentFor = (f, name = 'delivery') => {
  const parent = path.join(f.root, name); fs.mkdirSync(parent); return parent;
};
const manifest = (result) => JSON.parse(fs.readFileSync(path.join(result.export_directory, 'MANIFEST.json')));
const history = (f) => f.repository.listJobs(f.run_id).map((job) => ({
  job, attempts: f.repository.listAttempts(job.job_id),
  artifact: job.accepted_artifact_id && f.repository.getArtifact(job.accepted_artifact_id),
}));

test('native selection is awaited on each invocation; cancellation produces no delivery', async (t) => {
  const f = await fixture(build, work, t); const parent = parentFor(f); let picks = 0;
  const select = async () => { picks++; return null; };
  assert.equal(await f.controller.exportRun(f.run_id, 'ALL', select), null);
  assert.equal(await f.controller.exportRun(f.run_id, 'SUCCESSFUL_ONLY', select), null);
  assert.equal(picks, 2);
  assert.deepEqual(fs.readdirSync(parent), []);
  assert.deepEqual(fs.readdirSync(path.join(f.directories.runs, f.run_id, 'exports')), []);
});

test('selected parent receives the exact Run, native bytes and complete provenance in both modes', async (t) => {
  const f = await fixture(build, work, t); const parent = parentFor(f); const before = history(f);
  for (const mode of ['ALL', 'SUCCESSFUL_ONLY']) {
    const result = await f.controller.exportRun(f.run_id, mode, async () => parent);
    assert.equal(result.export_directory, path.join(parent, f.run_id, 'exports', mode.toLowerCase()));
    assert.equal(result.collection_status, 'COMPLETE');
    assert.equal(manifest(result).run_id, f.run_id);
    assert.equal(manifest(result).workspace_id, f.workspace.workspace_id);
    assert.equal(manifest(result).mode, mode);
    const raw = JSON.parse(fs.readFileSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')));
    assert.equal(raw.files.length, 1);
    const file = raw.files[0]; const attempt = before[0].attempts[0];
    assert.equal(file.job_id, f.job.job_id); assert.equal(file.source_id, f.job.source_id);
    assert.equal(file.artifact_id, f.artifact.artifact_id); assert.equal(file.attempt_id, attempt.attempt_id);
    assert.equal(file.validation_id, attempt.validation_id); assert.equal(file.dataset_type, 'SITEMAP_URLS');
    const bytes = fs.readFileSync(path.join(result.export_directory, file.relative_path));
    assert.deepEqual(bytes, fs.readFileSync(f.rawPath));
    assert.equal(file.byte_size, bytes.length); assert.equal(file.sha256, sha(bytes));
  }
  assert.deepEqual(history(f), before);
  assert.deepEqual(fs.readdirSync(path.join(f.directories.runs, f.run_id, 'exports')), []);
});

test('separate Runs keep distinct child folders and existing delivery is never overwritten', async (t) => {
  const a = await fixture(build, work, t); const b = await fixture(build, work, t);
  const parent = parentFor(a);
  const first = await a.controller.exportRun(a.run_id, 'ALL', async () => parent);
  const bytes = fs.readFileSync(path.join(first.export_directory, 'MANIFEST.json'));
  const second = await b.controller.exportRun(b.run_id, 'ALL', async () => parent);
  assert.notEqual(first.export_directory, second.export_directory);
  assert.equal(manifest(first).run_id, a.run_id); assert.equal(manifest(second).run_id, b.run_id);
  await assert.rejects(a.controller.exportRun(a.run_id, 'ALL', async () => parent), /exist|overwrite/i);
  assert.deepEqual(fs.readFileSync(path.join(first.export_directory, 'MANIFEST.json')), bytes);
});

test('invalid, missing, inaccessible, symbolic and canonical-evidence destinations fail safely', async (t) => {
  const f = await fixture(build, work, t); const parent = parentFor(f); const before = history(f);
  const file = path.join(parent, 'ordinary-file'); fs.writeFileSync(file, 'untouched');
  const symbolic = path.join(f.root, 'symbolic-parent'); fs.symlinkSync(parent, symbolic);
  const denied = path.join(f.root, 'denied'); fs.mkdirSync(denied, 0o500);
  t.after(() => fs.chmodSync(denied, 0o700));
  for (const chosen of ['', 'relative', '/', file, path.join(parent, 'missing'), symbolic,
    f.directories.runs, path.dirname(f.rawPath), denied]) {
    await assert.rejects(f.controller.exportRun(f.run_id, 'ALL', async () => chosen));
  }
  assert.deepEqual(history(f), before);
  assert.equal(fs.readFileSync(file, 'utf8'), 'untouched');
  assert.deepEqual(fs.readdirSync(parent), ['ordinary-file']);
});

test('integrity/write failure leaves no completed delivery, staging or reservation', async (t) => {
  const f = await fixture(build, work, t); const parent = parentFor(f);
  const before = history(f); const originalRaw = fs.readFileSync(f.rawPath);
  const loaded = await f.loader.loadRunExport(f.run_id); loaded.raw.files[0].sha256 = '0'.repeat(64);
  const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
  const controller = new DesktopMultiSourceController({ repository: f.repository, application_version: 'test',
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
    package_directory: f.directories.runs, load_export: async () => loaded });
  await assert.rejects(controller.exportRun(f.run_id, 'ALL', async () => parent), /integrity/i);
  assert.deepEqual(fs.readdirSync(path.join(parent, f.run_id, 'exports')), []);
  assert.deepEqual(fs.readdirSync(path.join(f.directories.runs, f.run_id, 'exports')), []);
  const promises = require('node:fs/promises'); const write = promises.writeFile;
  promises.writeFile = async (filename, ...args) => {
    if (String(filename).startsWith(parent) && path.basename(filename) === 'MANIFEST.json') {
      throw Object.assign(new Error('Injected export write failure'), { code: 'EIO' });
    }
    return write(filename, ...args);
  };
  try {
    await assert.rejects(f.controller.exportRun(f.run_id, 'ALL', async () => parent), /write failure/i);
  } finally { promises.writeFile = write; }
  assert.deepEqual(fs.readdirSync(path.join(parent, f.run_id, 'exports')), []);
  assert.deepEqual(history(f), before); assert.deepEqual(fs.readFileSync(f.rawPath), originalRaw);
});

test('stable partial and accepted NO_DATA/LOW_DATA outcomes retain their existing semantics', async (t) => {
  for (const options of [{ mixed: true, partial: true }, { empty: true }, { low_data: true }]) {
    const f = await fixture(build, work, t, options); const parent = parentFor(f); const before = history(f);
    const result = await f.controller.exportRun(f.run_id, 'ALL', async () => parent);
    assert.equal(result.collection_status, options.partial ? 'INCOMPLETE' : 'COMPLETE_WITH_WARNINGS');
    if (options.partial) {
      assert.match(manifest(result).snapshot_id, /^[a-f0-9]{64}$/);
      assert.equal(result.export_directory, path.join(parent, f.run_id, 'exports', 'partial', manifest(result).snapshot_id, 'all'));
    }
    assert.deepEqual(history(f), before);
  }
});

test('native export requires verified raw provenance while internal legacy normalized export stays compatible', async (t) => {
  const f = await fixture(build, work, t); const parent = parentFor(f);
  const { DesktopMultiSourceController } = load('main/app/desktop-multisource-controller.js');
  const data = { source_id: f.job.source_id, dataset_type: 'SITEMAP_URLS', job_id: f.job.job_id,
    job_key: f.job.job_key, rows: [{ url: 'https://example.test/', missing: null, count: 0 }] };
  const controller = new DesktopMultiSourceController({ repository: f.repository, application_version: 'test',
    readiness: { getReadiness: async () => ({ readiness_status: 'READY' }) },
    package_directory: f.directories.runs, load_datasets: async () => [data] });
  let picks = 0;
  await assert.rejects(controller.exportRun(f.run_id, 'ALL', async () => { picks++; return parent; }), /raw evidence|provenance/i);
  assert.equal(picks, 0); assert.deepEqual(fs.readdirSync(parent), []);
  const result = await controller.exportRun(f.run_id, 'ALL');
  assert.equal(manifest(result).run_id, f.run_id);
  assert.equal(fs.existsSync(path.join(result.export_directory, 'RAW_EVIDENCE.json')), false);
});

test('Run eligibility is checked before the dialog and evidence changes during selection are rejected', async (t) => {
  const f = await fixture(build, work, t); const parent = parentFor(f); let picks = 0;
  await assert.rejects(f.controller.exportRun('unknown', 'ALL', async () => { picks++; return parent; }));
  assert.equal(picks, 0);
  await assert.rejects(f.controller.exportRun(f.run_id, 'ALL', async () => {
    const previous = f.repository.getRun.bind(f.repository);
    f.repository.getRun = (id) => { const value = previous(id); return value && { ...value, updated_at: '2026-10-23T00:00:00Z' }; };
    return parent;
  }), /stable|changed|snapshot/i);
  assert.deepEqual(fs.readdirSync(parent), []);
});

test('trusted IPC and real preload use the native owner dialog and reject renderer paths', async (t) => {
  const f = await fixture(build, work, t); const parent = parentFor(f);
  const { createDesktopRunExportHandler } = load('main/app/desktop-run-export-ipc.js');
  const owner = {}; const sender = {}; const event = { sender }; let dialogs = 0; let cancel = false;
  const handler = createDesktopRunExportHandler({
    assertTrustedSender: (e) => { if (e !== event) throw new Error('Untrusted sender'); },
    getController: () => f.controller,
    windowForSender: (s) => { assert.equal(s, sender); return owner; },
    dialog: { showOpenDialog: async (window, options) => {
      assert.equal(window, owner); assert.deepEqual(options.properties, ['openDirectory', 'createDirectory']);
      dialogs++; return { canceled: cancel, filePaths: cancel ? [] : [parent] };
    } },
  });
  const { IPC_CHANNELS } = load('shared/application-info.js');
  const Module = require('node:module'); const previous = Module._load; let api;
  Module._load = function (name, ...args) {
    return name === 'electron' ? { contextBridge: { exposeInMainWorld: (_name, exposed) => { api = exposed; } },
      ipcRenderer: { invoke: (channel, input) => { assert.equal(channel, IPC_CHANNELS.DESKTOP_EXPORT); return handler(event, input); } } }
      : previous.call(this, name, ...args);
  };
  try { load('preload.js'); } finally { Module._load = previous; }
  for (const input of [{ run_id: f.run_id, mode: 'ALL', destination: parent },
    { run_id: '../escape', mode: 'ALL' }, { run_id: 'unknown', mode: 'ALL' }, null, []]) {
    await assert.rejects(handler(event, input));
  }
  await assert.rejects(handler({}, { run_id: f.run_id, mode: 'ALL' }), /Untrusted/);
  assert.equal(dialogs, 0);
  const result = await api.exportDesktopRun({ run_id: f.run_id, mode: 'ALL' });
  assert.equal(manifest(result).run_id, f.run_id); assert.equal(dialogs, 1);
  cancel = true;
  assert.equal(await api.exportDesktopRun({ run_id: f.run_id, mode: 'ALL' }), null);
  assert.equal(dialogs, 2);
});
