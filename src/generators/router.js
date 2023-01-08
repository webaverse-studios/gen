class Router extends EventTarget {
  constructor() {
    super();

    this.currentTab = '';
    this.currentSrc = '';

    // listen for history events
    const _update = () => {
      this.handleUrlUpdate(globalThis.location.href);
    };
    window.addEventListener('popstate', _update);
    window.addEventListener('load', _update, {
      once: true,
    });
  }
  pushUrl(u) {
    window.history.pushState({}, '', u);
    this.handleUrlUpdate(u);
  }
  handleUrlUpdate(urlString) {
    const u = new URL(urlString);
    const tab = u.searchParams.get('tab') ?? '';
    const src = u.searchParams.get('src') ?? '';
    if (tab !== this.currentTab) {
      this.currentTab = tab;
      this.dispatchEvent(new MessageEvent('tabchange', {
        data: {
          tab,
        },
      }));
    }
    if (src !== this.currentSrc) {
      this.currentSrc = src;
      this.dispatchEvent(new MessageEvent('srcchange', {
        data: {
          src,
        },
      }));
    }
  }
}
const router = new Router();
export const useRouter = () => {
  return router;
};