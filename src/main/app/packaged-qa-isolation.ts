import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { App } from 'electron';

const MARKER = '.roofroom-packaged-qa.json';
const FLAG = '--roofroom-packaged-qa';
const invalid = (): never => { throw new Error('Invalid packaged QA isolation configuration; normal bootstrap is forbidden.'); };

export const validatePackagedQaExecutable = (executable: string, expected: string): string => {
  if (!path.isAbsolute(executable) || executable !== expected || realpathSync(executable) !== executable) invalid();
  const stat = lstatSync(executable);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111) === 0) invalid();
  return executable;
};

export const createPackagedQaRoot = (executable: string): { root: string; token: string } => {
  validatePackagedQaExecutable(executable, executable);
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'roofroom-packaged-qa-'));
  const token = randomBytes(32).toString('hex');
  writeFileSync(path.join(root, MARKER), JSON.stringify({ schema_version: 1, executable, token }), { flag: 'wx', mode: 0o600 });
  return { root, token };
};

export const validatePackagedQaRoot = (root: string, token: string, executable: string): string => {
  if (!path.isAbsolute(root) || path.resolve(root) !== root
    || path.dirname(root) !== realpathSync(tmpdir()) || !/^roofroom-packaged-qa-[A-Za-z0-9]{6}$/u.test(path.basename(root))
    || !/^[a-f0-9]{64}$/u.test(token)) invalid();
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root
    || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) invalid();
  const markerPath = path.join(root, MARKER);
  const markerStat = lstatSync(markerPath);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.nlink !== 1
    || markerStat.uid !== stat.uid || (markerStat.mode & 0o777) !== 0o600 || markerStat.size > 4096) invalid();
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (marker.schema_version !== 1 || marker.token !== token || marker.executable !== executable
    || Object.keys(marker).sort().join(',') !== 'executable,schema_version,token') invalid();
  validatePackagedQaExecutable(executable, executable);
  const inspect = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const filename = path.join(directory, name);
      const entry = lstatSync(filename);
      if (entry.isSymbolicLink() || entry.uid !== stat.uid || !(entry.isFile() || entry.isDirectory())
        || entry.isFile() && entry.nlink !== 1) invalid();
      if (entry.isDirectory()) inspect(filename);
    }
  };
  inspect(root);
  return root;
};

type QaApp = Pick<App, 'isPackaged' | 'isReady' | 'getPath' | 'setPath' | 'setAppLogsPath' | 'commandLine'>;

export const initializePackagedQaIsolation = (
  app: QaApp,
  environment: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): { root: string; paths: Record<string, string> } | null => {
  const root = environment.ROOFROOM_PACKAGED_QA_ROOT;
  const token = environment.ROOFROOM_PACKAGED_QA_TOKEN;
  const flags = argv.filter((arg) => arg.startsWith(FLAG));
  if (root === undefined && token === undefined && flags.length === 0) return null;
  if (!root || !token || flags.length !== 1 || flags[0] !== FLAG || !app.isPackaged || app.isReady()
    || argv.some((arg) => /^--(?:user-data-dir|disk-cache-dir|crash-dumps-dir|data-path)(?:=|$)/u.test(arg))) invalid();
  validatePackagedQaRoot(root!, token!, app.getPath('exe'));
  const paths = Object.fromEntries([
    ['appData', 'electron-app-data'], ['userData', 'user-data'], ['sessionData', 'session-data'],
    ['temp', 'temp'], ['logs', 'user-data/app-data/logs'], ['crashDumps', 'crashes'], ['downloads', 'downloads'], ['cache', 'cache'],
  ].map(([key, leaf]) => [key, path.join(root!, leaf)]));
  for (const directory of Object.values(paths)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [key, directory] of Object.entries(paths)) {
    if (key !== 'cache') app.setPath(key, directory);
  }
  app.setAppLogsPath(paths.logs);
  app.commandLine.appendSwitch('disk-cache-dir', paths.cache);
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-component-update');
  for (const [key, directory] of Object.entries(paths)) {
    if (key !== 'cache' && app.getPath(key as Parameters<App['getPath']>[0]) !== directory) invalid();
  }
  environment.TMPDIR = paths.temp;
  writeFileSync(path.join(root!, 'qa-paths.json'), JSON.stringify({ schema_version: 1, executable: app.getPath('exe'), paths }, null, 2),
    { flag: 'wx', mode: 0o600 });
  return { root: root!, paths };
};
