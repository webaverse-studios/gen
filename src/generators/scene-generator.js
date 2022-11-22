import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
// import alea from '../utils/alea.js';
import {Text} from 'troika-three-text';
import {JFAOutline, renderDepthReconstruction} from '../utils/jfaOutline.js';

import {ImageAiClient} from '../clients/image-client.js';
// import {getLabel} from '../clients/perception-client.js';
import {
  pointcloudStride,
  getPointCloud,
  drawPointCloudCanvas,
  pointCloudArrayBufferToPositionAttributeArray,
  applySkybox,
  pointCloudArrayBufferToColorAttributeArray,
  skyboxDistance,
} from '../clients/reconstruction-client.js';

import {blob2img, img2ImageData} from '../utils/convert-utils.js';
import {makeId} from '../utils/id-utils.js';
// import {labelClasses} from '../constants/prompts.js';
// import {downloadFile} from '../utils/http-utils.js';

//

const imageAiClient = new ImageAiClient();
const abortError = new Error();
abortError.isAbortError = true;

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localMatrix = new THREE.Matrix4();
const localBox = new THREE.Box3();
const localColor = new THREE.Color();

//

export const panelSize = 1024;
export const mainImageKey = 'layer0/image';
export const promptKey = 'layer0/prompt';
export const layer1Specs = [
  {
    name: 'segmentMask',
    type: 'arrayBuffer',
  },
  // {
  //   name: 'labelImageData',
  //   type: 'arrayBuffer',
  // },
  {
    name: 'pointCloudHeaders',
    type: 'json',
  },
  {
    name: 'pointCloud',
    type: 'arrayBuffer',
  },
  // {
  //   name: 'boundingBoxLayers',
  //   type: 'json',
  // },
  // {
  //   name: 'planeMatrices',
  //   type: 'json',
  // },
  {
    name: 'planesJson',
    type: 'json',
  },
  {
    name: 'planesMask',
    type: 'arrayBuffer',
  },
  {
    name: 'predictedHeight',
    type: 'json',
  },
];
export const layer2Specs = [
  {
    name: 'maskImg',
    type: 'imageFile',
  },
  {
    name: 'editedImg',
    type: 'imageFile',
  },
  {
    name: 'pointCloudHeaders',
    type: 'json',
  },
  {
    name: 'pointCloud',
    type: 'arrayBuffer',
  },
  {
    name: 'depthFloatImageData',
    type: 'arrayBuffer',
  },
  // {
  //   name: 'indexColorsAlphasArray',
  //   type: 'json',
  // },
  {
    name: 'oldDepthFloatImageData',
    type: 'arrayBuffer',
  },
  {
    name: 'newDepthFloatImageData',
    type: 'arrayBuffer',
  },
  {
    name: 'reconstructedDepthFloats',
    type: 'arrayBuffer',
  },
  {
    name: 'planesJson',
    type: 'json',
  },
  {
    name: 'planesMask',
    type: 'arrayBuffer',
  },
  {
    name: 'segmentMask',
    type: 'arrayBuffer',
  },
];
export const tools = [
  'camera',
  'eraser',
  'segment',
  'plane',
];
const classes = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
  "traffic light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
  "banner",
  "blanket",
  "bridge",
  "cardboard",
  "counter",
  "curtain",
  "door-stuff",
  "floor-wood",
  "flower",
  "fruit",
  "gravel",
  "house",
  "light",
  "mirror-stuff",
  "net",
  "pillow",
  "platform",
  "playingfield",
  "railroad",
  "river",
  "road",
  "roof",
  "sand",
  "sea",
  "shelf",
  "snow",
  "stairs",
  "tent",
  "towel",
  "wall-brick",
  "wall-stone",
  "wall-tile",
  "wall-wood",
  "water-other",
  "window-blind",
  "window-other",
  "tree-merged",
  "fence-merged",
  "ceiling-merged",
  "sky-other-merged",
  "cabinet-merged",
  "table-merged",
  "floor-other-merged",
  "pavement-merged",
  "mountain-merged",
  "grass-merged",
  "dirt-merged",
  "paper-merged",
  "food-other-merged",
  "building-other-merged",
  "rock-merged",
  "wall-other-merged",
  "rug-merged"
];
const rainbowColors = [
  0x881177,
  0xaa3355,
  0xcc6666,
  0xee9944,
  0xeedd00,
  0x99dd55,
  0x44dd88,
  0x22ccbb,
  0x00bbcc,
  0x0099cc,
  0x3366bb,
  0x663399,
];
const detectronColors = [
  {"color": [120, 120, 120], "id": 0, "isthing": 0, "name": "wall"},
  {"color": [180, 120, 120], "id": 1, "isthing": 0, "name": "building"},
  {"color": [6, 230, 230], "id": 2, "isthing": 0, "name": "sky"},
  {"color": [80, 50, 50], "id": 3, "isthing": 0, "name": "floor"},
  {"color": [4, 200, 3], "id": 4, "isthing": 0, "name": "tree"},
  {"color": [120, 120, 80], "id": 5, "isthing": 0, "name": "ceiling"},
  {"color": [140, 140, 140], "id": 6, "isthing": 0, "name": "road, route"},
  {"color": [204, 5, 255], "id": 7, "isthing": 1, "name": "bed"},
  {"color": [230, 230, 230], "id": 8, "isthing": 1, "name": "window "},
  {"color": [4, 250, 7], "id": 9, "isthing": 0, "name": "grass"},
  {"color": [224, 5, 255], "id": 10, "isthing": 1, "name": "cabinet"},
  {"color": [235, 255, 7], "id": 11, "isthing": 0, "name": "sidewalk, pavement"},
  {"color": [150, 5, 61], "id": 12, "isthing": 1, "name": "person"},
  {"color": [120, 120, 70], "id": 13, "isthing": 0, "name": "earth, ground"},
  {"color": [8, 255, 51], "id": 14, "isthing": 1, "name": "door"},
  {"color": [255, 6, 82], "id": 15, "isthing": 1, "name": "table"},
  {"color": [143, 255, 140], "id": 16, "isthing": 0, "name": "mountain, mount"},
  {"color": [204, 255, 4], "id": 17, "isthing": 0, "name": "plant"},
  {"color": [255, 51, 7], "id": 18, "isthing": 1, "name": "curtain"},
  {"color": [204, 70, 3], "id": 19, "isthing": 1, "name": "chair"},
  {"color": [0, 102, 200], "id": 20, "isthing": 1, "name": "car"},
  {"color": [61, 230, 250], "id": 21, "isthing": 0, "name": "water"},
  {"color": [255, 6, 51], "id": 22, "isthing": 1, "name": "painting, picture"},
  {"color": [11, 102, 255], "id": 23, "isthing": 1, "name": "sofa"},
  {"color": [255, 7, 71], "id": 24, "isthing": 1, "name": "shelf"},
  {"color": [255, 9, 224], "id": 25, "isthing": 0, "name": "house"},
  {"color": [9, 7, 230], "id": 26, "isthing": 0, "name": "sea"},
  {"color": [220, 220, 220], "id": 27, "isthing": 1, "name": "mirror"},
  {"color": [255, 9, 92], "id": 28, "isthing": 0, "name": "rug"},
  {"color": [112, 9, 255], "id": 29, "isthing": 0, "name": "field"},
  {"color": [8, 255, 214], "id": 30, "isthing": 1, "name": "armchair"},
  {"color": [7, 255, 224], "id": 31, "isthing": 1, "name": "seat"},
  {"color": [255, 184, 6], "id": 32, "isthing": 1, "name": "fence"},
  {"color": [10, 255, 71], "id": 33, "isthing": 1, "name": "desk"},
  {"color": [255, 41, 10], "id": 34, "isthing": 0, "name": "rock, stone"},
  {"color": [7, 255, 255], "id": 35, "isthing": 1, "name": "wardrobe, closet, press"},
  {"color": [224, 255, 8], "id": 36, "isthing": 1, "name": "lamp"},
  {"color": [102, 8, 255], "id": 37, "isthing": 1, "name": "tub"},
  {"color": [255, 61, 6], "id": 38, "isthing": 1, "name": "rail"},
  {"color": [255, 194, 7], "id": 39, "isthing": 1, "name": "cushion"},
  {"color": [255, 122, 8], "id": 40, "isthing": 0, "name": "base, pedestal, stand"},
  {"color": [0, 255, 20], "id": 41, "isthing": 1, "name": "box"},
  {"color": [255, 8, 41], "id": 42, "isthing": 1, "name": "column, pillar"},
  {"color": [255, 5, 153], "id": 43, "isthing": 1, "name": "signboard, sign"},
  {
      "color": [6, 51, 255],
      "id": 44,
      "isthing": 1,
      "name": "chest of drawers, chest, bureau, dresser",
  },
  {"color": [235, 12, 255], "id": 45, "isthing": 1, "name": "counter"},
  {"color": [160, 150, 20], "id": 46, "isthing": 0, "name": "sand"},
  {"color": [0, 163, 255], "id": 47, "isthing": 1, "name": "sink"},
  {"color": [140, 140, 140], "id": 48, "isthing": 0, "name": "skyscraper"},
  {"color": [250, 10, 15], "id": 49, "isthing": 1, "name": "fireplace"},
  {"color": [20, 255, 0], "id": 50, "isthing": 1, "name": "refrigerator, icebox"},
  {"color": [31, 255, 0], "id": 51, "isthing": 0, "name": "grandstand, covered stand"},
  {"color": [255, 31, 0], "id": 52, "isthing": 0, "name": "path"},
  {"color": [255, 224, 0], "id": 53, "isthing": 1, "name": "stairs"},
  {"color": [153, 255, 0], "id": 54, "isthing": 0, "name": "runway"},
  {"color": [0, 0, 255], "id": 55, "isthing": 1, "name": "case, display case, showcase, vitrine"},
  {
      "color": [255, 71, 0],
      "id": 56,
      "isthing": 1,
      "name": "pool table, billiard table, snooker table",
  },
  {"color": [0, 235, 255], "id": 57, "isthing": 1, "name": "pillow"},
  {"color": [0, 173, 255], "id": 58, "isthing": 1, "name": "screen door, screen"},
  {"color": [31, 0, 255], "id": 59, "isthing": 0, "name": "stairway, staircase"},
  {"color": [11, 200, 200], "id": 60, "isthing": 0, "name": "river"},
  {"color": [255, 82, 0], "id": 61, "isthing": 0, "name": "bridge, span"},
  {"color": [0, 255, 245], "id": 62, "isthing": 1, "name": "bookcase"},
  {"color": [0, 61, 255], "id": 63, "isthing": 0, "name": "blind, screen"},
  {"color": [0, 255, 112], "id": 64, "isthing": 1, "name": "coffee table"},
  {
      "color": [0, 255, 133],
      "id": 65,
      "isthing": 1,
      "name": "toilet, can, commode, crapper, pot, potty, stool, throne",
  },
  {"color": [255, 0, 0], "id": 66, "isthing": 1, "name": "flower"},
  {"color": [255, 163, 0], "id": 67, "isthing": 1, "name": "book"},
  {"color": [255, 102, 0], "id": 68, "isthing": 0, "name": "hill"},
  {"color": [194, 255, 0], "id": 69, "isthing": 1, "name": "bench"},
  {"color": [0, 143, 255], "id": 70, "isthing": 1, "name": "countertop"},
  {"color": [51, 255, 0], "id": 71, "isthing": 1, "name": "stove"},
  {"color": [0, 82, 255], "id": 72, "isthing": 1, "name": "palm, palm tree"},
  {"color": [0, 255, 41], "id": 73, "isthing": 1, "name": "kitchen island"},
  {"color": [0, 255, 173], "id": 74, "isthing": 1, "name": "computer"},
  {"color": [10, 0, 255], "id": 75, "isthing": 1, "name": "swivel chair"},
  {"color": [173, 255, 0], "id": 76, "isthing": 1, "name": "boat"},
  {"color": [0, 255, 153], "id": 77, "isthing": 0, "name": "bar"},
  {"color": [255, 92, 0], "id": 78, "isthing": 1, "name": "arcade machine"},
  {"color": [255, 0, 255], "id": 79, "isthing": 0, "name": "hovel, hut, hutch, shack, shanty"},
  {"color": [255, 0, 245], "id": 80, "isthing": 1, "name": "bus"},
  {"color": [255, 0, 102], "id": 81, "isthing": 1, "name": "towel"},
  {"color": [255, 173, 0], "id": 82, "isthing": 1, "name": "light"},
  {"color": [255, 0, 20], "id": 83, "isthing": 1, "name": "truck"},
  {"color": [255, 184, 184], "id": 84, "isthing": 0, "name": "tower"},
  {"color": [0, 31, 255], "id": 85, "isthing": 1, "name": "chandelier"},
  {"color": [0, 255, 61], "id": 86, "isthing": 1, "name": "awning, sunshade, sunblind"},
  {"color": [0, 71, 255], "id": 87, "isthing": 1, "name": "street lamp"},
  {"color": [255, 0, 204], "id": 88, "isthing": 1, "name": "booth"},
  {"color": [0, 255, 194], "id": 89, "isthing": 1, "name": "tv"},
  {"color": [0, 255, 82], "id": 90, "isthing": 1, "name": "plane"},
  {"color": [0, 10, 255], "id": 91, "isthing": 0, "name": "dirt track"},
  {"color": [0, 112, 255], "id": 92, "isthing": 1, "name": "clothes"},
  {"color": [51, 0, 255], "id": 93, "isthing": 1, "name": "pole"},
  {"color": [0, 194, 255], "id": 94, "isthing": 0, "name": "land, ground, soil"},
  {
      "color": [0, 122, 255],
      "id": 95,
      "isthing": 1,
      "name": "bannister, banister, balustrade, balusters, handrail",
  },
  {
      "color": [0, 255, 163],
      "id": 96,
      "isthing": 0,
      "name": "escalator, moving staircase, moving stairway",
  },
  {
      "color": [255, 153, 0],
      "id": 97,
      "isthing": 1,
      "name": "ottoman, pouf, pouffe, puff, hassock",
  },
  {"color": [0, 255, 10], "id": 98, "isthing": 1, "name": "bottle"},
  {"color": [255, 112, 0], "id": 99, "isthing": 0, "name": "buffet, counter, sideboard"},
  {
      "color": [143, 255, 0],
      "id": 100,
      "isthing": 0,
      "name": "poster, posting, placard, notice, bill, card",
  },
  {"color": [82, 0, 255], "id": 101, "isthing": 0, "name": "stage"},
  {"color": [163, 255, 0], "id": 102, "isthing": 1, "name": "van"},
  {"color": [255, 235, 0], "id": 103, "isthing": 1, "name": "ship"},
  {"color": [8, 184, 170], "id": 104, "isthing": 1, "name": "fountain"},
  {
      "color": [133, 0, 255],
      "id": 105,
      "isthing": 0,
      "name": "conveyer belt, conveyor belt, conveyer, conveyor, transporter",
  },
  {"color": [0, 255, 92], "id": 106, "isthing": 0, "name": "canopy"},
  {
      "color": [184, 0, 255],
      "id": 107,
      "isthing": 1,
      "name": "washer, automatic washer, washing machine",
  },
  {"color": [255, 0, 31], "id": 108, "isthing": 1, "name": "plaything, toy"},
  {"color": [0, 184, 255], "id": 109, "isthing": 0, "name": "pool"},
  {"color": [0, 214, 255], "id": 110, "isthing": 1, "name": "stool"},
  {"color": [255, 0, 112], "id": 111, "isthing": 1, "name": "barrel, cask"},
  {"color": [92, 255, 0], "id": 112, "isthing": 1, "name": "basket, handbasket"},
  {"color": [0, 224, 255], "id": 113, "isthing": 0, "name": "falls"},
  {"color": [112, 224, 255], "id": 114, "isthing": 0, "name": "tent"},
  {"color": [70, 184, 160], "id": 115, "isthing": 1, "name": "bag"},
  {"color": [163, 0, 255], "id": 116, "isthing": 1, "name": "minibike, motorbike"},
  {"color": [153, 0, 255], "id": 117, "isthing": 0, "name": "cradle"},
  {"color": [71, 255, 0], "id": 118, "isthing": 1, "name": "oven"},
  {"color": [255, 0, 163], "id": 119, "isthing": 1, "name": "ball"},
  {"color": [255, 204, 0], "id": 120, "isthing": 1, "name": "food, solid food"},
  {"color": [255, 0, 143], "id": 121, "isthing": 1, "name": "step, stair"},
  {"color": [0, 255, 235], "id": 122, "isthing": 0, "name": "tank, storage tank"},
  {"color": [133, 255, 0], "id": 123, "isthing": 1, "name": "trade name"},
  {"color": [255, 0, 235], "id": 124, "isthing": 1, "name": "microwave"},
  {"color": [245, 0, 255], "id": 125, "isthing": 1, "name": "pot"},
  {"color": [255, 0, 122], "id": 126, "isthing": 1, "name": "animal"},
  {"color": [255, 245, 0], "id": 127, "isthing": 1, "name": "bicycle"},
  {"color": [10, 190, 212], "id": 128, "isthing": 0, "name": "lake"},
  {"color": [214, 255, 0], "id": 129, "isthing": 1, "name": "dishwasher"},
  {"color": [0, 204, 255], "id": 130, "isthing": 1, "name": "screen"},
  {"color": [20, 0, 255], "id": 131, "isthing": 0, "name": "blanket, cover"},
  {"color": [255, 255, 0], "id": 132, "isthing": 1, "name": "sculpture"},
  {"color": [0, 153, 255], "id": 133, "isthing": 1, "name": "hood, exhaust hood"},
  {"color": [0, 41, 255], "id": 134, "isthing": 1, "name": "sconce"},
  {"color": [0, 255, 204], "id": 135, "isthing": 1, "name": "vase"},
  {"color": [41, 0, 255], "id": 136, "isthing": 1, "name": "traffic light"},
  {"color": [41, 255, 0], "id": 137, "isthing": 1, "name": "tray"},
  {"color": [173, 0, 255], "id": 138, "isthing": 1, "name": "trash can"},
  {"color": [0, 245, 255], "id": 139, "isthing": 1, "name": "fan"},
  {"color": [71, 0, 255], "id": 140, "isthing": 0, "name": "pier"},
  {"color": [122, 0, 255], "id": 141, "isthing": 0, "name": "crt screen"},
  {"color": [0, 255, 184], "id": 142, "isthing": 1, "name": "plate"},
  {"color": [0, 92, 255], "id": 143, "isthing": 1, "name": "monitor"},
  {"color": [184, 255, 0], "id": 144, "isthing": 1, "name": "bulletin board"},
  {"color": [0, 133, 255], "id": 145, "isthing": 0, "name": "shower"},
  {"color": [255, 214, 0], "id": 146, "isthing": 1, "name": "radiator"},
  {"color": [25, 194, 194], "id": 147, "isthing": 1, "name": "glass, drinking glass"},
  {"color": [102, 255, 0], "id": 148, "isthing": 1, "name": "clock"},
  {"color": [92, 0, 255], "id": 149, "isthing": 1, "name": "flag"},
].map(o => {
  const {color: [r, g, b]} = o;
  const c = new THREE.Color(r / 255, g / 255, b / 255);
  const hex = c.getHex();
  return hex;
});
const colors = detectronColors;

//

const segmentsImg2Canvas = (imageBitmap, {
  color = false,
} = {})  => {  
  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const {data} = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i + 0];
    const segmentIndex = r;

    if (color) {
      const c = localColor.setHex(colors[segmentIndex % colors.length]);
      data[i + 0] = c.r * 255;
      data[i + 1] = c.g * 255;
      data[i + 2] = c.b * 255;
      data[i + 3] = 255;
    } else {
      data[i + 0] = segmentIndex;
      data[i + 1] = segmentIndex;
      data[i + 2] = segmentIndex;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // resize the canvas to the image size
  const canvas2 = document.createElement('canvas');
  canvas2.width = panelSize;
  canvas2.height = panelSize;

  const ctx2 = canvas2.getContext('2d');
  ctx2.imageSmoothingEnabled = false;
  ctx2.drawImage(canvas, 0, 0, canvas2.width, canvas2.height);

  return canvas2;
};
const resizeBoundingBoxLayers = (boundingBoxLayers, oldWidth, oldHeight, width, height) => boundingBoxLayers.map(layer => {
  const {label, bbox} = layer;
  return {
    label,
    bbox: [
      bbox[0] / oldWidth * width,
      bbox[1] / oldHeight * height,
      bbox[2] / oldWidth * width,
      bbox[3] / oldHeight * height,
    ],
  };
});

//

const planesMask2Canvas = (planesMask, {
  color = false,
} = {}) => {
  const canvas = document.createElement('canvas');
  canvas.width = panelSize;
  canvas.height = panelSize;

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const {data} = imageData;
  for (let i = 0; i < planesMask.length; i++) {
    const baseIndex = i * 4;
    const planeIndex = planesMask[i];
    
    if (color) {
      const c = localColor.setHex(rainbowColors[planeIndex % rainbowColors.length]);

      data[baseIndex + 0] = c.r * 255;
      data[baseIndex + 1] = c.g * 255;
      data[baseIndex + 2] = c.b * 255;
      data[baseIndex + 3] = 255;
    } else {
      data[baseIndex + 0] = planeIndex;
      data[baseIndex + 1] = planeIndex;
      data[baseIndex + 2] = planeIndex;
      data[baseIndex + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  /* if (data.byteLength !== planesMask.length * 4) {
    console.log('lengths', width, height, data, planesMask);
    debugger;
    throw new Error('unexpected length');
  } */

  return canvas;
}

//

const getMaskSpecsByConnectivity = (geometry, mask, width, height) => {
  const positions = geometry.attributes.position.array;

  const array = new Float32Array(width * height);
  const colorArray = new Float32Array(width * height * 3);
  const labels = [];
  const labelIndices = new Uint32Array(width * height);

  const seenIndices = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;

      if (!seenIndices.has(index)) {
        // initialize loop
        const value = mask[index];
        const segmentIndices = [];
        const boundingBox = localBox.set(
          localVector.set(Infinity, Infinity, Infinity),
          localVector2.set(-Infinity, -Infinity, -Infinity)
        );
        const labelIndex = labelIndices.length;

        // push initial queue entry
        const queue = [index];
        seenIndices.add(index);
        segmentIndices.push(index);
        labelIndices[index] = labelIndex;

        // loop
        while (queue.length > 0) {
          const index = queue.shift();

          const localValue = mask[index];
          if (localValue === value) {
            const x = index % width;
            const y = Math.floor(index / width);

            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) {
                  continue;
                }

                const ax = x + dx;
                const ay = y + dy;

                if (ax >= 0 && ax < width && ay >= 0 && ay < height) {
                  const aIndex = ay * width + ax;
                  
                  if (!seenIndices.has(aIndex)) {
                    queue.push(aIndex);
                    seenIndices.add(aIndex);
                    segmentIndices.push(aIndex);
                    labelIndices[aIndex] = labelIndex;
                  }
                }
              }
            }
          }
        }

        const c = localColor.setHex(colors[value % colors.length]);
        for (const index of segmentIndices) {
          const position = localVector.fromArray(positions, index * 3);
          boundingBox.expandByPoint(position);

          array[index] = value;

          colorArray[index * 3 + 0] = c.r;
          colorArray[index * 3 + 1] = c.g;
          colorArray[index * 3 + 2] = c.b;
        }
        labels.push({
          index: value,
          bbox: [
            boundingBox.min.toArray(),
            boundingBox.max.toArray(),
          ],
        });
      }
    }
  }
  return {
    array,
    colorArray,
    labels,
    labelIndices,
  };
};
const getMaskSpecsByValue = (geometry, mask, width, height) => {
  const positions = geometry.attributes.position.array;

  const array = new Float32Array(width * height);
  const colorArray = new Float32Array(width * height * 3);
  const labels = new Map();
  const labelIndices = new Uint32Array(width * height);

  const seenIndices = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;

      if (!seenIndices.has(index)) {
        // initialize loop
        const value = mask[index];
        const segmentIndices = [];
        const labelIndex = labelIndices.length;

        // push initial queue entry
        const queue = [index];
        seenIndices.add(index);
        segmentIndices.push(index);
        labelIndices[index] = labelIndex;

        let label = labels.get(value);
        if (!label) {
          label = {
            index: value,
            bbox: [
              [Infinity, Infinity, Infinity],
              [-Infinity, -Infinity, -Infinity],
            ],
          };
          labels.set(value, label);
        }
        const boundingBox = localBox.set(
          localVector.fromArray(label.bbox[0]),
          localVector2.fromArray(label.bbox[1])
        );

        // loop
        while (queue.length > 0) {
          const index = queue.shift();

          const localValue = mask[index];
          if (localValue === value) {
            const x = index % width;
            const y = Math.floor(index / width);

            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) {
                  continue;
                }

                const ax = x + dx;
                const ay = y + dy;

                if (ax >= 0 && ax < width && ay >= 0 && ay < height) {
                  const aIndex = ay * width + ax;
                  
                  if (!seenIndices.has(aIndex)) {
                    queue.push(aIndex);
                    seenIndices.add(aIndex);
                    segmentIndices.push(aIndex);
                    labelIndices[aIndex] = labelIndex;
                  }
                }
              }
            }
          }
        }

        const c = localColor.setHex(colors[value % colors.length]);
        for (const index of segmentIndices) {
          const position = localVector.fromArray(positions, index * 3);
          boundingBox.expandByPoint(position);

          array[index] = value;

          colorArray[index * 3 + 0] = c.r;
          colorArray[index * 3 + 1] = c.g;
          colorArray[index * 3 + 2] = c.b;
        }

        boundingBox.min.toArray(label.bbox[0]);
        boundingBox.max.toArray(label.bbox[1]);
      }
    }
  }
  return {
    array,
    colorArray,
    labels: Array.from(labels.values()),
    labelIndices,
  };
};
const zipPlanesSegmentsJson = (planeSpecs, planesJson) => {
  for (let i = 0; i < planeSpecs.labels.length; i++) {
    const label = planeSpecs.labels[i];
    // if (!planeSpec) {
    //   console.warn('missing planeSpec 1', {planeSpecs, planesJson});
    //   debugger;
    // }
    const planeJson = planesJson[i];
    // if (!planeJson) {
    //   console.warn('missing planeSpec 2', {planeSpecs, planesJson});
    //   debugger;
    // }
    for (const k in planeJson) {
      label[k] = planeJson[k];
    }
  }
  return planeSpecs;
};

//

const floatImageData = imageData => {
  const result = new Float32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const {width, height} = imageData;
  // flip Y
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const j = (height - 1 - y) * width + x;
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
  }
  return result;
};
const depthVertexShader = `\
  precision highp float;
  precision highp int;
  /* uniform float uVertexOffset;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec2 vWorldUv;
  varying vec3 vPos;
  varying vec3 vNormal; */

  void main() {
    // vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // vec3 newPosition = position + normal * vec3( uVertexOffset, uVertexOffset, uVertexOffset );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    // vViewPosition = -mvPosition.xyz;
    // vUv = uv;
    // vPos = position;
    // vNormal = normal;
  }
`;
const depthFragmentShader = `\
  // uniform vec3 uColor;
  // uniform float uTime;
  uniform float cameraNear;
  uniform float cameraFar;

  // varying vec3 vViewPosition;
  // varying vec2 vUv;

  // varying vec3 vPos;
  // varying vec3 vNormal;

  #define FLOAT_MAX  1.70141184e38
  #define FLOAT_MIN  1.17549435e-38

  lowp vec4 encode_float(highp float v) {
    highp float av = abs(v);

    //Handle special cases
    if(av < FLOAT_MIN) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    } else if(v > FLOAT_MAX) {
      return vec4(127.0, 128.0, 0.0, 0.0) / 255.0;
    } else if(v < -FLOAT_MAX) {
      return vec4(255.0, 128.0, 0.0, 0.0) / 255.0;
    }

    highp vec4 c = vec4(0,0,0,0);

    //Compute exponent and mantissa
    highp float e = floor(log2(av));
    highp float m = av * pow(2.0, -e) - 1.0;

    //Unpack mantissa
    c[1] = floor(128.0 * m);
    m -= c[1] / 128.0;
    c[2] = floor(32768.0 * m);
    m -= c[2] / 32768.0;
    c[3] = floor(8388608.0 * m);

    //Unpack exponent
    highp float ebias = e + 127.0;
    c[0] = floor(ebias / 2.0);
    ebias -= c[0] * 2.0;
    c[1] += floor(ebias) * 128.0;

    //Unpack sign bit
    c[0] += 128.0 * step(0.0, -v);

    //Scale back to range
    return c / 255.0;
  }

  // note: the 0.1s here an there are voodoo related to precision
  float decode_float(vec4 v) {
    vec4 bits = v * 255.0;
    float sign = mix(-1.0, 1.0, step(bits[3], 128.0));
    float expo = floor(mod(bits[3] + 0.1, 128.0)) * 2.0 +
                floor((bits[2] + 0.1) / 128.0) - 127.0;
    float sig = bits[0] +
                bits[1] * 256.0 +
                floor(mod(bits[2] + 0.1, 128.0)) * 256.0 * 256.0;
    return sign * (1.0 + sig / 8388607.0) * pow(2.0, expo);
  }

  float perspectiveDepthToViewZ( const in float invClipZ, const in float near, const in float far ) {
    return ( near * far ) / ( ( far - near ) * invClipZ - far );
  }
  float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
    return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
  }
  
  float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
    return ( viewZ + near ) / ( near - far );
  }
  float orthographicDepthToViewZ( const in float linearClipZ, const in float near, const in float far ) {
    return linearClipZ * ( near - far ) - near;
  }

  void main() {
    // get the view Z
    // first, we need to reconstruct the depth value in this fragment
    float depth = gl_FragCoord.z;
    float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
    
    // convert to orthographic depth
    // float orthoZ = viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
    // gl_FragColor = encode_float(orthoZ).abgr;

    gl_FragColor = encode_float(viewZ).abgr;
  }
`;
const setCameraViewPositionFromViewZ = (() => {
  function viewZToOrthographicDepth(viewZ, near, far) {
    return ( viewZ + near ) / ( near - far );
  }
  function orthographicDepthToViewZ(orthoZ, near, far) {
    return orthoZ * ( near - far ) - near;
  }

  return (x, y, viewZ, camera, target) => {
    const {near, far, projectionMatrix, projectionMatrixInverse} = camera;
    
    const depth = viewZToOrthographicDepth(viewZ, near, far);

    // float clipW = cameraProjection[2][3] * viewZ + cameraProjection[3][3];
    // vec4 clipPosition = vec4( ( vec3( gl_FragCoord.xy / viewport.zw, depth ) - 0.5 ) * 2.0, 1.0 );
    // clipPosition *= clipW;
    // vec4 viewPosition = inverseProjection * clipPosition;
    // vec4 vorldPosition = cameraMatrixWorld * vec4( viewPosition.xyz, 1.0 );

    const clipW = projectionMatrix.elements[2 * 4 + 3] * viewZ + projectionMatrix.elements[3 * 4 + 3];
    const clipPosition = new THREE.Vector4(
      (x - 0.5) * 2,
      (y - 0.5) * 2,
      (depth - 0.5) * 2,
      1
    );
    clipPosition.multiplyScalar(clipW);
    const viewPosition = clipPosition.applyMatrix4(projectionMatrixInverse);
    
    target.x = viewPosition.x;
    target.y = viewPosition.y;
    target.z = viewPosition.z;
    return target;
  };
})();
const getDepthFloatsFromPointCloud = (pointCloudArrayBuffer, ) => {
  const geometryPositions = new Float32Array(panelSize * panelSize * 3);
  pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometryPositions, 1 / panelSize);

  const newDepthFloatImageData = new Float32Array(geometryPositions.length / 3);
  for (let i = 0; i < newDepthFloatImageData.length; i++) {
    newDepthFloatImageData[i] = geometryPositions[i * 3 + 2];
  }
  return newDepthFloatImageData;
};
const makeFloatRenderTargetSwapChain = (width, height) => {
  const targets = Array(2);
  for (let i = 0; i < 2; i++) {
    targets[i] = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.FloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
    });
  }
  return targets;
};

//

function drawLabels(ctx, boundingBoxLayers) {
  for (let i = 0; i < boundingBoxLayers.length; i++) {
    const layer = boundingBoxLayers[i];
    let {label, bbox} = layer;

    ctx.strokeStyle = 'red';
    // draw the main rectangle
    const [x1, y1, x2, y2] = bbox;
    const w = x2 - x1;
    const h = y2 - y1;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, w, h);

    // label the box in the top left, with a black background and white text that fits inside
    ctx.fillStyle = 'black';
    ctx.fillRect(x1, y1, 150, 20);
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.fillText(label, x1 + 2, y1 + 14);
  }
}

//

const blockEvent = e => {
  e.preventDefault();
  e.stopPropagation();
};
const _isPointInSkybox = (geometry, i) => geometry.attributes.position.array[i * 3 + 2] > -skyboxDistance;
const _cutSkybox = geometry => {
  // copy over only the triangles that are all on one side of the skybox bounds
  const newIndices = new geometry.index.array.constructor(geometry.index.array.length);
  let numIndices = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.array[i + 0];
    const b = geometry.index.array[i + 1];
    const c = geometry.index.array[i + 2];
    const aInSkybox = _isPointInSkybox(geometry, a);
    const bInSkybox = _isPointInSkybox(geometry, b);
    const cInSkybox = _isPointInSkybox(geometry, c);
    if (aInSkybox === bInSkybox && bInSkybox === cInSkybox) {
      newIndices[numIndices + 0] = a;
      newIndices[numIndices + 1] = b;
      newIndices[numIndices + 2] = c;
      numIndices += 3;
    }
  }
  // set the new indices
  geometry.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, numIndices), 1));
};
const _isPointMasked = (maskImageData, i) => maskImageData.data[i * 4 + 3] > 0;
const _cutMask = (geometry, maskImageData) => {
  // copy over only the triangles that are not completely masked
  const newIndices = new geometry.index.array.constructor(geometry.index.array.length);
  let numIndices = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.array[i + 0];
    const b = geometry.index.array[i + 1];
    const c = geometry.index.array[i + 2];
    const aMasked = _isPointMasked(maskImageData, a);
    const bMasked = _isPointMasked(maskImageData, b);
    const cMasked = _isPointMasked(maskImageData, c);
    // if not all are masked, then keep the triangle
    if (!(aMasked && bMasked && cMasked)) {
      newIndices[numIndices + 0] = a;
      newIndices[numIndices + 1] = b;
      newIndices[numIndices + 2] = c;
      numIndices += 3;
    }
  }
  // set the new indices
  geometry.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, numIndices), 1));
};
const _isValidZDepth = z => z < 0;
const _cutDepth = (geometry, depthFloatImageData) => {
  // copy over only the triangles that are not completely far
  const newIndices = new geometry.index.array.constructor(geometry.index.array.length);
  let numIndices = 0;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.array[i + 0];
    const b = geometry.index.array[i + 1];
    const c = geometry.index.array[i + 2];
    const aValid = _isValidZDepth(depthFloatImageData[a]);
    const bValid = _isValidZDepth(depthFloatImageData[b]);
    const cValid = _isValidZDepth(depthFloatImageData[c]);
    // if not all are valid, then keep the triangle
    if (!(aValid && bValid && cValid)) {
      newIndices[numIndices + 0] = a;
      newIndices[numIndices + 1] = b;
      newIndices[numIndices + 2] = c;
      numIndices += 3;
    }
  }
  // set the new indices
  geometry.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, numIndices), 1));
};
// same as above, but for a luminosity value
function calculateValue(x, y, alphaSpecs /* : {x: number, y: number, a: number}[] */) {
  let total = 0;
  for (let i = 0; i < alphaSpecs.length; i++) {
    let c = alphaSpecs[i];
    let d = distance(c.x, c.y, x, y);
    if (d === 0) {
      return c;
    }
    d = 1 / (d * d);
    c.d = d;
    total += d;
  }
  let a = 0;
  for (let i = 0; i < alphaSpecs.length; i++) {
    let c = alphaSpecs[i];
    let ratio = c.d / total;
    a += ratio * c.value;
  }
  a = Math.floor(a);
  // return {a:a};
  return a;
}
const _clipGeometryToMask = (
  geometry,
  widthSegments,
  heightSegments,
  oldGeometry,
  maskImageData,
  depthFloatImageData,
  indexColorsAlphasArray
) => {
  // check if the point was originally solid or a hole
  const _isPointTransparent = i => maskImageData.data[i * 4 + 3] === 0;
  // get the array which has the brightest alphas at this index
  const _getBrightestIndexColorAlpha = (indexColorsAlphasArray, index) => {
    let bestIndexColorAlpha = null;
    let bestIndexColorAlphaValue = -1;
    for (let i = 0; i < indexColorsAlphasArray.length; i++) {
      const indexColorAlpha = indexColorsAlphasArray[i];
      const a = indexColorAlpha[index * 4 + 3];
      if (a > bestIndexColorAlphaValue) {
        bestIndexColorAlpha = indexColorAlpha;
        bestIndexColorAlphaValue = a;
      }
    }
    return bestIndexColorAlpha;
  };

  // const positions = geometry.attributes.position.array.slice();
  const indices = [];
  const gridX = widthSegments;
  const gridY = heightSegments;
  const gridX1 = gridX + 1;
  const gridY1 = gridY + 1;
  const frontierPoints = new Set();
  for (let iy = 0; iy < gridY; iy++) {
    for (let ix = 0; ix < gridX; ix++) {
      const a = ix + gridX1 * iy;
      const b = ix + gridX1 * (iy + 1);
      const c = (ix + 1) + gridX1 * (iy + 1);
      const d = (ix + 1) + gridX1 * iy;

      const aO = _isPointTransparent(a);
      const bO = _isPointTransparent(b);
      const cO = _isPointTransparent(c);
      const dO = _isPointTransparent(d);

      // if one of the points was in the hole, keep it; otherwise, discard it
      // if a kept point neighbors a non-hole point, add it to the frontier set for welding
      if (aO || bO || cO) {
        indices.push(a, b, d);
        if (!aO) {
          frontierPoints.add(a);
        }
        if (!bO) {
          frontierPoints.add(b);
        }
        if (!dO) {
          frontierPoints.add(d);
        }
      }
      if (bO || cO || dO) {
        indices.push(b, c, d);
        if (!bO) {
          frontierPoints.add(b);
        }
        if (!cO) {
          frontierPoints.add(c);
        }
        if (!dO) {
          frontierPoints.add(d);
        }
      }
    }
  }
  /* for (let ix = 0; ix < gridX1; ix++) {
    for (let iy = 0; iy < gridX1; iy++) {
      const index = ix + gridX1 * iy;

      // if it's a frontier point, we need to weld it to the nearest existing point in the old geometry
      if (frontierPoints.has(index)) {
        const brightestIndexColorAlpha = _getBrightestIndexColorAlpha(indexColorsAlphasArray, index);
        const r = brightestIndexColorAlpha[index * 4 + 0];
        const g = brightestIndexColorAlpha[index * 4 + 1];
        const b = brightestIndexColorAlpha[index * 4 + 2];
        // const a = brightestIndexColorAlpha[index * 4 + 3];

        const screenX = r * gridX1;
        const screenY = g * gridY1;
        const vertexIndex = b;

        // ensure screenX, screenY, vertexIndex are integers; throw if not
        if (screenX !== Math.floor(screenX)) {
          console.warn('invalid screenX', screenX);
          debugger;
          throw new Error('invalid screenX');
        }
        if (screenY !== Math.floor(screenY)) {
          console.warn('invalid screenY', screenY);
          debugger;
          throw new Error('invalid screenY');
        }
        if (vertexIndex !== Math.floor(vertexIndex)) {
          console.warn('invalid vertexIndex', vertexIndex);
          debugger;
          throw new Error('invalid vertexIndex');
        }

        const positionIndex = vertexIndex * 3;
        const oldPositions = oldGeometry.attributes.position.array;
        positions[index * 3 + 0] = oldPositions[positionIndex + 0];
        positions[index * 3 + 1] = oldPositions[positionIndex + 1];
        positions[index * 3 + 2] = oldPositions[positionIndex + 2];
      } else {
        // otherwise, we need to perform a 6-point interpolation across the index colors alphas array

        // colect [{x, y, value}]
        const alphaSpecs = indexColorsAlphasArray.map(indexColorsAlphas => {
          const r = indexColorsAlphas[index * 4 + 0];
          const g = indexColorsAlphas[index * 4 + 1];
          const b = indexColorsAlphas[index * 4 + 2];
          const a = indexColorsAlphas[index * 4 + 3];

          const screenX = r * gridX1;
          const screenY = g * gridY1;
          const vertexIndex = b;

          // ensure screenX, screenY, vertexIndex are integers; throw if not
          if (screenX !== Math.floor(screenX)) {
            console.warn('invalid screenX', screenX);
            debugger;
            throw new Error('invalid screenX');
          }
          if (screenY !== Math.floor(screenY)) {
            console.warn('invalid screenY', screenY);
            debugger;
            throw new Error('invalid screenY');
          }
          if (vertexIndex !== Math.floor(vertexIndex)) {
            console.warn('invalid vertexIndex', vertexIndex);
            debugger;
            throw new Error('invalid vertexIndex');
          }

          if (a > 0) { // if it's a solid point, get the viewZ from the depth float image data
            const depthFloatIndex = screenX + screenY * gridX1;
            const viewZ = depthFloatImageData[depthFloatIndex];

            return {
              x: screenX,
              y: screenY,
              value: viewZ,
            };
          } else { // else if it's a transparent point, pretend it's the destination geometry's local Z at the corner
            const {direction} = indexColorsAlphas;

            // snap the screen position
            let screenX2 = ix / gridX1;
            let screenY2 = iy / gridY1;
            if (direction.x < 0) {
              screenX2 = gridX1 - 1;
            } else if (direction.x > 0) {
              screenX2 = 0;
            }
            if (direction.y < 0) {
              screenY2 = gridY1 - 1;
            } else if (direction.y > 0) {
              screenY2 = 0;
            }

            const viewZ = 0; // XXX need to get this from the rendered depth of the destination geometry

            return {
              x: screenX2,
              y: screenY2,
              value: viewZ,
            };
          }
        });
        // XXX add to the list of candidates a centroid point at the axis intersection of the other points
        // XXX viewZ should come from the depth float image data of the new geometry
        
        const resolvedViewZ = calculateValue(ix, iy, alphaSpecs);
        // XXX convert viewZ to worldZ
        const worldZ = 0; // XXX
        // positions[index * 3 + 0] = oldPositions[positionIndex + 0];
        // positions[index * 3 + 1] = oldPositions[positionIndex + 1];
        positions[index * 3 + 2] = worldZ;
      }
    }
  }
  // set the new positions and indices on the geometry
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); */
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
};

//

const selectorSize = 8 + 1;
class Selector {
  constructor({
    renderer,
    camera,
    mouse,
    raycaster,
  }) {
    this.renderer = renderer;
    this.camera = camera;
    this.mouse = mouse;
    this.raycaster = raycaster;
    
    const lensRenderTarget = new THREE.WebGLRenderTarget(selectorSize, selectorSize, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
    });
    this.lensRenderTarget = lensRenderTarget;

    const lensMaterial = new THREE.ShaderMaterial({
      uniforms: {
        viewport: {
          value: new THREE.Vector4(),
          needsUpdate: true,
        },
        iResolution: {
          value: new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height),
          needsUpdate: true,
        },
        selectorSize: {
          value: selectorSize,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        uniform vec4 viewport;
        uniform vec2 iResolution;
        uniform float selectorSize;
        attribute float triangleId;
        varying float vIndex;

        void main() {
          // get the triangle index, dividing by 3
          // vIndex = gl_VertexID / 3;
          
          vIndex = triangleId;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

          float w = gl_Position.w;
          gl_Position /= w;
          
          // viewport is [x, y, width, height], in the range [0, iResolution]
          // iResolution is [width, height]
          // update gl_Position so that the view is zoomed in on the viewport:
          gl_Position.xy = (gl_Position.xy + 1.0) / 2.0;
          gl_Position.xy *= iResolution;
          gl_Position.xy -= viewport.xy;
          gl_Position.xy /= viewport.zw;
          gl_Position.xy = gl_Position.xy * 2.0 - 1.0;

          gl_Position *= w;
        }
      `,
      fragmentShader: `\
        varying float vIndex;

        void main() {
          float fIndex = vIndex;

          // encode the index as rgb
          float r = floor(fIndex / 65536.0);
          fIndex -= r * 65536.0;
          float g = floor(fIndex / 256.0);
          fIndex -= g * 256.0;
          float b = fIndex;

          gl_FragColor = vec4(r, g, b, 1.);
        }
      `,
    });
    this.lensMaterial = lensMaterial;

    const lensScene = new THREE.Scene();
    lensScene.autoUpdate = false;
    lensScene.overrideMaterial = lensMaterial;
    this.lensScene = lensScene;

    const lensOutputMesh = (() => {
      const geometry = new THREE.PlaneBufferGeometry(1, 1);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          tIndex: {
            value: lensRenderTarget.texture,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D tIndex;
          varying vec2 vUv;
          void main() {
            vec4 indexRgba = texture2D(tIndex, vUv);
            
            // encode the index as rgba
            // float r = floor(fIndex / 65536.0);
            // fIndex -= r * 65536.0;
            // float g = floor(fIndex / 256.0);
            // fIndex -= g * 256.0;
            // float b = floor(fIndex / 1.0);
            // fIndex -= b * 1.0;
            // gl_FragColor = vec4(r, g, b, 1.);

            gl_FragColor = vec4(indexRgba.rgb / 255.0, 1.0);
          }
        `,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      return mesh;
    })();
    this.lensOutputMesh = lensOutputMesh;

    // index full screen pass 
    const indicesRenderTarget = new THREE.WebGLRenderTarget((panelSize - 1) * 2, panelSize - 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
    });
    this.indicesRenderTarget = indicesRenderTarget;

    const indicesScene = new THREE.Scene();
    indicesScene.autoUpdate = false;
    this.indicesScene = indicesScene;

    const indexMaterial = new THREE.ShaderMaterial({
      uniforms: {
        iResolution: {
          value: new THREE.Vector2(this.indicesRenderTarget.width, this.indicesRenderTarget.height),
          needsUpdate: true,
        },
        uPointerCircle: {
          value: new THREE.Vector3(),
          needsUpdate: true,
        },
      },
      vertexShader: `\
        attribute vec3 point1;
        attribute vec3 point2;
        attribute vec3 point3;
        varying vec3 vPoint1;
        varying vec3 vPoint2;
        varying vec3 vPoint3;

        void main() {
          vPoint1 = point1;
          vPoint2 = point2;
          vPoint3 = point3;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        uniform mat4 projectionMatrix;
        uniform mat4 modelViewMatrix;
        uniform vec2 iResolution;
        uniform vec3 uPointerCircle;
        varying vec3 vPoint1;
        varying vec3 vPoint2;
        varying vec3 vPoint3;

        struct Point {
          float x;
          float y;
        };
        struct Triangle {
          Point a;
          Point b;
          Point c;
        };

        bool pointInTriangle(Point point, Triangle triangle) {
          //compute vectors & dot products
          float cx = point.x;
          float cy = point.y;
          Point t0 = triangle.a;
          Point t1 = triangle.b;
          Point t2 = triangle.c;
          float v0x = t2.x-t0.x;
          float v0y = t2.y-t0.y;
          float v1x = t1.x-t0.x;
          float v1y = t1.y-t0.y;
          float v2x = cx-t0.x;
          float v2y = cy-t0.y;
          float dot00 = v0x*v0x + v0y*v0y;
          float dot01 = v0x*v1x + v0y*v1y;
          float dot02 = v0x*v2x + v0y*v2y;
          float dot11 = v1x*v1x + v1y*v1y;
          float dot12 = v1x*v2x + v1y*v2y;
        
          // Compute barycentric coordinates
          float b = (dot00 * dot11 - dot01 * dot01);
          float inv = (b == 0.) ? 0. : (1. / b);
          float u = (dot11*dot02 - dot01*dot12) * inv;
          float v = (dot00*dot12 - dot01*dot02) * inv;
          return u>=0. && v>=0. && (u+v < 1.);
        }
        bool pointCircleCollision(Point point, Point circle, float r) {
          if (r==0.) return false;
          float dx = circle.x - point.x;
          float dy = circle.y - point.y;
          return dx * dx + dy * dy <= r * r;
        }
        bool lineCircleCollision(Point a, Point b, Point circle, float radius/*, nearest*/) {
          //check to see if start or end points lie within circle 
          if (pointCircleCollision(a, circle, radius)) {
            // if (nearest) {
            //     nearest[0] = a[0]
            //     nearest[1] = a[1]
            // }
            return true;
          } if (pointCircleCollision(b, circle, radius)) {
            // if (nearest) {
            //     nearest[0] = b[0]
            //     nearest[1] = b[1]
            // }
            return true;
          }
          
          float x1 = a.x;
          float y1 = a.y;
          float x2 = b.x;
          float y2 = b.y;
          float cx = circle.x;
          float cy = circle.y;
    
          //vector d
          float dx = x2 - x1;
          float dy = y2 - y1;
          
          //vector lc
          float lcx = cx - x1;
          float lcy = cy - y1;
          
          //project lc onto d, resulting in vector p
          float dLen2 = dx * dx + dy * dy; //len2 of d
          float px = dx;
          float py = dy;
          if (dLen2 > 0.) {
            float dp = (lcx * dx + lcy * dy) / dLen2;
            px *= dp;
            py *= dp;
          }
          
          // if (!nearest)
          //     nearest = tmp
          // const tmp = [0, 0]
          Point tmp;
          tmp.x = x1 + px;
          tmp.y = y1 + py;
          
          //len2 of p
          float pLen2 = px * px + py * py;
          
          //check collision
          return pointCircleCollision(tmp, circle, radius) &&
            pLen2 <= dLen2 &&
            (px * dx + py * dy) >= 0.;
        }

        bool triangleCircleCollision(Triangle triangle, Point circle, float radius) {
          if (pointInTriangle(circle, triangle))
              return true;
          if (lineCircleCollision(triangle.a, triangle.b, circle, radius))
              return true;
          if (lineCircleCollision(triangle.b, triangle.c, circle, radius))
              return true;
          if (lineCircleCollision(triangle.c, triangle.a, circle, radius))
              return true;
          return false;
        }

        void main() {
          // project the points
          vec4 point1Tmp = projectionMatrix * modelViewMatrix * vec4(vPoint1, 1.0);
          point1Tmp /= point1Tmp.w;
          vec2 point1 = point1Tmp.xy;

          vec4 point2Tmp = projectionMatrix * modelViewMatrix * vec4(vPoint2, 1.0);
          point2Tmp /= point2Tmp.w;
          vec2 point2 = point2Tmp.xy;

          vec4 point3Tmp = projectionMatrix * modelViewMatrix * vec4(vPoint3, 1.0);
          point3Tmp /= point3Tmp.w;
          vec2 point3 = point3Tmp.xy;

          Triangle triangle;
          triangle.a.x = point1.x;
          triangle.a.y = point1.y;
          triangle.b.x = point2.x;
          triangle.b.y = point2.y;
          triangle.c.x = point3.x;
          triangle.c.y = point3.y;

          Point circle;
          circle.x = uPointerCircle.x;
          circle.y = uPointerCircle.y;

          float radius = uPointerCircle.z;

          float v;
          if (triangleCircleCollision(triangle, circle, radius)) {
            v = 1.;
          } else {
            v = 0.;
          }
          gl_FragColor = vec4(vec3(v), 1.);
        }
      `,
    });
    this.indexMaterial = indexMaterial;

    const indicesOutputMesh = (() => {
      const scale = 10;
      const geometry = new THREE.PlaneBufferGeometry(2, 1)
        .scale(scale, scale, scale);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          indicesTexture: {
            value: indicesRenderTarget.texture,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D indicesTexture;
          varying vec2 vUv;
          void main() {
            vec4 indicesRgba = texture2D(indicesTexture, vUv);
            gl_FragColor = vec4(indicesRgba.rgb, 1.0);
            gl_FragColor.rg += 0.5 * vUv;
          }
        `,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      return mesh;
    })();
    this.indicesOutputMesh = indicesOutputMesh;
  }
  addMesh(mesh) {
    // lens mesh
    const selectorWindowMesh = mesh.clone();
    this.lensScene.add(selectorWindowMesh);
    
    // indices mesh
    const indicesMesh = (() => {
      const planeGeometry = new THREE.PlaneBufferGeometry(1, 1)
        .translate(0.5, 0.5, 0);
      // position x, y is in the range [0, 1]
      const sceneMeshGeometry = mesh.geometry;

      const {width, height} = this.indicesRenderTarget;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // const coords = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // for each plane, we copy in the sceneMeshGeometry triangle vertices it represents
      /* const triangles = new Float32Array(9 * planeGeometry.attributes.position.array.length * width * height);
      if (triangles.length !== sceneMeshGeometry.attributes.position.array * 9) {
        console.warn('triangle count mismatch 1', triangles.length, sceneMeshGeometry.attributes.position.array * 9);
        debugger;
      }
      if (triangles.length !== positions.length * 3) {
        console.warn('triangle count mismatch 2', positions.length, triangles.length * 3);
        debugger;
      } */
      if (width * height * 9 !== sceneMeshGeometry.attributes.position.array.length) {
        console.warn('invalid width/height', width, height, sceneMeshGeometry.attributes.position.array.length);
        debugger;
      }
      const pt1 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      const pt2 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      const pt3 = new Float32Array(planeGeometry.attributes.position.array.length * width * height);
      // if (pt1.length !== sceneMeshGeometry.attributes.position.array.length * 3) {
      //   console.warn('triangle count mismatch 1', pt1.length, sceneMeshGeometry.attributes.position.array.length * 3);
      //   debugger;
      // }
      const indices = new Uint32Array(planeGeometry.index.array.length * width * height);
      let positionOffset = 0;
      let indexOffset = 0;
      let triangleReadOffset = 0;
      let triangleWriteOffset = 0;
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const uvx = dx / width;
          const uvy = dy / height;

          // convert to ndc
          const ndcx = uvx * 2 - 1;
          const ndcy = uvy * 2 - 1;

          for (let i = 0; i < planeGeometry.attributes.position.array.length; i += 3) {

            // get the position offset
            // note: * 2 because we are in the range [-1, 1]
            const pox = planeGeometry.attributes.position.array[i + 0] / width * 2;
            const poy = planeGeometry.attributes.position.array[i + 1] / height * 2;

            // copy position
            positions[positionOffset + i + 0] = ndcx + pox;
            positions[positionOffset + i + 1] = ndcy + poy;
            positions[positionOffset + i + 2] = 0;

            // coord
            // const index = dx + dy * selectorSize;
            // coords[positionOffset + i + 0] = dx;
            // coords[positionOffset + i + 1] = dy;
            // coords[positionOffset + i + 2] = index;

            // triangle
            pt1[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 0];
            pt1[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 1];
            pt1[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 2];

            pt2[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 3];
            pt2[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 4];
            pt2[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 5];

            pt3[triangleWriteOffset + i + 0] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 6];
            pt3[triangleWriteOffset + i + 1] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 7];
            pt3[triangleWriteOffset + i + 2] = sceneMeshGeometry.attributes.position.array[triangleReadOffset + 8];
          }
          positionOffset += planeGeometry.attributes.position.array.length;

          triangleWriteOffset += planeGeometry.attributes.position.array.length;
          triangleReadOffset += 9;

          const localIndexOffset = positionOffset / 3;
          for (let i = 0; i < planeGeometry.index.array.length; i++) {
            indices[indexOffset + i] = planeGeometry.index.array[i] + localIndexOffset;
          }
          indexOffset += planeGeometry.index.array.length;
        }
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      // geometry.setAttribute('coord', new THREE.BufferAttribute(coords, 3));
      geometry.setAttribute('point1', new THREE.BufferAttribute(pt1, 3));
      geometry.setAttribute('point2', new THREE.BufferAttribute(pt2, 3));
      geometry.setAttribute('point3', new THREE.BufferAttribute(pt3, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));

      const material = this.indexMaterial;

      const resultMesh = new THREE.Mesh(geometry, material);
      resultMesh.frustumCulled = false;
      return resultMesh;
    })();
    this.indicesScene.add(indicesMesh);
  }
  update() {
    // push
    const oldRenderTarget = this.renderer.getRenderTarget();

    // update
    {
      // lens material
      const selectorSizeM1 = selectorSize - 1;
      const halfSelectorSizeM1 = selectorSizeM1 / 2;
      this.lensMaterial.uniforms.viewport.value.set(
        (this.mouse.x / 2 + 0.5) * this.renderer.domElement.width - halfSelectorSizeM1 - 1,
        (this.mouse.y / 2 + 0.5) * this.renderer.domElement.height - halfSelectorSizeM1 - 1,
        selectorSize,
        selectorSize
      );
      this.lensMaterial.uniforms.viewport.needsUpdate = true;

      // index material
      const radiusPixels = 100;
      const radius = radiusPixels / this.renderer.domElement.width;
      this.indexMaterial.uniforms.uPointerCircle.value.set(this.mouse.x, this.mouse.y, radius);
      this.indexMaterial.uniforms.uPointerCircle.needsUpdate = true;
    }

    // render lens
    this.renderer.setRenderTarget(this.lensRenderTarget);
    this.renderer.render(this.lensScene, this.camera);

    // render indices scene
    this.renderer.setRenderTarget(this.indicesRenderTarget);
    this.renderer.render(this.indicesScene, this.camera);

    // pop
    this.renderer.setRenderTarget(oldRenderTarget);
  }
}

//

class Overlay {
  constructor({
    renderer,
  }) {
    this.renderer = renderer;

    const overlayScene = new THREE.Scene();
    overlayScene.autoUpdate = false;
    this.overlayScene = overlayScene;
  }
  addMesh(mesh) {
    const geometry = mesh.geometry.clone();
    const {
      segmentSpecs,
      planeSpecs,
    } = mesh;

    /* // add barycentric coordinates
    const barycentric = new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.array.length), 3);
    for (let i = 0; i < barycentric.array.length; i += 9) {
      barycentric.array[i + 0] = 1;
      barycentric.array[i + 1] = 0;
      barycentric.array[i + 2] = 0;

      barycentric.array[i + 3] = 0;
      barycentric.array[i + 4] = 1;
      barycentric.array[i + 5] = 0;

      barycentric.array[i + 6] = 0;
      barycentric.array[i + 7] = 0;
      barycentric.array[i + 8] = 1;
    }
    geometry.setAttribute('barycentric', barycentric); */

    const _makeOverlayMesh = ({
      renderMode,
    }) => {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uRenderMode: {
            value: renderMode,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          attribute float segment;
          attribute vec3 segmentColor;
          attribute float plane;
          attribute vec3 planeColor;
          attribute vec3 barycentric;
          
          varying float vSegment;
          flat varying vec3 vSegmentColor;
          varying float vPlane;
          flat varying vec3 vPlaneColor;
          varying vec3 vBarycentric;
          varying vec2 vUv;
          varying vec3 vPosition;
  
          void main() {
            vSegment = segment;
            vSegmentColor = segmentColor;
            vPlane = plane;
            vPlaneColor = planeColor;
  
            vBarycentric = barycentric;
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform int uRenderMode;
          
          varying float vSegment;
          flat varying vec3 vSegmentColor;
          varying float vPlane;
          flat varying vec3 vPlaneColor;
          varying vec3 vBarycentric;
          varying vec2 vUv;
          varying vec3 vPosition;
  
          const float lineWidth = 0.1;
          const vec3 lineColor = vec3(${new THREE.Vector3(0x00BBCC).toArray().map(n => n.toFixed(8)).join(',')});
  
          float edgeFactor(vec3 bary, float width) {
            // vec3 bary = vec3(vBC.x, vBC.y, 1.0 - vBC.x - vBC.y);
            vec3 d = fwidth(bary);
            vec3 a3 = smoothstep(d * (width - 0.5), d * (width + 0.5), bary);
            return min(min(a3.x, a3.y), a3.z);
          }
  
          void main() {
            vec2 uv = vUv;
            float b = 0.05;
            float f = min(mod(uv.x, b), mod(uv.y, b));
            f = min(f, mod(1.-uv.x, b));
            f = min(f, mod(1.-uv.y, b));
            f *= 200.;
  
            float a = max(1. - f, 0.);
            a = max(a, 0.5);
  
            if (uRenderMode == 0) {
              vec3 c = lineColor;
              vec3 p = vPosition;
  
              gl_FragColor = vec4(c, a);
              gl_FragColor.rg = uv;
            } else if (uRenderMode == 1) {
              gl_FragColor = vec4(vSegmentColor, a);
            } else if (uRenderMode == 2) {
              gl_FragColor = vec4(vPlaneColor, 0.7);
            } else {
              // gl_FragColor = vec4(1., 0., 0., 1.);
              discard;
            }
          }
        `,
        transparent: true,
        alphaToCoverage: true,
        // polygon offset to front
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: 1,
      });

      const mesh = new THREE.Mesh(
        geometry,
        material,
      );
      mesh.frustumCulled = false;
      return mesh;
    };

    // lens mesh
    const toolOverlayMeshSpecs = [
      {
        name: 'eraser',
        renderMode: 0,
      },
      {
        name: 'segment',
        renderMode: 1,
      },
      {
        name: 'plane',
        renderMode: 2,
      },
    ];
    this.toolOverlayMeshes = {};
    for (let i = 0; i < toolOverlayMeshSpecs.length; i++) {
      const toolOverlayMeshSpec = toolOverlayMeshSpecs[i];
      const {
        name,
        renderMode,
      } = toolOverlayMeshSpec;
      const overlayMesh = _makeOverlayMesh({
        renderMode,
      });
      overlayMesh.visible = false;
      this.overlayScene.add(overlayMesh);
      this.toolOverlayMeshes[name] = overlayMesh;
    }

    // segment meshes
    {
      const segmentMesh = this.toolOverlayMeshes['segment'];
      // console.log('overlay specs', {
      //   segmentSpecs,
      //   planeSpecs,
      // });
      const {labels} = segmentSpecs;
      for (const label of labels) {
        const {index, bbox} = label;
        const name = classes[index];

        const boundingBox = localBox.set(
          localVector.fromArray(bbox[0]),
          localVector2.fromArray(bbox[1])
        );
        const center = boundingBox.getCenter(localVector);
        const size = boundingBox.getSize(localVector2);
        
        {
          const textMesh = new Text();
          textMesh.position.copy(center);
          textMesh.position.z += size.z / 2;
          textMesh.updateMatrixWorld();

          textMesh.text = name;
          textMesh.fontSize = 0.2;
          textMesh.anchorX = 'center';
          textMesh.anchorY = 'middle';
          textMesh.color = 0x000000;
          textMesh.sync();

          segmentMesh.add(textMesh);
        }
      }
    }

    // plane meshes
    {
      const planeMesh = this.toolOverlayMeshes['plane'];

      if (planeSpecs.labels.length > 0) {
        const arrowGeometry = (() => {
          const shape = new THREE.Shape();
          shape.moveTo(0, 0);
          shape.lineTo(1, -1);
          shape.lineTo(0, 2);
          shape.lineTo(-1, -1);

          const extrudeSettings = {
            // steps: 2,
            depth: 0.25,
            bevelEnabled: false,
            // bevelThickness: 1,
            // bevelSize: 1,
            // bevelOffset: 0,
            // bevelSegments: 1
          };

          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          geometry.translate(0, 1, 0);
          geometry.rotateX(Math.PI / 2);
          const s = 0.1;
          geometry.scale(s, s, s);

          return geometry;
        })();
        const arrowMaterial = new THREE.MeshPhongMaterial({
          color: 0xFF0000,
        });
        const gridGeometry = new THREE.PlaneGeometry(1, 1);
        const gridMaterial = new THREE.ShaderMaterial({
          vertexShader: `\
            varying vec2 vUv;
    
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `\
            varying vec2 vUv;

            const vec3 lineColor = vec3(${new THREE.Vector3(0x00BBCC).toArray().map(n => n.toFixed(8)).join(',')});
    
            void main() {
              vec2 uv = vUv;

              // draw a grid based on uv
              float b = 0.1;
              float f = min(mod(uv.x, b), mod(uv.y, b));
              f = min(f, mod(1.-uv.x, b));
              f = min(f, mod(1.-uv.y, b));
              f *= 200.;

              float a = max(1. - f, 0.);
              a = max(a, 0.5);

              vec3 c = lineColor;

              gl_FragColor = vec4(c, a);
              // gl_FragColor.rg = uv;
            }
          `,
          transparent: true,
          side: THREE.DoubleSide,
        });

        const makeArrowMesh = () => {
          const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
          return arrowMesh;
        };
        const makeGridMesh = () => {
          const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
          return gridMesh;
        };

        // console.log('render labels', planeSpecs.labels);
        for (const label of planeSpecs.labels) {
          // localBox.set(
          //   localVector.fromArray(label.bbox[0]),
          //   localVector2.fromArray(label.bbox[1])
          // );
          // const center = localBox.getCenter(localVector);
          // const size = localBox.getSize(localVector2);

          /* if (!label.center || !label.normal) {
            console.warn('invalid label', label);
            debugger;
          } */

          // compute label plane
          const center = localVector.fromArray(label.center);
          // center.x *= -1;
          center.y *= -1;
          center.z *= -1;
          const normal = localVector2.fromArray(label.normal);
          normal.x *= -1;

          // arrow mesh
          const arrowMesh = makeArrowMesh();
          arrowMesh.position.copy(center);
          arrowMesh.quaternion.setFromRotationMatrix(
            localMatrix.lookAt(
              localVector3.set(0, 0, 0),
              normal,
              localVector4.set(0, 1, 0)
            )
          );
          arrowMesh.updateMatrixWorld();
          arrowMesh.frustumCulled = false;
          planeMesh.add(arrowMesh);

          // grid mesh
          const gridMesh = makeGridMesh();
          gridMesh.position.copy(arrowMesh.position);
          gridMesh.quaternion.copy(arrowMesh.quaternion);
          gridMesh.updateMatrixWorld();
          gridMesh.frustumCulled = false;
          planeMesh.add(gridMesh);
        }
      }
    }
  }
  setTool(tool) {
    for (const k in this.toolOverlayMeshes) {
      const toolOverlayMesh = this.toolOverlayMeshes[k];
      toolOverlayMesh.visible = k === tool;
    }
  }
}

//

class PanelRenderer extends EventTarget {
  constructor(canvas, panel, {
    debug = false,
  } = {}) {
    super();

    this.canvas = canvas;
    this.panel = panel;
    this.debug = debug;

    this.tool = tools[0];
    this.layerScenes = [];

    // canvas
    canvas.width = panelSize;
    canvas.height = panelSize;
    canvas.classList.add('canvas');

    // renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    // renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.addEventListener('destroy', e => {
      this.renderer.dispose();
    });

    const scene = new THREE.Scene();
    // scene.background = new THREE.Color(0x0000FF);
    scene.autoUpdate = false;
    this.scene = scene;
    
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera = camera;

    // orbit controls
    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2;
    controls.target.set(0, 0, -3);
    this.controls = controls;

    // mouse
    const mouse = new THREE.Vector2();
    this.mouse = mouse;

    // raycaster
    const raycaster = new THREE.Raycaster();
    this.raycaster = raycaster;

    // lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 3);
    directionalLight.updateMatrixWorld();
    scene.add(directionalLight);

    this.sceneMesh = null;
    this.floorMesh = null;
    this.planesMesh = null;

    const defaultCubeMesh = new THREE.Mesh(
      new THREE.BoxBufferGeometry(1, 1, 1),
      new THREE.MeshPhongMaterial({
        color: 0x00ff00,
      }),
    );
    defaultCubeMesh.name = 'defaultCubeMesh';
    defaultCubeMesh.frustumCulled = false;
    // scene.add(defaultCubeMesh);

    // read the mesh from the panel
    const imgArrayBuffer = panel.getData(mainImageKey);
    const segmentMask = panel.getData('layer1/segmentMask');
    // const labelImageData = panel.getData('layer1/labelImageData');
    const pointCloudHeaders = panel.getData('layer1/pointCloudHeaders');
    const pointCloudArrayBuffer = panel.getData('layer1/pointCloud');
    // const planeMatrices = panel.getData('layer1/planeMatrices');
    const planesJson = panel.getData('layer1/planesJson');
    const planesMask = panel.getData('layer1/planesMask');
    const predictedHeight = panel.getData('layer1/predictedHeight');
    // console.log('got panel datas', panel.getDatas());

    // camera
    this.camera.fov = Number(pointCloudHeaders['x-fov']);
    this.camera.updateProjectionMatrix();

    // scene mesh
    const widthSegments = this.canvas.width - 1;
    const heightSegments = this.canvas.height - 1;
    let geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
    pointCloudArrayBufferToPositionAttributeArray(pointCloudArrayBuffer, geometry.attributes.position.array, 1/this.canvas.width);
    // geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(pointCloudArrayBuffer.byteLength / pointcloudStride * 3), 3, true));
    // pointCloudArrayBufferToColorAttributeArray(labelImageData, geometry.attributes.color.array);
    // _cutSkybox(geometry);
    // applySkybox(geometry.attributes.position.array);
    const segmentSpecs = getMaskSpecsByConnectivity(geometry, segmentMask, this.canvas.width, this.canvas.height);
    let planeSpecs = getMaskSpecsByValue(geometry, planesMask, this.canvas.width, this.canvas.height);
    planeSpecs = zipPlanesSegmentsJson(planeSpecs, planesJson);
    geometry.setAttribute('segment', new THREE.BufferAttribute(segmentSpecs.array, 1));
    geometry.setAttribute('segmentColor', new THREE.BufferAttribute(segmentSpecs.colorArray, 3));
    geometry.setAttribute('plane', new THREE.BufferAttribute(planeSpecs.array, 1));
    geometry.setAttribute('planeColor', new THREE.BufferAttribute(planeSpecs.colorArray, 3));
    // globalThis.oldGeometry = geometry;
    geometry = geometry.toNonIndexed();
    // globalThis.newGeometry = geometry;
    // add extra triangeId attribute
    const triangleIdAttribute = new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count), 1);
    for (let i = 0; i < triangleIdAttribute.count; i++) {
      triangleIdAttribute.array[i] = Math.floor(i / 3);
    }
    geometry.setAttribute('triangleId', triangleIdAttribute);

    // texture
    const map = new THREE.Texture();

    // mesh
    const sceneMesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: {
          map: {
            value: map,
            needsUpdate: true,
          },
          selectedIndicesMap: {
            value: null,
            needsUpdate: false,
          },
          iSelectedIndicesMapResolution: {
            value: new THREE.Vector2(),
            needsUpdate: false,
          },
          uEraser: {
            value: 0,
            needsUpdate: true,
          },
        },
        vertexShader: `\
          attribute float triangleId;
          varying vec2 vUv;
          varying float vTriangleId;
          
          void main() {
            vUv = uv;
            vTriangleId = triangleId;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `\
          uniform sampler2D map;
          uniform sampler2D selectedIndicesMap;
          uniform vec2 iSelectedIndicesMapResolution;
          uniform int uEraser;

          varying vec2 vUv;
          varying float vTriangleId;

          void main() {
            gl_FragColor = texture2D(map, vUv);
            
            if (uEraser == 1) {
              // check for selection
              float x = mod(vTriangleId, iSelectedIndicesMapResolution.x);
              float y = floor(vTriangleId / iSelectedIndicesMapResolution.x);
              vec2 uv = (vec2(x, y) + 0.5) / iSelectedIndicesMapResolution;
              vec4 selectedIndexRgba = texture2D(selectedIndicesMap, uv);
              bool isSelected = selectedIndexRgba.r > 0.5;
              if (isSelected) {
                gl_FragColor.rgb *= 0.2;
              }
            }
          }
        `,
      }),
    );
    sceneMesh.name = 'sceneMesh';
    sceneMesh.frustumCulled = false;
    sceneMesh.segmentSpecs = segmentSpecs;
    sceneMesh.planeSpecs = planeSpecs;
    this.scene.add(sceneMesh);
    this.sceneMesh = sceneMesh;

    (async () => { // load the texture image
      sceneMesh.visible = false;

      const imgBlob = new Blob([imgArrayBuffer], {
        type: 'image/png',
      });
      map.image = await createImageBitmap(imgBlob, {
        imageOrientation: 'flipY',
      });
      // map.encoding = THREE.sRGBEncoding;
      map.needsUpdate = true;

      sceneMesh.visible = true;
    })();

    // selector
    {
      const selector = new Selector({
        renderer,
        camera,
        mouse,
        raycaster,
      });
      selector.addMesh(sceneMesh);

      selector.lensOutputMesh.position.x = -10;
      selector.lensOutputMesh.updateMatrixWorld();
      scene.add(selector.lensOutputMesh);
      
      selector.indicesOutputMesh.position.x = -10;
      selector.indicesOutputMesh.position.z = -10;
      selector.indicesOutputMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      selector.indicesOutputMesh.updateMatrixWorld();
      scene.add(selector.indicesOutputMesh);
      
      sceneMesh.material.uniforms.selectedIndicesMap.value = selector.indicesRenderTarget.texture;
      sceneMesh.material.uniforms.selectedIndicesMap.needsUpdate = true;
      sceneMesh.material.uniforms.iSelectedIndicesMapResolution.value.set(selector.indicesRenderTarget.width, selector.indicesRenderTarget.height);
      sceneMesh.material.uniforms.iSelectedIndicesMapResolution.needsUpdate = true;

      this.selector = selector;
    }

    // overlay
    {
      const overlay = new Overlay({
        renderer,
      });

      overlay.addMesh(sceneMesh);
      scene.add(overlay.overlayScene);

      this.overlay = overlay;
    }

    // floor mesh
    const floorMesh = (() => {
      const geometry = new THREE.PlaneGeometry(1, 1)
        .rotateX(-Math.PI/2)
      const material = new THREE.MeshBasicMaterial({
        color: 0x808080,
        transparent: true,
        opacity: 0.1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'floorMesh';
      mesh.frustumCulled = false;
      return mesh;
    })();
    floorMesh.position.y = -predictedHeight;
    floorMesh.updateMatrixWorld();
    // this.scene.add(floorMesh);
    this.floorMesh = floorMesh;

    /* // planes mesh
    const planesMesh = (() => {
      const planeGeometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      });
      const planesMesh = new THREE.InstancedMesh(planeGeometry, material, planeMatrices.length);
      planesMesh.name = 'planesMesh';
      planesMesh.frustumCulled = false;
      for (let i = 0; i < planeMatrices.length; i++) {
        planesMesh.setMatrixAt(i, localMatrix.fromArray(planeMatrices[i]));
      }
      planesMesh.count = planeMatrices.length;
      planesMesh.instanceMatrix.needsUpdate = true;
      return planesMesh;
    })();
    // this.scene.add(planesMesh);
    this.planesMesh = planesMesh; */

    // bootstrap
    this.listen();
    this.animate();
  }
  setTool(tool) {
    this.tool = tool;

    this.sceneMesh.material.uniforms.uEraser.value = tool === 'eraser' ? 1 : 0;
    this.sceneMesh.material.uniforms.uEraser.needsUpdate = true;

    this.controls.enabled = [
      'camera',
      'segment',
      'plane',
    ].includes(this.tool);
    
    this.overlay.setTool(this.tool);
  }
  listen() {
    const keydown = e => {
      if (!e.repeat) {
        // page up
        if (e.key === 'PageUp') {
          this.sceneMesh.material.uniforms.uColorEnabled.value = 1;
          this.sceneMesh.material.uniforms.uColorEnabled.needsUpdate = true;
          blockEvent(e);
        } else if (e.key === 'PageDown') {
          this.sceneMesh.material.uniforms.uColorEnabled.value = 0;
          this.sceneMesh.material.uniforms.uColorEnabled.needsUpdate = true;
          blockEvent(e);
        }
      }
    };
    document.addEventListener('keydown', keydown);

    const mousemove = e => {
      // set the THREE.js.Raycaster from the mouse event
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.mouse.set(
        (x / rect.width) * 2 - 1,
        -(y / rect.height) * 2 + 1
      );
      this.raycaster.setFromCamera(this.mouse, this.camera);
    };

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', blockEvent);
    canvas.addEventListener('mouseup', blockEvent);
    canvas.addEventListener('mousemove', mousemove);
    canvas.addEventListener('click', blockEvent);
    canvas.addEventListener('wheel', blockEvent);

    const update = e => {
      this.updateOutmeshLayers();
    };
    this.panel.addEventListener('update', update);

    this.addEventListener('destroy', e => {
      document.removeEventListener('keydown', keydown);

      canvas.removeEventListener('mousedown', blockEvent);
      canvas.removeEventListener('mouseup', blockEvent);
      canvas.removeEventListener('mousemove', mousemove);
      canvas.removeEventListener('click', blockEvent);
      canvas.removeEventListener('wheel', blockEvent);

      this.panel.removeEventListener('update', update);
    });
  }
  animate() {
    const _startLoop = () => {
      const _render = () => {
        switch (this.tool) {
          case 'camera': {
            // update orbit controls
            this.controls.update();
            this.camera.updateMatrixWorld();
            break;
          }
          case 'eraser': {
            this.selector.update();
            break;
          }
        }

        // render
        this.renderer.render(this.scene, this.camera);
      };
      let frame;
      const _loop = () => {
        frame = requestAnimationFrame(_loop);
        _render();
      };
      _loop();

      this.addEventListener('destroy', e => {
        cancelAnimationFrame(frame);
      });
    };
    _startLoop();
  }
  async renderOutmesh(panel) {
    const prompt = panel.getData(promptKey);
    if (!prompt) {
      throw new Error('no prompt, so cannot outmesh');
    }

    // render the mask image
    console.time('maskImage');
    let blob;
    let maskBlob;
    let maskImgArrayBuffer;
    {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.classList.add('maskCanvas');
      maskCanvas.width = this.renderer.domElement.width;
      maskCanvas.height = this.renderer.domElement.height;
      maskCanvas.style.cssText = `\
        background: red;
      `;
      const backgroundContext = maskCanvas.getContext('2d');
      backgroundContext.drawImage(this.renderer.domElement, 0, 0);
      // this.element.appendChild(maskCanvas);
      document.body.appendChild(maskCanvas);

      blob = await new Promise((accept, reject) => {
        maskCanvas.toBlob(blob => {
          accept(blob);
        });
      });
      maskBlob = blob; // same as blob
      maskImgArrayBuffer = await blob.arrayBuffer();
      // const maskImg = await blob2img(maskBlob);
    }
    console.timeEnd('maskImage');

    // edit the image
    console.time('editImg');
    let editedImgBlob;
    let editedImgArrayBuffer;
    let editedImg;
    {
      editedImgBlob = await imageAiClient.editImgBlob(blob, maskBlob, prompt);
      editedImgArrayBuffer = await editedImgBlob.arrayBuffer();
      editedImg = await blob2img(editedImgBlob);
      editedImg.classList.add('editImg');
      // this.element.appendChild(editedImg);
      document.body.appendChild(editedImg);
    }
    console.timeEnd('editImg');

    // image segmentation
    console.time('imageSegmentation');
    let segmentMask;
    {
      const imageSegmentationSpec = await _getImageSegements(editedImgBlob);
      // console.log('got image segmentation spec', imageSegmentationSpec);
      const {segmentsBlob, boundingBoxLayers} = imageSegmentationSpec;

      const segmentsImageBitmap = await createImageBitmap(segmentsBlob);
      
      {
        const segmentsCanvasMono = segmentsImg2Canvas(segmentsImageBitmap);
        const ctx = segmentsCanvasMono.getContext('2d');

        const imageData = ctx.getImageData(0, 0, segmentsCanvasMono.width, segmentsCanvasMono.height);
        const {data} = imageData;
        segmentMask = new Int32Array(data.byteLength / Int32Array.BYTES_PER_ELEMENT);
        for (let i = 0; i < segmentMask.length; i++) {
          const r = data[i * 4 + 0];
          segmentMask[i] = r;
        }
      }

      {
        const segmentsCanvasColor = segmentsImg2Canvas(segmentsImageBitmap, {
          color: true,
        });
        segmentsCanvasColor.classList.add('imageSegmentationCanvas2');
        segmentsCanvasColor.style.cssText = `\
          background-color: red;
        `;
        document.body.appendChild(segmentsCanvasColor);
        const ctx = segmentsCanvasColor.getContext('2d');

        drawLabels(ctx, resizeBoundingBoxLayers(
          boundingBoxLayers,
          segmentsImageBitmap.width,
          segmentsImageBitmap.height,
          segmentsCanvasColor.width,
          segmentsCanvasColor.height
        ));
      }
    }
    console.timeEnd('imageSegmentation');

    // get point cloud
    console.time('pointCloud');
    let pointCloudHeaders;
    let pointCloudArrayBuffer;
    {
      const pc = await getPointCloud(editedImgBlob);
      pointCloudHeaders = pc.headers;
      pointCloudArrayBuffer = pc.arrayBuffer;
      // const pointCloudCanvas = drawPointCloudCanvas(pointCloudArrayBuffer);
      // this.element.appendChild(pointCloudCanvas);
    }
    console.timeEnd('pointCloud');

    // plane detection
    console.time('planeDetection');
    let planesJson;
    let planesMask;
    {
      const depthFloats32Array = getDepthFloatsFromPointCloud(pointCloudArrayBuffer);
      
      const {width, height} = editedImg;
      const planesSpec = await _getPlanesRgbd(width, height, depthFloats32Array);
      planesJson = planesSpec.planesJson;
      planesMask = planesSpec.planesMask;

      const planesCanvas = planesMask2Canvas(planesMask, {
        color: true,
      });
      planesCanvas.classList.add('planeDetectionCanvas');
      planesCanvas.style.cssText = `\
        background-color: red;
      `;
      document.body.appendChild(planesCanvas);
    }
    console.timeEnd('planeDetection');

    // set fov
    console.time('fov');
    {
      this.camera.fov = Number(pointCloudHeaders['x-fov']);
      this.camera.updateProjectionMatrix();
    }
    console.timeEnd('fov');

    // render depth
    console.time('renderDepth');
    let depthFloatImageData;
    {
      const depthMaterial = new THREE.ShaderMaterial({
        uniforms: {
          cameraNear: {
            value: this.camera.near,
            needsUpdate: true,
          },
          cameraFar: {
            value: this.camera.far,
            needsUpdate: true,
          },
        },
        vertexShader: depthVertexShader,
        fragmentShader: depthFragmentShader,
      });
      const depthMesh = this.sceneMesh.clone();
      depthMesh.name = 'depthMesh';
      depthMesh.material = depthMaterial;
      depthMesh.frustumCulled = false;
      const depthScene = new THREE.Scene();
      depthScene.autoUpdate = false;
      depthScene.add(depthMesh);

      const depthRenderTarget = new THREE.WebGLRenderTarget(
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        {
          type: THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
        }
      );

      const _renderOverrideMaterial = (renderTarget) => {
        this.renderer.setRenderTarget(renderTarget);
        // this.scene.overrideMaterial = overrideMaterial;

        this.renderer.clear();
        this.renderer.render(depthScene, this.camera);
        
        // this.scene.overrideMaterial = null;
        
        const imageData = {
          data: new Uint8Array(renderTarget.width * renderTarget.height * 4),
          width: renderTarget.width,
          height: renderTarget.height,
        };
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, renderTarget.width, renderTarget.height, imageData.data);
        this.renderer.setRenderTarget(null);
        return imageData;
      };
      depthFloatImageData = floatImageData(_renderOverrideMaterial(depthRenderTarget)); // viewZ
    }
    console.timeEnd('renderDepth');

    console.time('extractDepths');
    const newDepthFloatImageData = getDepthFloatsFromPointCloud(pointCloudArrayBuffer);
    console.timeEnd('extractDepths');

    // render outline
    console.time('outline');
    const iResolution = new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height);
    let distanceRenderTarget;
    {
      const tempScene = new THREE.Scene();
      tempScene.autoUpdate = false;
      tempScene.add(this.sceneMesh); // note: stealing the scene mesh for a moment

      // We need two render targets to ping-pong in between.  
      const targets = makeFloatRenderTargetSwapChain(this.renderer.domElement.width, this.renderer.domElement.height);

      const jfaOutline = new JFAOutline(targets, iResolution);
      jfaOutline.renderSelected(this.renderer, tempScene, this.camera, targets);
      const outlineUniforms = undefined;
      const distanceIndex = jfaOutline.renderDistanceTex(this.renderer, targets, iResolution, outlineUniforms);
      distanceRenderTarget = targets[distanceIndex];
      // get the image data back out of the render target, as a Float32Array
      const distanceFloatImageData = new Float32Array(distanceRenderTarget.width * distanceRenderTarget.height * 4);
      this.renderer.readRenderTargetPixels(distanceRenderTarget, 0, 0, distanceRenderTarget.width, distanceRenderTarget.height, distanceFloatImageData);

      // output to canvas
      const canvas = document.createElement('canvas');
      canvas.classList.add('outlineCanvas');
      canvas.width = distanceRenderTarget.width;
      canvas.height = distanceRenderTarget.height;
      const context = canvas.getContext('2d');
      const imageData = context.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      // globalThis.distanceU8ImageData = data;
      for (let i = 0; i < distanceFloatImageData.length; i += 4) {
        const r = distanceFloatImageData[i];
        const g = distanceFloatImageData[i+1];
        const b = distanceFloatImageData[i+2];
        const a = distanceFloatImageData[i+3];

        const j = i / 4;
        const x = j % canvas.width;
        const y = Math.floor(j / canvas.width);

        const expectedPoint = new THREE.Vector2(x, y);
        const realPoint = new THREE.Vector2(r, g);
        const d = realPoint.distanceTo(expectedPoint);
        const f = Math.max(1 - d / 512, 0);

        // flip y
        const index = (canvas.height - y - 1) * canvas.width + x;
        data[index*4 + 0] = r / canvas.width * 255 * f;
        data[index*4 + 1] = g / canvas.width * 255 * f;
        data[index*4 + 2] = b / canvas.width * 255 * f;
        data[index*4 + 3] = 255;
      }
      context.putImageData(imageData, 0, 0);
      document.body.appendChild(canvas);

      // done with this, put it back
      this.scene.add(this.sceneMesh);
    }
    console.timeEnd('outline');

    // depth reconstruction
    console.time('reconstructZ');
    let reconstructedDepthFloats;
    {
      const targets = makeFloatRenderTargetSwapChain(this.renderer.domElement.width, this.renderer.domElement.height);

      renderDepthReconstruction(
        this.renderer,
        distanceRenderTarget,
        targets,
        depthFloatImageData,
        newDepthFloatImageData,
        iResolution
      );

      // read the render target
      const writeRenderTarget = targets[0];
      const reconstructedDepthFloatsImageData = new Float32Array(writeRenderTarget.width * writeRenderTarget.height * 4);
      this.renderer.readRenderTargetPixels(writeRenderTarget, 0, 0, writeRenderTarget.width, writeRenderTarget.height, reconstructedDepthFloatsImageData);

      // extract to depth-only
      // flip y
      reconstructedDepthFloats = new Float32Array(reconstructedDepthFloatsImageData.length / 4);
      for (let i = 0; i < reconstructedDepthFloats.length; i++) {
        const j = i * 4;

        const x = i % writeRenderTarget.width;
        let y = Math.floor(i / writeRenderTarget.width);
        y = writeRenderTarget.height - y - 1;
        
        const index = y * writeRenderTarget.width + x;

        reconstructedDepthFloats[index] = reconstructedDepthFloatsImageData[j];
      }
      // globalThis.depthFloatImageData = depthFloatImageData;
      // globalThis.newDepthFloatImageData = newDepthFloatImageData;
      // globalThis.reconstructedDepthFloats = reconstructedDepthFloats;

      // draw to canvas
      const canvas = document.createElement('canvas');
      canvas.classList.add('reconstructionCanvas');
      canvas.width = writeRenderTarget.width;
      canvas.height = writeRenderTarget.height;
      const context = canvas.getContext('2d');
      const imageData = context.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < depthFloatImageData.length; i++) {
        const x = (i % canvas.width);
        const y = Math.floor(i / canvas.width);

        const px = x / canvas.width;
        const py = y / canvas.height;

        // const viewZ = r;
        // const localViewPoint = localVector.set(x / canvas.width, y / canvas.height, viewZ)
        //   .applyMatrix4(this.camera.projectionMatrixInverse);
        // const localViewZ = localViewPoint.z;
        // const localDepthZ = -localViewZ;

        const viewZ = reconstructedDepthFloats[i];
        const worldPoint = setCameraViewPositionFromViewZ(px, py, viewZ, this.camera, localVector);

        const index = y * canvas.width + x;
        data[index*4 + 0] = -worldPoint.z / 30 * 255;
        data[index*4 + 1] = 0;
        data[index*4 + 2] = 0;
        data[index*4 + 3] = 255;
      }
      context.putImageData(imageData, 0, 0);
      document.body.appendChild(canvas);
    }
    console.timeEnd('reconstructZ');

    /* if (!segmentMask) {
      console.warn('missing segment mask 1', segmentMask);
      debugger;
    } */

    // return result
    return {
      maskImg: maskImgArrayBuffer,
      editedImg: editedImgArrayBuffer,
      pointCloudHeaders,
      pointCloud: pointCloudArrayBuffer,
      depthFloatImageData,
      // indexColorsAlphasArray,
      newDepthFloatImageData,
      reconstructedDepthFloats,
      planesJson,
      planesMask,
      segmentMask,
    };
  }
  createOutmeshLayer(layerEntries) {
    // if (!globalThis.outmeshing) {
    //   globalThis.outmeshing = 1;
    // } else {
    //   console.warn('already outmeshing: ' + globalThis.outmeshing);
    //   debugger;
    // }
    const _getLayerEntry = key => layerEntries.find(layerEntry => layerEntry.key.endsWith('/' + key))?.value;
    const maskImg = _getLayerEntry('maskImg');
    const editedImg = _getLayerEntry('editedImg');
    const pointCloudHeaders = _getLayerEntry('pointCloudHeaders');
    const pointCloud = _getLayerEntry('pointCloud');
    const depthFloatImageData = _getLayerEntry('depthFloatImageData');
    // const indexColorsAlphasArray = _getLayerEntry('indexColorsAlphasArray');
    const newDepthFloatImageData = _getLayerEntry('newDepthFloatImageData');
    const reconstructedDepthFloats = _getLayerEntry('reconstructedDepthFloats');
    const planesJson = _getLayerEntry('planesJson');
    const planesMask = _getLayerEntry('planesMask');
    const segmentMask = _getLayerEntry('segmentMask');

    const layerScene = new THREE.Scene();
    layerScene.autoUpdate = false;

    // create background mesh
    console.time('backgroundMesh');
    let backgroundMesh;
    {
      const widthSegments = panelSize - 1;
      const heightSegments = panelSize - 1;
      // geometry is camera-relative
      const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
      pointCloudArrayBufferToPositionAttributeArray(pointCloud, geometry.attributes.position.array, 1 / panelSize);
      // _cutMask(geometry, maskImageData);
      if (!segmentMask) {
        console.warn('missing segment mask 2', segmentMask);
        debugger;
      }
      const segmentSpecs = getMaskSpecsByConnectivity(geometry, segmentMask, this.canvas.width, this.canvas.height);
      let planeSpecs = getMaskSpecsByValue(geometry, planesMask, this.canvas.width, this.canvas.height);
      planeSpecs = zipPlanesSegmentsJson(planeSpecs, planesJson);
      geometry.setAttribute('segment', new THREE.BufferAttribute(segmentSpecs.array, 1));
      geometry.setAttribute('segmentColor', new THREE.BufferAttribute(segmentSpecs.colorArray, 3));
      geometry.setAttribute('plane', new THREE.BufferAttribute(planeSpecs.array, 1));
      geometry.setAttribute('planeColor', new THREE.BufferAttribute(planeSpecs.colorArray, 3));
      geometry.computeVertexNormals();

      const material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.8,
      });
      backgroundMesh = new THREE.Mesh(geometry, material);
      backgroundMesh.name = 'backgroundMesh';
      backgroundMesh.position.copy(this.camera.position);
      backgroundMesh.quaternion.copy(this.camera.quaternion);
      backgroundMesh.scale.copy(this.camera.scale);
      backgroundMesh.matrix.copy(this.camera.matrix);
      backgroundMesh.matrixWorld.copy(this.camera.matrixWorld);
      backgroundMesh.frustumCulled = false;
      backgroundMesh.segmentSpecs = segmentSpecs;
      backgroundMesh.planeSpecs = planeSpecs;

      layerScene.add(backgroundMesh);
    }
    console.timeEnd('backgroundMesh');

    console.time('reconstructZ');
    {
      // render an instanced cubes mesh to show the depth
      // const depthCubesGeometry = new THREE.BoxBufferGeometry(1, 1, 1);
      const depthCubesGeometry = new THREE.BoxBufferGeometry(0.01, 0.01, 0.01);
      const depthCubesMaterial = new THREE.MeshPhongMaterial({
        color: 0x00FFFF,
      });
      const depthCubesMesh = new THREE.InstancedMesh(depthCubesGeometry, depthCubesMaterial, newDepthFloatImageData.length);
      depthCubesMesh.name = 'depthCubesMesh';
      depthCubesMesh.frustumCulled = false;
      layerScene.add(depthCubesMesh);

      // set the matrices by projecting the depth from the perspective camera
      const depthRenderSkipRatio = 8;
      depthCubesMesh.count = 0;
      for (let i = 0; i < newDepthFloatImageData.length; i += depthRenderSkipRatio) {
        const x = (i % this.renderer.domElement.width) / this.renderer.domElement.width;
        let y = Math.floor(i / this.renderer.domElement.width) / this.renderer.domElement.height;
        y = 1 - y;

        const viewZ = reconstructedDepthFloats[i];
        const worldPoint = setCameraViewPositionFromViewZ(x, y, viewZ, this.camera, localVector);
        const target = worldPoint.applyMatrix4(this.camera.matrixWorld);

        localMatrix.makeTranslation(target.x, target.y, target.z);
        depthCubesMesh.setMatrixAt(i / depthRenderSkipRatio, localMatrix);
        depthCubesMesh.count++;
      }
      depthCubesMesh.instanceMatrix.needsUpdate = true;
    }
    console.timeEnd('reconstructZ');

    // console.time('cutDepth');
    // // const wrappedPositions = geometry.attributes.position.array.slice();
    // _cutDepth(geometry, depthFloatImageData);
    // console.timeEnd('cutDepth');

    console.time('backgroundMesh2');
    {
      // copy the geometry, including the attributes
      const {geometry} = backgroundMesh;
      const geometry2 = geometry.clone();
      const material2 = new THREE.MeshPhongMaterial({
        color: 0x0000ff,
        transparent: true,
        opacity: 0.4,
      });
      const backgroundMesh2 = new THREE.Mesh(geometry2, material2);
      backgroundMesh2.name = 'backgroundMesh2';
      backgroundMesh2.position.copy(this.camera.position);
      backgroundMesh2.quaternion.copy(this.camera.quaternion);
      backgroundMesh2.scale.copy(this.camera.scale);
      backgroundMesh2.matrix.copy(this.camera.matrix);
      backgroundMesh2.matrixWorld.copy(this.camera.matrixWorld);
      backgroundMesh2.frustumCulled = false;
      
      layerScene.add(backgroundMesh2);
    }
    console.timeEnd('backgroundMesh2');

    return layerScene;
  }
  updateOutmeshLayers() {
    const layers = this.panel.getDataLayersMatchingSpec(layer2Specs);

    // console.log('update outmesh layers', layers.length, this.layerScenes.length);

    const _addNewLayers = () => {
      const startLayer = 2;
      for (let i = startLayer; i < layers.length; i++) {
        let layerScene = this.layerScenes[i];
        if (!layerScene) {
          const layerDatas = layers[i];
          // console.log ('pre add layer scene', i, layerDatas);
          layerScene = this.createOutmeshLayer(layerDatas);
          // console.log('add layer scene', i, layerScene);
          this.scene.add(layerScene);
          this.layerScenes[i] = layerScene;
        }
      }
    };
    _addNewLayers();

    const _removeOldLayers = () => {
      for (let i = layers.length; i < this.layerScenes.length; i++) {
        const layerScene = this.layerScenes[i];
        // console.log('remove layer scene', i, layerScene);
        this.scene.remove(layerScene);
      }
      // console.log('set layer scenes', layers.length);
      this.layerScenes.length = layers.length;
    };
    _removeOldLayers();

    // console.log('ending layer scenes length', this.layerScenes.length);
  }
  destroy() {
    this.dispatchEvent(new MessageEvent('destroy'));
  }
}

//

/* const _getPlanesRansac = async points => {
  console.time('ransac');
  const res = await fetch(`https://depth.webaverse.com/ransac?n=${8}&threshold=${0.1}&init_n=${1500}`, {
    method: 'POST',
    body: points,
  });
  if (res.ok) {
    const planesJson = await res.json();
    console.timeEnd('ransac');
    return planesJson;
  } else {
    console.timeEnd('ransac');
    throw new Error('failed to detect planes');
  }
}; */
const _getPlanesRgbd = async (width, height, depthFloats32Array) => {
  const header = Int32Array.from([width, height]);

  const requestBlob = new Blob([header, depthFloats32Array], {
    type: 'application/octet-stream',
  });

  const minSupport = 30000;
  const res = await fetch(`https://depth.webaverse.com/planeDetection?minSupport=${minSupport}`, {
    method: 'POST',
    body: requestBlob,
  });
  if (res.ok) {
    const planesArrayBuffer = await res.arrayBuffer();
    const dataView = new DataView(planesArrayBuffer);
    
    // parse number of planes
    let index = 0;
    const numPlanes = dataView.getUint32(index, true);
    index += Uint32Array.BYTES_PER_ELEMENT;

    /* if (numPlanes > 512) {
      console.warn('too many planes', numPlanes);
      debugger;
    } */
    
    // parse the planes
    const planesJson = [];
    for (let i = 0; i < numPlanes; i++) {
      try {
        const normal = new Float32Array(planesArrayBuffer, index, 3);
        index += Float32Array.BYTES_PER_ELEMENT * 3;
        const center = new Float32Array(planesArrayBuffer, index, 3);
        index += Float32Array.BYTES_PER_ELEMENT * 3;
        const numVertices = dataView.getUint32(index, true);
        index += Uint32Array.BYTES_PER_ELEMENT;
        const distanceSquaredF = new Float32Array(planesArrayBuffer, index, 1);
        index += Float32Array.BYTES_PER_ELEMENT;
        
        // console.log('plane', i, normal, center, numVertices, distanceSquaredF);
        const planeJson = {
          normal,
          center,
          numVertices,
          distanceSquaredF,
        };
        planesJson.push(planeJson);
      } catch(err) {
        console.warn('fail', err.stack);
        debugger;
      }
    }

    // the remainder is a Int32Array(width * height) of plane indices
    const planesMask = new Int32Array(planesArrayBuffer, index);
    index += Int32Array.BYTES_PER_ELEMENT * planesMask.length;
    /* if (planesMask.length !== width * height) {
      throw new Error('plane indices length mismatch');
    } */

    return {
      planesJson,
      planesMask,
    };
  } else {
    throw new Error('failed to detect planes');
  }
};
const _getImageSegements = async imgBlob => {
  const res = await fetch(`https://mask2former.webaverse.com/predict`, {
    method: 'POST',
    body: imgBlob,
  });
  if (res.ok) {
    const segmentsBlob = await res.blob();
    const resHeaders = Object.fromEntries(res.headers.entries());

    const boundingBoxLayers = JSON.parse(resHeaders['x-bounding-boxes']);

    return {
      segmentsBlob,
      boundingBoxLayers,
    };
  } else {
    throw new Error('failed to detect image segments');
  }
};

//

const _getPredictedHeight = async blob => {
  const fd = new FormData();
  fd.append('question', 'in feet, how high up is this?');
  fd.append('file', blob);
  fd.append('task', 'vqa');
  const res = await fetch(`https://blip.webaverse.com/upload`, {
    method: 'post',
    body: fd,
  });
  const j = await res.json();
  const {Answer} = j;
  const f = parseFloat(Answer);
  if (!isNaN(f)) {
    return f;
  } else {
    return null;
  }
};
const _getImageCaption = async blob => {
  const fd = new FormData();
  fd.append('file', blob);
  fd.append('task', 'image_captioning');
  const res = await fetch(`https://blip.webaverse.com/upload`, {
    method: 'post',
    body: fd,
  });
  const j = await res.json();
  const {Caption} = j;
  return Caption;
};

//

const _resizeFile = async file => {
  // read the image
  const image = await new Promise((accept, reject) => {
    const img = new Image();
    img.onload = () => {
      accept(img);
      cleanup();
    };
    img.onerror = err => {
      reject(err);
      cleanup();
    };
    img.crossOrigin = 'Anonymous';
    const u = URL.createObjectURL(file);
    img.src = u;
    const cleanup = () => {
      URL.revokeObjectURL(u);
    };
  });

  // if necessary, resize the image via contain mode
  if (image.width !== 1024 || image.height !== 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    // ctx.fillStyle = 'white';
    // ctx.fillRect(0, 0, 1024, 1024);
    const sx = Math.max(0, (image.width - image.height) / 2);
    const sy = Math.max(0, (image.height - image.width) / 2);
    const sw = Math.min(image.width, image.height);
    const sh = Math.min(image.width, image.height);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 1024, 1024);
    file = await new Promise((accept, reject) => {
      canvas.toBlob(blob => {
        accept(blob);
      });
    });
  }
  return file;
};

//

async function compileVirtualScene(arrayBuffer) {
  // color
  const blob = new Blob([arrayBuffer], {
    type: 'image/png',
  });
  const img = await blob2img(blob);
  img.classList.add('img');
  // document.body.appendChild(img);
  
  // image segmentation
  console.time('imageSegmentation');
  let segmentMask;
  {
    const imageSegmentationSpec = await _getImageSegements(blob);
    // console.log('got image segmentation spec', imageSegmentationSpec);
    const {segmentsBlob, boundingBoxLayers} = imageSegmentationSpec;

    const segmentsImageBitmap = await createImageBitmap(segmentsBlob);
    
    {
      const segmentsCanvasMono = segmentsImg2Canvas(segmentsImageBitmap);
      const ctx = segmentsCanvasMono.getContext('2d');

      const imageData = ctx.getImageData(0, 0, segmentsCanvasMono.width, segmentsCanvasMono.height);
      const {data} = imageData;
      segmentMask = new Int32Array(data.byteLength / Int32Array.BYTES_PER_ELEMENT);
      for (let i = 0; i < segmentMask.length; i++) {
        const r = data[i * 4 + 0];
        segmentMask[i] = r;
      }
    }

    {
      const segmentsCanvasColor = segmentsImg2Canvas(segmentsImageBitmap, {
        color: true,
      });
      segmentsCanvasColor.classList.add('imageSegmentationCanvas2');
      segmentsCanvasColor.style.cssText = `\
        background-color: red;
      `;
      document.body.appendChild(segmentsCanvasColor);
      const ctx = segmentsCanvasColor.getContext('2d');

      drawLabels(ctx, resizeBoundingBoxLayers(
        boundingBoxLayers,
        segmentsImageBitmap.width,
        segmentsImageBitmap.height,
        segmentsCanvasColor.width,
        segmentsCanvasColor.height
      ));
    }
  }
  console.timeEnd('imageSegmentation');

  // point cloud reconstruction
  console.time('pointCloud');
  const {
    headers: pointCloudHeaders,
    arrayBuffer: pointCloudArrayBuffer,
  } = await getPointCloud(blob);
  console.timeEnd('pointCloud');

  // plane detection
  console.time('planeDetection');
  let planesJson;
  let planesMask;
  {
    const depthFloats32Array = getDepthFloatsFromPointCloud(pointCloudArrayBuffer);
    
    const {width, height} = img;
    const planesSpec = await _getPlanesRgbd(width, height, depthFloats32Array);
    // console.log('got planes spec', planesSpec);
    planesJson = planesSpec.planesJson;
    planesMask = planesSpec.planesMask;

    // if (!planesMask) {
    //   console.warn('no planes mask');
    //   debugger;
    // }

    const planesCanvas = planesMask2Canvas(planesMask, {
      color: true,
    });
    planesCanvas.classList.add('planeDetectionCanvas');
    planesCanvas.style.cssText = `\
      background-color: red;
    `;
    document.body.appendChild(planesCanvas);
  }
  console.timeEnd('planeDetection');

  // query the height
  const predictedHeight = await _getPredictedHeight(blob);
  // console.log('got predicted height', predictedHeight);

  // return result
  return {
    segmentMask,
    // labelImageData,
    pointCloudHeaders,
    pointCloud: pointCloudArrayBuffer,
    // boundingBoxLayers,
    // planeMatrices,
    planesJson,
    planesMask,
    predictedHeight,
  };
}

//

export class Panel extends EventTarget {
  constructor(data = []) {
    super();

    this.id = makeId();
    this.#data = data;

    this.runningTasks = [];
    this.abortController = new AbortController();
  }
  #data;

  getDatas() {
    return this.#data;
  }
  getDataSpec(key) {
    return this.#data.find(item => item.key === key);
  }
  getData(key) {
    const item = this.getDataSpec(key);
    return item?.value;
  }
  setData(key, value, type) {
    let item = this.getDataSpec(key);
    if (!item) {
      item = {
        key,
        type,
        value,
      };
      this.#data.push(item);
    } else {
      item.value = value;
    }
    this.dispatchEvent(new MessageEvent('update', {
      data: {
        key,
      },
    }));
  }
  deleteData(key) {
    const index = this.#data.findIndex(item => item.key === key);
    if (index !== -1) {
      this.#data.splice(index, 1);
    }
    this.dispatchEvent(new MessageEvent('update', {
      data: {
        key,
      },
    }));
  }
  hasData(key) {
    return this.#data.some(item => item.key === key);
  }
  hasDataMatch(regex) {
    return this.#data.some(item => regex.test(item.key));
  }
  getDataLayersMatchingSpec(layersSpecs) {
    return this.getDataLayersMatchingSpecs([layersSpecs]);
  }
  getDataLayersMatchingSpecs(layersSpecsArray) {
    const maxLayers = 10;
    const layers = [];
    for (let i = 0; i < maxLayers; i++) {
      const layerDatas = this.getDatas().filter(({key}) => {
        return key.startsWith('layer' + i + '/');
      });
      if (layersSpecsArray.some(layersSpecs =>
        layersSpecs.every(spec => {
          return layerDatas.some(({key}) => key.endsWith('/' + spec.name));
        })
      )) {
        layers[i] = layerDatas;
      }
    }
    return layers;
  }

  isBusy() {
    return this.runningTasks.length > 0;
  }
  isEmpty() {
    return !this.hasData(mainImageKey);
  }
  getBusyMessage() {
    if (this.runningTasks.length > 0) {
      return this.runningTasks[0].message;
    } else {
      return '';
    }
  }
  getDimension() {
    return this.hasDataMatch(/^layer1/) ? 3 : 2;
  }

  async setFile(file, prompt) {
    file = await _resizeFile(file, panelSize, panelSize);
    (async () => {
      const arrayBuffer = await file.arrayBuffer();
      this.setData(mainImageKey, arrayBuffer, 'imageFile');
    })();
    (async () => {
      if (!prompt) {
        prompt = await _getImageCaption(file);
      }
      this.setData(promptKey, prompt, 'text');
    })();
  }
  async setFromPrompt(prompt) {
    await this.task(async ({signal}) => {
      const blob = await imageAiClient.createImageBlob(prompt, {signal});
      await this.setFile(blob, prompt);
    }, 'generating image');
  }

  async compile() {
    await this.task(async ({signal}) => {
      const image = this.getData(mainImageKey);
      const compileResult = await compileVirtualScene(image);
      // console.log('got compile result', compileResult);

      for (const {name, type} of layer1Specs) {
        this.setData('layer1/' + name, compileResult[name], type);
      }
    }, 'compiling');
  }
  async outmesh(renderer) {
    // console.log('outmesh start', renderer);
    try {
      const outmeshResult = await renderer.renderOutmesh(this);

      for (const {name, type} of layer2Specs) {
        this.setData('layer2/' + name, outmeshResult[name], type);
      }
    } catch(err) {
      console.warn(err);
    }
  }

  createRenderer(canvas, opts) {
    return new PanelRenderer(canvas, this, opts);
  }

  async task(fn, message) {
    const {signal} = this.abortController;

    const task = {
      message,
    };
    this.runningTasks.push(task);

    this.dispatchEvent(new MessageEvent('busyupdate', {
      data: {
        busy: this.isBusy(),
        message: this.getBusyMessage(),
      },
    }));

    try {
      await fn({
        signal,
      });
    } finally {
      const index = this.runningTasks.indexOf(task);
      this.runningTasks.splice(index, 1);
      
      this.dispatchEvent(new MessageEvent('busyupdate', {
        data: {
          busy: this.isBusy(),
          message: this.getBusyMessage(),
        },
      }));
    }
  }
  cancel() {
    this.abortController.abort(abortError);
  }
  destroy() {
    this.cancel();
  }
}

//

export class Storyboard extends EventTarget {
  constructor() {
    super();

    this.panels = [];
  }
  #addPanelInternal(panel) {
    this.panels.push(panel);
    this.dispatchEvent(new MessageEvent('paneladd', {
      data: {
        panel,
      },
    }));
  }
  #removePanelInternal(panel) {
    const i = this.panels.indexOf(panel);
    if (i !== -1) {
      this.panels.splice(i, 1);
      panel.destroy();

      this.dispatchEvent(new MessageEvent('panelremove', {
        data: {
          panel,
        },
      }));
    } else {
      throw new Error('panel not found');
    }
  }
  addPanel(data) {
    const panel = new Panel(data);
    this.#addPanelInternal(panel);
    return panel;
  }
  addPanelFromPrompt(prompt) {
    const panel = new Panel();
    panel.task(async ({signal}) => {
      const blob = await imageAiClient.createImageBlob(prompt, {signal});
      await panel.setFile(blob, prompt);
    }, 'generating image');
    this.#addPanelInternal(panel);
    return panel;
  }
  addPanelFromFile(file) {
    const panel = new Panel();
    panel.task(async ({signal}) => {
      await panel.setFile(file);
    }, 'adding image');
    this.#addPanelInternal(panel);
    return panel;
  }
  removePanel(panel) {
    this.#removePanelInternal(panel);
  }
}