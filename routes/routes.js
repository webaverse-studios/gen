import {settings} from './settings.js';
import {characters} from './characters.js';

export const routes = ctx => [
  ...settings(ctx),
  ...characters(ctx),
];