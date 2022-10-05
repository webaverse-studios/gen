import path from 'path';
import dotenv from 'dotenv';
import minimist from 'minimist';
import {
  formatItemJson,
  formatItemText,
} from '../../datasets/dataset-parser.js';
import {generateItem} from '../../datasets/dataset-generator.js';
import {Ctx} from '../../context.js';

//

const baseUrl = import.meta.url.replace(/^[^\/]*?\/+/, '/');
dotenv.config({
  path: path.join(path.dirname(baseUrl), '..', '..', '.env.local'),
});

const args = minimist(process.argv.slice(2));
const [type, name, description] = args._;

//

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