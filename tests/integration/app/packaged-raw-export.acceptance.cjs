// Explicit local packaged acceptance only; never included in routine test/release gates.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { chromium } = require('playwright');
const createFixture = require('../export/general-raw-evidence-fixture.cjs');
const { launchPackagedQa, expectedExecutable } = require('../../../scripts/qa/launch-packaged-qa.cjs');
const [buildRoot, projectRoot] = process.argv.slice(2);
const { createPackagedQaRoot } = require(path.join(buildRoot, 'main/app/packaged-qa-isolation.js'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const qa = createPackagedQaRoot(expectedExecutable(projectRoot));
  console.log(`QA_ROOT=${qa.root}`);
  const runs = [];
  let workspace;
  for (const options of [{ multi_source: true, mixed: true }, { empty: true }, { low_data: true }]) {
    const cleanup = [];
    try {
      const f = await createFixture(buildRoot, path.join(qa.root, 'fixtures'), { after: (fn) => cleanup.push(fn) },
        { ...options, root: path.join(qa.root, 'user-data/app-data'), workspace });
      workspace = f.workspace;
      // The packaged app needs no credential connection to inspect/export already accepted evidence.
      f.repository.deleteSourceConnection(workspace.workspace_id, 'google-search-console-query-page');
      const evidence = f.jobs.filter((job) => job.accepted_artifact_id).map((job) => {
        const artifact = f.repository.getArtifact(job.accepted_artifact_id);
        const attempt = f.repository.listAttempts(job.job_id).find((item) => item.candidate_artifact_id === artifact.artifact_id);
        const validation = f.repository.getValidationSummary(attempt.validation_id);
        const bytes = fs.readFileSync(f.storage.resolveRunRelativePath(f.run_id, artifact.relative_path));
        assert.equal(sha(bytes), artifact.sha256);
        return { job, artifact, attempt, validation, bytes };
      });
      runs.push({ run_id: f.run_id, options, evidence });
    } finally { for (const dispose of cleanup.reverse()) await dispose(); }
  }
  const { child } = launchPackagedQa(buildRoot, projectRoot, qa);
  const exited = once(child, 'exit');
  const log = fs.createWriteStream(path.join(qa.root, 'runtime.log'), { mode: 0o600 });
  let resolveEndpoint;
  const endpoint = new Promise((resolve) => { resolveEndpoint = resolve; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    log.write(chunk);
    const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/u);
    if (match) resolveEndpoint(match[1]);
  });
  const timer = setTimeout(() => resolveEndpoint(null), 30000);
  let browser;
  try {
    const address = await Promise.race([endpoint, exited.then(([code, signal]) => ({ code, signal }))]);
    clearTimeout(timer);
    assert.equal(typeof address, 'string', `Packaged renderer endpoint unavailable: ${JSON.stringify(address)}`);
    browser = await chromium.connectOverCDP(address, { timeout: 20000 });
    console.log('CDP connected to packaged application');
    const context = browser.contexts()[0];
    const page = context.pages().find((candidate) => candidate.url().startsWith('file:'))
      ?? await context.waitForEvent('page', { timeout: 30000 });
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => console.log(`Packaged page error: ${error.message}`));
    await page.waitForURL('file://**/index.html', { timeout: 30000 });
    console.log(`Packaged page: ${page.url()}`);
    try {
      await page.waitForFunction(() => window.roofroom?.getBootstrapStatus, undefined, { polling: 100, timeout: 30000 });
    } catch (error) {
      console.log('Preload diagnostics:', await page.evaluate(() => ({ url: location.href, title: document.title,
        ready: document.readyState, api: typeof window.roofroom, text: document.body?.innerText.slice(0, 1500) })));
      throw error;
    }
    const bootstrap = await page.evaluate(() => window.roofroom.getBootstrapStatus());
    assert.equal(bootstrap.database.status, 'READY');
    assert.equal(bootstrap.database.quick_check, 'ok');
    for (const directory of Object.values(bootstrap.directories)) assert.ok(directory.startsWith(`${qa.root}/`));
    assert.ok(page.url().includes('/Contents/Resources/app.asar/'));
    const application = await page.evaluate(() => window.roofroom.getApplicationInfo());
    console.log('Real bootstrap IPC ready; starting desktop export actions');
    const results = [];
    for (const run of runs) {
      console.log(`Opening native fixture Run: ${run.run_id}`);
      await page.getByRole('button', { name: 'RUNS', exact: true }).click();
      const back = page.getByRole('button', { name: 'Back to Run History', exact: true });
      if (await back.count()) await back.click();
      await page.getByRole('button', { name: new RegExp(run.run_id) }).click();
      await page.getByRole('heading', { name: 'Run Detail', exact: true }).waitFor();
      const state = await page.evaluate((id) => window.roofroom.getDesktopRunState(id), run.run_id);
      assert.equal(state.jobs.filter((job) => job.accepted_artifact_id).length, run.evidence.length);
      for (const mode of run.options.mixed ? ['ALL', 'SUCCESSFUL_ONLY'] : ['ALL']) {
        await page.getByRole('button', { name: mode === 'ALL' ? 'Export All' : 'Export Successful Only', exact: true }).click();
        await page.getByText(`Raw evidence files: ${run.evidence.length}`, { exact: true }).waitFor();
        await page.getByText(`Normalized dataset files: ${run.evidence.length}`, { exact: true }).waitFor();
        const directory = path.join(bootstrap.directories.runs, run.run_id, 'exports', mode.toLowerCase());
        await page.getByText(directory, { exact: true }).waitFor();
        await page.getByText(run.options.mixed ? 'Collection incomplete' : 'Collection completed with warnings', { exact: true }).waitFor();
        if (run.options.mixed) await page.getByText('Failed or cancelled jobs: 1 · Jobs without raw evidence: 1', { exact: true }).waitFor();
        else await page.getByText(`Accepted NO_DATA files: ${run.options.empty ? 1 : 0} · Accepted LOW_DATA files: ${run.options.low_data ? 1 : 0}`, { exact: true }).waitFor();
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'MANIFEST.json')));
        assert.equal(manifest.run_id, run.run_id); assert.equal(manifest.workspace_id, workspace.workspace_id);
        const index = JSON.parse(fs.readFileSync(path.join(directory, 'RAW_EVIDENCE.json')));
        assert.equal(index.files.length, run.evidence.length);
        assert.equal(index.jobs.filter((job) => job.execution_status === 'FAILED').length, run.options.mixed ? 1 : 0);
        const files = index.files.map((entry) => {
          assert.ok(!path.isAbsolute(entry.relative_path) && !entry.relative_path.split('/').includes('..'));
          const expected = run.evidence.find((item) => item.artifact.artifact_id === entry.artifact_id);
          assert.ok(expected);
          const { artifact, attempt, validation } = expected;
          const exported = fs.readFileSync(path.join(directory, entry.relative_path));
          const original = fs.readFileSync(path.join(bootstrap.directories.runs, run.run_id, artifact.relative_path));
          assert.deepEqual(exported, expected.bytes); assert.deepEqual(exported, original);
          assert.equal(entry.sha256, sha(exported)); assert.equal(entry.sha256, artifact.sha256);
          assert.equal(entry.byte_size, exported.length); assert.equal(entry.byte_size, artifact.byte_size);
          assert.equal(entry.filename, artifact.filename); assert.equal(entry.media_type, artifact.media_type);
          assert.equal(entry.attempt_id, attempt.attempt_id); assert.equal(entry.validation_id, validation.validation_id);
          assert.equal(entry.validation_status, validation.validation_status); assert.equal(entry.acquired_at, artifact.created_at);
          assert.equal(entry.workspace_id, workspace.workspace_id); assert.equal(entry.run_id, run.run_id);
          assert.equal(entry.job_id, expected.job.job_id); assert.equal(entry.source_id, artifact.source_id);
          const metadata = fs.readFileSync(path.join(bootstrap.directories.runs, run.run_id, artifact.source_id,
            'metadata', `${expected.job.job_key}.metadata.json`));
          assert.equal(entry.acquisition_metadata_sha256, sha(metadata));
          return { filename: entry.filename, media_type: entry.media_type, byte_size: entry.byte_size,
            sha256: entry.sha256, validation_status: entry.validation_status };
        });
        const before = fs.readFileSync(path.join(directory, 'RAW_EVIDENCE.json'));
        await page.getByRole('button', { name: mode === 'ALL' ? 'Export All' : 'Export Successful Only', exact: true }).click();
        await page.getByText(/Data Package export exists; refusing overwrite/u).waitFor();
        assert.deepEqual(fs.readFileSync(path.join(directory, 'RAW_EVIDENCE.json')), before);
        results.push({ run_id: run.run_id, mode, directory, files, overwrite_refused: true });
        fs.writeFileSync(path.join(qa.root, 'packaged-progress.json'), JSON.stringify({ results }, null, 2), { mode: 0o600 });
      }
    }
    await page.screenshot({ path: path.join(qa.root, 'packaged-export.png') });
    const report = { status: 'PACKAGED_EXPORT_VERIFIED', qa_root: qa.root, executable: expectedExecutable(projectRoot),
      url: page.url(), application, bootstrap, results,
      unverified: ['Export-specific open/reveal (no action in general export result)', 'Live providers', 'Production/release acceptance'] };
    fs.writeFileSync(path.join(qa.root, 'packaged-acceptance.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    clearTimeout(timer);
    // CDP Browser.close can leave a macOS app alive; stop only this launcher-owned child first.
    const forceStop = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 5000);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    clearTimeout(forceStop);
    await browser?.close().catch(() => {});
    log.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
