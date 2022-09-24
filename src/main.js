import React from 'react';
import {App} from './components/App.jsx';

class Router {
  constructor(url) {
    this.url = url;
    this.props = {};

    this.loadPromise = (async () => {
      this.props = await App.getRouteProps(url);
    })();
  }
  async push(url) {
    // nothing
  }
  async isReady() {
    await this.loadPromise;
  }
}

export function createApp(url) {
  const router = new Router(url);
  const app = React.createElement(App, {
    router,
  });

  return {
    app,
    router,
  };
}