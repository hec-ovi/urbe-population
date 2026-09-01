/** Testbed entry point: the fixture city on a 2D plane. */

import { createCityFeed } from './adapter/city-feed.js';
import { TestbedApp } from './app.js';

new TestbedApp(createCityFeed()).start();
