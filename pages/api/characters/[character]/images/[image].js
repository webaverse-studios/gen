// import uuidByString from 'uuid-by-string';
import {File} from 'web3.storage';

import {Ctx} from '../../../../../context.js';
import {cleanName} from '../../../../../utils.js';
import {generateCharacterImage} from '../../../../../generators/image/character.js';
import {ensureUrl} from '../../../../../utils.js';

const CharacterImage = async (req, res) => {
  const props = await CharacterImage.getInitialProps({req});
  if (props) {
    const {
      imgUrl,
    } = props;
    res.redirect(imgUrl);
  } else {
    res.send(404);
  }
};
CharacterImage.getInitialProps = async ctx => {
  const {req} = ctx;
  
  const match = req.url.match(/^\/api\/characters\/([^\/]*)\/images\/([^\/]*\.png)$/);
  if (match) {
    let characterName = match[1];
    characterName = decodeURIComponent(characterName);
    characterName = cleanName(characterName);
    let imageName = match[2];
    imageName = decodeURIComponent(imageName);
    imageName = cleanName(imageName);

    const characterTitle = `characters/${characterName}`;
    const imageTitle = `characters/${characterName}/images/${imageName}`;

    const c = new Ctx();
    // const id = uuidByString(imageTitle);
    const imageQuery = await c.databaseClient.getByName('IpfsData', imageTitle);
    if (imageQuery) {
      const {
        content: ipfsHash,
      } = imageQuery;

      const imgUrl = c.storageClient.getUrl(ipfsHash, imageName);
      return {
        imgUrl,
      };
    } else {
      const characterQuery = await c.databaseClient.getByName('Content', characterTitle);
      if (characterQuery) {
        const {
          content: bio,
        } = characterQuery;

        bio = bio.replace(/^[\s\S]*?\n[\s\S]*?\n/, ''); // skip name, class
        console.log('generate character image for', {bio});

        let imgArrayBuffer = await generateCharacterImage({
          name: characterName,
          description: bio,
        });

        const file = new File([imgArrayBuffer], imageName);
        const hash = await c.storageClient.uploadFile(file);
        const imgUrl = c.storageClient.getUrl(hash, file.name);

        await c.databaseClient.setByName('IpfsData', imageTitle, imgUrl);

        await ensureUrl(imgUrl);

        return {
          imgUrl,
        };
      } else {
        return null;
      }
    }
  } else {
    return null;
  }
};
export default CharacterImage;