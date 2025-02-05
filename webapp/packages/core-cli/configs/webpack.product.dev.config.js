const { merge } = require('webpack-merge');
const { resolve } = require('path');
const webpack = require('webpack');
const httpProxy = require('http-proxy');
const fs = require('fs');
const { URL } = require('url');

const commonConfig = require('./webpack.config.js');
const main = resolve('src/index.ts');
const sso = require.resolve('@cloudbeaver/plugin-sso/src/index.ts');
const ssoHtmlTemplate = require.resolve('@cloudbeaver/plugin-sso/src/index.html.ejs');
const { getAssets } = require('./webpack.product.utils');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlReplaceWebpackPlugin = require('html-replace-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ReactRefreshPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const HtmlInjectWebpackPlugin = require('./HtmlInjectWebpackPlugin');


const package = require(resolve('package.json'));

const certPath = resolve(__dirname, '../../../../../certs/private.pem');
const keyPath = resolve(__dirname, '../../../../../certs/private.key');
let server = undefined;

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  server = {
    type: 'https',
    options: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
  };
}

module.exports = (env, argv) => {
  const envServer = env.server ?? process.env.server;
  const urlObject = new URL(envServer);

  return merge(commonConfig(env, argv), {
    mode: 'development',
    entry: {
      main,
      sso,
    },
    optimization: {
      minimize: false,
      moduleIds: 'named',
    },
    devServer: {
      allowedHosts: 'all',
      host: '0.0.0.0',
      // port: 8080,
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws',
        overlay: false,
      },
      server,
      proxy: {
        '/api': {
          target: envServer,
        },
        '/api/ws': {
          target: `${urlObject.protocol === 'https:' ? 'wss:' : 'ws:'}//${urlObject.hostname}:${urlObject.port}/api/ws`,
          ws: true,
        },
      },
      onListening: function (devServer, ...args) {
        if (!devServer) {
          throw new Error('webpack-dev-server is not defined');
        }
        const logger = devServer.compiler.getInfrastructureLogger('webpack-dev-server');
        const port = devServer.server.address().port;
        logger.info(`Proxy from http://localhost:8080 to http://127.0.0.1:${port}`);
        httpProxy.createProxyServer({ target:`http://127.0.0.1:${port}` }).listen(8080);
      },
    },
    devtool: 'source-map',
    plugins: [
      new CopyWebpackPlugin({
        patterns: getAssets(package, ''),
      }),
      new webpack.DefinePlugin({
        _VERSION_: JSON.stringify(package.version),
        _DEV_: true,
      }),
      new HtmlWebpackPlugin({
        template: resolve('src/index.html.ejs'),
        inject: 'body',
        chunks: ['main'],
        version: package.version,
        title: package.product?.name,
      }),
      new HtmlWebpackPlugin({
        filename: 'sso.html',
        template: ssoHtmlTemplate,
        inject: 'body',
        chunks: ['sso'],
        version: package.version,
        title: package.product?.name,
      }),
      new HtmlInjectWebpackPlugin({
        body: [{ attributes: { hidden: true }, tagName: 'object', innerHTML: '{STATIC_CONTENT}', voidTag: false }],
      }),
      new HtmlReplaceWebpackPlugin([
        {
          pattern: '{ROOT_URI}',
          replacement: '/',
        },
      ]),
      new webpack.HotModuleReplacementPlugin(),
      new ReactRefreshPlugin(),
    ],
  });
};
