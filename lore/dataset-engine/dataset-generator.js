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
  async generateItem(type, initialValue) {
    const datasetSpec = this.datasetSpecs.find(ds => ds.type === type);
    if (datasetSpec) {
      const datasetEngine = new DatasetEngine({
        datasetSpec,
        aiClient: this.aiClient,
        fillRatio: this.fillRatio,
      });
      const generatedItem = await datasetEngine.generateItem(initialValue);
      return generatedItem;
    } else {
      throw new Error('unknown dataset: ' + type);
    }
  }
}