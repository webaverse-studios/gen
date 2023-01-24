import {useState, useEffect, useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import classnames from 'classnames';
import * as WebMWriter from 'webm-writer';
import alea from '../../utils/alea.js';
import {
  img2img,
} from '../../clients/image-client.js';
// import {
//   txt2img,
//   img2img,
// } from '../../clients/sd-image-client.js';
// import {
//   generateTextureMaps,
// } from '../../clients/material-map-client.js';
// import {mobUrls} from '../../constants/urls.js';
import {
  makeRenderer,
  makeGltfLoader,
  makeGltfExporter,
  pushMeshes,
  makeDefaultCamera,
} from '../../zine/zine-utils.js';
import {
  makePromise,
  loadImage,
  fetchArrayBuffer,
} from '../../../utils.js';
import {
  createSeedImage,
} from '../../../canvas/seed-image.js';
import {
  colors,
} from '../../constants/detectron-colors.js';
import {
  blob2img,
  canvas2blob,
  image2DataUrl,
  img2canvas,
} from '../../utils/convert-utils.js';
import {
  screenshotAvatar,
} from '../../avatars/avatar-screenshotter.js';
import {
  optimizeAvatarModel,
} from '../../utils/avatar-optimizer.js';
// import {
//   preprocessMeshForTextureEdit,
//   editMeshTextures,
// } from '../../utils/model-utils.js';
// import {downloadFile} from '../../utils/http-utils.js';
import Avatar from '../../avatars/avatars.js';
import {
  emotions as avatarEmotions,
} from '../../avatars/emotes/emotions.js';
import {
  AvatarRenderer,
} from '../../avatars/avatar-renderer.js';
// import {
//   AvatarIconer,
// } from '../../avatars/avatar-iconer.js';
import {
  ArrowMesh,
} from '../../generators/arrow-mesh.js';
import {
  maxAvatarQuality,
} from '../../avatars/constants.js';
import avatarsWasmManager from '../../avatars/avatars-wasm-manager.js';
import {
  makeId,
} from '../../../utils.js';
import {
  AiClient,
} from '../../../clients/ai/ai-client.js';
import {
  DatabaseClient,
} from '../../../clients/database/database-client.js';
import {
  getDatasetSpecs,
  // getDatasetItems,
  // getTrainingItems,
  // getDatasetItemsForDatasetSpec,
} from '../../../lore/dataset-engine/dataset-specs.js';
import {
  DatasetGenerator,
  // CachedDatasetGenerator,
} from '../../../lore/dataset-engine/dataset-generator.js';

import styles from '../../../styles/AvatarGenerator.module.css';

//

const localVector = new THREE.Vector3();
// const localVector2 = new THREE.Vector3();
// const localVector2D = new THREE.Vector2();
// const localQuaternion = new THREE.Quaternion();
const localPlane = new THREE.Plane();
const localRaycaster = new THREE.Raycaster();
const localColor = new THREE.Color();

const zeroVector = new THREE.Vector3(0, 0, 0);
const upVector = new THREE.Vector3(0, 1, 0);

//

const FPS = 60;

//

const aiClient = new AiClient();
const databaseClient = new DatabaseClient({
  aiClient,
});

//

/* const screenshotAvatarUrl = async ({
  start_url,
  width = 300,
  height = 300,
  canvas,
  emotion,
}) => {
  const arrayBuffer = await fetchArrayBuffer(start_url);

  const avatarRenderer = new AvatarRenderer({
    arrayBuffer,
    srcUrl: start_url,
    quality: maxAvatarQuality,
  });
  await avatarRenderer.waitForLoad();

  const avatar = createAvatarForScreenshot(avatarRenderer);

  const result = await screenshotAvatar({
    avatar,
    width,
    height,
    canvas,
    emotion,
  });
  avatar.destroy();
  return result;
}; */
const screenshotAvatarGltf = async ({
  gltf = null,
  width = 300,
  height = 300,
  canvas,
  emotion,
}) => {
  await Promise.all([
    Avatar.waitForLoad(),
    avatarsWasmManager.waitForLoad(),
  ]);

  const avatarRenderer = new AvatarRenderer({
    gltf,
    quality: maxAvatarQuality,
  });
  await avatarRenderer.waitForLoad();

  const avatar = createAvatarForScreenshot(avatarRenderer);

  const result = await screenshotAvatar({
    avatar,
    width,
    height,
    canvas,
    emotion,
  });
  avatar.destroy();
  return result;
};
const createAvatarForScreenshot = avatarRenderer => {
  const avatar = new Avatar(avatarRenderer, {
    fingers: true,
    hair: true,
    visemes: true,
    debug: false,
  });
  avatar.setTopEnabled(false);
  avatar.setHandEnabled(0, false);
  avatar.setHandEnabled(1, false);
  avatar.setBottomEnabled(false);
  avatar.inputs.hmd.position.y = avatar.height;
  avatar.inputs.hmd.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  avatar.inputs.hmd.updateMatrixWorld();
  return avatar;
};

//

const _pathize = (n, fn) => {
  if (Array.isArray(n)) {
    return n.map(n => _pathize(n, fn));
  } else if (typeof n === 'object' && n !== null) {
    const result = {};
    for (const k in n) {
      result[k] = _pathize(n[k], fn);
    }
    return result;
  } else if (typeof n === 'string') {
    return fn(n);
  } else {
    throw new Error('invalid pathize input');
  }
};

//

/* const colors = [
  `Black`,
  `Blue`,
  `Cyan`,
  `Green`,
  `Original`,
  `Pink`,
  `Yellow`,
]; */
const avatarSpecs = [
  {
    name: 'hacker',
    base: `/models/Avatar_Bases/Hacker Class/HackerClassMaster_v2.1_Guilty.vrm`,
    eye: [
      `IMG_2857.png`,
      `IMG_2858.png`,
      `IMG_2859.png`,
      `IMG_2860.png`,
      `IMG_2861.png`,
      `IMG_2862.png`,
      `IMG_2863.png`,
      `IMG_2864.png`,
      `IMG_2865.png`,
      `IMG_2866.png`,
      `IMG_2867.png`,
      `IMG_2868.png`,
      `IMG_2869.png`,
      `IMG_2870.png`,
      `IMG_2871.png`,
      `IMG_2872.png`,
      `IMG_2874.png`,
      `IMG_2875.png`,
      `IMG_2876.png`,
      `IMG_2877.png`,
      `IMG_2878.png`,
      `IMG_2879.png`,
      `IMG_2880.png`,
      `IMG_2881.png`,
      `IMG_2882.png`,
      `IMG_2883.png`,
      `IMG_2884.png`,
      `IMG_2885.png`,
      `IMG_2886.png`,
      `IMG_2887.png`,
      `IMG_2888.png`,
      `IMG_2889.png`,
    ].map(name => `/models/Avatar_Bases/Hacker Class/Hacker variant textures/Eye_Color/${name}`),
    skin: [
      // ./Arm sleeves
      // ./Arm sleeves/ArmSleeves_Original.png
      // ./Arm sleeves/ArmSleeves_Original_alt.png
      // ./Arm sleeves/ArmSleeves_Tone_1.png
      // ./Arm sleeves/ArmSleeves_Tone_2.png
      // ./Arm sleeves/ArmSleeves_Tone_3.png
      // ./Arm sleeves/ArmSleeves_Tone_4.png
      // ./Knee highs
      // ./Knee highs/KneeHighs_Original.png
      // ./Knee highs/KneeHighs_Original_alt.png
      // ./Knee highs/KneeHighs_Tone_1.png
      // ./Knee highs/KneeHighs_Tone_2.png
      // ./Knee highs/KneeHighs_Tone_3.png
      // ./Knee highs/KneeHighs_Tone_4.png
      // ./Original
      // ./Original/Hacker.png_BASE_Body_BaseColor.png
      // ./Original/Hacker.png_BASE_Body_alt2.png
      // ./Original/Hacker.png_BASE_Head_BaseColor.png
      // ./Original/Hacker.png_BASE_Head_BaseColor_alt2.png
      // ./Original/Hacker.png_BASE_Mouth_BaseColor.png
      // ./Skin tone 1
      // ./Skin tone 1/Hacker.png_BASE_Body_BaseColor.png
      // ./Skin tone 1/Hacker.png_BASE_Head_BaseColor.png
      // ./Skin tone 1/Hacker.png_BASE_Mouth_BaseColor.png
      // ./Skin tone 2
      // ./Skin tone 2/Hacker.png_BASE_Body_BaseColor.png
      // ./Skin tone 2/Hacker.png_BASE_Head_BaseColor.png
      // ./Skin tone 2/Hacker.png_BASE_Mouth_BaseColor.png
      // ./Skin tone 3
      // ./Skin tone 3/Hacker.png_BASE_Body_BaseColor.png
      // ./Skin tone 3/Hacker.png_BASE_Head_BaseColor.png
      // ./Skin tone 3/Hacker.png_BASE_Mouth_BaseColor.png
      // ./Skin tone 4
      // ./Skin tone 4/Hacker.png_BASE_Body_BaseColor.png
      // ./Skin tone 4/Hacker.png_BASE_Head_BaseColor.png
      // ./Skin tone 4/Hacker.png_BASE_Mouth_BaseColor.png
      // ./Thigh highs
      // ./Thigh highs/ThighHighs_Original.png
      // ./Thigh highs/ThighHighs_Original_alt.png
      // ./Thigh highs/ThighHighs_Tone_1.png
      // ./Thigh highs/ThighHighs_Tone_2.png
      // ./Thigh highs/ThighHighs_Tone_3.png
      // ./Thigh highs/ThighHighs_Tone_4.png
      [
        'face',
        [
          `Original/Hacker.png_BASE_Head_BaseColor.png`,
          `Original/Hacker.png_BASE_Head_BaseColor_alt2.png`,
          `Skin tone 1/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Head_BaseColor.png`,

          `Original/Hacker.png_BASE_Head_BaseColor.png`,
          `Original/Hacker.png_BASE_Head_BaseColor_alt2.png`,
          `Skin tone 1/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Head_BaseColor.png`,

          `Original/Hacker.png_BASE_Head_BaseColor.png`,
          `Original/Hacker.png_BASE_Head_BaseColor_alt2.png`,
          `Skin tone 1/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Head_BaseColor.png`,

          `Original/Hacker.png_BASE_Head_BaseColor.png`,
          `Original/Hacker.png_BASE_Head_BaseColor_alt2.png`,
          `Skin tone 1/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Head_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Head_BaseColor.png`,
        ].map(n => `/models/Avatar_Bases/Hacker Class/Hacker variant textures/Skin variations/${n}`),
      ],
      [
        'body',
        [
          `Original/Hacker.png_BASE_Body_BaseColor.png`,
          `Original/Hacker.png_BASE_Body_alt2.png`,
          `Skin tone 1/Hacker.png_BASE_Body_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Body_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Body_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Body_BaseColor.png`,

          `Arm sleeves/ArmSleeves_Original.png`,
          `Arm sleeves/ArmSleeves_Original_alt.png`,
          `Arm sleeves/ArmSleeves_Tone_1.png`,
          `Arm sleeves/ArmSleeves_Tone_2.png`,
          `Arm sleeves/ArmSleeves_Tone_3.png`,
          `Arm sleeves/ArmSleeves_Tone_4.png`,

          `Knee highs/KneeHighs_Original.png`,
          `Knee highs/KneeHighs_Original_alt.png`,
          `Knee highs/KneeHighs_Tone_1.png`,
          `Knee highs/KneeHighs_Tone_2.png`,
          `Knee highs/KneeHighs_Tone_3.png`,
          `Knee highs/KneeHighs_Tone_4.png`,

          `Thigh highs/ThighHighs_Original.png`,
          `Thigh highs/ThighHighs_Original_alt.png`,
          `Thigh highs/ThighHighs_Tone_1.png`,
          `Thigh highs/ThighHighs_Tone_2.png`,
          `Thigh highs/ThighHighs_Tone_3.png`,
          `Thigh highs/ThighHighs_Tone_4.png`,
        ].map(n => `/models/Avatar_Bases/Hacker Class/Hacker variant textures/Skin variations/${n}`),
      ],
      [
        'mouth',
        [
          `Original/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Original/Hacker.png_BASE_Mouth_BaseColor.png`, // alt
          `Skin tone 1/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Mouth_BaseColor.png`,

          `Original/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Original/Hacker.png_BASE_Mouth_BaseColor.png`, // alt
          `Skin tone 1/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Mouth_BaseColor.png`,

          `Original/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Original/Hacker.png_BASE_Mouth_BaseColor.png`, // alt
          `Skin tone 1/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Mouth_BaseColor.png`,

          `Original/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Original/Hacker.png_BASE_Mouth_BaseColor.png`, // alt
          `Skin tone 1/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 2/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 3/Hacker.png_BASE_Mouth_BaseColor.png`,
          `Skin tone 4/Hacker.png_BASE_Mouth_BaseColor.png`,
        ].map(n => `/models/Avatar_Bases/Hacker Class/Hacker variant textures/Skin variations/${n}`),
      ],
    ],
    clothing: _pathize({
      'Hacker_Dress_1_1_BaseColor': [
        `Hacker_Dress_1_1_BaseColor.jpg`,
        // `Hacker_Dress_1_1_Normal.jpg`,
        `Hacker_Dress_1_2_BaseColor.jpg`,
        // `Hacker_Dress_1_2_Normal.jpg`,
        `Hacker_Dress_1_3_BaseColor.jpg`,
        // `Hacker_Dress_1_3_Normal.jpg`,
        `Hacker_Dress_1_4_BaseColor.jpg`,
        // `Hacker_Dress_1_4_Normal.jpg`,
        `Hacker_Dress_1_5_BaseColor.jpg`,
        // `Hacker_Dress_1_5_Normal.jpg`,
        `Hacker_Dress_1_6_BaseColor.jpg`,
        // `Hacker_Dress_1_6_Normal.jpg`,
        `Hacker_Dress_1_7_BaseColor.jpg`,
        // `Hacker_Dress_1_7_Normal.jpg`,
        `Hacker_Dress_1_8_BaseColor.jpg`,
        // `Hacker_Dress_1_8_Normal.jpg`,
        `Hacker_Dress_1_9_BaseColor.jpg`,
        // `Hacker_Dress_1_9_Normal.jpg`,
        `Hacker_Dress_1_10_BaseColor.jpg`,
        // `Hacker_Dress_1_10_Normal.jpg`,
        `Hacker_Dress_1_11_BaseColor.jpg`,
        // `Hacker_Dress_1_11_Normal.jpg`,
      ],
      'Hacker_Dress_2_1_BaseColor': [
        `Hacker_Dress_2_1_BaseColor.jpg`,
        // `Hacker_Dress_2_1_Normal.jpg`,
        `Hacker_Dress_2_2_BaseColor.jpg`,
        // `Hacker_Dress_2_2_Normal.jpg`,
        `Hacker_Dress_2_3_BaseColor.jpg`,
        // `Hacker_Dress_2_3_Normal.jpg`,
        `Hacker_Dress_2_4_BaseColor.jpg`,
        // `Hacker_Dress_2_4_Normal.jpg`,
        `Hacker_Dress_2_5_BaseColor.jpg`,
        // `Hacker_Dress_2_5_Normal.jpg`,
        `Hacker_Dress_2_6_BaseColor.jpg`,
        // `Hacker_Dress_2_6_Normal.jpg`,
        `Hacker_Dress_2_7_BaseColor.jpg`,
        // `Hacker_Dress_2_7_Normal.jpg`,
        `Hacker_Dress_2_8_BaseColor.jpg`,
        // `Hacker_Dress_2_8_Normal.jpg`,
        `Hacker_Dress_2_9_BaseColor.jpg`,
        // `Hacker_Dress_2_9_Normal.jpg`,
        `Hacker_Dress_2_10_BaseColor.jpg`,
        // `Hacker_Dress_2_10_Normal.jpg`,
        `Hacker_Dress_2_11_BaseColor.jpg`,
        // `Hacker_Dress_2_11_Normal.jpg`,
      ],
      'Hacker_Dress_3_1_BaseColor': [
        `Hacker_Dress_3_1_BaseColor.jpg`,
        // `Hacker_Dress_3_1_Normal.jpg`,
        `Hacker_Dress_3_2_BaseColor.jpg`,
        // `Hacker_Dress_3_2_Normal.jpg`,
        `Hacker_Dress_3_3_BaseColor.jpg`,
        // `Hacker_Dress_3_3_Normal.jpg`,
        `Hacker_Dress_3_4_BaseColor.jpg`,
        // `Hacker_Dress_3_4_Normal.jpg`,
        `Hacker_Dress_3_5_BaseColor.jpg`,
        // `Hacker_Dress_3_5_Normal.jpg`,
        `Hacker_Dress_3_6_BaseColor.jpg`,
        // `Hacker_Dress_3_6_Normal.jpg`,
        `Hacker_Dress_3_7_BaseColor.jpg`,
        // `Hacker_Dress_3_7_Normal.jpg`,
        `Hacker_Dress_3_8_BaseColor.jpg`,
        // `Hacker_Dress_3_8_Normal.jpg`,
        `Hacker_Dress_3_9_BaseColor.jpg`,
        // `Hacker_Dress_3_9_Normal.jpg`,
        `Hacker_Dress_3_10_BaseColor.jpg`,
        // `Hacker_Dress_3_10_Normal.jpg`,
      ],
      'Hacker_Dress_4_1_BaseColor': [
        `Hacker_Dress_4_1_BaseColor.jpg`,
        // `Hacker_Dress_4_1_Normal.jpg`,
        `Hacker_Dress_4_2_BaseColor.jpg`,
        // `Hacker_Dress_4_2_Normal.jpg`,
        `Hacker_Dress_4_3_BaseColor.jpg`,
        // `Hacker_Dress_4_3_Normal.jpg`,
        `Hacker_Dress_4_4_BaseColor.jpg`,
        // `Hacker_Dress_4_4_Normal.jpg`,
        `Hacker_Dress_4_5_BaseColor.jpg`,
        // `Hacker_Dress_4_5_Normal.jpg`,
        `Hacker_Dress_4_6_BaseColor.jpg`,
        // `Hacker_Dress_4_6_Normal.jpg`,
        `Hacker_Dress_4_7_BaseColor.jpg`,
        // `Hacker_Dress_4_7_Normal.jpg`,
        `Hacker_Dress_4_8_BaseColor.jpg`,
        // `Hacker_Dress_4_8_Normal.jpg`,
        `Hacker_Dress_4_9_BaseColor.jpg`,
        // `Hacker_Dress_4_9_Normal.jpg`,
        `Hacker_Dress_4_10_BaseColor.jpg`,
        // `Hacker_Dress_4_10_Normal.jpg`,
        `Hacker_Dress_4_11_BaseColor.jpg`,
        // `Hacker_Dress_4_11_Normal.jpg`,
        // `Hacker_Dress_4_Mixed_AO.jpg`,
      ],
      'Hacker_Dress_5_1_BaseColor': [
        `Hacker_Dress_5_1_BaseColor.jpg`,
        // `Hacker_Dress_5_1_Normal.jpg`,
        `Hacker_Dress_5_2_BaseColor.jpg`,
        // `Hacker_Dress_5_2_Normal.jpg`,
        `Hacker_Dress_5_3_BaseColor.jpg`,
        // `Hacker_Dress_5_3_Normal.jpg`,
        `Hacker_Dress_5_4_BaseColor.jpg`,
        // `Hacker_Dress_5_4_Normal.jpg`,
        `Hacker_Dress_5_5_BaseColor.jpg`,
        // `Hacker_Dress_5_5_Normal.jpg`,
        `Hacker_Dress_5_6_BaseColor.jpg`,
        // `Hacker_Dress_5_6_Normal.jpg`,
        `Hacker_Dress_5_7_BaseColor.jpg`,
        // `Hacker_Dress_5_7_Normal.jpg`,
        `Hacker_Dress_5_8_BaseColor.jpg`,
        // `Hacker_Dress_5_8_Normal.jpg`,
        `Hacker_Dress_5_9_BaseColor.jpg`,
        // `Hacker_Dress_5_9_Normal.jpg`,
        `Hacker_Dress_5_10_BaseColor.jpg`,
        // `Hacker_Dress_5_10_Normal.jpg`,
        `Hacker_Dress_5_11_BaseColor.jpg`,
        // `Hacker_Dress_5_11_Normal.jpg`,
        // `Hacker_Dress_5_Mixed_AO.jpg`,
      ],
      'Hacker_Dress_6_1_BaseColor': [
        `Hacker_Dress_6_1_BaseColor.jpg`,
        // `Hacker_Dress_6_1_Normal.jpg`,
        `Hacker_Dress_6_2_BaseColor.jpg`,
        // `Hacker_Dress_6_2_Mixed_AO.png`,
        // `Hacker_Dress_6_2_Normal.jpg`,
        `Hacker_Dress_6_3_BaseColor.jpg`,
        // `Hacker_Dress_6_3_Normal.jpg`,
        `Hacker_Dress_6_4_BaseColor.jpg`,
        // `Hacker_Dress_6_4_Normal.jpg`,
        `Hacker_Dress_6_5_BaseColor.jpg`,
        // `Hacker_Dress_6_5_Normal.jpg`,
        `Hacker_Dress_6_6_BaseColor.jpg`,
        // `Hacker_Dress_6_6_Normal.jpg`,
        `Hacker_Dress_6_7_BaseColor.jpg`,
        // `Hacker_Dress_6_7_Normal.jpg`,
        `Hacker_Dress_6_8_BaseColor.jpg`,
        // `Hacker_Dress_6_8_Normal.jpg`,
        `Hacker_Dress_6_9_BaseColor.jpg`,
        // `Hacker_Dress_6_9_Normal.jpg`,
        `Hacker_Dress_6_10_BaseColor.jpg`,
        // `Hacker_Dress_6_10_Normal.jpg`,
        `Hacker_Dress_6_11_BaseColor.jpg`,
        // `Hacker_Dress_6_11_Normal.jpg`,
        // `Hacker_Dress_6_Mixed_AO.png`,
      ],
      'Hacker_Dress_7_1_BaseColor': [
        `Hacker_Dress_7_1_BaseColor.jpg`,
        // `Hacker_Dress_7_1_Normal.jpg`,
        `Hacker_Dress_7_2_BaseColor.jpg`,
        // `Hacker_Dress_7_2_Normal.jpg`,
        `Hacker_Dress_7_3_BaseColor.jpg`,
        // `Hacker_Dress_7_3_Normal.jpg`,
        `Hacker_Dress_7_4_BaseColor.jpg`,
        // `Hacker_Dress_7_4_Normal.jpg`,
        `Hacker_Dress_7_5_BaseColor.jpg`,
        // `Hacker_Dress_7_5_Normal.jpg`,
        `Hacker_Dress_7_6_BaseColor.jpg`,
        // `Hacker_Dress_7_6_Normal.jpg`,
        `Hacker_Dress_7_7_BaseColor.jpg`,
        // `Hacker_Dress_7_7_Normal.jpg`,
        `Hacker_Dress_7_8_BaseColor.jpg`,
        // `Hacker_Dress_7_8_Normal.jpg`,
        `Hacker_Dress_7_9_BaseColor.jpg`,
        // `Hacker_Dress_7_9_Normal.jpg`,
        `Hacker_Dress_7_10_BaseColor.jpg`,
        // `Hacker_Dress_7_10_Normal.jpg`,
        `Hacker_Dress_7_11_BaseColor.jpg`,
        // `Hacker_Dress_7_11_Normal.jpg`,
      ],
      'Hacker_Dress_7_Normal': [
        // `Hacker_Dress_7_1_BaseColor.jpg`,
        `Hacker_Dress_7_1_Normal.jpg`,
        // `Hacker_Dress_7_2_BaseColor.jpg`,
        `Hacker_Dress_7_2_Normal.jpg`,
        // `Hacker_Dress_7_3_BaseColor.jpg`,
        `Hacker_Dress_7_3_Normal.jpg`,
        // `Hacker_Dress_7_4_BaseColor.jpg`,
        `Hacker_Dress_7_4_Normal.jpg`,
        // `Hacker_Dress_7_5_BaseColor.jpg`,
        `Hacker_Dress_7_5_Normal.jpg`,
        // `Hacker_Dress_7_6_BaseColor.jpg`,
        `Hacker_Dress_7_6_Normal.jpg`,
        // `Hacker_Dress_7_7_BaseColor.jpg`,
        `Hacker_Dress_7_7_Normal.jpg`,
        // `Hacker_Dress_7_8_BaseColor.jpg`,
        `Hacker_Dress_7_8_Normal.jpg`,
        // `Hacker_Dress_7_9_BaseColor.jpg`,
        `Hacker_Dress_7_9_Normal.jpg`,
        // `Hacker_Dress_7_10_BaseColor.jpg`,
        `Hacker_Dress_7_10_Normal.jpg`,
        // `Hacker_Dress_7_11_BaseColor.jpg`,
        `Hacker_Dress_7_11_Normal.jpg`,
      ],
      'Hacker_Dress_8_1_BaseColor': [
        `Hacker_Dress_8_1_BaseColor.jpg`,
        // `Hacker_Dress_8_1_Normal.jpg`,
        `Hacker_Dress_8_2_BaseColor.jpg`,
        // `Hacker_Dress_8_2_Normal.jpg`,
        `Hacker_Dress_8_3_BaseColor.jpg`,
        // `Hacker_Dress_8_3_Normal.jpg`,
        `Hacker_Dress_8_4_BaseColor.jpg`,
        // `Hacker_Dress_8_4_Normal.jpg`,
        `Hacker_Dress_8_5_BaseColor.jpg`,
        // `Hacker_Dress_8_5_Normal.jpg`,
        `Hacker_Dress_8_6_BaseColor.jpg`,
        // `Hacker_Dress_8_6_Normal.jpg`,
        `Hacker_Dress_8_7_BaseColor.jpg`,
        // `Hacker_Dress_8_7_Normal.jpg`,
        `Hacker_Dress_8_8_BaseColor.jpg`,
        // `Hacker_Dress_8_8_Normal.jpg`,
        `Hacker_Dress_8_9_BaseColor.jpg`,
        // `Hacker_Dress_8_9_Normal.jpg`,
        `Hacker_Dress_8_10_BaseColor.jpg`,
        // `Hacker_Dress_8_10_Normal.jpg`,
        `Hacker_Dress_8_11_BaseColor.jpg`,
        // `Hacker_Dress_8_11_Normal.jpg`,
      ],
      'Hacker_Dress_8_Normal': [
        // `Hacker_Dress_8_1_BaseColor.jpg`,
        `Hacker_Dress_8_1_Normal.jpg`,
        // `Hacker_Dress_8_2_BaseColor.jpg`,
        `Hacker_Dress_8_2_Normal.jpg`,
        // `Hacker_Dress_8_3_BaseColor.jpg`,
        `Hacker_Dress_8_3_Normal.jpg`,
        // `Hacker_Dress_8_4_BaseColor.jpg`,
        `Hacker_Dress_8_4_Normal.jpg`,
        // `Hacker_Dress_8_5_BaseColor.jpg`,
        `Hacker_Dress_8_5_Normal.jpg`,
        // `Hacker_Dress_8_6_BaseColor.jpg`,
        `Hacker_Dress_8_6_Normal.jpg`,
        // `Hacker_Dress_8_7_BaseColor.jpg`,
        `Hacker_Dress_8_7_Normal.jpg`,
        // `Hacker_Dress_8_8_BaseColor.jpg`,
        `Hacker_Dress_8_8_Normal.jpg`,
        // `Hacker_Dress_8_9_BaseColor.jpg`,
        `Hacker_Dress_8_9_Normal.jpg`,
        // `Hacker_Dress_8_10_BaseColor.jpg`,
        `Hacker_Dress_8_10_Normal.jpg`,
        // `Hacker_Dress_8_11_BaseColor.jpg`,
        `Hacker_Dress_8_11_Normal.jpg`,
      ],
      'Hacker_Dress_9_1_BaseColor': [
        `Hacker_Dress_9_1_BaseColor.jpg`,
        // `Hacker_Dress_9_1_Normal.jpg`,
        `Hacker_Dress_9_2_BaseColor.jpg`,
        // `Hacker_Dress_9_2_Normal.jpg`,
        `Hacker_Dress_9_3_BaseColor.jpg`,
        // `Hacker_Dress_9_3_Normal.jpg`,
        `Hacker_Dress_9_4_BaseColor.jpg`,
        // `Hacker_Dress_9_4_Normal.jpg`,
        `Hacker_Dress_9_5_BaseColor.jpg`,
        // `Hacker_Dress_9_5_Normal.jpg`,
        `Hacker_Dress_9_6_BaseColor.jpg`,
        // `Hacker_Dress_9_6_Normal.jpg`,
        `Hacker_Dress_9_7_BaseColor.jpg`,
        // `Hacker_Dress_9_7_Normal.jpg`,
        `Hacker_Dress_9_8_BaseColor.jpg`,
        // `Hacker_Dress_9_8_Normal.jpg`,
        `Hacker_Dress_9_9_BaseColor.jpg`,
        // `Hacker_Dress_9_9_Normal.jpg`,
        `Hacker_Dress_9_10_BaseColor.jpg`,
        // `Hacker_Dress_9_10_Normal.jpg`,
        `Hacker_Dress_9_11_BaseColor.jpg`,
        // `Hacker_Dress_9_11_Normal.jpg`,
      ],
      'Hacker_Dress_9_Normal': [
        // `Hacker_Dress_9_1_BaseColor.jpg`,
        `Hacker_Dress_9_1_Normal.jpg`,
        // `Hacker_Dress_9_2_BaseColor.jpg`,
        `Hacker_Dress_9_2_Normal.jpg`,
        // `Hacker_Dress_9_3_BaseColor.jpg`,
        `Hacker_Dress_9_3_Normal.jpg`,
        // `Hacker_Dress_9_4_BaseColor.jpg`,
        `Hacker_Dress_9_4_Normal.jpg`,
        // `Hacker_Dress_9_5_BaseColor.jpg`,
        `Hacker_Dress_9_5_Normal.jpg`,
        // `Hacker_Dress_9_6_BaseColor.jpg`,
        `Hacker_Dress_9_6_Normal.jpg`,
        // `Hacker_Dress_9_7_BaseColor.jpg`,
        `Hacker_Dress_9_7_Normal.jpg`,
        // `Hacker_Dress_9_8_BaseColor.jpg`,
        `Hacker_Dress_9_8_Normal.jpg`,
        // `Hacker_Dress_9_9_BaseColor.jpg`,
        `Hacker_Dress_9_9_Normal.jpg`,
        // `Hacker_Dress_9_10_BaseColor.jpg`,
        `Hacker_Dress_9_10_Normal.jpg`,
        // `Hacker_Dress_9_11_BaseColor.jpg`,
        `Hacker_Dress_9_11_Normal.jpg`,
      ],
      'Hacker_Dress_10_1_BaseColor': [
        `Hacker_Dress_10_1_BaseColor.jpg`,
        // `Hacker_Dress_10_1_Normal.jpg`,
        `Hacker_Dress_10_2_BaseColor.jpg`,
        // `Hacker_Dress_10_2_Normal.jpg`,
        `Hacker_Dress_10_3_BaseColor.jpg`,
        // `Hacker_Dress_10_3_Normal.jpg`,
        `Hacker_Dress_10_4_BaseColor.jpg`,
        // `Hacker_Dress_10_4_Normal.jpg`,
        `Hacker_Dress_10_5_BaseColor.jpg`,
        // `Hacker_Dress_10_5_Normal.jpg`,
        `Hacker_Dress_10_6_BaseColor.jpg`,
        // `Hacker_Dress_10_6_Normal.jpg`,
        `Hacker_Dress_10_7_BaseColor.jpg`,
        // `Hacker_Dress_10_7_Normal.jpg`,
        `Hacker_Dress_10_8_BaseColor.jpg`,
        // `Hacker_Dress_10_8_Normal.jpg`,
        `Hacker_Dress_10_9_BaseColor.jpg`,
        // `Hacker_Dress_10_9_Normal.jpg`,
        `Hacker_Dress_10_10_BaseColor.jpg`,
        // `Hacker_Dress_10_10_Normal.jpg`,
        `Hacker_Dress_10_11_BaseColor.jpg`,
        // `Hacker_Dress_10_11_Normal.jpg`,
      ],
      'Hacker_Dress_10_Normal': [
        // `Hacker_Dress_10_1_BaseColor.jpg`,
        `Hacker_Dress_10_1_Normal.jpg`,
        // `Hacker_Dress_10_2_BaseColor.jpg`,
        `Hacker_Dress_10_2_Normal.jpg`,
        // `Hacker_Dress_10_3_BaseColor.jpg`,
        `Hacker_Dress_10_3_Normal.jpg`,
        // `Hacker_Dress_10_4_BaseColor.jpg`,
        `Hacker_Dress_10_4_Normal.jpg`,
        // `Hacker_Dress_10_5_BaseColor.jpg`,
        `Hacker_Dress_10_5_Normal.jpg`,
        // `Hacker_Dress_10_6_BaseColor.jpg`,
        `Hacker_Dress_10_6_Normal.jpg`,
        // `Hacker_Dress_10_7_BaseColor.jpg`,
        `Hacker_Dress_10_7_Normal.jpg`,
        // `Hacker_Dress_10_8_BaseColor.jpg`,
        `Hacker_Dress_10_8_Normal.jpg`,
        // `Hacker_Dress_10_9_BaseColor.jpg`,
        `Hacker_Dress_10_9_Normal.jpg`,
        // `Hacker_Dress_10_10_BaseColor.jpg`,
        `Hacker_Dress_10_10_Normal.jpg`,
        // `Hacker_Dress_10_11_BaseColor.jpg`,
        `Hacker_Dress_10_11_Normal.jpg`,
      ],
    }, n => `/models/Avatar_Bases/Hacker Class/Hacker variant textures/texture/${n}`),
  },
  {
    name: 'dropHunter',
    base: `/models/Avatar_Bases/Drophunter Class/DropHunter_Master_v3_Guilty.vrm`,
    // base: `/models/Avatar_Bases/Drophunter Class/DropHunter_Master_v3.1_Guilty.glb`,
    eye: [
      `IMG_2817.png`,
      `IMG_2818.png`,
      `IMG_2819.png`,
      `IMG_2820.png`,
      `IMG_2821.png`,
      `IMG_2822.png`,
      `IMG_2823.png`,
      `IMG_2824.png`,
      `IMG_2826.png`,
      `IMG_2827.png`,
      `IMG_2828.png`,
      `IMG_2829.png`,
      `IMG_2830.png`,
      `IMG_2831.png`,
      `IMG_2833.png`,
      `IMG_2834.png`,
      `IMG_2836.png`,
      `IMG_2837.png`,
      `IMG_2838.png`,
      `IMG_2839.png`,
      `IMG_2840.png`,
      `IMG_2841.png`,
      `IMG_2842.png`,
      `IMG_2843.png`,
      `IMG_2844.png`,
      `IMG_2845.png`,
      `IMG_2846.png`,
      `IMG_2847.png`,
      `IMG_2848.png`,
      `IMG_2849.png`,
      `IMG_2850.png`,
      `IMG_2851.png`,
      `IMG_2853.png`,
      `IMG_2854.png`,
      `IMG_2855.png`,
    ].map(name => `/models/Avatar_Bases/Drophunter Class/Variation textures/Eye_Colors/${name}`),
    skin: [
      [
        'face',
        [
          `Skin variations/Original skin/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Original skin/Anime_Proj_base_NoClothes_Face_BaseColor_alt.png`,
          `Skin variations/Skin tone 1/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 2/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 3/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 4/Anime_Proj_base_NoClothes_Face_BaseColor.png`,

          `Skin variations/Original skin/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 1/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 2/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 3/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 4/Anime_Proj_base_NoClothes_Face_BaseColor.png`,

          `Skin variations/Original skin/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 1/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 2/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 3/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 4/Anime_Proj_base_NoClothes_Face_BaseColor.png`,

          `Skin variations/Original skin/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 1/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 2/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 3/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
          `Skin variations/Skin tone 4/Anime_Proj_base_NoClothes_Face_BaseColor.png`,
        ].map(n => `/models/Avatar_Bases/Drophunter Class/Variation textures/${n}`),
      ],
      [
        'body',
        [
          `Skin variations/Original skin/Anime_Proj_base_NoClothes_skin_BaseColor.png`,
          `Skin variations/Original skin/Anime_Proj_base_NoClothes_skin_BaseColor_alt.png`,
          `Skin variations/Skin tone 1/Anime_Proj_base_NoClothes_skin_BaseColor.png`,
          `Skin variations/Skin tone 2/Anime_Proj_base_NoClothes_skin_BaseColor.png`,
          `Skin variations/Skin tone 3/Anime_Proj_base_NoClothes_skin_BaseColor.png`,
          `Skin variations/Skin tone 4/Anime_Proj_base_NoClothes_skin_BaseColor.png`,

          `Skin variations/Arm sleeves/ArmSleeves_Original.png`,
          `Skin variations/Arm sleeves/ArmSleeves_Tone_1.png`,
          `Skin variations/Arm sleeves/ArmSleeves_Tone_2.png`,
          `Skin variations/Arm sleeves/ArmSleeves_Tone_3.png`,
          `Skin variations/Arm sleeves/ArmSleeves_Tone_4.png`,

          `Skin variations/Knee highs/KneeHighs_Original.png`,
          `Skin variations/Knee highs/KneeHighs_Tone_1.png`,
          `Skin variations/Knee highs/KneeHighs_Tone_2.png`,
          `Skin variations/Knee highs/KneeHighs_Tone_3.png`,
          `Skin variations/Knee highs/KneeHighs_Tone_4.png`,

          `Skin variations/Thigh highs/ThighHighs_Original.png`,
          `Skin variations/Thigh highs/ThighHighs_Tone_1.png`,
          `Skin variations/Thigh highs/ThighHighs_Tone_2.png`,
          `Skin variations/Thigh highs/ThighHighs_Tone_3.png`,
          `Skin variations/Thigh highs/ThighHighs_Tone_4.png`,
        ].map(n => `/models/Avatar_Bases/Drophunter Class/Variation textures/${n}`),
      ],
      [
        'mouth',
        [],
      ],
    ],
    clothing: _pathize({
      'Anime_Proj_base_Set_1_Pants.001_BaseColor': [
        `Outfit_6_Textures/Blue/Anime_Proj_base_Set_1_Pants.001_BaseColor.png`,
        `Outfit_6_Textures/Black/Anime_Proj_base_Set_1_Pants.001_BaseColor.png`,
        `Outfit_6_Textures/Pink/Anime_Proj_base_Set_1_Pants.001_BaseColor.png`,
        `Outfit_6_Textures/Green/Anime_Proj_base_Set_1_Pants.001_BaseColor.png`,
        `Outfit_6_Textures/Yellow/Anime_Proj_base_Set_1_Pants.001_BaseColor.png`,
        `Outfit_6_Textures/Original/Anime_Proj_base_Set_1_Pants.001_BaseColor.png`,
        `Outfit_6_Textures/Cyan/Anime_Proj_base_Set_1_Pants.001_BaseColor.png`,
      ],
      'Anime_Proj_base_Set_1_Shoes_BaseColor': [
        `Outfit_6_Textures/Blue/Anime_Proj_base_Set_1_Shoes_BaseColor.png`,
        `Outfit_6_Textures/Black/Anime_Proj_base_Set_1_Shoes_BaseColor.png`,
        `Outfit_6_Textures/Pink/Anime_Proj_base_Set_1_Shoes_BaseColor.png`,
        `Outfit_6_Textures/Green/Anime_Proj_base_Set_1_Shoes_BaseColor.png`,
        `Outfit_6_Textures/Yellow/Anime_Proj_base_Set_1_Shoes_BaseColor.png`,
        `Outfit_6_Textures/Original/Anime_Proj_base_Set_1_Shoes_BaseColor.png`,
        `Outfit_6_Textures/Cyan/Anime_Proj_base_Set_1_Shoes_BaseColor.png`,
      ],
      'Anime_Proj_base_Set_1_Top_BaseColor': [
        `Outfit_6_Textures/Blue/Anime_Proj_base_Set_1_Top_BaseColor.png`,
        `Outfit_6_Textures/Black/Anime_Proj_base_Set_1_Top_BaseColor.png`,
        `Outfit_6_Textures/Pink/Anime_Proj_base_Set_1_Top_BaseColor.png`,
        `Outfit_6_Textures/Green/Anime_Proj_base_Set_1_Top_BaseColor.png`,
        `Outfit_6_Textures/Yellow/Anime_Proj_base_Set_1_Top_BaseColor.png`,
        `Outfit_6_Textures/Original/Anime_Proj_base_Set_1_Top_BaseColor.png`,
        `Outfit_6_Textures/Cyan/Anime_Proj_base_Set_1_Top_BaseColor.png`,
      ],
      'Anime_Proj_base_Set_3_Shoes1_BaseColor': [
        `Outfit_8_Textures/Blue/Anime_Proj_base_Set_3_Shoes1_BaseColor.png`,
        `Outfit_8_Textures/Black/Anime_Proj_base_Set_3_Shoes1_BaseColor.png`,
        `Outfit_8_Textures/Pink/Anime_Proj_base_Set_3_Shoes1_BaseColor.png`,
        `Outfit_8_Textures/Green/Anime_Proj_base_Set_3_Shoes1_BaseColor.png`,
        `Outfit_8_Textures/Yellow/Anime_Proj_base_Set_3_Shoes1_BaseColor.png`,
        `Outfit_8_Textures/Original/Anime_Proj_base_Set_3_Shoes1_BaseColor.png`,
        `Outfit_8_Textures/Cyan/Anime_Proj_base_Set_3_Shoes1_BaseColor.png`,
      ],
      'Anime_Proj_base_Set_3_Top1_BaseColor': [
        `Outfit_8_Textures/Blue/Anime_Proj_base_Set_3_Top1_BaseColor.png`,
        `Outfit_8_Textures/Black/Anime_Proj_base_Set_3_Top1_BaseColor.png`,
        `Outfit_8_Textures/Pink/Anime_Proj_base_Set_3_Top1_BaseColor.png`,
        `Outfit_8_Textures/Green/Anime_Proj_base_Set_3_Top1_BaseColor.png`,
        `Outfit_8_Textures/Yellow/Anime_Proj_base_Set_3_Top1_BaseColor.png`,
        `Outfit_8_Textures/Original/Anime_Proj_base_Set_3_Top1_BaseColor.png`,
        `Outfit_8_Textures/Cyan/Anime_Proj_base_Set_3_Top1_BaseColor.png`,
      ],
      'Anime_Proj_base_Set_3_pants1_BaseColor': [
        `Outfit_8_Textures/Blue/Anime_Proj_base_Set_3_pants1_BaseColor.png`,
        `Outfit_8_Textures/Black/Anime_Proj_base_Set_3_pants1_BaseColor.png`,
        `Outfit_8_Textures/Pink/Anime_Proj_base_Set_3_pants1_BaseColor.png`,
        `Outfit_8_Textures/Green/Anime_Proj_base_Set_3_pants1_BaseColor.png`,
        `Outfit_8_Textures/Yellow/Anime_Proj_base_Set_3_pants1_BaseColor.png`,
        `Outfit_8_Textures/Original/Anime_Proj_base_Set_3_pants1_BaseColor.png`,
        `Outfit_8_Textures/Cyan/Anime_Proj_base_Set_3_pants1_BaseColor.png`,
      ],
      'DropHunter_Outfit_1_Highcut socks_BaseColor': [
        `Outfit_1_Textures/Blue/DropHunter_Outfit_1_Highcut socks_BaseColor.png`,
        `Outfit_1_Textures/Black/DropHunter_Outfit_1_Highcut socks_BaseColor.png`,
        `Outfit_1_Textures/Pink/DropHunter_Outfit_1_Highcut socks_BaseColor.png`,
        `Outfit_1_Textures/Green/DropHunter_Outfit_1_Highcut socks_BaseColor.png`,
        `Outfit_1_Textures/Yellow/DropHunter_Outfit_1_Highcut socks_BaseColor.png`,
        `Outfit_1_Textures/Original/DropHunter_Outfit_1_Highcut socks_BaseColor.png`,
        `Outfit_1_Textures/Cyan/DropHunter_Outfit_1_Highcut socks_BaseColor.png`,
      ],
      'DropHunter_Outfit_1_Leg Items_BaseColor': [
        `Outfit_1_Textures/Blue/DropHunter_Outfit_1_Leg Items_BaseColor.png`,
        `Outfit_1_Textures/Black/DropHunter_Outfit_1_Leg Items_BaseColor.png`,
        `Outfit_1_Textures/Pink/DropHunter_Outfit_1_Leg Items_BaseColor.png`,
        `Outfit_1_Textures/Green/DropHunter_Outfit_1_Leg Items_BaseColor.png`,
        `Outfit_1_Textures/Yellow/DropHunter_Outfit_1_Leg Items_BaseColor.png`,
        `Outfit_1_Textures/Original/DropHunter_Outfit_1_Leg Items_BaseColor.png`,
        `Outfit_1_Textures/Cyan/DropHunter_Outfit_1_Leg Items_BaseColor.png`,
      ],
      'DropHunter_Outfit_1_Shirt1_BaseColor': [
        `Outfit_1_Textures/Blue/DropHunter_Outfit_1_Shirt1_BaseColor.png`,
        `Outfit_1_Textures/Black/DropHunter_Outfit_1_Shirt1_BaseColor.png`,
        `Outfit_1_Textures/Pink/DropHunter_Outfit_1_Shirt1_BaseColor.png`,
        `Outfit_1_Textures/Green/DropHunter_Outfit_1_Shirt1_BaseColor.png`,
        `Outfit_1_Textures/Yellow/DropHunter_Outfit_1_Shirt1_BaseColor.png`,
        `Outfit_1_Textures/Original/DropHunter_Outfit_1_Shirt1_BaseColor.png`,
        `Outfit_1_Textures/Cyan/DropHunter_Outfit_1_Shirt1_BaseColor.png`,
      ],
      'DropHunter_Outfit_1_Shoes4_BaseColor': [
        `Outfit_1_Textures/Blue/DropHunter_Outfit_1_Shoes4_BaseColor.png`,
        `Outfit_1_Textures/Black/DropHunter_Outfit_1_Shoes4_BaseColor.png`,
        `Outfit_1_Textures/Pink/DropHunter_Outfit_1_Shoes4_BaseColor.png`,
        `Outfit_1_Textures/Green/DropHunter_Outfit_1_Shoes4_BaseColor.png`,
        `Outfit_1_Textures/Yellow/DropHunter_Outfit_1_Shoes4_BaseColor.png`,
        `Outfit_1_Textures/Original/DropHunter_Outfit_1_Shoes4_BaseColor.png`,
        `Outfit_1_Textures/Cyan/DropHunter_Outfit_1_Shoes4_BaseColor.png`,
      ],
      'DropHunter_Outfit_1_Shorts_BaseColor2': [
        `Outfit_1_Textures/Blue/legs_WaistShorts_Blue.png`,
        `Outfit_1_Textures/Blue/old/DropHunter_Outfit_1_Shorts_BaseColor.png`,
        `Outfit_1_Textures/Black/legs_WaistShorts_Black.png`,
        `Outfit_1_Textures/Black/old/DropHunter_Outfit_1_Shorts_BaseColor.png`,
        `Outfit_1_Textures/Pink/legs_WaistShorts_Pink.png`,
        `Outfit_1_Textures/Pink/old/DropHunter_Outfit_1_Shorts_BaseColor.png`,
        `Outfit_1_Textures/Green/legs_WaistShorts_Green.png`,
        `Outfit_1_Textures/Green/old/DropHunter_Outfit_1_Shorts_BaseColor.png`,
        `Outfit_1_Textures/Yellow/legs_WaistShorts_Yellow.png`,
        `Outfit_1_Textures/Yellow/old/DropHunter_Outfit_1_Shorts_BaseColor.png`,
        `Outfit_1_Textures/Original/old/DropHunter_Outfit_1_Shorts_BaseColor.png`,
        `Outfit_1_Textures/Original/DropHunter_Outfit_1_Shorts_BaseColor2.png`,
        `Outfit_1_Textures/Cyan/legs_WaistShorts_Cyan.png`,
        `Outfit_1_Textures/Cyan/old/DropHunter_Outfit_1_Shorts_BaseColor.png`,
      ],
      'DropHunter_Outfit_2_Boots1_BaseColor': [
        `Outfit_2_Textures/Blue/DropHunter_Outfit_2_Boots1_BaseColor.png`,
        `Outfit_2_Textures/Black/DropHunter_Outfit_2_Boots1_BaseColor.png`,
        `Outfit_2_Textures/Pink/DropHunter_Outfit_2_Boots1_BaseColor.png`,
        `Outfit_2_Textures/Green/DropHunter_Outfit_2_Boots1_BaseColor.png`,
        `Outfit_2_Textures/Yellow/DropHunter_Outfit_2_Boots1_BaseColor.png`,
        `Outfit_2_Textures/Original/DropHunter_Outfit_2_Boots1_BaseColor.png`,
        `Outfit_2_Textures/Cyan/DropHunter_Outfit_2_Boots1_BaseColor.png`,
      ],
      'DropHunter_Outfit_2_Dress1_BaseColor': [
        `Outfit_2_Textures/Blue/DropHunter_Outfit_2_Dress1_BaseColor.png`,
        `Outfit_2_Textures/Black/DropHunter_Outfit_2_Dress1_BaseColor.png`,
        `Outfit_2_Textures/Pink/DropHunter_Outfit_2_Dress1_BaseColor.png`,
        `Outfit_2_Textures/Green/DropHunter_Outfit_2_Dress1_BaseColor.png`,
        `Outfit_2_Textures/Yellow/DropHunter_Outfit_2_Dress1_BaseColor.png`,
        `Outfit_2_Textures/Original/DropHunter_Outfit_2_Dress1_BaseColor.png`,
        `Outfit_2_Textures/Cyan/DropHunter_Outfit_2_Dress1_BaseColor.png`,
      ],
      'DropHunter_Outfit_3_VERTEX_Belt1_BaseColor': [
        `Outfit_3_Textures/Blue/DropHunter_Outfit_3_VERTEX_Belt1_BaseColor.png`,
        `Outfit_3_Textures/Black/DropHunter_Outfit_3_VERTEX_Belt1_BaseColor.png`,
        `Outfit_3_Textures/Pink/DropHunter_Outfit_3_VERTEX_Belt1_BaseColor.png`,
        `Outfit_3_Textures/Green/DropHunter_Outfit_3_VERTEX_Belt1_BaseColor.png`,
        `Outfit_3_Textures/Yellow/DropHunter_Outfit_3_VERTEX_Belt1_BaseColor.png`,
        `Outfit_3_Textures/Original/DropHunter_Outfit_3_VERTEX_Belt1_BaseColor.png`,
        `Outfit_3_Textures/Cyan/DropHunter_Outfit_3_VERTEX_Belt1_BaseColor.png`,
      ],
      'DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor': [
        `Outfit_3_Textures/Blue/DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor.png`,
        `Outfit_3_Textures/Black/DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor.png`,
        `Outfit_3_Textures/Pink/DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor.png`,
        `Outfit_3_Textures/Green/DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor.png`,
        `Outfit_3_Textures/Yellow/DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor.png`,
        `Outfit_3_Textures/Original/DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor.png`,
        `Outfit_3_Textures/Cyan/DropHunter_Outfit_3_VERTEX_Jacket2_BaseColor.png`,
      ],
      'DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor': [
        `Outfit_3_Textures/Blue/DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor.png`,
        `Outfit_3_Textures/Black/DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor.png`,
        `Outfit_3_Textures/Pink/DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor.png`,
        `Outfit_3_Textures/Green/DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor.png`,
        `Outfit_3_Textures/Yellow/DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor.png`,
        `Outfit_3_Textures/Original/DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor.png`,
        `Outfit_3_Textures/Cyan/DropHunter_Outfit_3_VERTEX_Shirt2_BaseColor.png`,
      ],
      'DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor': [
        `Outfit_3_Textures/Blue/DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor.png`,
        `Outfit_3_Textures/Black/DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor.png`,
        `Outfit_3_Textures/Pink/DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor.png`,
        `Outfit_3_Textures/Green/DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor.png`,
        `Outfit_3_Textures/Yellow/DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor.png`,
        `Outfit_3_Textures/Original/DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor.png`,
        `Outfit_3_Textures/Cyan/DropHunter_Outfit_3_VERTEX_Shoes6_BaseColor.png`,
      ],
      'DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor': [
        `Outfit_3_Textures/Blue/DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor.png`,
        `Outfit_3_Textures/Black/DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor.png`,
        `Outfit_3_Textures/Pink/DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor.png`,
        `Outfit_3_Textures/Green/DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor.png`,
        `Outfit_3_Textures/Yellow/DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor.png`,
        `Outfit_3_Textures/Original/DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor.png`,
        `Outfit_3_Textures/Cyan/DropHunter_Outfit_3_VERTEX_Skirt1_BaseColor.png`,
      ],
      'DropHunter_Outfit_3_VERTEX_Socks1_BaseColor': [
        `Outfit_3_Textures/Blue/DropHunter_Outfit_3_VERTEX_Socks1_BaseColor.png`,
        `Outfit_3_Textures/Black/DropHunter_Outfit_3_VERTEX_Socks1_BaseColor.png`,
        `Outfit_3_Textures/Pink/DropHunter_Outfit_3_VERTEX_Socks1_BaseColor.png`,
        `Outfit_3_Textures/Green/DropHunter_Outfit_3_VERTEX_Socks1_BaseColor.png`,
        `Outfit_3_Textures/Yellow/DropHunter_Outfit_3_VERTEX_Socks1_BaseColor.png`,
        `Outfit_3_Textures/Original/DropHunter_Outfit_3_VERTEX_Socks1_BaseColor.png`,
        `Outfit_3_Textures/Cyan/DropHunter_Outfit_3_VERTEX_Socks1_BaseColor.png`,
      ],
      'DropHunter_Outfit_4_Shoe7_BaseColor': [
        `Outfit_4_Textures/Blue/DropHunter_Outfit_4_Shoe7_BaseColor.png`,
        `Outfit_4_Textures/Black/DropHunter_Outfit_4_Shoe7_BaseColor.png`,
        `Outfit_4_Textures/Pink/DropHunter_Outfit_4_Shoe7_BaseColor.png`,
        `Outfit_4_Textures/Green/DropHunter_Outfit_4_Shoe7_BaseColor.png`,
        `Outfit_4_Textures/Yellow/DropHunter_Outfit_4_Shoe7_BaseColor.png`,
        `Outfit_4_Textures/Original/DropHunter_Outfit_4_Shoe7_BaseColor.png`,
        `Outfit_4_Textures/Cyan/DropHunter_Outfit_4_Shoe7_BaseColor.png`,
      ],
      'DropHunter_Outfit_4_Shorts3_BaseColor': [
        `Outfit_4_Textures/Blue/DropHunter_Outfit_4_Shorts3_BaseColor.png`,
        `Outfit_4_Textures/Black/DropHunter_Outfit_4_Shorts3_BaseColor.png`,
        `Outfit_4_Textures/Pink/DropHunter_Outfit_4_Shorts3_BaseColor.png`,
        `Outfit_4_Textures/Green/DropHunter_Outfit_4_Shorts3_BaseColor.png`,
        `Outfit_4_Textures/Yellow/DropHunter_Outfit_4_Shorts3_BaseColor.png`,
        `Outfit_4_Textures/Original/DropHunter_Outfit_4_Shorts3_BaseColor.png`,
        `Outfit_4_Textures/Cyan/DropHunter_Outfit_4_Shorts3_BaseColor.png`,
      ],
      'DropHunter_Outfit_4_Sweater1_BaseColor': [
        `Outfit_4_Textures/Blue/DropHunter_Outfit_4_Sweater1_BaseColor.png`,
        `Outfit_4_Textures/Black/DropHunter_Outfit_4_Sweater1_BaseColor.png`,
        `Outfit_4_Textures/Pink/DropHunter_Outfit_4_Sweater1_BaseColor.png`,
        `Outfit_4_Textures/Green/DropHunter_Outfit_4_Sweater1_BaseColor.png`,
        `Outfit_4_Textures/Yellow/DropHunter_Outfit_4_Sweater1_BaseColor.png`,
        `Outfit_4_Textures/Original/DropHunter_Outfit_4_Sweater1_BaseColor.png`,
        `Outfit_4_Textures/Cyan/DropHunter_Outfit_4_Sweater1_BaseColor.png`,
      ],
      'DropHunter_Outfit_4_Tanktop1_BaseColor': [
        `Outfit_5_Textures/Blue/DropHunter_Outfit_5_Tanktop1_BaseColor.png`,
        `Outfit_5_Textures/Black/DropHunter_Outfit_5_Tanktop1_BaseColor.png`,
        `Outfit_5_Textures/Pink/DropHunter_Outfit_5_Tanktop1_BaseColor.png`,
        `Outfit_5_Textures/Green/DropHunter_Outfit_5_Tanktop1_BaseColor.png`,
        `Outfit_5_Textures/Yellow/DropHunter_Outfit_5_Tanktop1_BaseColor.png`,
        `Outfit_5_Textures/Original/DropHunter_Outfit_5_Tanktop1_BaseColor.png`,
        `Outfit_5_Textures/Cyan/DropHunter_Outfit_5_Tanktop1_BaseColor.png`,
        `Outfit_4_Textures/Blue/DropHunter_Outfit_4_Tanktop1_BaseColor.png`,
        `Outfit_4_Textures/Black/DropHunter_Outfit_4_Tanktop1_BaseColor.png`,
        `Outfit_4_Textures/Pink/DropHunter_Outfit_4_Tanktop1_BaseColor.png`,
        `Outfit_4_Textures/Green/DropHunter_Outfit_4_Tanktop1_BaseColor.png`,
        `Outfit_4_Textures/Yellow/DropHunter_Outfit_4_Tanktop1_BaseColor.png`,
        `Outfit_4_Textures/Original/DropHunter_Outfit_4_Tanktop1_BaseColor.png`,
        `Outfit_4_Textures/Cyan/DropHunter_Outfit_4_Tanktop1_BaseColor.png`,
      ],
      'DropHunter_Outfit_5_Jacket1_BaseColor': [
        `Outfit_5_Textures/Blue/DropHunter_Outfit_5_Jacket1_BaseColor.png`,
        `Outfit_5_Textures/Black/DropHunter_Outfit_5_Jacket1_BaseColor.png`,
        `Outfit_5_Textures/Pink/DropHunter_Outfit_5_Jacket1_BaseColor.png`,
        `Outfit_5_Textures/Green/DropHunter_Outfit_5_Jacket1_BaseColor.png`,
        `Outfit_5_Textures/Yellow/DropHunter_Outfit_5_Jacket1_BaseColor.png`,
        `Outfit_5_Textures/Original/DropHunter_Outfit_5_Jacket1_BaseColor.png`,
        `Outfit_5_Textures/Cyan/DropHunter_Outfit_5_Jacket1_BaseColor.png`,
      ],
      'DropHunter_Outfit_5_Shoes5_BaseColor': [
        `Outfit_5_Textures/Blue/DropHunter_Outfit_5_Shoes5_BaseColor.png`,
        `Outfit_5_Textures/Black/DropHunter_Outfit_5_Shoes5_BaseColor.png`,
        `Outfit_5_Textures/Pink/DropHunter_Outfit_5_Shoes5_BaseColor.png`,
        `Outfit_5_Textures/Green/DropHunter_Outfit_5_Shoes5_BaseColor.png`,
        `Outfit_5_Textures/Yellow/DropHunter_Outfit_5_Shoes5_BaseColor.png`,
        `Outfit_5_Textures/Original/DropHunter_Outfit_5_Shoes5_BaseColor.png`,
        `Outfit_5_Textures/Cyan/DropHunter_Outfit_5_Shoes5_BaseColor.png`,
      ],
      'DropHunter_Outfit_5_Shorts2_BaseColor': [
        `Outfit_5_Textures/Blue/DropHunter_Outfit_5_Shorts2_BaseColor.png`,
        `Outfit_5_Textures/Black/DropHunter_Outfit_5_Shorts2_BaseColor.png`,
        `Outfit_5_Textures/Pink/DropHunter_Outfit_5_Shorts2_BaseColor.png`,
        `Outfit_5_Textures/Green/DropHunter_Outfit_5_Shorts2_BaseColor.png`,
        `Outfit_5_Textures/Yellow/DropHunter_Outfit_5_Shorts2_BaseColor.png`,
        `Outfit_5_Textures/Original/DropHunter_Outfit_5_Shorts2_BaseColor.png`,
        `Outfit_5_Textures/Cyan/DropHunter_Outfit_5_Shorts2_BaseColor.png`,
      ],
      'DropHunter_Outfit_7_Jacket_2_BaseColor': [
        `Outfit_7_Textures/Blue/DropHunter_Outfit_7_Jacket_2_BaseColor.png`,
        `Outfit_7_Textures/Black/DropHunter_Outfit_7_Jacket_2_BaseColor.png`,
        `Outfit_7_Textures/Pink/DropHunter_Outfit_7_Jacket_2_BaseColor.png`,
        `Outfit_7_Textures/Green/DropHunter_Outfit_7_Jacket_2_BaseColor.png`,
        `Outfit_7_Textures/Yellow/DropHunter_Outfit_7_Jacket_2_BaseColor.png`,
        `Outfit_7_Textures/Original/DropHunter_Outfit_7_Jacket_2_BaseColor.png`,
        `Outfit_7_Textures/Cyan/DropHunter_Outfit_7_Jacket_2_BaseColor.png`,
      ],
      'DropHunter_Outfit_7_boots_BaseColor': [
        `Outfit_7_Textures/Blue/DropHunter_Outfit_7_boots_BaseColor.png`,
        `Outfit_7_Textures/Black/DropHunter_Outfit_7_boots_BaseColor.png`,
        `Outfit_7_Textures/Pink/DropHunter_Outfit_7_boots_BaseColor.png`,
        `Outfit_7_Textures/Green/DropHunter_Outfit_7_boots_BaseColor.png`,
        `Outfit_7_Textures/Yellow/DropHunter_Outfit_7_boots_BaseColor.png`,
        `Outfit_7_Textures/Original/DropHunter_Outfit_7_boots_BaseColor.png`,
        `Outfit_7_Textures/Cyan/DropHunter_Outfit_7_boots_BaseColor.png`,
      ],
      'DropHunter_Outfit_7_shorts_BaseColor': [
        `Outfit_7_Textures/Blue/DropHunter_Outfit_7_shorts_BaseColor.png`,
        `Outfit_7_Textures/Black/DropHunter_Outfit_7_shorts_BaseColor.png`,
        `Outfit_7_Textures/Pink/DropHunter_Outfit_7_shorts_BaseColor.png`,
        `Outfit_7_Textures/Green/DropHunter_Outfit_7_shorts_BaseColor.png`,
        `Outfit_7_Textures/Yellow/DropHunter_Outfit_7_shorts_BaseColor.png`,
        `Outfit_7_Textures/Original/DropHunter_Outfit_7_shorts_BaseColor.png`,
        `Outfit_7_Textures/Cyan/DropHunter_Outfit_7_shorts_BaseColor.png`,
      ],
      'DropHunter_Outfit_9_Half jacket_BaseColor': [
        `Outfit_9_Textures/Blue/DropHunter_Outfit_9_Half jacket_BaseColor.png`,
        `Outfit_9_Textures/Black/DropHunter_Outfit_9_Half jacket_BaseColor.png`,
        `Outfit_9_Textures/Pink/DropHunter_Outfit_9_Half jacket_BaseColor.png`,
        `Outfit_9_Textures/Green/DropHunter_Outfit_9_Half jacket_BaseColor.png`,
        `Outfit_9_Textures/Yellow/DropHunter_Outfit_9_Half jacket_BaseColor.png`,
        `Outfit_9_Textures/Original/DropHunter_Outfit_9_Half jacket_BaseColor.png`,
        `Outfit_9_Textures/Cyan/DropHunter_Outfit_9_Half jacket_BaseColor.png`,
      ],
      'DropHunter_Outfit_9_Pants_BaseColor': [
        `Outfit_9_Textures/Blue/DropHunter_Outfit_9_Pants_BaseColor.png`,
        `Outfit_9_Textures/Black/DropHunter_Outfit_9_Pants_BaseColor.png`,
        `Outfit_9_Textures/Pink/DropHunter_Outfit_9_Pants_BaseColor.png`,
        `Outfit_9_Textures/Green/DropHunter_Outfit_9_Pants_BaseColor.png`,
        `Outfit_9_Textures/Yellow/DropHunter_Outfit_9_Pants_BaseColor.png`,
        `Outfit_9_Textures/Original/DropHunter_Outfit_9_Pants_BaseColor.png`,
        `Outfit_9_Textures/Cyan/DropHunter_Outfit_9_Pants_BaseColor.png`,
      ],
      'DropHunter_Outfit_9_Shoes2_BaseColor': [
        `Outfit_9_Textures/Blue/DropHunter_Outfit_9_Shoes2_BaseColor.png`,
        `Outfit_9_Textures/Black/DropHunter_Outfit_9_Shoes2_BaseColor.png`,
        `Outfit_9_Textures/Pink/DropHunter_Outfit_9_Shoes2_BaseColor.png`,
        `Outfit_9_Textures/Green/DropHunter_Outfit_9_Shoes2_BaseColor.png`,
        `Outfit_9_Textures/Yellow/DropHunter_Outfit_9_Shoes2_BaseColor.png`,
        `Outfit_9_Textures/Original/DropHunter_Outfit_9_Shoes2_BaseColor.png`,
        `Outfit_9_Textures/Cyan/DropHunter_Outfit_9_Shoes2_BaseColor.png`,
      ],
      'DropHunter_Outfit_9_Topsuit_BaseColor': [
        `Outfit_9_Textures/Blue/DropHunter_Outfit_9_Topsuit_BaseColor.png`,
        `Outfit_9_Textures/Black/DropHunter_Outfit_9_Topsuit_BaseColor.png`,
        `Outfit_9_Textures/Pink/DropHunter_Outfit_9_Topsuit_BaseColor.png`,
        `Outfit_9_Textures/Green/DropHunter_Outfit_9_Topsuit_BaseColor.png`,
        `Outfit_9_Textures/Yellow/DropHunter_Outfit_9_Topsuit_BaseColor.png`,
        `Outfit_9_Textures/Original/DropHunter_Outfit_9_Topsuit_BaseColor.png`,
        `Outfit_9_Textures/Cyan/DropHunter_Outfit_9_Topsuit_BaseColor.png`,
      ],
      'DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor': [
        `Outfit_10_Textures/Blue/DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor.png`,
        `Outfit_10_Textures/Black/DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor.png`,
        `Outfit_10_Textures/Pink/DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor.png`,
        `Outfit_10_Textures/Green/DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor.png`,
        `Outfit_10_Textures/Yellow/DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor.png`,
        `Outfit_10_Textures/Original/DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor.png`,
        `Outfit_10_Textures/Cyan/DropHunter_Outfit_10_Updated jacket_Jacket_BaseColor.png`,
      ],
      'DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor': [
        `Outfit_10_Textures/Blue/DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor.png`,
        `Outfit_10_Textures/Black/DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor.png`,
        `Outfit_10_Textures/Pink/DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor.png`,
        `Outfit_10_Textures/Green/DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor.png`,
        `Outfit_10_Textures/Yellow/DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor.png`,
        `Outfit_10_Textures/Original/DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor.png`,
        `Outfit_10_Textures/Cyan/DropHunter_Outfit_10_Updated jacket_Shoes3_BaseColor.png`,
      ],
      'DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor': [
        `Outfit_10_Textures/Blue/DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor.png`,
        `Outfit_10_Textures/Black/DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor.png`,
        `Outfit_10_Textures/Pink/DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor.png`,
        `Outfit_10_Textures/Green/DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor.png`,
        `Outfit_10_Textures/Yellow/DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor.png`,
        `Outfit_10_Textures/Original/DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor.png`,
        `Outfit_10_Textures/Cyan/DropHunter_Outfit_10_Updated jacket_shorts1_BaseColor.png`,
      ],
    }, n => `/models/Avatar_Bases/Drophunter Class/Variation textures/${n}`),
  },
];
// const seed = 'b';
// const rng = alea(seed);
// const rng = Math.random;
const r = Math.random() + '';
const makeRng = () => alea(r);
const rng = makeRng();
const hairShift = rng() * Math.PI * 2;
const clothingShift = rng() * Math.PI * 2;
const hairMetadata = [1, hairShift, 0.5, 0.5];
const chestMetadata = [0, clothingShift, 0, 0.3];
const clothingMetadata = [1, clothingShift, 0, 0.3];
const eyeMetadata = [1, 0, 0, 0];
const headMetadata = [1, 0, 0, 0];
const bodyMetadata = [1, 0, 0, 0];
const categorySpecsArray = [
  [
    {
      regex: /hair/i,
      name: 'hair',
      className: 'hair',
      metadata: hairMetadata,
    },
    {
      regex: /^Headbaked\(copy\)_1$/i,
      name: 'eye',
      metadata: eyeMetadata,
    },
    {
      regex: /head/i,
      name: 'head',
      className: 'body',
      metadata: headMetadata,
    },
    {
      regex: /body/i,
      name: 'body',
      className: 'body',
      metadata: bodyMetadata,
    },
    {
      regex: /^chest_/,
      name: 'clothing',
      className: 'clothing',
      metadata: chestMetadata,
    },
    {
      regex: /^legs_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^foot_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^outer_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^accessories_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^solo_/,
      name: 'clothing',
      className: 'solo',
      metadata: clothingMetadata,
    },
  ],
  [
    {
      regex: /^hair_/,
      name: 'hair',
      className: 'hair',
      metadata: hairMetadata,
    },
    {
      regex: /^foot_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^accessories_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^outer_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^chest_/,
      name: 'clothing',
      className: 'clothing',
      metadata: chestMetadata,
    },
    {
      regex: /^legs_/,
      name: 'clothing',
      className: 'clothing',
      metadata: clothingMetadata,
    },
    {
      regex: /^head_geobaked\(copy\)$/i,
      name: 'eye',
      className: 'eye',
      metadata: eyeMetadata,
    },
    {
      regex: /^head_/,
      name: 'head',
      className: 'body',
      metadata: headMetadata,
    },
    {
      regex: /^body_/,
      name: 'body',
      className: 'body',
      metadata: bodyMetadata,
    },
    {
      regex: /^solo_/,
      name: 'clothing',
      className: 'solo',
      metadata: clothingMetadata,
    },
  ],
];
const size = 1024;
const idleAnimationName = 'idle.fbx';

//

const gltfLoader = makeGltfLoader();
const getMeshes = model => {
  const meshes = [];
  model.traverse(o => {
    if (o.isMesh) {
      meshes.push(o);
    }
  });
  return meshes;
};
const loadGltf = avatarUrl => {
  const p = makePromise();
  gltfLoader.load(avatarUrl, p.resolve, function onProgress(xhr) {
    // console.log('progress', xhr.loaded / xhr.total);
  }, p.reject);
  return p;
};
const _hueShiftCtx = (ctx, shift) => {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const {data} = imageData;
  for (let i = 0; i < data.length; i += 4) {
    localColor.setRGB(
      data[i + 0] / 255,
      data[i + 1] / 255 * 0.5,
      data[i + 2] / 255 * 0.5
    )
      .offsetHSL(shift, 0, 0);
    data[i + 0] = localColor.r * 255;
    data[i + 1] = localColor.g * 255;
    data[i + 2] = localColor.b * 255;
  }
  ctx.putImageData(imageData, 0, 0);
};
const selectAvatar = async (rng = Math.random) => {
  const avatarSpecIndex = Math.floor(rng() * avatarSpecs.length);
  const avatarSpec = avatarSpecs[avatarSpecIndex];
  const {
    base,
  } = avatarSpec;
  const categorySpecs = categorySpecsArray[avatarSpecIndex];

  const gltf = await loadGltf(base);
  const oldModel = gltf.scene;
  
  const model = new THREE.Scene();
  model.position.copy(gltf.scene.position);
  model.quaternion.copy(gltf.scene.quaternion);
  model.scale.copy(gltf.scene.scale);
  model.matrix.copy(gltf.scene.matrix);
  model.matrixWorld.copy(gltf.scene.matrixWorld);
  model.visible = gltf.scene.visible;
  while (oldModel.children.length > 0) {
    model.add(oldModel.children[0]);
  }
  model.updateMatrixWorld();
  gltf.scene = model;

  // recompile model
  const meshes = getMeshes(model);

  const categories = {};
  for (const mesh of meshes) {
    const {name} = mesh;
    const categoryIndex = categorySpecs.findIndex(categorySpec => {
      return categorySpec.regex.test(name);
    });
    if (categoryIndex !== -1) {
      const categorySpec = categorySpecs[categoryIndex];
      let entry = categories[categorySpec.name];
      if (!entry) {
        entry = {
          meshes: [],
        };
        categories[categorySpec.name] = entry;
      }
      entry.meshes.push(mesh);
    } else {
      console.warn('failed to match mesh to category', name);
      debugger;
    }
    mesh.visible = false;
  }

  // console.log('got categories', {
  //   meshes,
  //   categories,
  // });

  // sort by name
  for (const categoryName in categories) {
    categories[categoryName].meshes.sort((a, b) => a.name.localeCompare(b.name));
  }

  // select and show a random mesh from each category
  const categorySelections = {};
  const _selectFromCategory = (name) => {
    const category = categories[name];
    const mesh = category.meshes[Math.floor(rng() * category.meshes.length)];
    mesh.visible = true;
    categorySelections[name] = mesh;
  };
  for (const categorySpec of categorySpecs) {
    const {name, className} = categorySpec;
    // if (!['solo', 'clothing'].includes(className)) {
      _selectFromCategory(name);
    // }
  }
  /* let isSolo = (categories['solo'] ?
    (categories['solo'].meshes.length > 0)
  :
    false
  ) && (rng() < 0.5);
  if (isSolo) {
    for (const categorySpec of categorySpecs) {
      const {name, className} = categorySpec;
      if (className === 'solo') {
        _selectFromCategory(name);
      }
    }
  } else {
    for (const categorySpec of categorySpecs) {
      const {name, className} = categorySpec;
      if (className === 'clothing') {
        _selectFromCategory(name);
      }
    }
  } */

  const textures = [];
  const materialMeshes = [];
  const materials = [];
  const texturePaths = [];
  const seenTextures = new Set();
  model.traverse(o => {
    if (o.isMesh) {
      const {material} = o;
      for (const k in material) {
        const v = material[k];
        if (v?.isTexture) {
          textures.push(v);
          materialMeshes.push(o);
          materials.push(material);
          texturePaths.push([
            o,
            material,
            k,
            v,
          ]);
          seenTextures.add(v);
        }
      }
    }
  });

  // enable base meshes
  for (const mesh of categories.eye.meshes) {
    mesh.visible = true;
  }
  for (const mesh of categories.head.meshes) {
    mesh.visible = true;
  }
  for (const mesh of categories.body.meshes) {
    mesh.visible = true;
  }

  const _updateEye = async () => {
    for (let i = 0; i < categories.eye.meshes.length; i++) {
      const mesh = categories.eye.meshes[i];
      const eyeTexture = mesh.material.map;
      const {source} = eyeTexture;
      const imageBitmap = source.data;

      const {
        eye,
      } = avatarSpec;
      const eyeTextureUrl = eye[Math.floor(rng() * eye.length)];
      const img = await loadImage(eyeTextureUrl);

      const canvas2 = document.createElement('canvas');
      canvas2.width = imageBitmap.width;
      canvas2.height = imageBitmap.height;
      canvas2.classList.add(mesh.name + '-2');
      const ctx2 = canvas2.getContext('2d');
      ctx2.drawImage(img, 0, 0);
      canvas2.style.cssText = `\
        background: red;
        width: 512px;
        height: 512px;
      `;
      document.body.appendChild(canvas2);

      eyeTexture.image = canvas2;
      eyeTexture.needsUpdate = true;

      mesh.material.map = eyeTexture;
      mesh.material.needsUpdate = true;
    }
  };
  await _updateEye();

  const _updateHair = () => {
    const hairTextures = new Set();
    for (const mesh of categories.hair.meshes) {
      if (mesh.visible) {
        const {material} = mesh;
        const {map} = material;
        hairTextures.add(map);
      }
    }
    for (const hairTexture of hairTextures) {
      const canvas = document.createElement('canvas');
      canvas.width = hairTexture.image.width;
      canvas.height = hairTexture.image.height;
      canvas.classList.add('hair');
      const ctx = canvas.getContext('2d');
      ctx.drawImage(hairTexture.image, 0, 0);
      _hueShiftCtx(ctx, Math.random() * Math.PI * 2);
      canvas.style.cssText = `\
        background: red;
        width: 512px;
        height: 512px;
      `;
      document.body.appendChild(canvas);

      hairTexture.image = canvas;
      hairTexture.needsUpdate = true;
    }
  };
  _updateHair();

  const _updateSkin = async () => {
    // load images
    let faceCanvas;
    let bodyCanvas;
    {
      const {
        skin,
      } = avatarSpec;
      const [faceSpec, bodySpec] = skin;
      const faceOptions = faceSpec[1];
      const bodyOptions = bodySpec[1];

      const optionIndex = Math.floor(rng() * faceOptions.length);
      const faceOption = faceOptions[optionIndex];
      const bodyOption = bodyOptions[optionIndex];

      const [
        faceImage,
        bodyImage,
      ] = await Promise.all([
        loadImage(faceOption),
        loadImage(bodyOption),
      ]);

      faceCanvas = document.createElement('canvas');
      faceCanvas.width = faceImage.width;
      faceCanvas.height = faceImage.height;
      faceCanvas.classList.add('face');
      const faceCtx = faceCanvas.getContext('2d');
      faceCtx.drawImage(faceImage, 0, 0);
      faceCanvas.style.cssText = `\
        background: red;
        width: 512px;
        height: 512px;
      `;

      bodyCanvas = document.createElement('canvas');
      bodyCanvas.width = bodyImage.width;
      bodyCanvas.height = bodyImage.height;
      bodyCanvas.classList.add('body');
      const bodyCtx = bodyCanvas.getContext('2d');
      bodyCtx.drawImage(bodyImage, 0, 0);
      bodyCanvas.style.cssText = `\
        background: red;
        width: 512px;
        height: 512px;
      `;
    }

    // head
    const headTextures = new Set();
    const headMeshes = new Set();
    for (let i = 0; i < categories.head.meshes.length; i++) {
      const mesh = categories.head.meshes[i];
      if (mesh.visible) {
        const {material} = mesh;
        const {map} = material;
        headTextures.add(map);
        headMeshes.add(mesh);

        material.map.image = faceCanvas;
        material.map.needsUpdate = true;
      }
    }

    // body
    const bodyTextures = new Set();
    const bodyMeshes = new Set();
    for (const mesh of categories.body.meshes) {
      if (mesh.visible) {
        const {material} = mesh;
        const {map} = material;
        bodyTextures.add(map);
        bodyMeshes.add(mesh);

        material.map.image = bodyCanvas;
        material.map.needsUpdate = true;
      }
    }
  };
  await _updateSkin();

  const _updateClothing = async () => {
    const clothingTextures = new Set();
    const clothingMeshes = new Set();
    for (const mesh of categories.clothing.meshes) {
      if (mesh.visible) {
        const {material} = mesh;
        const {map} = material;
        clothingTextures.add(map);
        clothingMeshes.add(mesh);

        // const textureName = textureReverseMap.get(map.source.uuid);
        const textureSpec = gltf.parser.associations.get(map);
        const {textures} = textureSpec;
        const image = gltf.parser.json.images[textures];
        const {name} = image;

        const {
          clothing,
        } = avatarSpec;
        // XXX this needs to be extended to the full path in the spec
        // XXX replace the textures with an option from the new spec
        const clothingSpec = clothing[name];
        const clothingUrl = clothingSpec[Math.floor(rng() * clothingSpec.length)];

        const img = await loadImage(clothingUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.classList.add('clothing');
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.style.cssText = `\
          background: red;
          width: 512px;
          height: 512px;
        `;
        document.body.appendChild(canvas);

        map.image = canvas;
        map.needsUpdate = true;
      }
    }
    // console.log('got clothing meshes', Array.from(clothingMeshes));
  };
  await _updateClothing();

  return gltf;

  /* // sort meshes
  const categories = {};
  for (const mesh of meshes) {
    const {name} = mesh;
    const categoryIndex = categorySpecs.findIndex(categorySpec => {
      return categorySpec.regex.test(name);
    });
    if (categoryIndex !== -1) {
      const categorySpec = categorySpecs[categoryIndex];
      let entry = categories[categorySpec.name];
      if (!entry) {
        entry = {
          meshes: [],
        };
        categories[categorySpec.name] = entry;
      }
      mesh.className = 'avatar';
      mesh.metadata = categorySpec.metadata;
      entry.meshes.push(mesh);
    } else {
      console.warn('failed to match mesh to category', name);
      debugger;
    }
    mesh.visible = false;
  }
  // sort by name
  for (const categoryName in categories) {
    categories[categoryName].meshes.sort((a, b) => a.name.localeCompare(b.name));
  }

  // select and show a random mesh from each category
  const categorySelections = {};
  const _selectFromCategory = (name) => {
    const category = categories[name];
    const mesh = category.meshes[Math.floor(rng() * category.meshes.length)];
    mesh.visible = true;
    categorySelections[name] = mesh;
  };
  for (const categorySpec of categorySpecs) {
    const {name, className} = categorySpec;
    if (!['solo', 'clothing'].includes(className)) {
      _selectFromCategory(name);
    }
  }
  let isSolo = (categories['solo'] ?
    (categories['solo'].meshes.length > 0)
  :
    false
  ) && (rng() < 0.5);
  if (isSolo) {
    for (const categorySpec of categorySpecs) {
      const {name, className} = categorySpec;
      if (className === 'solo') {
        _selectFromCategory(name);
      }
    }
  } else {
    for (const categorySpec of categorySpecs) {
      const {name, className} = categorySpec;
      if (className === 'clothing') {
        _selectFromCategory(name);
      }
    }
  }

  // enable base meshes
  for (const mesh of categories.body.meshes) {
    mesh.visible = true;
  }
  for (const mesh of categories.head.meshes) {
    mesh.visible = true;
  }

  // remove invisible meshes
  for (const mesh of meshes) {
    if (!mesh.visible) {
      mesh.parent.remove(mesh);
    }
  }

  // return
  return gltf; */
};

//

/* const gltfExporter = makeGltfExporter();
const downloadGlb = async (gltf, name = 'avatar.vrm') => {
  // export glb
  const arrayBuffer = await new Promise((accept, reject) => {
    gltfExporter.parse(
      gltf.scene,
      function onCompleted(arrayBuffer) {
        accept(arrayBuffer);
      }, function onError(error) {
        reject(error);
      },
      {
        binary: true,
        onlyVisible: false,
        // forceIndices: true,
        // truncateDrawRange: false,
        includeCustomExtensions: true,
        vrm: true,
        gltfObject: gltf,
      },
    );
  });
  const avatarBlob = new Blob([
    arrayBuffer,
  ], {
    type: 'model/gltf-binary',
  });
  const url = URL.createObjectURL(avatarBlob);

  downloadFile(avatarBlob, name);
};
const generateAvatars = async () => {
  const numAvatarsPerIndex = 10;
  for (let i = 0; i < avatarUrls.length; i++) {
    for (let j = 0; j < numAvatarsPerIndex; j++) {
      const gltf = await selectAvatar();
      await downloadGlb(gltf, `avatar_${i}_${j}.vrm`);
    }
  }
};
globalThis.generateAvatars = generateAvatars; */

//

const fitCameraToBoundingBox = (() => {
  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  const localMatrix = new THREE.Matrix4();

  return (camera, box, fitOffset = 1) => {
      const size = box.getSize(localVector);
      const center = box.getCenter(localVector2)
        .add(new THREE.Vector3(0, size.y / 16, 0));

      const maxSize = Math.max(size.x, size.y) / 2;
      const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
      const fitWidthDistance = fitHeightDistance / camera.aspect;
      const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);
  
      const direction = center
        .clone()
        .sub(camera.position)
        .normalize();

      const directionScaled = direction.clone()
        .multiplyScalar(distance);
      camera.position.sub(directionScaled);
      // camera.position.sub(direction);
      camera.quaternion.setFromRotationMatrix(
        localMatrix.lookAt(new THREE.Vector3(), direction, new THREE.Vector3(0, 1, 0))
      );
      camera.updateMatrixWorld();
  };
})();
const _lookAt = (camera, boundingBox) => {
  boundingBox.getCenter(camera.position);
  const size = boundingBox.getSize(localVector);

  camera.position.set(0, size.y / 2, -1);

  fitCameraToBoundingBox(camera, boundingBox, 0.65);
};

//

class AvatarManager extends EventTarget {
  constructor(canvas) {
    super();

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.gltf = null;
    // this.gltf2 = null;

    this.loadPromise = (async () => {
      const {
        renderer,
        scene,
        camera,
        controls,
        gltf,
        // gltf2,
      } = await AvatarManager.makeContext(canvas);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.controls = controls;
      this.gltf = gltf;
      // this.gltf2 = gltf2;

      const avatarToolsMesh = new AvatarToolsMesh({
        avatarManager: this,
      });
      scene.add(avatarToolsMesh);
      this.avatarToolsMesh = avatarToolsMesh;
    })();

    this.lastTimestamp = performance.now();
  }
  static async makeContext(canvas) {
    const renderer = makeRenderer(canvas);

    const scene = new THREE.Scene();
    scene.autoUpdate = false;

    const camera = makeDefaultCamera();
    camera.position.set(0, 0.9, -2);
    camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    camera.updateMatrixWorld();

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(1, 2, 3);
    light.updateMatrixWorld();
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const controls = new OrbitControls(camera, canvas);
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.target.copy(camera.position);
    controls.target.z = 0;
    controls.update();
    
    const gltf = await selectAvatar(makeRng());      
    scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld();

    // const gltf2 = await selectAvatar(makeRng());
    
    return {
      renderer,
      scene,
      camera,
      controls,
      gltf,
      // gltf2,
    };
  }
  static async makeAvatar({
    gltf,
    // gltf2,
  }) {
    const avatarRenderer = new AvatarRenderer({
      gltf,
      // gltf2,
      quality: maxAvatarQuality,
    });
    await avatarRenderer.waitForLoad();
  
    const avatar = new Avatar(avatarRenderer, {
      fingers: true,
      hair: true,
      visemes: true,
      debug: false,
    });
    avatar.setTopEnabled(false);
    avatar.setHandEnabled(0, false);
    avatar.setHandEnabled(1, false);
    avatar.setBottomEnabled(false);
    avatar.inputs.hmd.position.y = avatar.height;
    // avatar.inputs.hmd.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    avatar.inputs.hmd.updateMatrixWorld();

    return avatar;
  }
  update() {
    const {
      renderer,
      scene,
      camera,
    } = this;

    const timestamp = performance.now();
    const timeDiff = timestamp - this.lastTimestamp;
    this.dispatchEvent(new MessageEvent('update', {
      data: {
        timestamp,
        timeDiff,
      },
    }));
    this.lastTimestamp = timestamp;

    this.avatarToolsMesh.update();
    
    renderer.render(scene, camera);
  }
  waitForLoad() {
    return this.loadPromise;
  }
  async createImage() {
    const {
      gltf,
    } = this;
    const width = 300;
    const height = 300;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.classList.add('avatarImageCanvas');

    const emotion = '';
    
    const img = await screenshotAvatarGltf({
      gltf,
      width,
      height,
      canvas,
      emotion,
    });
    return img;
  }
  async createIcons() {
    // XXX
  }
  async createVideo() {
    await Promise.all([
      Avatar.waitForLoad(),
      avatarsWasmManager.waitForLoad(),
    ]);

    const animations = Avatar.getAnimations();
    const idleAnimation = animations.find(a => a.name === idleAnimationName);
    const idleAnimationDuration = idleAnimation.duration;

    const width = 512;
    const height = 512;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const {
      renderer,
      scene,
      camera,
      controls,
      gltf,
      // gltf2,
    } = await AvatarManager.makeContext(canvas);

    const avatar = await AvatarManager.makeAvatar({
      gltf,
      // gltf2,
    });
    // avatar.inputs.hmd.position.y = 0;
    // avatar.inputs.hmd.updateMatrixWorld();

    scene.add(gltf.scene);

    avatar.update(0, 0); // compute the bounding box
    gltf.scene.updateMatrixWorld();
    const boundingBox = new THREE.Box3().setFromObject(gltf.scene);

    const writeCanvas = document.createElement('canvas');
    writeCanvas.width = width;
    writeCanvas.height = height;
    const writeCtx = writeCanvas.getContext('2d');

    const videoWriter = new WebMWriter({
      quality: 1,
      fileWriter: null,
      fd: null,
      frameDuration: null,
      frameRate: FPS,
    });

    const _pushFrame = () => {
      writeCtx.drawImage(renderer.domElement, 0, 0);
      videoWriter.addFrame(writeCanvas);
    };

    let now = 0;
    const timeDiff = 1000 / FPS;
    while (now < idleAnimationDuration * 1000) {
      avatar.update(now, timeDiff);

      _lookAt(camera, boundingBox);

      renderer.clear();
      renderer.render(scene, camera);

      _pushFrame();
      
      now += timeDiff;
    }

    const blob = await videoWriter.complete();

    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    await new Promise((accept, reject) => {
      video.oncanplaythrough = accept;
      video.onerror = reject;
      video.src = URL.createObjectURL(blob);
    });
    video.style.cssText = `\
      position: fixed;
      top: 0;
      left: 0;
      width: 512px;
      background: red;
    `;
    video.loop = true;
    document.body.appendChild(video);
  }
  async embody() {
    await Promise.all([
      Avatar.waitForLoad(),
      avatarsWasmManager.waitForLoad(),
    ]);

    const {
      gltf,
      // gltf2,
    } = this;
    const avatar = await AvatarManager.makeAvatar({
      gltf,
      // gltf2,
    });

    this.scene.add(gltf.scene);

    this.addEventListener('update', e => {
      const {timestamp, timeDiff} = e.data;
      avatar.update(timestamp, timeDiff);

      // gltf2.scene.updateMatrixWorld();
      // gltf.scene.updateMatrixWorld();
    });
  }
};

//

const retextureAvatar = async (canvas, prompt, negativePrompt) => {
  const renderer = makeRenderer(canvas);

  const scene = new THREE.Scene();
  scene.autoUpdate = false;

  const camera = makeDefaultCamera();
  camera.position.set(0, 0.9, -2);
  camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  camera.updateMatrixWorld();

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(1, 2, 3);
  light.updateMatrixWorld();
  scene.add(light);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 1;
  controls.maxDistance = 100;
  controls.target.copy(camera.position);
  controls.target.z = 0;
  controls.update();

  const avatars = new THREE.Object3D();

  (async () => {
    const gltf = await selectAvatar();
    let model = gltf.scene;

    // optimize the resulting model
    model = await optimizeAvatarModel(model);

    // // add the model to the scene
    avatars.add(model);
    model.updateMatrixWorld();

    const meshes = getMeshes(model);
    {
      const mesh = meshes[0];
      const {material} = mesh;

      const canvas = document.createElement('canvas');
      canvas.classList.add('frontCanvas');
      canvas.width = size;
      canvas.height = size;
      canvas.style.cssText = `\
        background: red;
      `;
      document.body.appendChild(canvas);

      const renderer2 = makeRenderer(canvas);
      renderer2.autoClear = false;

      // const candidateColors = colors.slice();

      const backgroundColor = 0xFFFFFF;
      const bgColor = new THREE.Color(backgroundColor);

      const backgroundColor2 = 0xFFFFFF;
      const bgColor2 = new THREE.Color(backgroundColor2);

      // background scene
      const backgroundScene = new THREE.Scene();
      backgroundScene.autoUpdate = false;

      // background mesh
      // fullscreen geometry
      const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
      const backgroundMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uAlpha: {
            value: 1,
            needsUpdate: true,
          },
          uColor: {
            value: bgColor,
            needsUpdate: true,
          },
          uColor2: {
            value: bgColor2,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0., 1.0);
          }
        `,
        fragmentShader: `\
          uniform vec3 uColor;
          uniform vec3 uColor2;
          uniform float uAlpha;
          varying vec2 vUv;

          void main() {
            gl_FragColor = vec4(mix(uColor, uColor2, vUv.y), uAlpha);
          }
        `,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NoBlending,
        // transparent: true,
      });
      const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
      backgroundMesh.frustumCulled = false;
      backgroundScene.add(backgroundMesh);

      // foreground scene
      const scene2 = new THREE.Scene();
      scene2.autoUpdate = false;
      
      const overrideMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uAlpha: {
            value: -1,
            needsUpdate: true,
          },
          uMap: {
            value: material.map,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          attribute vec4 metadata;
          varying vec2 vUv;
          varying vec2 vUv2;
          flat varying vec4 vMetadata;
  
          void main() {
            vUv = uv;
            vMetadata = metadata;
            
            // gl_Position = vec4(position, 1.0);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            
            vec3 p = gl_Position.xyz / gl_Position.w;
            vUv2 = p.xy * 0.5 + 0.5;

            // vec2 duv = (uv - 0.5) * 2.;
            // gl_Position = vec4(duv.x, duv.y, 0., 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D uMap;
          uniform float uAlpha;
          varying vec2 vUv;
          varying vec2 vUv2;
          flat varying vec4 vMetadata;
  
          // convert rgb to hsv in glsl
          vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0., -1./3., 2./3., -1.);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
          }
  
          // convert hsv to rgb in glsl
          vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1., 2./3., 1./3., 3.);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
          }
  
          void main() {
            float alpha = vMetadata.x;
            float hueShift = vMetadata.y;
            float saturationShift = vMetadata.z;
            float valueShift = vMetadata.w;

            vec4 color = texture2D(uMap, vUv);
  
            vec3 hsv = rgb2hsv(color.rgb);
            hsv.x += hueShift;
            hsv.y += saturationShift;
            hsv.z += valueShift;
            color.rgb = hsv2rgb(hsv);
  
            bool realAlpha = uAlpha < 0.;
            float a = realAlpha ? alpha : uAlpha;
            gl_FragColor = vec4(color.rgb, a);
          }
        `,
        blending: THREE.NoBlending,
      });
      scene2.overrideMaterial = overrideMaterial;

      const camera2 = new THREE.OrthographicCamera(
        -1, // left
        1, // right
        1, // top
        -1, // bottom
        0, // near
        1000 // far
      );
      camera2.position.copy(camera.position);
      camera2.quaternion.copy(camera.quaternion);
      camera2.updateMatrixWorld();

      // prepare latch canvases
      const processingCanvas = document.createElement('canvas');
      processingCanvas.width = size;
      processingCanvas.height = size;
      const processingContext = processingCanvas.getContext('2d');
      processingContext.drawImage(renderer2.domElement, 0, 0);

      const popMeshes = pushMeshes(scene2, [
        model,
      ]);

      // render mask
      backgroundMaterial.uniforms.uAlpha.value = 0.1;
      backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
      overrideMaterial.uniforms.uAlpha.value = -1;
      overrideMaterial.uniforms.uAlpha.needsUpdate = true;
      renderer2.clear();
      renderer2.render(backgroundScene, camera2);
      renderer2.render(scene2, camera2);
      processingContext.drawImage(renderer2.domElement, 0, 0);
      const maskImageData = processingContext.getImageData(0, 0, size, size);

      // render opaque
      backgroundMaterial.uniforms.uAlpha.value = 1;
      backgroundMaterial.uniforms.uAlpha.needsUpdate = true;
      overrideMaterial.uniforms.uAlpha.value = 1;
      overrideMaterial.uniforms.uAlpha.needsUpdate = true;
      renderer2.clear();
      renderer2.render(backgroundScene, camera2);
      renderer2.render(scene2, camera2);
      processingContext.drawImage(renderer2.domElement, 0, 0);
      const opaqueImageData = processingContext.getImageData(0, 0, size, size);

      popMeshes();

      // draw the canvases for debugging
      const opaqueCanvas = document.createElement('canvas');
      opaqueCanvas.width = size;
      opaqueCanvas.height = size;
      opaqueCanvas.classList.add('opaqueCanvas');
      opaqueCanvas.style.cssText = `\
        background: red;
      `;
      document.body.appendChild(opaqueCanvas);
      const opaqueContext = opaqueCanvas.getContext('2d');
      opaqueContext.putImageData(opaqueImageData, 0, 0);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = size;
      maskCanvas.height = size;
      maskCanvas.classList.add('maskCanvas');
      maskCanvas.style.cssText = `\
        background: red;
      `;
      document.body.appendChild(maskCanvas);
      const maskContext = maskCanvas.getContext('2d');
      maskContext.putImageData(maskImageData, 0, 0);

      const blob = await canvas2blob(opaqueCanvas);
      const maskBlob = await canvas2blob(maskCanvas);

      const editImg = await img2img({
        prompt,
        blob,
        maskBlob,
      });
      console.log('edit image', editImg);
      document.body.appendChild(editImg);
    }
  })();
  scene.add(avatars);

  // start render loop
  const _render = () => {
    requestAnimationFrame(_render);
    renderer.render(scene, camera);
  };
  _render();
};

//

const cancelEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};

//

class FloorMesh extends THREE.Mesh {
  constructor() {
    const geometry = new THREE.PlaneBufferGeometry(30, 30)
      .rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      // color: 0xEEEEEE,
      color: 0x000000,
      // opacity: 0.5,
      // transparent: true,
    });
    super(geometry, material);
  }
}

//

class AvatarToolsMesh extends THREE.Object3D {
  static tools = [
    'camera',
    'move',
  ];
  
  constructor({
    avatarManager,
  }) {
    super();

    // args
    this.avatarManager = avatarManager;
    
    const {
      camera,
      controls,
    } = avatarManager;
    const canvas = avatarManager.renderer.domElement;
    // if (!camera || !controls || !canvas) {
    //   console.log('got', {camera, controls});
    //   debugger;
    // }
    this.camera = camera;
    this.controls = controls;
    this.canvas = canvas;

    // scene
    // const scene = new THREE.Scene();
    // scene.autoUpdate = true;
    // this.scene = scene;

    // floor mesh
    const floorMesh = new FloorMesh();
    floorMesh.frustumCulled = false;
    this.add(floorMesh);
    floorMesh.updateMatrixWorld();
    this.floorMesh = floorMesh;
    // globalThis.floorMesh = floorMesh;

    // arrow mesh
    const arrowMesh = new ArrowMesh();
    arrowMesh.geometry = arrowMesh.geometry.clone()
      .rotateX(Math.PI)
      .scale(0.1, 0.1, 0.1)
      .translate(0, 0.2, 0)
    arrowMesh.frustumCulled = false;
    arrowMesh.visible = false;
    this.add(arrowMesh);
    arrowMesh.updateMatrixWorld();
    this.arrowMesh = arrowMesh;

    // state
    this.toolIndex = 0;
    this.mouse = new THREE.Vector2();
    this.cleanup = null;
    
    // intitialize
    this.#listen();
  }
  get tool() {
    return AvatarToolsMesh.tools[this.toolIndex];
  }
  set tool(tool) {
    throw new Error('not implemented');
    /* const toolIndex = AvatarToolsMesh.tools.indexOf(tool);
    if (toolIndex !== -1) {
      this.setToolIndex(toolIndex);
    } */
  }
  setToolIndex(toolIndex) {
    this.toolIndex = toolIndex;
    this.dispatchEvent({
      type: 'toolchange',
      tool: this.tool,
    });
  }
  update() {
    this.arrowMesh.visible = false;
    
    if (this.tool === 'move') {
      // console.log('update move');
  
      const intersectFloor = (mouse, camera, vectorTarget) => {
        const floorPlane = localPlane.setFromNormalAndCoplanarPoint(
          upVector,
          zeroVector
        );
        localRaycaster.setFromCamera(mouse, camera);
        return localRaycaster.ray.intersectPlane(floorPlane, vectorTarget);
      };
      const intersection = intersectFloor(this.mouse, this.camera, localVector);

      // console.log('intersect', this.mouse.toArray(), this.camera.position.toArray(), intersection && intersection.toArray());
      if (intersection) {
        this.arrowMesh.position.copy(intersection);
        this.arrowMesh.updateMatrixWorld();
        this.arrowMesh.visible = true;
       }
    }
  }
  #listen() {
    const keydown = e => {
      switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
        {
          cancelEvent(e);

          const keyIndex = parseInt(e.key, 10) - 1;
          this.setToolIndex(keyIndex);
          break;
        }
        case 't': {
          cancelEvent(e);
          // XXX enable talk
          break;
        }
      }
    };
    document.addEventListener('keydown', keydown);

    const mousemove = e => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.mouse.set(
        (x / rect.width) * 2 - 1,
        -(y / rect.height) * 2 + 1
      );
    };
    this.canvas.addEventListener('mousemove', mousemove);

    const toolchange = e => {
      console.log('update', e.tool);
      this.controls.enabled = e.tool === 'camera';
    };
    this.addEventListener('toolchange', toolchange);

    this.cleanup = () => {
      document.removeEventListener('keydown', keydown);
      this.canvas.removeEventListener('mousemove', mousemove);
      this.removeEventListener('toolchange', toolchange);
    };
  }
  destroy() {
    this.cleanup();
  }
}

//

const Conversation = ({
  conversation,
}) => {
  const {
    characters,
    setting,
  } = conversation;

  const [messages, setMessages] = useState(conversation.messages);
  const [message, setMessage] = useState('');

  return (<div className={styles.conversation}>
    <div className={styles.characters}>{characters.map(character => {
      return (
        <div className={classnames(
          styles.character,
          styles.row,
        )} key={character.name}>
          <div className={styles.name}>{character.name}</div>
          <div className={styles.description}>{character.description}</div>
          <div className={styles.image}>{character.image}</div>
        </div>
      );
    })}</div>
    <div className={styles.setting}>
      <div className={styles.name}>{setting.name}</div>
      <div className={styles.description}>{setting.description}</div>
      <div className={styles.image}>{setting.image}</div>
    </div>
    <div className={classnames(
      styles.messages,
      styles.row,
    )}>{messages.map((m, index) => {
      return (
        <div className={styles.message} key={index}>
          <div className={styles.name}>{m.name}</div>
          <div className={styles.text}>{m.text}</div>
        </div>
      );
    })}</div>
    <input type='text' className={styles.input} value={message} onChange={e => {
      setMessage(e.target.value);
    }} onKeyDown={e => {
      if (e.key === 'Enter') {
        const text = e.target.value;
        if (text) {
          const message = {
            name: 'you',
            text,
          };
          const newMessages = messages.concat([message]);
          setMessages(newMessages);
          setMessage('');

          console.log('handle new message', message);

          // XXX handle the message here
        }
      }
    }} placeholder='press enter to chat' />
  </div>);
};

//

class NLPConversation {
  constructor({
    name = `conversation_${makeId(8)}`,
    characters = [],
    setting = '',
    messages = [],
  }) {
    this.name = name;
    this.characters = characters;
    this.setting = setting;
    this.messages = messages;
  }
}

//

const ConversationSelect = ({
  conversations,
  onSelect,
}) => {
  const [conversation, setConversation] = useState('new');
  const [loading, setLoading] = useState(false);

  return (
    <div className={styles.conversationSelect}>
      {!loading ? <>
        <select value={conversation} onChange={e => {
          setConversation(e.target.value);
        }}>
          {conversations.map((conversation, index) => {
            return (
              <option key={index}>{conversation.name}</option>
            );
          })}
          <option value='new'>New conversation</option>
        </select>
        <div className={styles.button} onClick={async e => {
          try {
            setLoading(true);

            let newConversation;
            if (conversation === 'new') {
              const datasetSpecs = await getDatasetSpecs();
              const datasetGenerator = new DatasetGenerator({
                datasetSpecs,
                aiClient,
                // fillRatio: 0.5,
              });
              let [
                character1,
                // character2,
                setting,
              ] = await Promise.all([
                datasetGenerator.generateItem('character', {
                  // Name: 'Death Mountain',
                  // Description: panelSpec.description,
                }, {
                  keys: ['Name', 'Description', 'Image'],
                }),
                // datasetGenerator.generateItem('character', {
                //   // Name: 'Death Mountain',
                //   // Description: panelSpec.description,
                // }, {
                //   // keys: ['Name', 'Description', 'Image'],
                // }),
                datasetGenerator.generateItem('setting', {
                  // Name: 'Death Mountain',
                  // Description: panelSpec.description,
                }, {
                  keys: ['Name', 'Description', 'Image'],
                }),
              ]);
              const formatObject = c => {
                const result = {};
                for (const key in c) {
                  result[key.toLowerCase()] = c[key];
                }
                return result;
              };
              const characters = [
                character1,
                // character2,
              ].map(c =>  formatObject(c));
              setting = formatObject(setting);
              console.log('got character spec', {characters, setting});

              newConversation = new NLPConversation({
                characters,
                setting,
              });
            } else {
              newConversation = conversations.find(c => c.name === conversation);
            }
            onSelect(newConversation);
          } finally {
            setLoading(false);
          }
        }}>Open convo</div>
      </>
      :
      <div className={styles.row}>
        Loading...
      </div>}
    </div>
  );
};

const defaultPrompt = 'anime style, girl character, 3d model vrchat avatar orthographic front view, dress';
const negativePrompt = '';
const AvatarGeneratorComponent = () => {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [avatarManager, setAvatarManager] = useState(null);
  
  const [retextured, setRetextured] = useState(false);
  const [imageAiModel, setImageAiModel] = useState('sd');
  
  const [emotion, setEmotion] = useState('none');
  const [emotions, setEmotions] = useState([]);
  const [animation, setAnimation] = useState('none');
  const [animations, setAnimations] = useState([]);
  
  const [embodied, setEmbodied] = useState(false);
  
  // const [characters, setCharacters] = useState([]);
  // const [setting, setSetting] = useState('');
  // const [messages, setMessages] = useState([]);
  const [interrogating, setInterrogating] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  
  const canvasRef = useRef();
  
  const generateClick = async () => {
    const canvas = canvasRef.current;
    if (canvas && !avatarManager) {
      try {
        setLoading(true);

        await Promise.all([
          Avatar.waitForLoad(),
          avatarsWasmManager.waitForLoad(),
        ]);

        // avatar manager
        const avatarManager = new AvatarManager(canvas);
        await avatarManager.waitForLoad();
        setAvatarManager(avatarManager);

        // emotions
        const emotions = [
          'none',
        ].concat(avatarEmotions);
        console.log('got emotions', emotions);
        setEmotions(emotions);

        // animations
        const animations = Avatar.getAnimations();
        setAnimations(animations);
        setAnimation(idleAnimationName);

        // animate
        const _render = () => {
          requestAnimationFrame(_render);
          avatarManager.update();
        };
        requestAnimationFrame(_render);
      } finally {
        setLoading(false);
      }
    }
  };
  const retextureClick = async () => {
    const canvas = canvasRef.current;
    if (canvas && !retextured) {
      try {
        setLoading(true);

        await retextureAvatar(canvas, prompt, negativePrompt);
        setRetextured(true);
      } finally {
        setLoading(false);
      }
    }
  };
  const imageClick = async () => {
    const image = await avatarManager.createImage();
    image.style.cssText = `\
      position: fixed;
      top: 0 ;
      left: 0;
      width: 128px;
      height: 128px;
      background: red;
    `;
    document.body.appendChild(image);
  };
  const iconsClick = async () => {
    const icons = await avatarManager.createIcons();
  };
  const videoClick = async () => {
    const video = await avatarManager.createVideo();
  };
  const embodyClick = async () => {
    await avatarManager.embody();
    setEmbodied(true);
  };
  const interrogateClick = async () => {
    setInterrogating(true);
  };

  return (
    <div className={styles.avatarGenerator}>
      {loading ?
        <div className={styles.header}>
          compiling...
        </div>
      :
        <>
          <div className={styles.header}>
            {!avatarManager ?
              <div className={styles.button} onClick={async () => {
                await generateClick();
              }}>Generate</div>
            : null}
            {(avatarManager && !retextured) ?
              <>
                <input type="text" className={styles.input} value={prompt} onChange={e => {
                  setPrompt(e.target.value);
                }} placeholder={prompt} />
                <select className={styles.select} value={imageAiModel} onChange={e => {
                  setImageAiModel(e.target.value);
                }}>
                  <option value="sd">SD</option>
                  <option value="openai">OpenAI</option>
                </select>
                <div className={styles.button} onClick={async () => {
                  await retextureClick();
                }}>Retexture</div>
              </>
            : null}
          </div>
          {(avatarManager) ? <div className={styles.header}>
            <label>
              Emote:
              <select className={styles.select} value={emotion} onChange={e => {
                setEmotion(e.target.value);
              }}>
                {emotions.map(emotion => {
                  return (
                    <option key={emotion} value={emotion}>{emotion}</option>
                  );
                })}
              </select>
            </label>
            <label>
              Anim:
              <select className={styles.select} value={animation} onChange={e => {
                setAnimation(e.target.value);
              }}>
                {animations.map(animation => {
                  return (
                    <option key={animation.name} value={animation.name}>{animation.name}</option>
                  );
                })}
              </select>
            </label>
            <div className={styles.button} onClick={async () => {
              await imageClick();
            }}>Image</div>
            <div className={styles.button} onClick={async () => {
              await iconsClick();
            }}>Icons</div>
            <div className={styles.button} onClick={async () => {
              await videoClick();
            }}>Video</div>
            {!embodied ? <div className={styles.button} onClick={async () => {
              embodyClick();
            }}>Embody</div> : null}
            {embodied && !interrogating ? <div className={styles.button} onClick={async () => {
              interrogateClick();
            }}>Interrogate</div> : null}
          </div> : null}
        </>
      }
      {interrogating ? <div className={styles.interrogation}>
        {conversation ?
          <Conversation
            conversation={conversation}
          />
        :
          <ConversationSelect
            conversations={conversations}
            onSelect={conversation => {
              setConversation(conversation);
            }}
          />
        }
      </div> : null}
      <canvas className={classnames(
        styles.canvas,
        avatarManager ? null : styles.hidden,
      )} width={size} height={size} ref={canvasRef} />
    </div>
  );
};
export default AvatarGeneratorComponent;