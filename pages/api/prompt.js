import {DatasetEngine} from '../../datasets/datasets.js';
import characters from '../../datasets/characters.js';
import {Ctx} from '../../context.js';

export default (req, res) => {
  (async () => {
    const c = new Ctx();

    const datasetEngine = new DatasetEngine({
      dataset: characters,
      aiClient: c.aiClient,
    });

    const prompt = characters.generatePrompt('Annie Masuki', 'bio');
    // console.log('got prompt', {prompt});
    // const response = await datasetEngine.generateItemAttribute('Annie Masuki', 'bio');
    res.send(prompt);
  })();
};