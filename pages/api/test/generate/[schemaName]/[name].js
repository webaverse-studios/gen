import {DatasetEngine} from '../../../../../datasets/datasets.js';
import {Ctx} from '../../../../../context.js';
import datasets from '../../../../../datasets/data.js';
import {capitalizeAllWords} from '../../../../../utils.js';

export default async (req, res) => {
  // match /api/:schemaName/:name/:attributeName with regex
  const match = req.url.match(/^\/api\/test\/generate\/([^\/]+?)\/([^\/]+?)$/);
  if (match) {
    // decode the match
    const schemaName = decodeURIComponent(match[1]);
    let name = decodeURIComponent(match[2]);
    name = capitalizeAllWords(name);

    const dataset = datasets[schemaName];
    if (dataset) {
      const c = new Ctx();
      const datasetEngine = new DatasetEngine({
        dataset,
        aiClient: c.aiClient,
      });

      const {
        prompt,
        response,
        parsedResponse,
      } = await datasetEngine.generateItem(name);

      const result = `${prompt}${response}\n\n${JSON.stringify(parsedResponse, null, 2)}`;
      res.send(result);
    } else {
      res.send(404);
    }
  } else {
    res.send(400);
  }
};