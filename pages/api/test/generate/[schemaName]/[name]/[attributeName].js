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

    const dataset = datasets[schemaName];
    if (dataset) {
      const c = new Ctx();
      const datasetEngine = new DatasetEngine({
        dataset,
        aiClient: c.aiClient,
      });

      if (attributeName === '') {
        const {
          prompt,
          response,
        } = await datasetEngine.generateItemDescription(name);
        const result = `${prompt}${response}`;
        res.send(result);

      } else {
        const {
          response: description,
        } = await datasetEngine.generateItemDescription(name);

        const {
          prompt,
          response,
        } = await datasetEngine.generateItemAttribute(name, attributeName, description);
        const result = `${prompt} ${response}`;
        
        res.send(result);
      }
    } else {
      res.send(404);
    }
  } else {
    res.send(400);
  }
};