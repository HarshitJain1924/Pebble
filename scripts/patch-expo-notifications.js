const fs = require('fs');
const path = require('path');

// 1. Patch warnOfExpoGoPushUsage
const warningFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'warnOfExpoGoPushUsage.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'src', 'warnOfExpoGoPushUsage.ts'),
];

for (const file of warningFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes("throw new Error(message);")) {
      content = content.replace(
        /if\s*\(\s*Platform\.OS\s*===\s*'android'\s*\)\s*\{\s*throw new Error\(message\);\s*\}\s*else if\s*\(\s*__DEV__\s*\)\s*\{\s*didWarn = true;\s*console\.warn\(message\);\s*\}/g,
        'didWarn = true; if (__DEV__) { console.warn(message); }'
      );
      fs.writeFileSync(file, content, 'utf8');
      console.log(`[patch-expo-notifications] Patched ${path.basename(file)} to prevent Expo Go crash.`);
    }
  }
}

// 2. Patch remote push modules that are omitted in Expo Go on Android
const nativeModuleFiles = [
  {
    file: path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'TopicSubscriptionModule.android.js'),
    moduleName: 'ExpoTopicSubscriptionModule',
  },
  {
    file: path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'PushTokenManager.native.js'),
    moduleName: 'ExpoPushTokenManager',
  },
  {
    file: path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'ServerRegistrationModule.native.js'),
    moduleName: 'NotificationsServerRegistrationModule',
  },
];

for (const { file, moduleName } of nativeModuleFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(`requireNativeModule('${moduleName}')`)) {
      content = content.replace(
        "import { requireNativeModule } from 'expo-modules-core';",
        "import { requireOptionalNativeModule } from 'expo-modules-core';"
      ).replace(
        `export default requireNativeModule('${moduleName}');`,
        `export default requireOptionalNativeModule('${moduleName}') ?? {};`
      );
      fs.writeFileSync(file, content, 'utf8');
      console.log(`[patch-expo-notifications] Patched ${path.basename(file)} to use requireOptionalNativeModule.`);
    }
  }
}

// 3. Patch getAllScheduledNotificationsAsync to handle null/undefined from NotificationScheduler
const schedulerFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'getAllScheduledNotificationsAsync.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'src', 'getAllScheduledNotificationsAsync.ts'),
];

for (const file of schedulerFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes("(await NotificationScheduler.getAllScheduledNotificationsAsync()).map")) {
      content = content.replace(
        "(await NotificationScheduler.getAllScheduledNotificationsAsync()).map",
        "((await NotificationScheduler.getAllScheduledNotificationsAsync()) ?? []).map"
      );
      fs.writeFileSync(file, content, 'utf8');
      console.log(`[patch-expo-notifications] Patched ${path.basename(file)} to safely fallback to empty array.`);
    }
  }
}

