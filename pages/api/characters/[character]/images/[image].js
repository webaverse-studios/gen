import {Ctx} from '../../../../../context.js';
import {cleanName} from '../../../../../utils.js';
import {generateImage} from '../../../../../media/images/image-generator.js';
import {parseDatasetItems} from '../../../../../datasets/dataset-parser.js';

//

const generateCharacterImage = generateImage({
  modelName: null,
  suffix: 'anime style video game character concept',
  seed: [512, 512, 64, 128, 1, 256],
});

//

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
        let {
          content,
        } = characterQuery;

        const contentJson = parseDatasetItems({
          content,
        })[0] ?? null;
        if (contentJson) {
          // const imgArrayBuffer = await generateCharacterImage();
          return null;
        } else {
          return null;
        }

        /* const match = content.match(/\#\# ([\s\S]*?)\n/);
        if (match) {
          const description = match[1];

          console.log('generate character image for', {description});
          let imgArrayBuffer = await generateCharacterImage({
            name: characterName,
            description,
          });

          const file = new Blob([imgArrayBuffer], {
            type: 'image/png',
          });
          file.name = imageName;
          const hash = await c.storageClient.uploadFile(file);

          await c.databaseClient.setByName('IpfsData', imageTitle, hash);

          const imgUrl = c.storageClient.getUrl(hash, file.name);

          return {
            imgUrl,
          };
        } else {
          return null;
        } */
      } else {
        return null;
      }
    }
  } else {
    return null;
  }
};
export default CharacterImage;