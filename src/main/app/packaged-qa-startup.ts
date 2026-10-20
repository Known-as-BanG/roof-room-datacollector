import { app, session } from 'electron';
import { initializePackagedQaIsolation } from './packaged-qa-isolation';

try {
  if (initializePackagedQaIsolation(app, process.env, process.argv) !== null) {
    void app.whenReady().then(() => {
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: /^(?:https?|wss?|ftp):/iu.test(details.url) });
      });
    });
  }
} catch {
  console.error('Packaged QA isolation rejected. Application bootstrap was not started.');
  app.exit(1);
  throw new Error('Packaged QA isolation rejected.');
}
