// Polyfill Web/JS APIs the SDK relies on (must run before any SDK imports).
import "@zama-fhe/react-native-sdk/polyfills";

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
