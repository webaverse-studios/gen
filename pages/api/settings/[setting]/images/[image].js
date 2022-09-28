// import uuidByString from 'uuid-by-string';
import {File} from 'web3.storage';

import {Ctx} from '../../../../../context.js';
import {cleanName} from '../../../../../utils.js';
import {generateSettingImage} from '../../../../../generators/image/setting.js';
import {ensureUrl} from '../../../../../utils.js';

const SettingImage = async (req, res) => {
  const props = await SettingImage.getInitialProps({req});
  if (props) {
    const {
      imgUrl,
    } = props;
    res.redirect(imgUrl);
  } else {
    res.send(404);
  }
};
SettingImage.getInitialProps = async ctx => {
  const {req} = ctx;
  
  const match = req.url.match(/^\/api\/settings\/([^\/]*)\/images\/([^\/]*\.png)$/);
  if (match) {
    let settingName = match[1];
    settingName = decodeURIComponent(settingName);
    settingName = cleanName(settingName);
    let imageName = match[2];
    imageName = decodeURIComponent(imageName);
    imageName = cleanName(imageName);

    const settingTitle = `settings/${settingName}`;
    const imageTitle = `settings/${settingName}/images/${imageName}`;

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
      const settingQuery = await c.databaseClient.getByName('Content', settingTitle);
      if (settingQuery) {
        let {
          content: description,
        } = settingQuery;

        description = description.replace(/^[\s\S]*?\n/, ''); // skip name

        console.log('generate setting image for', {description});

        const imgArrayBuffer = await generateSettingImage({
          name: settingName,
          description,
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
export default SettingImage;