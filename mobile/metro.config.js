const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so Metro picks up changes in shared/
config.watchFolders = [workspaceRoot];

// Look for modules in both the project's and the workspace root's node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Resolve @live-translate/shared directly to the shared package source
config.resolver.resolveRequest = (context, moduleName, platform) => {
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
