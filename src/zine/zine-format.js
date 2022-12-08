import {
  makeId,
} from '../utils/id-utils.js';
import {
  mainImageKey,
} from '../zine/zine-data-specs.js';
import {
  zbencode,
  zbdecode,
} from '../utils/encoding.mjs';

//

export const zineMagicBytes = 'ZINE';

//

/* class KeyPath {
  constructor(keyPath) {
    this.keyPath = keyPath;
  }
  get(o) {
    return this.keyPath.reduce((o, key) => o[key], o);
  }
  set(o, value) {
    const keyPath = this.keyPath.slice();
    const key = keyPath.pop();
    const o2 = keyPath.reduce((o, key) => o[key], o);
    o2[key] = value;
  }
  delete(o) {
    const keyPath = this.keyPath.slice();
    const key = keyPath.pop();
    const o2 = keyPath.reduce((o, key) => o[key], o);
    delete o2[key];
  }
} */

//

function filterNumbers(a) {
  return a.filter(x => typeof x === 'number');
}

//

// o is structured like:
// o = [
//   [key, value],
//   [key2, [
//     [key3, value3],
//   ]]
// ]
// the methods automatically create intermediate objects
// keyPath is an array of keys
function getKeyPath(o, keyPath) {
  for (let i = 0; i < keyPath.length; i++) {
    const key = keyPath[i];
    const item = o.find(item => item[0] === key);
    if (!item) {
      return undefined;
    }
    o = item[1];
  }
  return o;
}
function hasKeyPath(o, keyPath) {
  return getKeyPath(o, keyPath) !== undefined;
}
function setKeyPath(o, keyPath, value) {
  // scan down to the parent object
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i];
    let item = o.find(item => item[0] === key);
    if (!item) {
      item = [key, []];
      o.push(item);
    }
    o = item[1];
  }

  // set the value on the parent object
  const key = keyPath[keyPath.length - 1];
  const item = o.find(item => item[0] === key);
  if (item) {
    item[1] = value;
  } else {
    o.push([key, value]);
  }
}
function deleteKeyPath(o, keyPath) {
  // scan down to the parent object
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i];
    const item = o.find(item => item[0] === key);
    if (!item) {
      return undefined;
    }
    o = item[1];
  }

  // delete the value from the parent object
  const key = keyPath[keyPath.length - 1];
  const i = o.findIndex(item => item[0] === key);
  if (i !== -1) {
    o.splice(i, 1);
  } else {
    throw new Error(`key not found': ${keyPath.join(', ')}`);
  }
}

//

function checkEventKeypathPrefix(e, prefix) {
  // return isKeyPathSub(prefix, e.data.keyPath);
  return keyPathEquals(prefix, e.data.keyPath.slice(0, -1));
}
function keyPathEquals(a, b) {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}
function isKeyPathSub(prefix, keyPath) {
  return prefix.length <= keyPath.length &&
    prefix.every((key, i) => keyPath[i] === key);
}

export class ZineStoryboard extends EventTarget {
  constructor() {
    super();

    this.zd = new ZineData();

    this.#init();
    this.#listen();
  }
  prefix = [];
  #panels = [];
  #unlisten;
  #init() {
    this.#panels = this.getKeys().map(id => {
      const keyPath = this.prefix.concat([id]);
      return new ZinePanel(this.zd, keyPath);
    });
  }
  #listen() {
    const onadd = e => {
      console.log('zine panel add event', e.data.keyPath, this.prefix);
      if (!checkEventKeypathPrefix(e, this.prefix)) {
        console.log('bail');
        return;
      } else {
        console.log('continue');
      }

      const {
        keyPath,
      } = e.data;
      const panel = new ZinePanel(this.zd, keyPath);      
      this.#panels.push(panel);

      this.dispatchEvent(new MessageEvent('paneladd', {
        data: {
          keyPath,
          panel,
        },
      }));
    };
    this.zd.addEventListener('add', onadd);

    const onremove = e => {
      console.log('zine panel remove event', e.data.keyPath, this.prefix);
      if (!checkEventKeypathPrefix(e, this.prefix)) {
        console.log('bail');
        return;
      } else {
        console.log('continue');
      }

      const {
        keyPath,
      } = e.data;
      const id = keyPath[keyPath.length - 1];
      const index = this.#panels.findIndex(panel => panel.id === id);
      const panel = this.#panels[index];
      panel.destroy();
      this.#panels.splice(index, 1);

      this.dispatchEvent(new MessageEvent('panelremove', {
        data: {
          keyPath,
          panel,
        },
      }));
    };
    this.zd.addEventListener('remove', onremove);

    this.#unlisten = () => {
      this.zd.removeEventListener('add', onadd);
      this.zd.removeEventListener('remove', onremove);
    };
  }

  getKeys() {
    return this.zd.getKeys(this.prefix);
  }
  
  clear() {
    this.zd.clear();
  }
  load(uint8Array) {
    this.zd.load(uint8Array);
  }
  export() {
    return this.zd.toUint8Array();
  }

  getPanels() {
    return this.#panels;
  }
  addPanel() {
    // if (!this.zd) {
    //   console.warn('no zd c', this);
    //   debugger;
    // }

    const id = makeId();
    const keyPath = this.prefix.concat([id]);
    this.zd.setData(keyPath, []);

    // console.log('got panels', this.#panels.slice(), this.#panels.map(p => p.id), keyPath);
    // const panel = this.#panels.find(panel => panel.id === id);
    const panel = this.#panels[this.#panels.length - 1];
    // console.log('zine add panel', panel);
    return panel;
  }

  getPanels() {
    return this.#panels;
  }
  getPanel(index) {
    return this.#panels[index];
  }

  removePanel(panel) {
    const index = this.#panels.indexOf(panel);
    this.removePanelIndex(index);
  }
  removePanelIndex(index) {
    if (index !== -1) {
      const panel = this.#panels[index];
      const keyPath = this.prefix.concat([panel.id]);
      this.zd.deleteData(keyPath);
    } else {
      // console.warn('panel not found', {
      //   panel,
      //   panels: this.#panels,
      // });
      throw new Error('panel not found');
    }
  }

  destroy() {
    this.#unlisten();
  }
}

//

export class ZinePanel extends EventTarget {
  constructor(zd, prefix) {
    super();

    this.zd = zd;
    this.prefix = prefix;

    this.#init();
    this.#listen();
  }
  get id() {
    return this.prefix[this.prefix.length - 1];
  }
  prefix;
  #layers = [];
  #unlisten;
  #init() {
    this.#layers = this.getKeys().map(id => {
      const keyPath = this.prefix.concat([id]);
      return new ZineLayer(this.zd, keyPath);
    })
  }
  #listen() {
    const onadd = e => {
      // console.log('got panel add event', e.data.keyPath, this.prefix);
      if (!checkEventKeypathPrefix(e, this.prefix)) {
        // console.warn('panel bail');
        return;
      }

      const {
        keyPath,
      } = e.data;
      const layer = new ZineLayer(this.zd, keyPath);
      this.#layers.push(layer);

      layer.addEventListener('update', e => {
        this.dispatchEvent(new MessageEvent('layerupdate', {
          data: {
            keyPath,
            layer,
          },
        }));
      });

      this.dispatchEvent(new MessageEvent('layeradd', {
        data: {
          keyPath,
          layer,
        },
      }));
    };
    this.zd.addEventListener('add', onadd);

    const onremove = e => {
      if (!checkEventKeypathPrefix(e, this.prefix)) return;

      const {
        keyPath,
      } = e.data;
      const index = keyPath[0];
      const layer = this.#layers[index];
      layer.destroy();
      this.#layers[index] = undefined;

      // shave the tail
      for (let i = this.#layers.length - 1; i >= 0; i--) {
        if (this.#layers[i] !== undefined) {
          break;
        } else {
          this.#layers.pop();
        }
      }

      this.dispatchEvent(new MessageEvent('layerremove', {
        data: {
          keyPath,
          layer,
        },
      }));
    };
    this.zd.addEventListener('remove', onremove);

    this.#unlisten = () => {
      this.zd.removeEventListener('add', onadd);
      this.zd.removeEventListener('remove', onremove);
    };
  }

  getKeys() {
    const keyPath = this.prefix;
    return this.zd.getKeys(keyPath);
  }

  getLayers() {
    return this.#layers;
  }
  getLayer(index) {
    return this.#layers[index];
  }
  addLayer() {
    // if (!this.zd) {
    //   console.warn('no zd d', this);
    //   debugger;
    // }

    const id = makeId();
    const keyPath = this.prefix.concat([id]);
    this.zd.setData(keyPath, []);

    const layer = this.#layers.find(layer => layer.id === id);
    if (!layer) {
      console.warn('failed to get layer');
      debugger;
    }
    return layer;
  }

  destroy() {
    this.#unlisten();
  }
}

//

class ZineLayer extends EventTarget {
  constructor(zd, prefix) {
    super();

    if (!zd) {
      console.warn('no zd b', this);
      debugger;
    }

    this.zd = zd;
    this.prefix = prefix;
  }

  get id() {
    return this.prefix[this.prefix.length - 1];
  }
  prefix;
  getData(key) {
    // if (!this.zd) {
    //   console.warn('no zd a', this);
    //   debugger;
    // }

    // if (!key) {
    //   console.warn('no key during get', key);
    //   debugger;
    // }

    const keyPath = this.prefix.concat([key]);
    const value = this.zd.getData(keyPath);
    // console.log('get data', key, value, keyPath, structuredClone(this.zd.data));
    return value;
  }
  setData(key, value) {
    // if (!this.zd) {
    //   console.warn('no zd a', this);
    //   debugger;
    // }
    
    // if (!key) {
    //   console.warn('no key during set', key);
    //   debugger;
    // }
    
    const keyPath = this.prefix.concat([key]);
    this.zd.setData(keyPath, value);
    // console.log('set data', [key, value], keyPath);

    this.dispatchEvent(new MessageEvent('update', {
      data: {
        key,
        value,
        keyPath,
      },
    }));
  }
  getKeys() {
    const keyPath = this.prefix;
    return this.zd.getKeys(keyPath);
  }

  matchesSpecs(specs) {
    const keys = this.getKeys();
    for (const spec of specs) {
      if (!keys.includes(spec)) {
        return false;
      }
    }
    return true;
  }

  destroy() {
    // nothing
  }
}

//

export class ZineData extends EventTarget {
  constructor(data = []) {
    super();

    this.data = data;
  }

  toUint8Array() {
    return zbencode(this.data);
  }
  static fromUint8Array(uint8Array) {
    return new ZineData(zbdecode(uint8Array));
  }

  //

  clear() {
    for (let i = 0; i < this.data.length; i++) {
      this.dispatchEvent(new MessageEvent('remove', {
        data: {
          keyPath: [i],
        },
      }));
    }
    this.data.length = 0;
  }
  load(uint8Array) {
    if (this.data.length !== 0) {
      throw new Error('cannot load into non-empty zine');
    }

    this.data = zbdecode(uint8Array);
    for (const [id, panelData] of this.data) {
      this.dispatchEvent(new MessageEvent('add', {
        data: {
          keyPath: [id],
        },
      }));
    }
  }

  //

  getDatas() {
    // const keyPath = this.prefixKeyPath;
    // return getKeyPath(this.data, keyPath);
    return this.data;
  }
  getData(key) {
    const keyPath = [].concat(key);
    return getKeyPath(this.data, keyPath);
  }
  setData(key, value) {
    const keyPath = [].concat(key);
    const hadKeyPath = hasKeyPath(this.data, keyPath);
    setKeyPath(this.data, keyPath, value);

    if (!hadKeyPath && keyPath.length <= 2) {
      this.dispatchEvent(new MessageEvent('add', {
        data: {
          keyPath,
        },
      }));
    } else {
      this.dispatchEvent(new MessageEvent('update', {
        data: {
          keyPath,
        },
      }));
    }
  }
  deleteData(key) {
    const keyPath = [].concat(key);
    deleteKeyPath(this.data, keyPath);

    if (keyPath.length <= 2) {
      this.dispatchEvent(new MessageEvent('remove', {
        data: {
          keyPath,
        },
      }));
    } else {
      this.dispatchEvent(new MessageEvent('update', {
        data: {
          keyPath,
        },
      }));
    }
  }
  hasData(key) {
    return this.getData(key) !== undefined;
  }
  getKeys(key) {
    const parent = this.getData(key);
    if (parent) {
      // console.log('get keys for', structuredClone(this.data));
      return parent.map(([key]) => key);
    } else {
      return [];
    }
  }
  // hasDataMatch(regex) {
  //   return this.data.some(item => regex.test(item.key));
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
}