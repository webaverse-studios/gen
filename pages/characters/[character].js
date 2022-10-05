import uuidByString from 'uuid-by-string';
import Markdown from 'marked-react';

import styles from '../../styles/Character.module.css'
import {Ctx} from '../../context.js';
import {cleanName} from '../../utils.js';
import {DatasetEngine, formatItem} from '../../datasets/datasets.js';
import datasets from '../../datasets/data.js';

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
    // let bio = '';
    // const numTries = 5;
    // for (let i = 0; i < numTries; i++) {

    const c = new Ctx();
    const dataset = datasets.characters;
    const datasetEngine = new DatasetEngine({
      dataset,
      aiClient: c.aiClient,
    });

    const {
      response,
      parsedResponse: item,
    } = await datasetEngine.generateItem(name);
    // console.log('try generate', {name, response});
    // const bio = response;

    // const {
    //   prompt,
    //   response: bio,
    // } = await datasetEngine.generateItemAttribute('characters', attributeName, description);

    // }
    // if (!bio) {
    //   throw new Error('too many retries');
    // }

    const imgUrl = `/api/characters/${name}/images/main.png`;

    const content = `\
# ${name}
${formatItem(item)}
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