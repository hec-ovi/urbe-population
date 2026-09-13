import { startTestbed } from './bootstrap.js';
import { mountPoint } from './ui/dom.js';
import { renderTestbed } from './views/testbed.js';

renderTestbed(mountPoint('app'));
startTestbed();
