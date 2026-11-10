const path = require('path')
const outputPath = path.join(__dirname, 'dist')
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = [
  {
    target: 'electron-preload',
    mode: 'production',
    entry: {
      preload: './bridge/preload.js'
    },
    output: {
      path: outputPath,
      filename: '[name].js'
    },
    externals: {
      electron: 'commonjs electron'
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: [['@babel/preset-env', { targets: { electron: '34' } }]]
            }
          }
        }
      ]
    }
  },
  {
    target: 'web',
    mode: 'production',
    resolve: {
      extensions: ['.js', '.jsx']
    },
    entry: {
      index: './src/index.js'
    },
    output: {
      path: outputPath,
      filename: '[name].js'
    },
    plugins: [
      new CopyWebpackPlugin({ patterns: [{ from: 'public', to: '.', noErrorOnMissing: true }] })
    ],
    performance: {
      hints: false
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: [
                ['@babel/preset-env', { targets: { chrome: '132' }, modules: false }],
                ['@babel/preset-react', { runtime: 'automatic' }]
              ]
            }
          }
        },
        {
          test: /\.(less|css)$/,
          use: [
            { loader: 'style-loader' },
            { loader: 'css-loader', options: { url: false } },
            { loader: 'less-loader' }
          ]
        },
        {
          test: /\.wasm$/,
          type: 'asset/resource'
        }
      ]
    }
  }
]
