const timestamp = () => new Date().toISOString();

export function info(msg: string) {
  console.log(`[${timestamp()}] ℹ️  ${msg}`);
}

export function warn(msg: string) {
  console.warn(`[${timestamp()}] ⚠️  ${msg}`);
}

export function error(msg: string) {
  console.error(`[${timestamp()}] ❌ ${msg}`);
}
