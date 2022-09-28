import uuidByString from 'uuid-by-string';
// import {File} from 'web3.storage';
import Markdown from 'marked-react';

import styles from '../../styles/Character.module.css'
import {Ctx} from '../../context.js';
import {cleanName} from '../../utils.js';
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
    const prompt = `\
Generate 50 RPG characters.

# Scillia Doge
## Drop Hunter
Her nickname is Scilly or SLY. 13/F drop hunter. She is an adventurer, swordfighter and fan of potions.

# Drake Silkbourne
## Neural hacker
His nickname is DRK. 15/M hacker. Loves guns. Likes plotting new hacks. He has the best equipment and is always ready for a fight.

# Anemone Sikl
## Lisk Witch
A witch studying to make the best potions. 13/F. She is exceptionally skilled and sells her potions on the black market, but she is very shy.

# Hyacinth Flowers
## Beast Tamer
Scillia's mentor. 15/F beast tamer. She is quite famous. She is known for releasing beasts on her enemies when she get angry.

# Juniper Heartwood
## Academy Engineer
She is an engineer. 17/F engineer. She is new on the street. She has a strong moral compass and it the voice of reason in the group.

# ${name}
##`;

    let bio = '';
    const numTries = 5;
    for (let i = 0; i < numTries; i++) {
      bio = await c.aiClient.generate(prompt, '# ');
      bio = bio.trim();
      const bioLines = bio.split(/\n+/);
      if (bioLines.length >= 2) {
        bioLines[0] = bioLines[0]
          .replace(/^"(.+)"$/, '$1')
          .replace(/^'(.+)'$/, '$1');
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