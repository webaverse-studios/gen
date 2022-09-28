import uuidByString from 'uuid-by-string';
import {File} from 'web3.storage';
import Markdown from 'marked-react';

import styles from '../../styles/Setting.module.css'
import {Ctx} from '../../context.js';
import {ensureUrl, cleanName} from '../../utils.js';
import {generateSettingImage} from '../../generators/image/setting.js';

const Setting = ({
  title,
  content,
}) => {
  return (
    <div className={styles.setting}>
      <div className={styles.name}>{title}</div>
      <div className={styles.markdown}>
        <Markdown gfm baseURL="">{content}</Markdown>
      </div>
    </div>
  );
};
Setting.getInitialProps = async ctx => {
  const {req} = ctx;
  const match = req.url.match(/^\/settings\/([^\/]*)/);
  let name = match ? match[1] : '';
  name = decodeURIComponent(name);
  name = cleanName(name);

  const c = new Ctx();
  const title = `settings/${name}`;
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
    const prompt = `\
Generate 50 anime RPG video game locations.

# Nihon City
A solarpunk city based loosely on a Tokyo, Japan. It is the main city of Zone 0 along the street, which makes it extremely busy. It contains the Citadel, a massive structure which serves as a school for AIs. The scenery is lush and turns neon at night. It is a technological utopia.

# ${name}
`;

    let description = '';
    const numTries = 5;
    for (let i = 0; i < numTries; i++) {
      description = await c.aiClient.generate(prompt, '# ');
      description = description.trim();
      const descriptionLines = description.split(/\n+/);
      if (descriptionLines.length >= 1) {
        descriptionLines[0] = capitalize(descriptionLines[0]);
        description = descriptionLines.join('\n');
        break;
      } else {
        description = '';
      }
    }
    if (!description) {
      throw new Error('too many retries');
    }

    const imgArrayBuffer = await generateSettingImage({
      name,
      description,
    });
    const file = new File([imgArrayBuffer], `${name}.png`);
    const hash = await c.storageClient.uploadFile(file);
    const imgUrl = c.storageClient.getUrl(hash, file.name);
    await ensureUrl(imgUrl);

    const content = `\
# ${name}
${description}
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

export default Setting;