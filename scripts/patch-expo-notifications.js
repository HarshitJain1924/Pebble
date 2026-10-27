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

// 3. SDK 58 ships three `.native` entry points that call
//    `requireOptionalNativeModule(...)` as a free variable instead of importing
//    it. Nothing defines that free variable in the app runtime, so importing
//    expo-notifications crashes with
//    "[ReferenceError: Property 'requireOptionalNativeModule' doesn't exist]" and
//    every export after that line (SchedulableTriggerInputTypes,
//    cancelScheduledNotificationAsync, …) stays undefined. Jest hit the same
//    failure, which is why this is repaired on disk rather than shimmed in
//    tests. `expo` re-exports the helper, so extend the existing import when
//    present and otherwise add one.
const nativeGlobalFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build'),
  path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'src'),
];

const usesBareOptionalNativeModule = (content) =>
  /(^|[^.\w])requireOptionalNativeModule\(/m.test(content) &&
  !/import\s*\{[^}]*requireOptionalNativeModule[^}]*\}\s*from/.test(content);

for (const dir of nativeGlobalFiles) {
  if (!fs.existsSync(dir)) continue;

  for (const fileName of fs.readdirSync(dir)) {
    if (!/\.(js|ts)$/.test(fileName)) continue;

    const file = path.join(dir, fileName);
    let content = fs.readFileSync(file, 'utf8');
    if (!usesBareOptionalNativeModule(content)) continue;

    const expoImport = /import\s*\{([^}]*)\}\s*from\s*'expo';/;
    if (expoImport.test(content)) {
      content = content.replace(
        expoImport,
        (_match, names) => `import {${names.trimEnd()}, requireOptionalNativeModule } from 'expo';`
      );
    } else {
      content = `import { requireOptionalNativeModule } from 'expo';\n${content}`;
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(
      `[patch-expo-notifications] Imported requireOptionalNativeModule in ${fileName}.`
    );
  }
}

// 4. Patch getAllScheduledNotificationsAsync to handle null/undefined from NotificationScheduler
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

// 5. Patch ExpoApplication to use requireOptionalNativeModule to prevent startup crash when native module is missing
const applicationFiles = [
  path.join(__dirname, '..', 'node_modules', 'expo-application', 'build', 'ExpoApplication.js'),
  path.join(__dirname, '..', 'node_modules', 'expo-application', 'src', 'ExpoApplication.ts'),
];

for (const file of applicationFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes("requireNativeModule('ExpoApplication')")) {
      content = content
        .replace(
          "import { requireNativeModule } from 'expo';",
          "import { requireOptionalNativeModule } from 'expo';"
        )
        .replace(
          "export default requireNativeModule('ExpoApplication');",
          "export default requireOptionalNativeModule('ExpoApplication') ?? {};"
        );
      fs.writeFileSync(file, content, 'utf8');
      console.log(`[patch-expo-notifications] Patched ${path.basename(file)} to use requireOptionalNativeModule.`);
    }
  }
}


