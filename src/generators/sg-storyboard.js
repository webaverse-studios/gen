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

export class Storyboard extends ZineStoryboard {
  constructor() {
    super();
  }
  panels = [];
  // #addPanelInternal(panel) {
  //   this.panels.push(panel);
  //   this.dispatchEvent(new MessageEvent('paneladd', {
  //     data: {
  //       panel,
  //     },
  //   }));
  // }
  // #removePanelInternal(panel) {
  //   const i = this.panels.indexOf(panel);
  //   if (i !== -1) {
  //     this.panels.splice(i, 1);
  //     panel.destroy();

  //     this.dispatchEvent(new MessageEvent('panelremove', {
  //       data: {
  //         panel,
  //       },
  //     }));
  //   } else {
  //     throw new Error('panel not found');
  //   }
  // }
  // addPanel(data) {
  //   const panel = new Panel(data);
  //   this.#addPanelInternal(panel);
  //   return panel;
  // }
  addPanel() {
    const zp = super.addPanel();
    if (!zp) {
      console.warn('construct with bad zp', zp);
      debugger;
    }
    const panel = new Panel(zp);
    this.panels.push(panel);
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
  }
}