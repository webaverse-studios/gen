import {AiClient} from './clients/ai/ai-client.js';
import {DatabaseClient} from './clients/database/database-client.js';
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

globalThis.testDatabaseInit = async () => {
  const aiClient = new AiClient();
  const databaseClient = new DatabaseClient({
    aiClient,
  });
  await databaseClient.init();
};
globalThis.testGeneration = async () => {
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

  // generate an item from the dataset
  {
    const datasetGenerator = new DatasetGenerator({
      datasetSpecs,
      aiClient,
      // fillRatio: 0.5,
    });
    const settingSpec = await datasetGenerator.generateItem('setting', {
      Name: 'Death Mountain',
      // Description: 'A mountain in the middle of a desert.',
    }, {
      keys: ['Image'],
    });
    console.log(settingSpec);
  }

  /* // continue item from the dataset
  {
    // generate an item from the dataset
    const datasetGenerator = new DatasetGenerator({
      datasetSpecs,
      aiClient,
      // fillRatio: 0.5,
    });
    const initialValue = {
      Name: 'Witches Luck',
      Description: 'Three witches argue over the ingredients to buy at the market.',
    };
    const chatSpec1 = await datasetGenerator.generateItem('chat', initialValue, {
      keys: ['Name', 'Description', 'Chat'],
      continueKey: 'Chat',
    });
    console.log('chat spec 1', chatSpec1);

    const chatSpec2 = await datasetGenerator.generateItem('chat', chatSpec1, {
      keys: ['Name', 'Description', 'Chat'],
      continueKey: 'Chat',
    });
    console.log(chatSpec2);
  } */
};