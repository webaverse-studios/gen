import ReactDOMServer from 'react-dom/server';
import {createApp} from './main.js';

export async function render(url, manifest) {
  const {app, router} = createApp(url, manifest);

  await router.push(url);
  await router.isReady();

  const html = ReactDOMServer.renderToString(app);
  
  return [html];
};