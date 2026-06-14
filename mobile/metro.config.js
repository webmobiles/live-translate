const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
const appNodeModules = path.resolve(projectRoot, 'node_modules');
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules');

// Watch the entire monorepo so Metro picks up changes in shared/
config.watchFolders = [workspaceRoot];

// Look for modules in both the project's and the workspace root's node_modules
config.resolver.nodeModulesPaths = [
  appNodeModules,
  workspaceNodeModules,
];
config.resolver.extraNodeModules = {
  react: path.resolve(appNodeModules, 'react'),
  'react-dom': path.resolve(appNodeModules, 'react-dom'),
  'react-native': path.resolve(workspaceNodeModules, 'react-native'),
};

// Resolve @live-translate/shared directly to the shared package source
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return {
      filePath: require.resolve(moduleName, { paths: [appNodeModules] }),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    return {
      filePath: require.resolve(moduleName, { paths: [appNodeModules] }),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    return {
      filePath: require.resolve(moduleName, { paths: [workspaceNodeModules] }),
      type: 'sourceFile',
    };
  }
  if (moduleName === '@live-translate/shared') {
    return {
      filePath: path.resolve(workspaceRoot, 'shared/src/index.ts'),
      type: 'sourceFile',
    };
  }
  if (moduleName === '@live-translate/shared/locales') {
    return {
      filePath: path.resolve(workspaceRoot, 'shared/src/locales.ts'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
