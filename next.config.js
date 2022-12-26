/** @type {import('next').NextConfig} */

const securityHeaders = [
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Embedder-Policy',
    value: 'require-corp',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'cross-origin',
  },
];

const nextConfig = {
  reactStrictMode: true,
  // swcMinify: true,
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  webpack(config) {
    return Object.assign({}, config, {
      // target: ["web", "es2020"],
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
        ])
      }),
    });
  },
  // experimental: {
  //   legacyBrowsers: false,
  //   browsersListForSwc: true,
  // },
};
export default nextConfig;
// module.exports = nextConfig;
