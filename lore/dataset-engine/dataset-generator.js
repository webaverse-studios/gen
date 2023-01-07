// import {
//   getDatasetSpecs,
// } from './dataset-specs.js';
import {DatasetEngine} from './dataset-engine.js';
// import {Ctx} from '../clients/context.js';

export class DatasetGenerator {
  constructor({
    datasetSpecs,
    aiClient,
  }) {
    this.datasetSpecs = datasetSpecs;
    this.aiClient = aiClient;
  }
  async generateItem(type, {
    name = '',
    description = '',
  } = {}) {
    const datasetSpec = this.datasetSpecs.find(ds => ds.type === type);
    if (datasetSpec) {
      const datasetEngine = new DatasetEngine({
        dataset: datasetSpec,
        aiClient: this.aiClient,
      });
      const generatedItem = await datasetEngine.generateItem({
        name,
        description,
      });
      return generatedItem;
    } else {
      throw new Error('unknown dataset: ' + type);
    }
  }
}