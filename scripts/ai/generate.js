// import {capitalizeAllWords, isAllCaps} from '../../utils.js';
import path from 'path';
import dotenv from 'dotenv';
import minimist from 'minimist';
import {
  getDatasetSpecs,
} from '../../datasets/dataset-specs.js';
import {DatasetEngine} from '../../datasets/dataset-engine.js';
import {Ctx} from '../../context.js';

//

const baseUrl = import.meta.url.replace(/^[^\/]*?\/+/, '/');
dotenv.config({
  path: path.join(path.dirname(baseUrl), '..', '..', '.env.local'),
});

const args = minimist(process.argv.slice(2));
// const type = process.argv[2] ?? '';
// const name = process.argv[3] ?? '';
// const description = process.argv[4] ?? '';
const [type, name, description] = args._;

//

const _run = async (type, name, description) => {
  const datasetSpecs = await getDatasetSpecs();
  const datasetSpec = datasetSpecs.find(ds => ds.type === type);
  if (datasetSpec) {
    const ctx = new Ctx();
    const datasetEngine = new DatasetEngine({
      dataset: datasetSpec,
      aiClient: ctx.aiClient,
    });
    const generatedItem = await datasetEngine.generateItem(name, description);
    console.log(JSON.stringify(generatedItem, null, 2));
    /* const response = await ctx.aiClient.generate(`\
@Type: ${type}
`, '\n\n');
    console.log('got response', response); */
  } else {
    console.warn('unknown dataset:', type);
    process.exit(1);
  }
};
_run(type, name, description);