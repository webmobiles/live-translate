const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Only watch the shared package, not the entire monorepo root
config.watchFolders = [path.resolve(workspaceRoot, 'shared')];

// Resolve @live-translate/shared directly to source
// For all other modules, fall through to Metro's default resolver
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@live-translate/shared') {
    return { filePath: path.resolve(workspaceRoot, 'shared/src/index.ts'), type: 'sourceFile' };
  }
  if (moduleName === '@live-translate/shared/locales') {
    return { filePath: path.resolve(workspaceRoot, 'shared/src/locales.ts'), type: 'sourceFile' };
  }
  // Use Metro's default resolver for everything else
  return context.resolveRequest(context, moduleName, platform);
};

// Ensure TypeScript files inside node_modules are resolvable
// (Expo SDK 54 ships TypeScript source with "main": "src/Expo.ts")
if (!config.resolver.sourceExts.includes('ts')) {
  config.resolver.sourceExts.unshift('ts', 'tsx');
}

module.exports = withNativeWind(config, { input: './global.css' });
