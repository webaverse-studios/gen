// import {
//   makeId,
// } from '../utils/id-utils.js';
import {
  mainImageKey,
  promptKey,
  compressedKey,
  layer0Specs,
  layer1Specs,
  layer2Specs,
  layerSpecs,
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
  getDepth
} from './scene-generator.js';
import {
  panelSize,
} from '../zine/zine-constants.js';

//

//

const vqaClient = new VQAClient();
const imageAiClient = new ImageAiClient();

const resizeBlob = async blob => {
  const img = await blob2img(blob);
  const canvas = resizeImage(img, panelSize, panelSize, {
    // mode: 'contain',
  });
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

    this.zp = zp;

    this.runningTasks = [];
    this.abortController = new AbortController();

    this.#listen();
  }
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
  getOrCreateLayer(index) {
    for (let i = 0; i <= index; i++) {
      const layer = this.zp.getLayer(i);
      if (!layer) {
        this.zp.addLayer();
      }
    }
    const layer = this.zp.getLayer(index);
    return layer;
  }

  isEmpty() {
    // return !this.hasData(mainImageKey);
    // return this.zp.getLayers().length === 0;
    const layer0 = this.zp.getLayer(0);
    // return !layer0 || !layer0.matchesSpecs(layer0Specs);
    return !layer0;
  }
  getDimension() {
    const isCompressed = !!this.zp.getLayer(0)?.getData('compressed');
    const hasFullLayer1 = !!this.zp.getLayer(1)?.matchesSpecs(layer1Specs);
    if (!isCompressed && hasFullLayer1) {
      return 3;
    } else {
      return 2;
    }
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
    layer.setData(compressedKey, false);
    await Promise.all([
      (async () => {
        const arrayBuffer = await file.arrayBuffer();
        layer.setData(mainImageKey, arrayBuffer);
      })(),
      (async () => {
        if (!prompt) {
          prompt = await vqaClient.getImageCaption(file);
        }
        layer.setData(promptKey, prompt);
      })(),
    ]);
  }
  async setFromPrompt(prompt) {
    await this.task(async ({signal}) => {
      const blob = await imageAiClient.createImageBlob(prompt, {signal});
      await this.setFile(blob, prompt);
    }, 'generating image');
  }

  async collectData() {
    await this.task(async ({signal}) => {
      console.log("Collected data");
      // get image from layer 0
      const layer = this.zp.getLayer(0);
      const imageArrayBuffer = layer.getData(mainImageKey);
      console.log('got image array buffer', imageArrayBuffer);
      const depthRes = await getDepth(imageArrayBuffer)
      // get scale from layer 1
      const layer1 = this.zp.getLayer(1);
      const scale = layer1.getData("scale");
      console.log("scale", scale);

      // if depthRes.ok then create blob from imageArrayBuffer and depthRes.arrayBuffer() and scale and send to server
      if (depthRes.ok) {
        console.log("Sending Data");
        // turn depthRes.arrayBuffer() into a Float32Array
        const depthArrayBuffer = await depthRes.arrayBuffer();
        const depthFloat32Array = new Float32Array(depthArrayBuffer);

        const headers = new Headers();
        headers.set('scale', scale[0]);
        const depthMapArrayBuffer = depthFloat32Array.buffer;

        const body = new FormData();
        const image_blob = new Blob([imageArrayBuffer], {type: 'image/jpeg'});
        body.append('image', image_blob, 'image.bin');
        const depthMapBlob = new Blob([depthMapArrayBuffer], { type: 'application/octet-stream' });
        body.append('depth_map', depthMapBlob, 'depth_map.bin');

        const requestOptions = {
          method: 'POST',
          headers: headers,
          body: body,
        };
        const response = await fetch('https://training.webaverse.com/store', requestOptions);
      } else {
        console.log("Depth Error");
        console.warn('invalid response', depthRes.status);
      }
    }, "collecting data");
  }

  async compile() {
    await this.task(async ({signal}) => {
      const layer = this.zp.getLayer(0);
      const imageArrayBuffer = layer.getData(mainImageKey);
      const prompt = layer.getData(promptKey);
      const compileResultLayers = await compileVirtualScene({
        imageArrayBuffer,
        prompt,
      });

      for (let i = 0; i < compileResultLayers.length && i < layerSpecs.length; i++) {
        const layerData = compileResultLayers[i];
        const layerSpec = layerSpecs[i];

        const layer = this.getOrCreateLayer(i);
        for (const name of layerSpec) {
          if (name in layerData) {
            const v = layerData[name];
            layer.setData(name, v);
          }
        }
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