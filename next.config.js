/** @type {import('next').NextConfig} */

if (
  process.env.LD_LIBRARY_PATH == null ||
  !process.env.LD_LIBRARY_PATH.includes(
    `${process.env.PWD}/node_modules/canvas/build/Release:`,
  )
) {
  process.env.LD_LIBRARY_PATH = `${
    process.env.PWD
  }/node_modules/canvas/build/Release:${process.env.LD_LIBRARY_PATH || ''}`;
}

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config) => {
    return Object.assign({}, config, {
      /* externals: Object.assign({}, config.externals, {
        fs: 'fs',
      }), */
      module: Object.assign({}, config.module, {
        rules: config.module.rules.concat([
          /* {
            test: /\.md$/,
            loader: 'emit-file-loader',
            options: {
              name: 'dist/[path][name].[ext]',
            },
          }, */
          {
            test: /\.md$/,
            loader: 'raw-loader',
          }
        ]),
      }),
    });
  }
};
export default nextConfig;
// module.exports = nextConfig;