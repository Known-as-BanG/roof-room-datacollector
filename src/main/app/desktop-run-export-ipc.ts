import type { BrowserWindow, Dialog, IpcMainInvokeEvent, WebContents } from 'electron';
import type { DesktopMultiSourceController } from './desktop-multisource-controller';

export const createDesktopRunExportHandler = (dependencies: {
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
  getController: () => Pick<DesktopMultiSourceController, 'exportRun'>;
  windowForSender: (sender: WebContents) => BrowserWindow | null;
  dialog: Pick<Dialog, 'showOpenDialog'>;
}) => async (event: IpcMainInvokeEvent, input: unknown) => {
  dependencies.assertTrustedSender(event);
  if (typeof input !== 'object' || input === null || Array.isArray(input)
    || Object.keys(input).some((key) => key !== 'run_id' && key !== 'mode')) {
    throw new Error('Export input must contain only Run identity and mode.');
  }
  const value = input as { run_id?: unknown; mode?: unknown };
  if (typeof value.run_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value.run_id)
    || value.mode !== 'ALL' && value.mode !== 'SUCCESSFUL_ONLY') throw new Error('Export input is invalid.');
  return dependencies.getController().exportRun(value.run_id, value.mode, async () => {
    const owner = dependencies.windowForSender(event.sender);
    if (owner === null) throw new Error('Export destination requires an application window.');
    const result = await dependencies.dialog.showOpenDialog(owner, {
      title: 'Select Run export destination', properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    if (result.filePaths.length !== 1) throw new Error('Select one export destination parent directory.');
    return result.filePaths[0];
  });
};
