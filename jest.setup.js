// Reanimated 4.7 test helpers (its resolver routes the web build under Jest).
require('react-native-reanimated').setUpTests();

// react-native-gesture-handler 3.x installs UI-runtime bindings when its
// reanimated wrapper module is first imported:
//   installUIRuntimeBindings(Worklets.getUIRuntimeHolder)
// Under Jest, worklets resolves to its web build (see the reanimated jest
// resolver), which deliberately has no UI runtime and throws
// "`getUIRuntimeHolder` is not supported on web". Supply an inert holder so the
// install path completes; gestures themselves are never run on a UI runtime in
// tests. The rest of the module is the real implementation.
jest.mock('react-native-worklets', () => {
  const actual = jest.requireActual('react-native-worklets');
  return {
    ...actual,
    getUIRuntimeHolder: () => ({}),
  };
});

require('react-native-gesture-handler/jestSetup');

// gesture-handler 3.x throws in __DEV__ when a GestureDetector renders without a
// GestureHandlerRootView ancestor. The app provides the root view in
// app/_layout.tsx; component-level tests render subtrees directly with
// react-test-renderer, so mark the context as already provided. Both the source
// and the compiled entry points are mocked because Jest can resolve either.
jest.mock('react-native-gesture-handler/src/GestureHandlerRootViewContext', () => {
  const React = require('react');
  return { __esModule: true, default: React.createContext(true) };
});
jest.mock('react-native-gesture-handler/lib/module/GestureHandlerRootViewContext', () => {
  const React = require('react');
  return { __esModule: true, default: React.createContext(true) };
});

// `expo-notifications` 58 ships `.native` entry points that call
// `requireOptionalNativeModule(...)` as a free variable. `scripts/patch-expo-notifications.js`
// (wired to postinstall) imports it explicitly; no global shim is installed here so a
// missing patch fails loudly in tests instead of being masked.

// React 19 schedules work on `setImmediate`. Suites that render with
// `react-test-renderer` directly (rather than RNTL, which auto-unmounts) can
// leave a render or an animation callback queued when the test ends; it then
// fires after Jest tore the module registry down and crashes the worker with
// "trying to require a file after the Jest environment has been torn down".
// Let one macrotask drain while the environment is still alive. The reference is
// captured before any suite installs fake timers, otherwise the drain itself
// would hang until the 5s hook timeout.
const drainSetImmediate = globalThis.setImmediate;
afterEach(async () => {
  if (typeof drainSetImmediate !== 'function') return;
  await new Promise((resolve) => drainSetImmediate(resolve));
});

// Font loading is not observable under react-test-renderer. In SDK 58 expo-font
// resolves `require`d font files through `Asset.fromModule`, but the Jest asset
// transformer emits the numeric id `1` and expo-asset reads the *real*
// `AssetRegistry` exported by react-native 0.88 (jest-expo's registry mock only
// intercepts the `react-native/asset-registry` entry point). That made every
// `@expo/vector-icons` mount throw "Module \"1\" is missing from the asset
// registry". Resolve loads without touching the registry instead of weakening
// any assertion: the rest of expo-font (useFonts, isLoaded, events) stays real.
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return {
    ...actual,
    loadAsync: jest.fn(async () => {}),
    isLoaded: jest.fn(() => true),
  };
});
