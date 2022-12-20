
const pointcloudStride = 4 + 4 + 4 + 1 + 1 + 1;


/**
 * Destructure a point cloud into its component parts.
 */
export function destructurePointCloud( arrayBuffer) {
  const numPoints = arrayBuffer.byteLength / pointcloudStride;
  const points = new Float32Array(numPoints * 3);
  const colors = new Uint8Array(numPoints * 3);
  const intensities = new Uint8Array(numPoints);
  const classifications = new Uint8Array(numPoints);
  const dataView = new DataView(arrayBuffer);

  let pointIndex = 0;
  let colorIndex = 0;
  let intensityIndex = 0;
  let classificationIndex = 0;

  for (let i = 0; i < arrayBuffer.byteLength; i += pointcloudStride) {
    points[pointIndex++] = dataView.getFloat32(i, true);
    points[pointIndex++] = dataView.getFloat32(i + 4, true);
    points[pointIndex++] = dataView.getFloat32(i + 8, true);

    colors[colorIndex++] = arrayBuffer[i + 12];
    colors[colorIndex++] = arrayBuffer[i + 13];
    colors[colorIndex++] = arrayBuffer[i + 14];

    intensities[intensityIndex++] = arrayBuffer[i + 15];
    classifications[classificationIndex++] = arrayBuffer[i + 16];
  }

  return {
    points: points.buffer,
    colors: colors.buffer,
    intensities: intensities.buffer,
    classifications: classifications.buffer,
  };
}
