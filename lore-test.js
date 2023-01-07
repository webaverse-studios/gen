import {AiClient} from './clients/ai/ai-client.js';
// import databaseClient from './clients/database/database-client.js';
import {
  getDatasetSpecs,
  getDatasetItems,
  getTrainingItems,
  getDatasetItemsForDatasetSpec,
} from './lore/dataset-engine/dataset-specs.js';
import {DatasetGenerator} from './lore/dataset-engine/dataset-generator.js';
import {
  // formatDatasetNamePrompt,
  // formatDatasetDescriptionPrompt,
  // formatDatasetAttributePrompts,
  formatDatasetItems,
  formatDatasetItemsForPolyfill,
} from './lore/dataset-engine/dataset-parser.js';

/* async createLocation() {
  const prompt = `Describe a JRPG location, end with two new lines:\n`;
  const stop = '\n\n';
  const s = await this.aiClient.generate(prompt, stop);
  return s;
}
async createQuest(locations) {
  const prompt = `Write a JRPG quest for the following locations, end with two new lines: ${locations}\n`;
  const stop = '\n\n';
  const s = await this.aiClient.generate(prompt, stop);
  return s;
}
*/

globalThis.test = async () => {
  // load
  const datasetSpecs = await getDatasetSpecs();
  // const datasetItems = await getDatasetItems();
  const aiClient = new AiClient();

  // console.log('got dataset specs', datasetSpecs);
  {
    const type = 'battle-banter';
    const datasetSpec = datasetSpecs.find(ds => ds.type === type);
    const items = await getDatasetItemsForDatasetSpec(datasetSpec);
    // console.log('battle-banter items', items);
  }
  const type = 'setting';
  const datasetSpec = datasetSpecs.find(ds => ds.type === type);
  const items = await getDatasetItemsForDatasetSpec(datasetSpec);
  // console.log('setting items', items);

  // write initial dataset to DB




  // get embedding
  {
    const embedding = await aiClient.embed('lol');
    console.log('got embedding', embedding);
  }

  // get tokenization
  {
    const tokenization = aiClient.tokenize('lol and the bestesterestest');
    console.log('got tokenization', tokenization);
  }




  // format dataset items
  {
    // console.log('got', {
    //   items,
    //   datasetSpec,
    // });
    // const s = formatDatasetItems(items, datasetSpec);
    const s = formatDatasetItemsForPolyfill(items, datasetSpec, {
      Name: 'Death Mountain',
      // description: 'A mountain in the middle of a desert.',
    }, {
      keys: ['Image'],
    });
    return s;
  }

  // generate an item from the dataset
  const datasetGenerator = new DatasetGenerator({
    datasetSpecs,
    aiClient,
  });
  const settingSpec = await datasetGenerator.generateItem('setting');
  console.log('got setting', settingSpec);
};