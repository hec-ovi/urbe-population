import layout from './components/inspector.json' with { type: 'json' };
import { render } from './ui/element.js';
import type { ElementSpec } from './ui/schema.js';
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
  render(root, layout.startupError as ElementSpec[], { code, message });
}
