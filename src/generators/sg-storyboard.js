import {ImageAiClient} from '../clients/image-client.js';
import {
  ZineStoryboard,
} from '../zine/zine-format.js';
import {
  Panel,
} from './sg-panel.js';

//

const imageAiClient = new ImageAiClient();

//

export class Storyboard extends EventTarget {
  constructor(zs = new ZineStoryboard()) {
    super();

    this.zs = zs;

    this.#listen();
  }
  panels = [];
  #unlisten;
  #listen() {
    const onupdate = e => {
      const {keyPath} = e.data;
      const opts = {
        data: {
          keyPath,
        },
      };
      this.dispatchEvent(new MessageEvent(e.type, opts));
      this.dispatchEvent(new MessageEvent('update', opts));
    };
    const onpaneladd = e => {
      const {keyPath} = e.data;
      const panels = this.zs.getPanels();
      const id = keyPath[keyPath.length - 1];
      const zp = panels.find(zp => zp.id === id);
      // if (!zp) {
      //   console.log('could not find added panel', panels, id, keyPath);
      //   debugger;
      // }
      const panel = new Panel(zp);
      this.panels.push(panel);

      onupdate(e);
    };
    const onpanelremove = e => {
      const {keyPath} = e.data;
      const id = keyPath[keyPath.length - 1];
      const index = this.panels.findIndex(panel => panel.zp.id === id);
      if (index !== -1) {
        this.panels.splice(index, 1);
      } else {
        console.log('could not find removed panel');
        debugger;
      }

      onupdate(e);
    };

    this.zs.addEventListener('paneladd', onpaneladd);
    this.zs.addEventListener('panelremove', onpanelremove);
    this.zs.addEventListener('panelupdate', onupdate);

    this.#unlisten = () => {
      this.zs.removeEventListener('paneladd', onpaneladd);
      this.zs.removeEventListener('panelremove', onpanelremove);
      this.zs.removeEventListener('panelupdate', onupdate);
    };
  }

  clear() {
    this.zs.clear();
  }
  async loadAsync(uint8Array) {
    await this.zs.loadAsync(uint8Array);
  }
  async exportAsync() {
    return await this.zs.exportAsync();
  }
  
  addPanel() {
    const zp = this.zs.addPanel();
    const panel = this.panels[this.panels.length - 1];
    return panel;
  }
  addPanelFromPrompt(prompt) {
    const panel = this.addPanel();
    panel.task(async ({signal}) => {
      const blob = await imageAiClient.createImageBlob(prompt, {signal});
      await panel.setFile(blob, prompt);
    }, 'generating image');
    // this.#addPanelInternal(panel);
    return panel;
  }
  addPanelFromFile(file) {
    const panel = this.addPanel();
    panel.task(async ({signal}) => {
      await panel.setFile(file);
    }, 'adding image');
    // this.#addPanelInternal(panel);
    return panel;
  }
  removePanel(panel) {
    // this.#removePanelInternal(panel);
    const index = this.panels.indexOf(panel);
    if (index !== -1) {
      this.zs.removePanelIndex(index);
      // this.panels.splice(index, 1);
    } else {
      console.warn('could not find panel to remove');
      debugger;
    }
  }

  destroy() {
    this.#unlisten();
  }
}