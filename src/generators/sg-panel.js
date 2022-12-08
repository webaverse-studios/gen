import {
  makeId,
} from '../utils/id-utils.js';
import {
  mainImageKey,
  promptKey,
  layer0Specs,
  layer1Specs,
  layer2Specs,
} from '../zine/zine-data-specs.js';
import {
  blob2img,
  canvas2blob,
  // img2ImageData,
  resizeImage,
} from '../utils/convert-utils.js';
import {
  VQAClient,
} from '../clients/vqa-client.js'
import {
  ImageAiClient,
} from '../clients/image-client.js';
import {
  compileVirtualScene,
} from './scene-generator.js';
import {
  panelSize,
} from '../constants/sg-constants.js';

//

//

const vqaClient = new VQAClient();
const imageAiClient = new ImageAiClient();

const resizeBlob = async blob => {
  const img = await blob2img(blob);
  const canvas = resizeImage(img, panelSize, panelSize);
  const blob2 = await canvas2blob(canvas);
  return blob2;
}

//

export class Panel extends EventTarget {
  constructor(zp) {
    super();

    // if (!zp) {
    //   console.warn('construct with bad zp', zp);
    //   debugger;
    // }

    this.id = makeId();
    this.zp = zp;

    this.runningTasks = [];
    this.abortController = new AbortController();

    this.#listen();
  }
  #unlisten;
  #listen() {
    const onupdate = e => {
      const {keyPath} = e.data;
      this.dispatchEvent(new MessageEvent('update', {
        data: {
          keyPath,
        },
      }));
    };
    this.zp.addEventListener('layeradd', onupdate);
    this.zp.addEventListener('layerremove', onupdate);
    this.zp.addEventListener('layerupdate', onupdate);

    this.#unlisten = () => {
      this.zp.removeEventListener('layeradd', onupdate);
      this.zp.removeEventListener('layerremove', onupdate);
      this.zp.removeEventListener('layerupdate', onupdate);
    };
  }
  // getDatas() {
  //   return this.#data;
  // }
  // getDataSpec(key) {
  //   return this.#data.find(item => item.key === key);
  // }
  // getData(key) {
  //   const item = this.getDataSpec(key);
  //   return item?.value;
  // }
  // setData(key, value, type) {
  //   let item = this.getDataSpec(key);
  //   if (!item) {
  //     item = {
  //       key,
  //       type,
  //       value,
  //     };
  //     this.#data.push(item);
  //   } else {
  //     item.value = value;
  //   }
  //   this.dispatchEvent(new MessageEvent('update', {
  //     data: {
  //       key,
  //     },
  //   }));
  // }
  // deleteData(key) {
  //   const index = this.#data.findIndex(item => item.key === key);
  //   if (index !== -1) {
  //     this.#data.splice(index, 1);
  //   }
  //   this.dispatchEvent(new MessageEvent('update', {
  //     data: {
  //       key,
  //     },
  //   }));
  // }
  // hasData(key) {
  //   return this.#data.some(item => item.key === key);
  // }
  // hasDataMatch(regex) {
  //   return this.#data.some(item => regex.test(item.key));
  // }
  // getDataLayersMatchingSpec(layersSpecs) {
  //   return this.getDataLayersMatchingSpecs([layersSpecs]);
  // }
  // getDataLayersMatchingSpecs(layersSpecsArray) {
  //   const maxLayers = 10;
  //   const layers = [];
  //   for (let i = 0; i < maxLayers; i++) {
  //     const layerDatas = this.getDatas().filter(({key}) => {
  //       return key.startsWith('layer' + i + '/');
  //     });
  //     if (layersSpecsArray.some(layersSpecs =>
  //       layersSpecs.every(spec => {
  //         return layerDatas.some(({key}) => key.endsWith('/' + spec.name));
  //       })
  //     )) {
  //       layers[i] = layerDatas;
  //     }
  //   }
  //   return layers;
  // }

  getLayers() {
    return this.zp.getLayers();
  }
  getLayer(index) {
    return this.zp.getLayer(index);
  }

  isEmpty() {
    // return !this.hasData(mainImageKey);
    // return this.zp.getLayers().length === 0;
    const layer0 = this.zp.getLayer(0);
    // return !layer0 || !layer0.matchesSpecs(layer0Specs);
    return !layer0;
  }
  getDimension() {
    // return this.hasDataMatch(/^layer1/) ? 3 : 2;
    // if (!this.zp?.getLayers) {
    //   console.log('got bad zp', this.zp);
    //   debugger;
    // }

    const layer = this.zp.getLayer(1);
    const keys = layer?.getKeys() ?? [];
    const candidateLayer1Specs = layer1Specs.filter(spec => !keys.includes(spec));
    // console.log('layer matches', !!this.zp.getLayer(1), !!this.zp.getLayer(1)?.matchesSpecs(layer1Specs), {
    //   layer,
    //   keys,
    //   candidateLayer1Specs,
    // });

    // const hasLayer0 = !!this.zp.getLayer(0)?.matchesSpecs(layer0Specs);
    const hasLayer1 = !!this.zp.getLayer(1)?.matchesSpecs(layer1Specs);
    // const hasLayer2 = !!this.zp.getLayer(2)?.matchesSpec(layer2Specs);

    // if (hasLayer0) {
      if (hasLayer1) {
        return 3;
      } else {
        return 2;
      }
    // } else {
    //   return 0;
    // }

    // const numLayers = this.zp.getLayers().length;
    // // return numLayers >= 1 ? 3 : 2;
    // return Math.min(numLayers + 1, 3);
  }
  isBusy() {
    return this.runningTasks.length > 0;
  }
  getBusyMessage() {
    if (this.runningTasks.length > 0) {
      return this.runningTasks[0].message;
    } else {
      return '';
    }
  }

  async setFile(file, prompt) {
    file = await resizeBlob(file, panelSize, panelSize);
    const layer = this.zp.addLayer();
    (async () => {
      const arrayBuffer = await file.arrayBuffer();
      console.log('set file');
      layer.setData(mainImageKey, arrayBuffer);
    })();
    (async () => {
      if (!prompt) {
        prompt = await vqaClient.getImageCaption(file);
      }
      console.log('set prompt', promptKey, prompt);
      layer.setData(promptKey, prompt);
    })();
  }
  async setFromPrompt(prompt) {
    await this.task(async ({signal}) => {
      const blob = await imageAiClient.createImageBlob(prompt, {signal});
      await this.setFile(blob, prompt);
    }, 'generating image');
  }

  async compile() {
    await this.task(async ({signal}) => {
      const layer = this.zp.getLayer(0);
      const imageArrayBuffer = layer.getData(mainImageKey);
      const compileResult = await compileVirtualScene(
        imageArrayBuffer,
        panelSize,
        panelSize,
      );

      const layer1 = this.zp.addLayer();
      for (const name of layer1Specs) {
        const v = compileResult[name];
        console.log('set compile result data', v);
        layer1.setData(name, v);
      }
    }, 'compiling');
  }

  async task(fn, message) {
    const {signal} = this.abortController;

    const task = {
      message,
    };
    this.runningTasks.push(task);

    this.dispatchEvent(new MessageEvent('busyupdate', {
      data: {
        busy: this.isBusy(),
        message: this.getBusyMessage(),
      },
    }));

    try {
      await fn({
        signal,
      });
    } finally {
      const index = this.runningTasks.indexOf(task);
      this.runningTasks.splice(index, 1);
      
      this.dispatchEvent(new MessageEvent('busyupdate', {
        data: {
          busy: this.isBusy(),
          message: this.getBusyMessage(),
        },
      }));
    }
  }
  cancel() {
    this.abortController.abort(abortError);
  }
  destroy() {
    this.#unlisten();
    this.cancel();
  }
}