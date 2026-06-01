import { pluginManager } from "./manager";
import { hapticPlugin } from "./hapticPlugin";
import { syncPlugin } from "./syncPlugin";

// Register default plugins
pluginManager.register(hapticPlugin);
pluginManager.register(syncPlugin);

// Dispatch initial load event
pluginManager.dispatchAppLoad();

export { pluginManager } from "./manager";
export { AppPlugin } from "./types";
export default pluginManager;
