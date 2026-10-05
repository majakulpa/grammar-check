/**
 * Keeps the background worker from being evicted while the user is writing.
 *
 * MV3 shuts a service worker down after ~30 seconds idle, and bringing it back
 * means recompiling Harper's 16MB WASM — about 1.5 seconds. Warm, a check takes
 * ~10ms. Without this the user would pay that 1.5s every time they came back to
 * a form after a pause, which reads as the extension being broken.
 *
 * An open port keeps the worker alive, and traffic on it resets the idle timer.
 * The port is held only while a field is focused, so an idle tab lets the worker
 * shut down the way it should.
 */
const PING_MS = 20_000;

let port: chrome.runtime.Port | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

export function holdWorkerAwake(): void {
	if (port) return;

	try {
		port = chrome.runtime.connect({ name: 'keep-alive' });
	} catch {
		// The extension was reloaded or disabled; nothing to keep awake.
		return;
	}

	port.onDisconnect.addListener(() => {
		port = undefined;
		// The worker restarting is normal, so reconnect rather than give up.
		if (timer) {
			clearInterval(timer);
			timer = undefined;
			holdWorkerAwake();
		}
	});

	timer ??= setInterval(() => port?.postMessage('ping'), PING_MS);
}

export function releaseWorker(): void {
	clearInterval(timer);
	timer = undefined;
	port?.disconnect();
	port = undefined;
}
