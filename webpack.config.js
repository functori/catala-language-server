const fs = require('fs');
const path = require('path');
const { Compilation, sources } = require('webpack');

class EmitCodiconsCss {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('EmitCodiconsCss', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'EmitCodiconsCss',
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const file = require.resolve('@vscode/codicons/dist/codicon.css');
          compilation.fileDependencies.add(file);
          compilation.emitAsset(
            'codicon.css',
            new sources.RawSource(fs.readFileSync(file))
          );
        }
      );
    });
  }
}

const commonConfig = {
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
};

const extensionConfig = {
  ...commonConfig,
  // we use the node target as we invoke external commands (catala compiler);
  // we might want to look for an alternative solution
  target: 'node',
  entry: {
    extension: './src/extension.ts',
  },
  output: {
    ...commonConfig.output,
    filename: 'extension.js',
    libraryTarget: 'commonjs2', // TODO move to ESM?
  },
  externals: {
    vscode: 'commonjs vscode',
  },
  plugins: [new EmitCodiconsCss()],
};

const uiConfig = {
  ...commonConfig,
  target: 'web',
  entry: {
    ui: {
      import: './src/uiEntryPoint.ts',
      library: {
        name: 'Ui',
        type: 'window', // TODO find something better... this is icky
      },
    },
  },
  output: {
    ...commonConfig.output,
    filename: 'ui.js',
  },
};

module.exports = [extensionConfig, uiConfig];
