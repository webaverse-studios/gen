// import {
//   getDatasetSpecs,
// } from './dataset-specs.js';
import {DatasetEngine} from './dataset-engine.js';
// import {Ctx} from '../clients/context.js';

export class DatasetGenerator {
  constructor({
    datasetSpecs,
    aiClient,
    fillRatio,
  }) {
    this.datasetSpecs = datasetSpecs;
    this.aiClient = aiClient;
    this.fillRatio = fillRatio;
  }
  async generateItem(type, initialValue, opts) {
    const datasetSpec = this.datasetSpecs.find(ds => ds.type === type);
    if (datasetSpec) {
      const datasetEngine = new DatasetEngine({
        datasetSpec,
        aiClient: this.aiClient,
        fillRatio: this.fillRatio,
      });
      const generatedItem = await datasetEngine.generateItem(initialValue, opts);
      return generatedItem;
    } else {
      throw new Error('unknown dataset: ' + type);
    }
  }
}
export class CachedDatasetGenerator extends DatasetGenerator {
  constructor(opts) {
    super(opts);

    const {
      databaseClient,
    } = opts;
    this.databaseClient = databaseClient;
  }
  async generateItem(type, initialValue, opts) {
    const id = this.databaseClient.getId(type, initialValue);
    let value = await this.databaseClient.getItem(id);
    if (value === undefined) {
      value = await super.generateItem(type, initialValue, opts);
      // console.log('set new value 1', {
      //   id,
      //   value,
      // });
      await this.databaseClient.setItem(id, value);
      // console.log('set new value 2', {
      //   id,
      //   value,
      // });
    } else {
      // console.log('return cached item', {
      //   id,
      //   value,
      // });
    }
  }
}