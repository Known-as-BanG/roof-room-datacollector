const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const fixture = require('../export/general-raw-evidence-fixture.cjs');
const { createDesktopRunExportHandler } = require(path.join(process.argv[2], 'main/app/desktop-run-export-ipc.js'));

(async () => {
  const cleanup = [];
  const f = await fixture(process.argv[2], process.argv[3], { after: (fn) => cleanup.push(fn) });
  const parent = path.join(f.root, 'chosen'); fs.mkdirSync(parent);
  let action = 'success'; let picks = 0; const event = { sender: {} };
  const handler = createDesktopRunExportHandler({ assertTrustedSender: () => {}, getController: () => f.controller,
    windowForSender: () => ({}), dialog: { showOpenDialog: async () => {
      picks++; if (action === 'error') throw new Error('Destination unavailable');
      return { canceled: action === 'cancel', filePaths: action === 'cancel' ? [] : [parent] };
    } } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeBinding('destinationExport', (_source, input) => handler(event, input));
    await page.exposeBinding('destinationRuns', () => f.controller.listRuns(f.workspace.workspace_id));
    await page.exposeBinding('destinationRunState', (_source, id) => f.controller.getRunState(id));
    await page.addInitScript(({ workspace }) => {
      window.roofroom = {
        getApplicationInfo: async () => ({ version: 'destination-ui-test' }),
        getBootstrapStatus: async () => ({ query_config: { status: 'READY', config: { groups: [] } },
          source_registry: { status: 'READY', sources: [] }, database: { status: 'READY' } }),
        getDesktopWorkspaces: async () => ({ workspaces: [workspace], selected_workspace_id: workspace.workspace_id, connections: [] }),
        getDesktopWorkspaceConnections: async () => [], getDesktopPresets: async () => [],
        getGoogleProviderConfigurationStatus: async () => ({ oauth_application_status: 'NOT_CONFIGURED', ads_developer_token_status: 'NOT_CONFIGURED' }),
        createDesktopDraft: async ({ workspace_id }) => ({ workspace_id, origin: { kind: 'BLANK' }, reusable_configuration: { sources: {} }, source_cards: [] }),
        listDesktopRuns: () => window.destinationRuns(), getDesktopRunState: (id) => window.destinationRunState(id),
        exportDesktopRun: (input) => window.destinationExport(input),
      };
    }, { workspace: f.workspace });
    for (let i = 0; ; i++) {
      try { await page.goto(process.argv[4], { waitUntil: 'networkidle', timeout: 3000 }); break; }
      catch (error) { if (i === 20) throw error; await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    await page.getByRole('heading', { name: 'Collection Operations' }).waitFor();
    await page.getByRole('button', { name: 'RUNS', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(f.run_id) }).click();
    const all = page.getByRole('button', { name: 'Export All', exact: true });
    await all.click();
    await page.getByText('Export completed', { exact: true }).waitFor();
    const destination = path.join(parent, f.run_id, 'exports', 'all');
    assert.ok((await page.locator('body').innerText()).includes(destination));
    assert.equal(JSON.parse(fs.readFileSync(path.join(destination, 'MANIFEST.json'))).run_id, f.run_id);
    console.log('PASS RUN-DESTINATION-UI-001: existing Run Detail exports through the privileged handler and displays the actual destination');
    action = 'cancel'; await all.click();
    await page.getByText('Export cancelled. No files were exported.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Export completed', { exact: true }).count(), 0);
    assert.equal((await page.locator('body').innerText()).includes(destination), false);
    assert.equal(picks, 2);
    console.log('PASS RUN-DESTINATION-UI-002: cancellation clears the prior receipt and reports no new delivery');
    action = 'success';
    await page.getByRole('button', { name: 'Export Successful Only', exact: true }).click();
    await page.getByText('Export completed', { exact: true }).waitFor();
    action = 'error'; await all.click();
    await page.getByText('Destination unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByText('Export completed', { exact: true }).count(), 0);
    assert.equal(picks, 4);
    assert.deepEqual(errors, []);
    console.log('PASS RUN-DESTINATION-UI-003: both modes invoke selection and a subsequent error clears success');
  } finally {
    await browser.close();
    for (const fn of cleanup.reverse()) await fn();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
