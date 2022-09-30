// import uuidByString from 'uuid-by-string';
// import {File} from 'web3.storage';

import {Ctx} from '../../../../../context.js';
import {cleanName} from '../../../../../utils.js';
import {generateItemImage} from '../../../../../generators/image/item.js';
import {ensureUrl} from '../../../../../utils.js';

const ItemImage = async (req, res) => {
  const props = await ItemImage.getInitialProps({req});
  if (props) {
    const {
      imgUrl,
    } = props;
    res.redirect(imgUrl);
  } else {
    res.send(404);
  }
};
ItemImage.getInitialProps = async ctx => {
  const {req} = ctx;
  
  const match = req.url.match(/^\/api\/items\/([^\/]*)\/images\/([^\/]*\.png)$/);
  if (match) {
    let itemName = match[1];
    itemName = decodeURIComponent(itemName);
    itemName = cleanName(itemName);
    let imageName = match[2];
    imageName = decodeURIComponent(imageName);
    imageName = cleanName(imageName);

    const itemTitle = `items/${itemName}`;
    const imageTitle = `items/${itemName}/images/${imageName}`;

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
      const itemQuery = await c.databaseClient.getByName('Content', itemTitle);
      if (itemQuery) {
        let {
          content: description,
        } = itemQuery;

        description = description.replace(/^[\s\S]*?\n/, ''); // skip name

        // console.log('generate item image for', {description});

        const imgArrayBuffer = await generateItemImage({
          name: itemName,
          description,
        });
        const file = new Blob([imgArrayBuffer], {
          type: 'image/png',
        });
        file.name = imageName;
        const hash = await c.storageClient.uploadFile(file);
        
        await c.databaseClient.setByName('IpfsData', imageTitle, hash);
        
        const imgUrl = c.storageClient.getUrl(hash, file.name);
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
export default ItemImage;