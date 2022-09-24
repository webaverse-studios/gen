import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import dotenv from 'dotenv';
// import fetch from 'node-fetch';

import {DatabaseClient} from './database/database-client.js';
import {StorageClient} from './storage/storage-client.js';
import {AiClient} from './ai/ai-client.js';
import {routes} from './routes/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config();

//

class Ctx {
  constructor() {
    this.databaseClient = new DatabaseClient();
    this.storageClient = new StorageClient();
    this.aiClient = new AiClient();
  }
}

//

async function createServer() {
  const app = express();

  // Create Vite server in middleware mode and configure the app type as
  // 'custom', disabling Vite's own HTML serving logic so parent server
  // can take control
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });

  // use vite's connect instance as middleware
  // if you use your own express router (express.Router()), you should use router.use
  app.use(vite.middlewares);

  const ctx = new Ctx();

  for (const route of routes(ctx)) {
    const {methods, path, handler} = route;
    for (const method of methods) {
      app[method](path, handler);
    }
  }

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
  
    try {
      // 1. Read index.html
      let template = fs.readFileSync(
        path.resolve(__dirname, 'index.html'),
        'utf-8'
      );
  
      // 2. Apply Vite HTML transforms. This injects the Vite HMR client, and
      //    also applies HTML transforms from Vite plugins, e.g. global preambles
      //    from @vitejs/plugin-react
      template = await vite.transformIndexHtml(url, template);
  
      // 3. Load the server entry. vite.ssrLoadModule automatically transforms
      //    your ESM source code to be usable in Node.js! There is no bundling
      //    required, and provides efficient invalidation similar to HMR.
      const {render} = await vite.ssrLoadModule('/src/entry-server.js');
  
      // 4. render the app HTML. This assumes entry-server.js's exported `render`
      //    function calls appropriate framework SSR APIs,
      //    e.g. ReactDOMServer.renderToString()
      const appHtml = await render(url, ctx);
  
      // 5. Inject the app-rendered HTML into the template.
      const html = template.replace(`<!--ssr-outlet-->`, appHtml);
  
      // 6. Send the rendered HTML back.
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      // If an error is caught, let Vite fix the stack trace so it maps back to
      // your actual source code.
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  app.listen(8080);
}
createServer();