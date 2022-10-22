import uuidByString from 'uuid-by-string';
import Markdown from 'marked-react';

import styles from '../../styles/ContentObject.module.css';
import {Ctx} from '../../clients/context.js';
import {cleanName} from '../../utils.js';
import {generateItem} from '../../datasets/dataset-generator.js';
import {formatItemText} from '../../datasets/dataset-parser.js';
import {getDatasetSpecs} from '../../datasets/dataset-specs.js';
import React, { useState } from 'react';
import { UserBox } from '../../src/components/user-box/UserBox';

//

const ContentObject = ({
  type,
  title,
  content,
}) => {
  const formatImages = md => {
    md = md.replace(/\!\[([^\]]*?)\]\(([^\)]*?)\)/g, (all, title, url) => {
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
    md = md.replace(/(\!?)\[([\s\S]+?)\]\(([\s\S]+?)\)/g, (all, q, title, url) => {
      if (q) {
        return all;
      }
      return `[${title}](${encodeURI(url)})`;
    });
    return md;
  };
  content = formatImages(content);
  const name = title.split("/")[1];

  const [ itemClass, setItemClass ] = useState("");

  React.useEffect(() => {
    const val = document.querySelectorAll('h2');

    [...val].map(item => {
      if(item?.outerText === "CLASS:"){
        setItemClass(item.nextSibling.outerText);
        item.nextSibling.remove();
        item.remove();
      }
      if(item?.outerText === "IMAGE GALLERY:"){
        console.log(item.nextSibling);
        item.nextSibling.classList.add(styles.galleryWrap);
      }
    })
    //console.log(val);
  },[content])

  return (
    <div className={styles.character}>
      <UserBox />
      <img src={'/assets/logo.svg'} className={styles.logo} alt="Webaverse Wiki" />
      <div className={styles.contentWrap}>
        <div className={styles.name}>{name}</div>
        <div className={styles.rightContent}>
          <div className={styles.title}>{name}</div>
          {itemClass && <div className={styles.subtitle}>{itemClass}</div>}
          <div className={styles.previewImageWrap}>
            <img src={'/assets/image-frame.svg'} className={styles.frame} />
            <div className={styles.mask}>
              <img />
            </div>
          </div>
        </div>
        <div className={styles.leftContent}>
          <div className={styles.markdown}>
            <Markdown gfm openLinksInNewTab={false}>{content}</Markdown>
          </div>
        </div>
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