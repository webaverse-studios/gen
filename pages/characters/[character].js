import uuidByString from 'uuid-by-string';
import Markdown from 'marked-react';

import styles from '../../styles/Character.module.css'
import {Ctx} from '../../context.js';
import {cleanName} from '../../utils.js';
// import {DatasetEngine, formatItem} from '../../datasets/datasets.js';
// import datasets from '../../datasets/data.js';
import {generateItem} from '../../datasets/dataset-generator.js';
import {formatItemText} from '../../datasets/dataset-parser.js';
import {getDatasetSpecs} from '../../datasets/dataset-specs.js';

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
    const c = new Ctx();
    /* const dataset = datasets.characters;
    const datasetEngine = new DatasetEngine({
      dataset,
      aiClient: c.aiClient,
    }); */

    const [
      datasetSpecs,
      generatedItem,
    ] = await Promise.all([
      getDatasetSpecs(),
      generateItem('character', name),
    ]);
    const datasetSpec = datasetSpecs.find(ds => ds.type === 'character');
    const itemText = formatItemText(generatedItem, datasetSpec);

    // const imgUrl = `/api/characters/${name}/images/main.png`;

    const content = `\
${itemText}
`;
// ![](${encodeURI(imgUrl)})

    await c.databaseClient.setByName('Content', title, content);
    
    return {
      id,
      title,
      content,
    };
  }
};

export default Character;