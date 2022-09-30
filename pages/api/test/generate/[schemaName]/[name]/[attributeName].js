import {DatasetEngine} from '../../../../../../datasets/datasets.js';
import {Ctx} from '../../../../../../context.js';
import datasets from '../../../../../../datasets/data.js';
import {capitalizeAllWords} from '../../../../../../utils.js';

export default async (req, res) => {
  // match /api/:schemaName/:name/:attributeName with regex
  const match = req.url.match(/^\/api\/test\/generate\/([^\/]+?)\/([^\/]+?)\/([^\/]+?)$/);
  if (match) {
    // decode the match
    const schemaName = decodeURIComponent(match[1]);
    let name = decodeURIComponent(match[2]);
    name = capitalizeAllWords(name);
    let attributeName = decodeURIComponent(match[3]);
    if (attributeName === 'description') {
      attributeName = '';
    }

    console.log('generate prompt', {
      schemaName,
      name,
      attributeName,
    });

    const dataset = datasets[schemaName];
    if (dataset) {
      const prompt = dataset.generatePrompt(name, attributeName);

      const c = new Ctx();
      const datasetEngine = new DatasetEngine({
        dataset,
        aiClient: c.aiClient,
      });
      // console.log('got prompt', {prompt});
      
      const response = await datasetEngine.generateItemAttribute('Annie Masuki', attributeName);
      const result = `${prompt}${attributeName ? ' ' : ''}${response}`;
      console.log('got response', {prompt, response, result});
      
      res.send(result);
    } else {
      res.send(404);
    }
  } else {
    res.send(400);
  }
};