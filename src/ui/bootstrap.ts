import { createCityFeed } from './adapter/city-feed.js';
import type { CityFeed } from './adapter/types.js';
import { TestbedApp } from './app.js';
import { TestbedError } from './errors.js';

export function startTestbed(feed?: CityFeed): TestbedApp | null {
  try {
    const app = new TestbedApp(feed ?? createCityFeed());
    app.start();
    return app;
  } catch (error) {
    renderStartupError(error);
    return null;
  }
}

function renderStartupError(error: unknown): void {
  const code = error instanceof TestbedError ? error.code : 'E_STARTUP';
  const message = error instanceof Error ? error.message : String(error);
  const root = document.getElementById('inspector') ?? document.body;
  const panel = document.createElement('div');
  panel.className = 'error-state-box';
  const label = document.createElement('div');
  label.className = 'error-tag';
  label.textContent = `[${code}]`;
  const body = document.createElement('div');
  body.className = 'error-body';
  body.textContent = message;
  panel.append(label, body);
  root.replaceChildren(panel);
}
