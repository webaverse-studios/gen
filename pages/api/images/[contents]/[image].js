import {Ctx} from '../../../../context.js';
import {cleanName} from '../../../../utils.js';
import {generateImage} from '../../../../media/images/image-generator.js';
// import {parseDatasetItems} from '../../../../datasets/dataset-parser.js';

//

const generateCharacterImage = generateImage({
  modelName: null,
  suffix: 'anime style video game character concept, full body',
  // seed: [512, 512, 64, 128, 1, 256],
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
  
  const match = req.url.match(/^\/api\/images\/([^\/]*)\/([^\/]*)\.png$/);
  if (match) {
    let type = match[1];
    type = decodeURIComponent(type);
    type = cleanName(type);
    let description = match[2];
    description = decodeURIComponent(description);
    description = cleanName(description);

    const imageTitle = `images/${type}/${description}`;
    const imageName = `${description}.png`;

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
      let imgArrayBuffer = await generateCharacterImage(description); // XXX make this based on the type

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
    }
  } else {
    return null;
  }
};
export default CharacterImage;