import path from 'path';
import http from 'http';
import https from 'https';
import fs from 'fs';
import child_process from 'child_process';

import express from 'express';
import * as vite from 'vite';

import {ImageAiServer} from './src/clients/image-client.js';

//

const isProduction = process.env.NODE_ENV === 'production';
const vercelJson = JSON.parse(fs.readFileSync('./vercel.json', 'utf8'));

const SERVER_NAME = 'local.webaverse.com';
// const MULTIPLAYER_NAME = 'local-multiplayer.webaverse.com';
// const COMPILER_NAME = 'local-compiler.webaverse.com';
// const RENDERER_NAME = 'local-renderer.webaverse.com';

const port = parseInt(process.env.PORT, 10) || 9999;
// const COMPILER_PORT = parseInt(process.env.COMPILER_PORT, 10) || 3333;
// const RENDERER_PORT = parseInt(process.env.RENDERER_PORT, 10) || 5555;

//

const imageAiServer = new ImageAiServer();

//

class DatabaseServer {
  constructor() {
    const cp = child_process.spawn(path.join(
      'target',
      'release',
      'qdrant',
    ), [], {
      cwd: path.join(
        'bin',
        'qdrant',
      ),
    });
    cp.stdout.pipe(process.stdout);
    cp.stderr.pipe(process.stderr);
    cp.on('error', err => {
      console.warn(err.stack);
    });
    this.cp = cp;
  }
  destory() {
    this.cp.kill();
  }
}
const databaseServer = new DatabaseServer();
process.on('exit', () => {
  databaseServer.destory();
});

//

const _tryReadFile = p => {
  try {
    return fs.readFileSync(p);
  } catch(err) {
    // console.warn(err);
    return null;
  }
};
const certs = {
  key: _tryReadFile('./certs/privkey.pem') || _tryReadFile('./certs-local/privkey.pem'),
  cert: _tryReadFile('./certs/fullchain.pem') || _tryReadFile('./certs-local/fullchain.pem'),
};

//

const {headers: headerSpecs} = vercelJson;
const headerSpec0 = headerSpecs[0];
const {headers} = headerSpec0;
const _setHeaders = res => {
  for (const {key, value} of headers) {
    res.setHeader(key, value);
  }
};

//

// const serveDirectories = [
//   '/packages/scenes/',
//   '/packages/characters/',
//   // '/packages/wsrtc/',
// ];
/* const _proxyFile = (req, res, u) => {
  u = path.join(dirname, u);
  // console.log('proxy file', u);
  const rs = fs.createReadStream(u);
  rs.on('error', err => {
    console.warn(err);
    res.statusCode = 404;
    res.end(err.stack);
  });
  rs.pipe(res);
}; */

// main

(async () => {
  const app = express();
  app.all('*', async (req, res, next) => {
    // console.log('got headers', req.method, req.url, req.headers);

    _setHeaders(res);

    // req.headers.host = '127.0.0.1';
    // delete req.headers.host;

    if (req.url.startsWith('/api/ai/image-ai/')) {
      await imageAiServer.handleRequest(req, res);
    // if (req.headers.host === COMPILER_NAME) {
    //   const u = `http://127.0.0.1:${COMPILER_PORT}${req.url}`;
    //   _proxyUrl(req, res, u);
    // } else if (req.headers.host === RENDERER_NAME) {
    //   const u = `http://127.0.0.1:${RENDERER_PORT}${req.url}`;
    //   // console.log('proxy to renderer', u);
    //   _proxyUrl(req, res, u);
    // } else if (serveDirectories.some(d => req.url.startsWith(d))) {
    //   _proxyFile(req, res, req.url);
    } else {
      next();
    }
  });

  const isHttps = !process.env.HTTP_ONLY && (!!certs.key && !!certs.cert);
  // const wsPort = port + 1;

  const _makeHttpServer = () => isHttps ? https.createServer(certs, app) : http.createServer(app);
  const httpServer = _makeHttpServer();
  const viteServer = await vite.createServer({
    mode: isProduction ? 'production' : 'development',
    // root: process.cwd(),
    server: {
      middlewareMode: true,
      // force: true,
      hmr: {
        server: httpServer,
        port,
        // overlay: false,
      },
    },
    // appType: 'custom',
  });
  app.use(viteServer.middlewares);
  
  await new Promise((accept, reject) => {
    httpServer.listen(port, '0.0.0.0', () => {
      accept();
    });
    httpServer.on('error', reject);
  });
  // console.log('pid', process.pid);
  console.log(`  > Local: http${isHttps ? 's' : ''}://${SERVER_NAME}:${port}/`);
})();

process.on('disconnect', function() {
  console.log('dev-server parent exited')
  process.exit();
});
process.on('SIGINT', function() {
  console.log('dev-server SIGINT')
  process.exit();
});