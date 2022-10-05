// import {capitalizeAllWords, isAllCaps} from '../../utils.js';
import path from 'path';
import dotenv from 'dotenv';
import minimist from 'minimist';
import {
  getDatasetSpecs,
} from '../../datasets/dataset-specs.js';
import {DatasetEngine} from '../../datasets/dataset-engine.js';
import {
  formatItemJson,
  formatItemText,
} from '../../datasets/dataset-parser.js';
import {Ctx} from '../../context.js';

//

const baseUrl = import.meta.url.replace(/^[^\/]*?\/+/, '/');
dotenv.config({
  path: path.join(path.dirname(baseUrl), '..', '..', '.env.local'),
});

const args = minimist(process.argv.slice(2));
const [type, name, description] = args._;

//

const generateItem = async (type, name, description) => {
  const datasetSpecs = await getDatasetSpecs();
  const datasetSpec = datasetSpecs.find(ds => ds.type === type);
  if (datasetSpec) {
    const ctx = new Ctx();
    const datasetEngine = new DatasetEngine({
      dataset: datasetSpec,
      aiClient: ctx.aiClient,
    });
    const generatedItem = await datasetEngine.generateItem(name, description);
    return generatedItem;
  } else {
    throw new Error('unknown dataset: ' + type);
  }
};
const _run = async (type, name, description) => {
  const generatedItem = await generateItem(type, name, description);
  
  if (args.t) {
    const itemText = formatItemText(generatedItem);
    console.log(itemText);
  } else if (args.s) {
    const ctx = new Ctx();
    ctx.databaseClient.setByName('Content', name, );
  } else {
    const itemJson = formatItemJson(generatedItem);
    console.log(JSON.stringify(itemJson, null, 2));
  }
};
_run(type, name, description);