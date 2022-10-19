import stream from 'stream';
import {Ctx} from '../../../../clients/context.js';
import {getDatasetSpecs} from '../../../../datasets/dataset-specs.js';
import {cleanName} from '../../../../utils.js';
import {generateImage} from '../../../../media/images/image-generator.js';
import { Blob } from 'buffer';

const globalImagePrompt = `trending on ArtStation`;

//

const CharacterImage = async (req, res) => {
  const props = await CharacterImage.getInitialProps({req});
  if (props) {
    const {
      imgUrl,
    } = props;

    const proxyRes = await fetch(imgUrl);
    // proxy the status and headers
    res.status(proxyRes.status);
    for (const [key, value] of proxyRes.headers.entries()) {
      res.setHeader(key, value);
    }
    // pipe the response
    // console.log('got body', proxyRes.body);
    stream.Readable.fromWeb(proxyRes.body).pipe(res);
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
    const singleType = type.replace(/s$/, '');
    type = cleanName(type);
    let description = match[2];
    description = decodeURIComponent(description);
    description = cleanName(description);

    const datasetSpecs = await getDatasetSpecs();
    const datasetSpec = datasetSpecs.find(spec => spec.type === singleType);
    if (datasetSpec) {
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
        const {
          imagePrompt,
        } = datasetSpec;

        const generateCharacterImage = generateImage({
          modelName: null,
          // suffix: 'anime style video game character concept, full body',
          suffix: `${imagePrompt}, ${globalImagePrompt}`,
          // seed: [512, 512, 64, 128, 1, 256],
        });
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
  } else {
    return null;
  }
};
export default CharacterImage;