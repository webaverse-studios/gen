import {DatasetEngine} from '../../../../../../datasets/datasets.js';
import {Ctx} from '../../../../../../context.js';
import datasets from '../../../../../../datasets/data.js';

export default async (req, res) => {
  // match /api/:schemaName/:name/:attributeName with regex
  const match = req.url.match(/^\/api\/test\/prompt\/([^\/]+?)\/([^\/]+?)\/([^\/]+?)$/);
  if (match) {
    // decode the match
    const schemaName = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
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
      
      // const response = await datasetEngine.generateItemAttribute('Annie Masuki', 'bio');
      res.send(prompt);
    } else {
      res.send(404);
    }
  } else {
    res.send(400);
  }
};