module.exports = function (api) {
  api.cache(true);
  const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin');

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      expoRouterBabelPlugin,
      'react-native-reanimated/plugin',
    ],
  };
};
