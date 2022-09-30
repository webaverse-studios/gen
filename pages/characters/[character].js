import uuidByString from 'uuid-by-string';
// import {File} from 'web3.storage';
import Markdown from 'marked-react';

import styles from '../../styles/Character.module.css'
import {Ctx} from '../../context.js';
import {cleanName} from '../../utils.js';
import {DatasetEngine} from '../../datasets/datasets.js';
import datasets from '../../datasets/data.js';
// import {generateCharacterImage} from '../../generators/image/character.js';
import {capitalize, capitalizeAllWords} from '../../utils.js';

const Character = ({
  title,
  content,
}) => {
  return (
    <div className={styles.character}>
      <div className={styles.name}>{title}</div>
      <div className={styles.markdown}>
        <Markdown gfm baseURL="">{content}</Markdown>
      </div>
    </div>
  );
};
Character.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/characters\/([^\/]*)/);
  let name = match ? match[1] : '';
  name = decodeURIComponent(name);
  name = cleanName(name);

  const c = new Ctx();
  const title = `characters/${name}`;
  const id = uuidByString(title);
  const query = await c.databaseClient.getByName('Content', title);
  if (query) {
    const {content} = query;
    return {
      id,
      title,
      content,
    };
  } else {
    // const prompt = dataset.generatePrompt(name, attributeName);
    
    // console.log('got prompt', {prompt});
    
    // const response = await datasetEngine.generateItemAttribute(name, attributeName);
    // const result = `${prompt}${attributeName ? ' ' : ''}${response}`;
    // console.log('got response', {prompt, response, result});
    

    let bio = '';
    const numTries = 5;
    for (let i = 0; i < numTries; i++) {
      const c = new Ctx();
      const dataset = datasets.characters;
      // console.log('got datasets', [datasets, dataset])
      const datasetEngine = new DatasetEngine({
        dataset,
        aiClient: c.aiClient,
      });

      // bio = await c.aiClient.generate(prompt, '\n\n');
      // bio = bio.trim();
      bio = await datasetEngine.generateItemAttribute(name, '');
      // console.log('got bio', {bio});
      
      const bioLines = bio.split(/\n+/);
      if (bioLines.length >= 2) {
        bioLines[0] = bioLines[0]
          .replace(/^[^a-zA-Z]+/, '')
          .replace(/[^a-zA-Z]+$/, '');
        bioLines[0] = capitalizeAllWords(bioLines[0]);
        bioLines[1] = capitalize(bioLines[1]);
        bio = bioLines.join('\n');
        break;
      } else {
        bio = '';
      }
    }
    if (!bio) {
      throw new Error('too many retries');
    }

    // const imgArrayBuffer = await generateCharacterImage({
    //   name,
    //   description: bio,
    // });
    // const file = new File([imgArrayBuffer], `${name}.png`);
    // const hash = await c.storageClient.uploadFile(file);
    const imgUrl = `/api/characters/${name}/images/main.png`;
    // const imgUrl = c.storageClient.getUrl(hash, file.name);
    // await ensureUrl(imgUrl);

    const content = `\
# ${name}
## ${bio}
![](${encodeURI(imgUrl)})
`;

    await c.databaseClient.setByName('Content', title, content);
    
    return {
      id,
      title,
      content,
    };
  }
};

export default Character;