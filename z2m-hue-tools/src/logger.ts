const timestamp = () => new Date().toISOString();

let debugEnabled = false;

export function setDebug(enabled: boolean) {
  debugEnabled = enabled;
}

export function info(msg: string) {
  console.log(`[${timestamp()}] ℹ️  ${msg}`);
}

export function debug(msg: string) {
  if (debugEnabled) {
    console.log(`[${timestamp()}] 🔍 ${msg}`);
  }
}

export function success(msg: string) {
  console.log(`[${timestamp()}] ✅ ${msg}`);
}

export function warn(msg: string) {
  console.warn(`[${timestamp()}] ⚠️  ${msg}`);
}

export function error(msg: string) {
  console.error(`[${timestamp()}] ❌ ${msg}`);
}
