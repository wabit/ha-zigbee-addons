const timestamp = () => new Date().toISOString();

export function info(msg: string) {
  console.log(`[${timestamp()}] ℹ️  ${msg}`);
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

export function progress(device: string, percent: number) {
  process.stdout.write(
    `\r[${timestamp()}] 🔄 ${device}: ${percent.toFixed(1)}%   `
  );
}
