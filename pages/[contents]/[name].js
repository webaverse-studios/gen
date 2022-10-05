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

const ContentObject = ({
  type,
  title,
  content,
}) => {
  const formatImages = md => {
    const r = /\!\[([^\]]*)\]\(([^\)]*)\)/g;
    md = md.replace(r, (all, title, url) => {
      const match = title.match(/^([\s\S]*?)(\|[\s\S]*?)?$/);
      if (match) {
        title = match[1].trim();
        url = match[2] ? match[2].trim() : title;
        if (url) {
          return `![${title}](/api/images/${type}s/${encodeURIComponent(url)}.png)`;
        } else {
          return null;
        }
      } else {
        return all;
      }
    });
    return md;
  };
  content = formatImages(content);
  return (
    <div className={styles.character}>
      <div className={styles.name}>{title}</div>
      <div className={styles.markdown}>
        <Markdown gfm baseURL="">{content}</Markdown>
      </div>
    </div>
  );
};
ContentObject.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/([^\/]*)\/([^\/]*)/);
  let type = match ? match[1].replace(/s$/, '') : '';
  let name = match ? match[2] : '';
  name = decodeURIComponent(name);
  name = cleanName(name);

  const c = new Ctx();
  const title = `${type}/${name}`;
  const id = uuidByString(title);
  const query = await c.databaseClient.getByName('Content', title);
  if (query) {
    const {content} = query;
    return {
      type,
      id,
      title,
      content,
    };
  } else {
    const c = new Ctx();
    const [
      datasetSpecs,
      generatedItem,
    ] = await Promise.all([
      getDatasetSpecs(),
      generateItem(type, name),
    ]);
    const datasetSpec = datasetSpecs.find(ds => ds.type === type);
    // console.log('got datset spec', {datasetSpec});
    const itemText = formatItemText(generatedItem, datasetSpec);

    // const imgUrl = `/api/characters/${name}/images/main.png`;

    const content = `\
${itemText}
`;
// ![](${encodeURI(imgUrl)})

    await c.databaseClient.setByName('Content', title, content);
    
    return {
      type,
      id,
      title,
      content,
    };
  }
};
export default ContentObject;