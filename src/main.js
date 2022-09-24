import React from 'react';
import {App} from './components/App.jsx';

class Router {
  constructor(url, ctx) {
    this.url = url;
    this.props = {};

    this.loadPromise = (async () => {
      this.props = await App.getRouteProps(url, ctx);
    })();
  }
  /* async push(url) {
    // nothing
  } */
  async isReady() {
    await this.loadPromise;
  }
}

export function createApp(url, ctx) {
  const router = new Router(url, ctx);
  const app = React.createElement(App, {
    router,
  });

  return {
    app,
    router,
  };
}