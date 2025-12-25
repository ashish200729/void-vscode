/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContentsView } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { IEmbeddedBrowserService, BrowserSessionOptions } from '../common/embeddedBrowser.js';
import { BrowserError, BrowserErrorCode } from '../common/embeddedBrowserErrors.js';
import { BrowserValidator } from '../common/embeddedBrowserValidation.js';
import { AXNode, convertToReadibleFormat } from '../../webContentExtractor/electron-main/cdpAccessibilityDomain.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { ICodeWindow } from '../../window/electron-main/window.js';

interface BrowserSession {
	view: WebContentsView;
	parentWindow: ICodeWindow | null;
	options: BrowserSessionOptions;
	bounds: { x: number; y: number; width: number; height: number };
	// Lifecycle management
	isDestroying: boolean;
	operationLock: Promise<void> | null;
	createdAt: number;
	lastActiveAt: number;
	// Event handlers for cleanup
	eventHandlers: {
		navHandler: (event: any, url: string) => void;
		loadHandler: () => void;
		consoleHandler: (event: any, level: number, message: string) => void;
	};
	// CDP document cache for performance
	documentCache?: { root: any; timestamp: number };
}

export class EmbeddedBrowserService extends Disposable implements IEmbeddedBrowserService {
	declare readonly _serviceBrand: undefined;

	private readonly sessions = new Map<string, BrowserSession>();

	// Event emitters
	private readonly _onNavigate = this._register(new Emitter<{ sessionId: string; url: string }>());
	readonly onNavigate = this._onNavigate.event;

	private readonly _onLoad = this._register(new Emitter<{ sessionId: string; url: string }>());
	readonly onLoad = this._onLoad.event;

	private readonly _onConsoleMessage = this._register(new Emitter<{ sessionId: string; type: string; text: string }>());
	readonly onConsoleMessage = this._onConsoleMessage.event;

	private readonly _onError = this._register(new Emitter<{ sessionId: string; error: BrowserError }>());
	readonly onError = this._onError.event;

	private readonly _onSessionDestroyed = this._register(new Emitter<string>());
	readonly onSessionDestroyed = this._onSessionDestroyed.event;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService
	) {
		super();
	}

	async createSession(sessionId: string, options: BrowserSessionOptions = {}): Promise<void> {
		// Check if session already exists
		const existingSession = this.sessions.get(sessionId);
		if (existingSession) {
			// Guard against concurrent access to destroying session
			if (existingSession.isDestroying) {
				throw new BrowserError(
					`Session ${sessionId} is being destroyed`,
					sessionId,
					BrowserErrorCode.SESSION_DESTROYING
				);
			}
			// Session exists and is valid, just navigate if URL provided
			if (options.url) {
				await this.navigate(sessionId, options.url);
			}
			// Make sure to show the view if visible
			if (options.visible !== false) {
				await this.showBrowser(sessionId);
			}
			return;
		}

		const width = options.width ?? 800;
		const height = options.height ?? 600;

		// Create WebContentsView
		const view = new WebContentsView({
			webPreferences: {
				javascript: options.javascript ?? true,
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: false, // Disable sandbox to allow CDP debugger
				webSecurity: true,
				allowRunningInsecureContent: false
			}
		});

		// Attach CDP debugger
		try {
			view.webContents.debugger.attach('1.3');
			console.log('[EmbeddedBrowser] CDP debugger attached successfully');

			// Enable required CDP domains
			await view.webContents.debugger.sendCommand('DOM.enable');
			await view.webContents.debugger.sendCommand('Runtime.enable');
			console.log('[EmbeddedBrowser] CDP domains enabled successfully');
		} catch (err) {
			console.error('[EmbeddedBrowser] Failed to attach debugger:', err);
			throw new BrowserError(
				`Failed to attach CDP debugger: ${err}`,
				sessionId,
				BrowserErrorCode.CDP_COMMAND_FAILED,
				{ originalError: err }
			);
		}

		// Create event handlers (store references for cleanup)
		const navHandler = async (_event: any, url: string) => {
			// Invalidate document cache on navigation
			const session = this.sessions.get(sessionId);
			if (session) {
				session.documentCache = undefined;
				// Re-enable DOM domain after navigation to ensure it stays active
				try {
					await session.view.webContents.debugger.sendCommand('DOM.enable');
				} catch (err) {
					console.warn('[EmbeddedBrowser] Failed to re-enable DOM domain after navigation:', err);
				}
			}
			this._onNavigate.fire({ sessionId, url });
		};
		const loadHandler = () => {
			this._onLoad.fire({ sessionId, url: view.webContents.getURL() });
		};
		const consoleHandler = (_event: any, level: number, message: string) => {
			const types = ['verbose', 'info', 'warning', 'error'];
			this._onConsoleMessage.fire({ sessionId, type: types[level] || 'info', text: message });
		};

		// Set up event listeners
		view.webContents.on('did-navigate', navHandler);
		view.webContents.on('did-finish-load', loadHandler);
		view.webContents.on('console-message', consoleHandler);

		// Get the active VS Code window
		const parentWindow = this.windowsMainService.getLastActiveWindow() ?? null;

		// Default bounds - positioned in the right half of the window
		const bounds = { x: 0, y: 0, width, height };

		// Only add to parent window if visible is true
		const visible = options.visible ?? true;

		if (visible && parentWindow?.win) {
			// Verify window is not destroyed before attempting attachment
			if (parentWindow.win.isDestroyed()) {
				throw new BrowserError(
					'Parent window was destroyed before view could be attached',
					sessionId,
					BrowserErrorCode.WINDOW_DESTROYED
				);
			}

			const windowBounds = parentWindow.win.getBounds();
			// Position in the right portion of the window
			bounds.x = Math.floor(windowBounds.width * 0.4);
			bounds.y = 80; // Below the title bar
			bounds.width = Math.floor(windowBounds.width * 0.58);
			bounds.height = windowBounds.height - 120;

			// Add the view to the parent window
			parentWindow.win.contentView.addChildView(view);
			view.setBounds(bounds);

			// Immediately verify attachment succeeded
			if (!parentWindow.win.contentView.children.includes(view)) {
				throw new BrowserError(
					'Failed to attach view to parent window',
					sessionId,
					BrowserErrorCode.WINDOW_DESTROYED
				);
			}

			console.log(`[EmbeddedBrowser] View attached to main window at bounds:`, bounds);
		} else if (!visible) {
			// For hidden automation mode - view exists in memory but not attached to any window
			console.log(`[EmbeddedBrowser] Session created in hidden automation mode`);
		} else {
			console.warn('[EmbeddedBrowser] No active window found for visible browser');
		}

		// Store session with lifecycle metadata
		this.sessions.set(sessionId, {
			view,
			parentWindow,
			options,
			bounds,
			isDestroying: false,
			operationLock: null,
			createdAt: Date.now(),
			lastActiveAt: Date.now(),
			eventHandlers: {
				navHandler,
				loadHandler,
				consoleHandler
			}
		});

		console.log(`[EmbeddedBrowser] Session created: ${sessionId}`);

		// Navigate to initial URL if provided
		if (options.url) {
			try {
				await view.webContents.loadURL(options.url);
			} catch (err) {
				console.error('[EmbeddedBrowser] Failed to load initial URL:', err);
				const error = new BrowserError(
					`Failed to load initial URL: ${err}`,
					sessionId,
					BrowserErrorCode.NAVIGATION_FAILED,
					{ url: options.url, originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		}
	}

	async destroySession(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		// Set destroying flag BEFORE any async operations
		session.isDestroying = true;

		// Wait for any pending operations with timeout
		if (session.operationLock) {
			try {
				await Promise.race([
					session.operationLock,
					new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), 5000))
				]);
			} catch (err) {
				console.error(`[EmbeddedBrowser] Operation did not complete before destroy:`, err);
			}
		}

		// NOW remove from map (prevents new operations from starting)
		this.sessions.delete(sessionId);

		// Remove event listeners BEFORE cleanup
		const wc = session.view.webContents;
		if (wc && !wc.isDestroyed()) {
			wc.removeListener('did-navigate', session.eventHandlers.navHandler);
			wc.removeListener('did-finish-load', session.eventHandlers.loadHandler);
			wc.removeListener('console-message', session.eventHandlers.consoleHandler);
		}

		// Detach CDP debugger
		try {
			if (wc && !wc.isDestroyed() && wc.debugger.isAttached()) {
				wc.debugger.detach();
			}
		} catch (err) {
			console.error(`[EmbeddedBrowser] Failed to detach debugger:`, err);
		}

		// Remove view from parent window
		if (session.parentWindow?.win && !session.parentWindow.win.isDestroyed()) {
			try {
				session.parentWindow.win.contentView.removeChildView(session.view);
			} catch (err) {
				console.error(`[EmbeddedBrowser] Failed to remove view from parent:`, err);
			}
		}

		console.log(`[EmbeddedBrowser] Session destroyed: ${sessionId}`);

		// Fire session destroyed event
		this._onSessionDestroyed.fire(sessionId);
	}

	// Navigation
	async navigate(sessionId: string, url: string): Promise<void> {
		// Validate URL first
		const validation = BrowserValidator.validateUrl(url);
		if (!validation.valid) {
			throw new BrowserError(
				validation.error!,
				sessionId,
				BrowserErrorCode.INVALID_URL,
				{ providedUrl: url }
			);
		}

		const session = this.getSession(sessionId);
		if (session.view.webContents.isDestroyed()) {
			throw new BrowserError(
				`Browser view for session ${sessionId} is destroyed`,
				sessionId,
				BrowserErrorCode.WINDOW_DESTROYED
			);
		}

		try {
			await session.view.webContents.loadURL(validation.sanitized!);
		} catch (err) {
			const error = new BrowserError(
				`Navigation failed: ${err}`,
				sessionId,
				BrowserErrorCode.NAVIGATION_FAILED,
				{ url: validation.sanitized, originalError: err }
			);
			this._onError.fire({ sessionId, error });
			throw error;
		}
	}

	async back(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		if (session.view.webContents.navigationHistory.canGoBack()) {
			session.view.webContents.navigationHistory.goBack();
		}
	}

	async forward(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		if (session.view.webContents.navigationHistory.canGoForward()) {
			session.view.webContents.navigationHistory.goForward();
		}
	}

	async reload(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		session.view.webContents.reload();
	}

	async getCurrentUrl(sessionId: string): Promise<string> {
		const session = this.getSession(sessionId);
		return session.view.webContents.getURL();
	}

	async getNavigationState(sessionId: string): Promise<{ url: string; canGoBack: boolean; canGoForward: boolean }> {
		const session = this.getSession(sessionId);
		const history = session.view.webContents.navigationHistory;
		return {
			url: session.view.webContents.getURL(),
			canGoBack: history.canGoBack(),
			canGoForward: history.canGoForward()
		};
	}

	// CDP-based interactions
	async click(sessionId: string, selector: string, options?: any): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate selector first
			const validation = BrowserValidator.validateSelector(selector);
			if (!validation.valid) {
				throw new BrowserError(
					validation.error!,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector }
				);
			}

			const clickCount = options?.clickCount ?? 1;
			const button = options?.button ?? 'left';
			const modifiers = this.getModifiersMask(options?.modifiers);

			const cdp = session.view.webContents.debugger;

			try {
				// Get document (cached for performance)
				const root = await this.getCachedDocument(session);

				// Find element
				const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
					nodeId: root.nodeId,
					selector
				});

				if (!nodeId) {
					throw new BrowserError(
						`Element not found: ${selector}`,
						sessionId,
						BrowserErrorCode.ELEMENT_NOT_FOUND,
						{ selector, url: session.view.webContents.getURL() }
					);
				}

				// Check if element is visible using JavaScript
				const isVisible = await session.view.webContents.executeJavaScript(`
					(function() {
						const el = document.querySelector(${JSON.stringify(selector)});
						if (!el) return false;
						const style = window.getComputedStyle(el);
						return style.display !== 'none' &&
						       style.visibility !== 'hidden' &&
						       style.opacity !== '0';
					})()
				`);

				if (!isVisible) {
					throw new BrowserError(
						`Element is not visible: ${selector}`,
						sessionId,
						BrowserErrorCode.ELEMENT_NOT_VISIBLE,
						{ selector }
					);
				}

				// Scroll element into view
				try {
					await cdp.sendCommand('DOM.scrollIntoViewIfNeeded', { nodeId });
					// Small delay to ensure scroll completes
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch (err) {
					// scrollIntoViewIfNeeded might not be available in all versions
					console.warn('[EmbeddedBrowser] Failed to scroll into view:', err);
				}

				// Get element box model
				let model;
				try {
					const result = await cdp.sendCommand('DOM.getBoxModel', { nodeId });
					model = result.model;
				} catch (err) {
					throw new BrowserError(
						`Element is not interactable: ${selector}`,
						sessionId,
						BrowserErrorCode.ELEMENT_NOT_INTERACTABLE,
						{ selector, originalError: err }
					);
				}

				const content = model.content;
				const x = (content[0] + content[2]) / 2;
				const y = (content[1] + content[5]) / 2;

				// Click using Input domain with modifiers support
				await cdp.sendCommand('Input.dispatchMouseEvent', {
					type: 'mousePressed',
					x, y,
					button,
					clickCount,
					modifiers
				});
				await cdp.sendCommand('Input.dispatchMouseEvent', {
					type: 'mouseReleased',
					x, y,
					button,
					clickCount,
					modifiers
				});

			} catch (err) {
				if (err instanceof BrowserError) {
					this._onError.fire({ sessionId, error: err });
					throw err;
				}
				const error = new BrowserError(
					`Click operation failed: ${err}`,
					sessionId,
					BrowserErrorCode.CDP_COMMAND_FAILED,
					{ selector, originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		});
	}

	/**
	 * Convert KeyboardModifiers to CDP modifiers mask
	 */
	private getModifiersMask(modifiers?: any): number {
		if (!modifiers) {
			return 0;
		}

		let mask = 0;
		if (modifiers.alt) { mask |= 1; }      // Alt
		if (modifiers.ctrl) { mask |= 2; }     // Control
		if (modifiers.meta) { mask |= 4; }     // Meta/Command
		if (modifiers.shift) { mask |= 8; }    // Shift
		return mask;
	}

	async type(sessionId: string, selector: string, text: string, options?: any): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate selector
			const validation = BrowserValidator.validateSelector(selector);
			if (!validation.valid) {
				throw new BrowserError(
					validation.error!,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector }
				);
			}

			const delay = options?.delay ?? 0;

			// First focus the element
			await this.focusInternal(session, selector);

			const cdp = session.view.webContents.debugger;

			try {
				// Type each character with optional delay
				for (const char of text) {
					await cdp.sendCommand('Input.dispatchKeyEvent', {
						type: 'keyDown',
						text: char
					});
					await cdp.sendCommand('Input.dispatchKeyEvent', {
						type: 'keyUp',
						text: char
					});

					if (delay > 0) {
						await new Promise(resolve => setTimeout(resolve, delay));
					}
				}
			} catch (err) {
				const error = new BrowserError(
					`Type operation failed: ${err}`,
					sessionId,
					BrowserErrorCode.CDP_COMMAND_FAILED,
					{ selector, text: text.substring(0, 50), originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		});
	}

	async fill(sessionId: string, selector: string, value: string): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate selector
			const validation = BrowserValidator.validateSelector(selector);
			if (!validation.valid) {
				throw new BrowserError(
					validation.error!,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector }
				);
			}

			try {
				// Use JavaScript to set value directly
				await session.view.webContents.executeJavaScript(`
					(function() {
						const el = document.querySelector(${JSON.stringify(selector)});
						if (el) {
							el.value = ${JSON.stringify(value)};
							el.dispatchEvent(new Event('input', { bubbles: true }));
							el.dispatchEvent(new Event('change', { bubbles: true }));
							return true;
						}
						return false;
					})();
				`);
			} catch (err) {
				const error = new BrowserError(
					`Fill operation failed: ${err}`,
					sessionId,
					BrowserErrorCode.CDP_COMMAND_FAILED,
					{ selector, originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		});
	}

	async press(sessionId: string, key: string): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate key
			const validation = BrowserValidator.validateKey(key);
			if (!validation.valid) {
				throw new BrowserError(
					validation.error!,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ key }
				);
			}

			const cdp = session.view.webContents.debugger;

			try {
				await cdp.sendCommand('Input.dispatchKeyEvent', {
					type: 'keyDown',
					key
				});
				await cdp.sendCommand('Input.dispatchKeyEvent', {
					type: 'keyUp',
					key
				});
			} catch (err) {
				const error = new BrowserError(
					`Press key operation failed: ${err}`,
					sessionId,
					BrowserErrorCode.CDP_COMMAND_FAILED,
					{ key, originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		});
	}

	async hover(sessionId: string, selector: string): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate selector
			const validation = BrowserValidator.validateSelector(selector);
			if (!validation.valid) {
				throw new BrowserError(
					validation.error!,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector }
				);
			}

			const cdp = session.view.webContents.debugger;

			try {
				const root = await this.getCachedDocument(session);
				const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
					nodeId: root.nodeId,
					selector
				});

				if (!nodeId) {
					throw new BrowserError(
						`Element not found: ${selector}`,
						sessionId,
						BrowserErrorCode.ELEMENT_NOT_FOUND,
						{ selector }
					);
				}

				const { model } = await cdp.sendCommand('DOM.getBoxModel', { nodeId });
				const content = model.content;
				const x = (content[0] + content[2]) / 2;
				const y = (content[1] + content[5]) / 2;

				await cdp.sendCommand('Input.dispatchMouseEvent', {
					type: 'mouseMoved',
					x, y
				});
			} catch (err) {
				if (err instanceof BrowserError) {
					this._onError.fire({ sessionId, error: err });
					throw err;
				}
				const error = new BrowserError(
					`Hover operation failed: ${err}`,
					sessionId,
					BrowserErrorCode.CDP_COMMAND_FAILED,
					{ selector, originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		});
	}

	async focus(sessionId: string, selector: string): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			await this.focusInternal(session, selector);
		});
	}

	/**
	 * Internal focus method that doesn't use operation lock (for use by other methods)
	 */
	private async focusInternal(session: BrowserSession, selector: string): Promise<void> {
		// Validate selector
		const validation = BrowserValidator.validateSelector(selector);
		if (!validation.valid) {
			throw new BrowserError(
				validation.error!,
				'', // sessionId not available here
				BrowserErrorCode.INVALID_SELECTOR,
				{ selector }
			);
		}

		const cdp = session.view.webContents.debugger;

		try {
			const root = await this.getCachedDocument(session);
			const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
				nodeId: root.nodeId,
				selector
			});

			if (!nodeId) {
				throw new BrowserError(
					`Element not found: ${selector}`,
					'',
					BrowserErrorCode.ELEMENT_NOT_FOUND,
					{ selector }
				);
			}

			await cdp.sendCommand('DOM.focus', { nodeId });
		} catch (err) {
			if (err instanceof BrowserError) {
				throw err;
			}
			throw new BrowserError(
				`Focus operation failed: ${err}`,
				'',
				BrowserErrorCode.CDP_COMMAND_FAILED,
				{ selector, originalError: err }
			);
		}
	}

	// Capture
	async screenshot(sessionId: string): Promise<string> {
		const session = this.getSession(sessionId);
		const image = await session.view.webContents.capturePage();
		return image.toPNG().toString('base64');
	}

	async getContent(sessionId: string): Promise<string> {
		const session = this.getSession(sessionId);
		return await session.view.webContents.executeJavaScript('document.documentElement.outerHTML');
	}

	async getAccessibilityTree(sessionId: string): Promise<string> {
		const session = this.getSession(sessionId);
		const cdp = session.view.webContents.debugger;

		try {
			const result: { nodes: AXNode[] } = await cdp.sendCommand('Accessibility.getFullAXTree');
			return convertToReadibleFormat(result.nodes);
		} catch (err) {
			console.error('[EmbeddedBrowser] Failed to get accessibility tree:', err);
			return '';
		}
	}

	// JavaScript evaluation
	async evaluate(sessionId: string, script: string): Promise<any> {
		// Validate and sanitize script
		const validation = BrowserValidator.sanitizeScript(script);
		if (!validation.valid) {
			throw new BrowserError(
				validation.error!,
				sessionId,
				BrowserErrorCode.SCRIPT_EXECUTION_FAILED,
				{ reason: 'validation_failed' }
			);
		}

		const session = this.getSession(sessionId);
		try {
			return await session.view.webContents.executeJavaScript(validation.sanitized!);
		} catch (err) {
			const error = new BrowserError(
				`Script execution failed: ${err}`,
				sessionId,
				BrowserErrorCode.SCRIPT_EXECUTION_FAILED,
				{ originalError: err }
			);
			this._onError.fire({ sessionId, error });
			throw error;
		}
	}

	// Wait operations
	async waitForSelector(sessionId: string, selector: string, timeout: number = 30000): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate selector first
			const validation = BrowserValidator.validateSelector(selector);
			if (!validation.valid) {
				throw new BrowserError(
					validation.error!,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector }
				);
			}

			// First check if element already exists
			const exists = await session.view.webContents.executeJavaScript(
				`!!document.querySelector(${JSON.stringify(selector)})`
			);
			if (exists) {
				return;
			}

			// Use MutationObserver instead of polling for better performance
			const waitPromise = session.view.webContents.executeJavaScript(`
				new Promise((resolve, reject) => {
					const timeout = ${timeout};
					const startTime = Date.now();

					// Check if element exists initially
					if (document.querySelector(${JSON.stringify(selector)})) {
						resolve();
						return;
					}

					// Set up MutationObserver
					const observer = new MutationObserver(() => {
						if (document.querySelector(${JSON.stringify(selector)})) {
							observer.disconnect();
							resolve();
						} else if (Date.now() - startTime > timeout) {
							observer.disconnect();
							reject(new Error('Timeout waiting for selector: ${selector}'));
						}
					});

					observer.observe(document.body, {
						childList: true,
						subtree: true,
						attributes: true
					});

					// Timeout fallback
					setTimeout(() => {
						observer.disconnect();
						reject(new Error('Timeout waiting for selector: ${selector}'));
					}, timeout);
				})
			`);

			// Also monitor for navigation during wait
			let navigationOccurred = false;
			const navHandler = () => { navigationOccurred = true; };
			session.view.webContents.once('did-start-navigation', navHandler);

			try {
				await waitPromise;
				if (navigationOccurred) {
					throw new BrowserError(
						`Navigation occurred while waiting for selector: ${selector}`,
						sessionId,
						BrowserErrorCode.NAVIGATION_TIMEOUT,
						{ selector }
					);
				}
			} catch (err: any) {
				throw new BrowserError(
					err.message || `Timeout waiting for selector: ${selector}`,
					sessionId,
					BrowserErrorCode.OPERATION_TIMEOUT,
					{ selector, timeout }
				);
			} finally {
				session.view.webContents.removeListener('did-start-navigation', navHandler);
			}
		});
	}

	async waitForNavigation(sessionId: string, timeout: number = 30000): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			const initialUrl = session.view.webContents.getURL();

			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					cleanup();
					reject(new BrowserError(
						'Navigation timeout',
						sessionId,
						BrowserErrorCode.NAVIGATION_TIMEOUT,
						{ timeout }
					));
				}, timeout);

				const finishHandler = () => {
					// Only resolve if URL actually changed
					const newUrl = session.view.webContents.getURL();
					if (newUrl !== initialUrl) {
						cleanup();
						resolve();
					}
				};

				const startHandler = () => {
					// Navigation started - wait for it to finish
					session.view.webContents.once('did-finish-load', finishHandler);
				};

				const cleanup = () => {
					clearTimeout(timer);
					session.view.webContents.removeListener('did-start-navigation', startHandler);
					session.view.webContents.removeListener('did-finish-load', finishHandler);
				};

				// Check if already loading
				if (session.view.webContents.isLoading()) {
					session.view.webContents.once('did-finish-load', finishHandler);
				} else {
					// Wait for next navigation
					session.view.webContents.once('did-start-navigation', startHandler);
				}
			});
		});
	}

	// Drag and Drop
	async dragAndDrop(sessionId: string, sourceSelector: string, targetSelector: string): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate selectors
			const sourceValidation = BrowserValidator.validateSelector(sourceSelector);
			if (!sourceValidation.valid) {
				throw new BrowserError(
					`Invalid source selector: ${sourceValidation.error}`,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector: sourceSelector }
				);
			}

			const targetValidation = BrowserValidator.validateSelector(targetSelector);
			if (!targetValidation.valid) {
				throw new BrowserError(
					`Invalid target selector: ${targetValidation.error}`,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector: targetSelector }
				);
			}

			const cdp = session.view.webContents.debugger;

			try {
				// Get source element position
				const root = await this.getCachedDocument(session);
				const { nodeId: sourceNodeId } = await cdp.sendCommand('DOM.querySelector', {
					nodeId: root.nodeId,
					selector: sourceSelector
				});

				if (!sourceNodeId) {
					throw new BrowserError(
						`Source element not found: ${sourceSelector}`,
						sessionId,
						BrowserErrorCode.ELEMENT_NOT_FOUND,
						{ selector: sourceSelector }
					);
				}

				const { model: sourceModel } = await cdp.sendCommand('DOM.getBoxModel', { nodeId: sourceNodeId });
				const sourceX = (sourceModel.content[0] + sourceModel.content[2]) / 2;
				const sourceY = (sourceModel.content[1] + sourceModel.content[5]) / 2;

				// Get target element position
				const { nodeId: targetNodeId } = await cdp.sendCommand('DOM.querySelector', {
					nodeId: root.nodeId,
					selector: targetSelector
				});

				if (!targetNodeId) {
					throw new BrowserError(
						`Target element not found: ${targetSelector}`,
						sessionId,
						BrowserErrorCode.ELEMENT_NOT_FOUND,
						{ selector: targetSelector }
					);
				}

				const { model: targetModel } = await cdp.sendCommand('DOM.getBoxModel', { nodeId: targetNodeId });
				const targetX = (targetModel.content[0] + targetModel.content[2]) / 2;
				const targetY = (targetModel.content[1] + targetModel.content[5]) / 2;

				// Perform drag and drop
				// 1. Mouse down on source
				await cdp.sendCommand('Input.dispatchMouseEvent', {
					type: 'mousePressed',
					x: sourceX,
					y: sourceY,
					button: 'left',
					clickCount: 1
				});

				// 2. Move to target (with intermediate steps for smooth drag)
				const steps = 10;
				for (let i = 1; i <= steps; i++) {
					const x = sourceX + (targetX - sourceX) * (i / steps);
					const y = sourceY + (targetY - sourceY) * (i / steps);
					await cdp.sendCommand('Input.dispatchMouseEvent', {
						type: 'mouseMoved',
						x, y
					});
					await new Promise(resolve => setTimeout(resolve, 20));
				}

				// 3. Mouse up on target
				await cdp.sendCommand('Input.dispatchMouseEvent', {
					type: 'mouseReleased',
					x: targetX,
					y: targetY,
					button: 'left',
					clickCount: 1
				});

			} catch (err) {
				if (err instanceof BrowserError) {
					this._onError.fire({ sessionId, error: err });
					throw err;
				}
				const error = new BrowserError(
					`Drag and drop operation failed: ${err}`,
					sessionId,
					BrowserErrorCode.CDP_COMMAND_FAILED,
					{ sourceSelector, targetSelector, originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		});
	}

	// Cookie management
	async getCookies(sessionId: string, urls?: string[]): Promise<any[]> {
		const session = this.getSession(sessionId);
		const cookies = await session.view.webContents.session.cookies.get(
			urls ? { url: urls[0] } : {}
		);
		return cookies;
	}

	async setCookies(sessionId: string, cookies: any[]): Promise<void> {
		const session = this.getSession(sessionId);
		for (const cookie of cookies) {
			await session.view.webContents.session.cookies.set({
				url: cookie.domain ? `https://${cookie.domain}` : 'https://example.com',
				name: cookie.name,
				value: cookie.value,
				domain: cookie.domain,
				path: cookie.path,
				expirationDate: cookie.expires,
				httpOnly: cookie.httpOnly,
				secure: cookie.secure,
				sameSite: cookie.sameSite?.toLowerCase() as any
			});
		}
	}

	async clearCookies(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		await session.view.webContents.session.clearStorageData({
			storages: ['cookies']
		});
	}

	// Scroll operations
	async scrollTo(sessionId: string, x: number, y: number): Promise<void> {
		const session = this.getSession(sessionId);
		await session.view.webContents.executeJavaScript(`window.scrollTo(${x}, ${y})`);
	}

	async scrollBy(sessionId: string, deltaX: number, deltaY: number): Promise<void> {
		const session = this.getSession(sessionId);
		await session.view.webContents.executeJavaScript(`window.scrollBy(${deltaX}, ${deltaY})`);
	}

	async scrollIntoView(sessionId: string, selector: string): Promise<void> {
		return this.withOperationLock(sessionId, async (session) => {
			// Validate selector
			const validation = BrowserValidator.validateSelector(selector);
			if (!validation.valid) {
				throw new BrowserError(
					validation.error!,
					sessionId,
					BrowserErrorCode.INVALID_SELECTOR,
					{ selector }
				);
			}

			const cdp = session.view.webContents.debugger;

			try {
				const root = await this.getCachedDocument(session);
				const { nodeId } = await cdp.sendCommand('DOM.querySelector', {
					nodeId: root.nodeId,
					selector
				});

				if (!nodeId) {
					throw new BrowserError(
						`Element not found: ${selector}`,
						sessionId,
						BrowserErrorCode.ELEMENT_NOT_FOUND,
						{ selector }
					);
				}

				await cdp.sendCommand('DOM.scrollIntoViewIfNeeded', { nodeId });
			} catch (err) {
				if (err instanceof BrowserError) {
					this._onError.fire({ sessionId, error: err });
					throw err;
				}
				const error = new BrowserError(
					`Scroll into view operation failed: ${err}`,
					sessionId,
					BrowserErrorCode.CDP_COMMAND_FAILED,
					{ selector, originalError: err }
				);
				this._onError.fire({ sessionId, error });
				throw error;
			}
		});
	}

	// Window control
	async setViewportSize(sessionId: string, width: number, height: number): Promise<void> {
		const session = this.getSession(sessionId);
		session.bounds.width = width;
		session.bounds.height = height;
		session.view.setBounds(session.bounds);
	}

	async showBrowser(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		// Re-add view to window if it was removed
		if (session.parentWindow?.win && !session.parentWindow.win.isDestroyed()) {
			// Check if view already added
			const children = session.parentWindow.win.contentView.children;
			if (!children.includes(session.view)) {
				session.parentWindow.win.contentView.addChildView(session.view);
			}
			session.view.setBounds(session.bounds);
		}
	}

	async hideBrowser(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		// Remove view from window to hide it
		if (session.parentWindow?.win && !session.parentWindow.win.isDestroyed()) {
			session.parentWindow.win.contentView.removeChildView(session.view);
		}
	}

	/**
	 * Operation lock wrapper to prevent concurrent CDP operations on same session
	 */
	private async withOperationLock<T>(
		sessionId: string,
		operation: (session: BrowserSession) => Promise<T>
	): Promise<T> {
		const session = this.getSession(sessionId);

		// Wait for any existing operation to complete
		if (session.operationLock) {
			await session.operationLock;
		}

		// Create new lock
		let releaseLock: () => void;
		session.operationLock = new Promise(resolve => {
			releaseLock = resolve;
		});

		try {
			session.lastActiveAt = Date.now();
			return await operation(session);
		} finally {
			releaseLock!();
			session.operationLock = null;
		}
	}

	/**
	 * Get cached CDP document or fetch fresh one if cache is stale
	 * Caches for 1 second to reduce redundant CDP calls
	 */
	private async getCachedDocument(session: BrowserSession): Promise<any> {
		const now = Date.now();
		const CACHE_TTL = 1000; // 1 second

		// Return cached document if still valid
		if (session.documentCache && now - session.documentCache.timestamp < CACHE_TTL) {
			return session.documentCache.root;
		}

		// Fetch fresh document
		const cdp = session.view.webContents.debugger;
		try {
			// Ensure DOM domain is enabled before getting document
			try {
				await cdp.sendCommand('DOM.enable');
			} catch (enableErr) {
				console.warn('[EmbeddedBrowser] DOM.enable failed, attempting to continue:', enableErr);
			}

			const { root } = await cdp.sendCommand('DOM.getDocument');
			session.documentCache = { root, timestamp: now };
			return root;
		} catch (err) {
			// Provide more context in error message
			const url = session.view.webContents.getURL();
			const loadingState = session.view.webContents.isLoading() ? 'loading' : 'loaded';
			throw new BrowserError(
				`Failed to get DOM document. URL: ${url}, State: ${loadingState}, Error: ${err}`,
				'', // sessionId not available in this context
				BrowserErrorCode.CDP_COMMAND_FAILED,
				{ originalError: err, url, loadingState }
			);
		}
	}

	private getSession(sessionId: string): BrowserSession {
		const session = this.sessions.get(sessionId);
		if (!session) {
			const error = new BrowserError(
				`Session ${sessionId} not found`,
				sessionId,
				BrowserErrorCode.SESSION_NOT_FOUND
			);
			this._onError.fire({ sessionId, error });
			throw error;
		}
		if (session.isDestroying) {
			const error = new BrowserError(
				`Session ${sessionId} is being destroyed`,
				sessionId,
				BrowserErrorCode.SESSION_DESTROYING
			);
			this._onError.fire({ sessionId, error });
			throw error;
		}
		return session;
	}

	override dispose(): void {
		// Close all sessions with timeout
		const sessionIds = Array.from(this.sessions.keys());
		const destroyPromises = sessionIds.map(id =>
			Promise.race([
				this.destroySession(id),
				new Promise((_, reject) => setTimeout(() => reject(new Error('Dispose timeout')), 3000))
			]).catch(err => {
				console.error(`[EmbeddedBrowser] Failed to destroy session ${id} during dispose:`, err);
			})
		);

		// Wait for all sessions to close (with overall timeout)
		Promise.race([
			Promise.all(destroyPromises),
			new Promise(resolve => setTimeout(resolve, 5000))
		]).finally(() => {
			super.dispose();
		});
	}
}
