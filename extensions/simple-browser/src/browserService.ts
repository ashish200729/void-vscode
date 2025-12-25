/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Browser service client for the simple-browser extension.
 * Uses the main process EmbeddedBrowserService for CDP automation via internal commands.
 *
 * The automation happens in a hidden WebContentsView in the main process,
 * while the visual display is the simple-browser webview panel.
 */
export class BrowserService implements vscode.Disposable {
	private sessionId = 'simple-browser-default';
	private sessionCreated = false;
	private currentUrl = '';

	// Callbacks for UI sync
	private onNavigateCallback?: (url: string) => void;

	constructor() { }

	dispose(): void {
		if (this.sessionCreated) {
			this.destroySession().catch(() => { /* ignore cleanup errors */ });
		}
	}

	/**
	 * Set a callback to be notified when navigation happens (for syncing with UI)
	 */
	setOnNavigate(callback: (url: string) => void): void {
		this.onNavigateCallback = callback;
	}

	/**
	 * Get the current URL
	 */
	getCurrentUrlSync(): string {
		return this.currentUrl;
	}

	private async ensureSession(): Promise<void> {
		if (!this.sessionCreated) {
			await this.createSession();
			this.sessionCreated = true;
		}
	}

	// Lifecycle
	async createSession(options?: { url?: string; visible?: boolean }): Promise<void> {
		try {
			await vscode.commands.executeCommand('_embeddedBrowser.createSession', {
				sessionId: this.sessionId,
				options: {
					url: options?.url ?? 'https://www.google.com',
					visible: options?.visible ?? false, // Hidden by default, we use webview for display
					width: 1280,
					height: 720
				}
			});
			this.sessionCreated = true;
			if (options?.url) {
				this.currentUrl = options.url;
			}
		} catch (error) {
			// If command not found, it means the workbench contribution hasn't loaded yet
			// This is okay - we can still use the webview for display
		}
	}

	async destroySession(): Promise<void> {
		try {
			await vscode.commands.executeCommand('_embeddedBrowser.destroySession', {
				sessionId: this.sessionId
			});
		} catch { }
		this.sessionCreated = false;
	}

	// Navigation
	async navigate(url: string): Promise<void> {
		this.currentUrl = url;
		if (this.onNavigateCallback) {
			this.onNavigateCallback(url);
		}

		await this.ensureSession();
		try {
			await vscode.commands.executeCommand('_embeddedBrowser.navigate', {
				sessionId: this.sessionId,
				url
			});
		} catch {
			// Fall back to just updating the webview
		}
	}

	async back(): Promise<void> {
		await this.ensureSession();
		try {
			await vscode.commands.executeCommand('_embeddedBrowser.back', {
				sessionId: this.sessionId
			});
			// Query and fire callback to update UI
			const state = await this.getNavigationState();
			this.currentUrl = state.url;
			if (this.onNavigateCallback) {
				this.onNavigateCallback(state.url);
			}
		} catch { }
	}

	async forward(): Promise<void> {
		await this.ensureSession();
		try {
			await vscode.commands.executeCommand('_embeddedBrowser.forward', {
				sessionId: this.sessionId
			});
			// Query and fire callback to update UI
			const state = await this.getNavigationState();
			this.currentUrl = state.url;
			if (this.onNavigateCallback) {
				this.onNavigateCallback(state.url);
			}
		} catch { }
	}

	async reload(): Promise<void> {
		await this.ensureSession();
		try {
			await vscode.commands.executeCommand('_embeddedBrowser.reload', {
				sessionId: this.sessionId
			});
			// Query and fire callback to update UI
			const state = await this.getNavigationState();
			this.currentUrl = state.url;
			if (this.onNavigateCallback) {
				this.onNavigateCallback(state.url);
			}
		} catch { }
	}

	async getCurrentUrl(): Promise<string> {
		await this.ensureSession();
		try {
			const url = await vscode.commands.executeCommand('_embeddedBrowser.getCurrentUrl', {
				sessionId: this.sessionId
			}) as string;
			this.currentUrl = url;
			return url;
		} catch {
			return this.currentUrl;
		}
	}

	/**
	 * Format error message for user-friendly display
	 */
	private formatErrorMessage(error: any): string {
		if (error?.code === 'ELEMENT_NOT_FOUND') {
			return `Element not found: ${error.details?.selector || 'unknown'}`;
		}
		if (error?.code === 'ELEMENT_NOT_VISIBLE') {
			return `Element is not visible: ${error.details?.selector || 'unknown'}`;
		}
		if (error?.code === 'ELEMENT_NOT_INTERACTABLE') {
			return `Element is not interactable: ${error.details?.selector || 'unknown'}`;
		}
		if (error?.code === 'NAVIGATION_TIMEOUT') {
			return 'Navigation timed out. The page may be slow or unresponsive.';
		}
		if (error?.code === 'NAVIGATION_FAILED') {
			return `Navigation failed: ${error.details?.url || 'unknown URL'}`;
		}
		if (error?.code === 'INVALID_URL') {
			return `Invalid URL: ${error.message}`;
		}
		if (error?.code === 'INVALID_SELECTOR') {
			return `Invalid CSS selector: ${error.message}`;
		}
		if (error?.code === 'OPERATION_TIMEOUT') {
			return `Operation timed out after ${error.details?.timeout || 'unknown'}ms`;
		}
		if (error?.code === 'SESSION_NOT_FOUND') {
			return 'Browser session not found. Please restart the browser.';
		}
		if (error?.code === 'SESSION_DESTROYING') {
			return 'Browser session is being closed. Please wait or restart.';
		}
		return error?.message || 'Unknown error occurred';
	}

	// Interaction - these require CDP, so they use the embedded browser service
	async click(selector: string): Promise<void> {
		await this.ensureSession();
		try {
			await vscode.commands.executeCommand('_embeddedBrowser.click', {
				sessionId: this.sessionId,
				selector
			});
		} catch (error) {
			const message = this.formatErrorMessage(error);
			vscode.window.showErrorMessage(`Browser click failed: ${message}`);
			throw error;
		}
	}

	async type(selector: string, text: string): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.type', {
			sessionId: this.sessionId,
			selector,
			text
		});
	}

	async fill(selector: string, value: string): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.fill', {
			sessionId: this.sessionId,
			selector,
			value
		});
	}

	async press(key: string): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.press', {
			sessionId: this.sessionId,
			key
		});
	}

	async hover(selector: string): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.hover', {
			sessionId: this.sessionId,
			selector
		});
	}

	// Capture - these return data from the embedded browser
	async screenshot(): Promise<string> {
		await this.ensureSession();
		return await vscode.commands.executeCommand('_embeddedBrowser.screenshot', {
			sessionId: this.sessionId
		}) as string;
	}

	async getContent(): Promise<string> {
		await this.ensureSession();
		return await vscode.commands.executeCommand('_embeddedBrowser.getContent', {
			sessionId: this.sessionId
		}) as string;
	}

	async getNavigationState(): Promise<{ url: string; canGoBack: boolean; canGoForward: boolean }> {
		await this.ensureSession();
		try {
			const state = await vscode.commands.executeCommand('_embeddedBrowser.getNavigationState', {
				sessionId: this.sessionId
			}) as { url: string; canGoBack: boolean; canGoForward: boolean };
			return state;
		} catch (error) {
			// Fallback if command fails
			return {
				url: this.currentUrl,
				canGoBack: false,
				canGoForward: false
			};
		}
	}

	async getAccessibilityTree(): Promise<string> {
		await this.ensureSession();
		return await vscode.commands.executeCommand('_embeddedBrowser.getAccessibilityTree', {
			sessionId: this.sessionId
		}) as string;
	}

	// Evaluation
	async evaluate(script: string): Promise<any> {
		await this.ensureSession();
		return await vscode.commands.executeCommand('_embeddedBrowser.evaluate', {
			sessionId: this.sessionId,
			script
		});
	}

	// Wait operations
	async waitForSelector(selector: string, timeout?: number): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.waitForSelector', {
			sessionId: this.sessionId,
			selector,
			timeout
		});
	}

	// Window control
	async setViewportSize(width: number, height: number): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.setViewportSize', {
			sessionId: this.sessionId,
			width,
			height
		});
	}

	async showBrowser(): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.showBrowser', {
			sessionId: this.sessionId
		});
	}

	async hideBrowser(): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.hideBrowser', {
			sessionId: this.sessionId
		});
	}

	// Drag and drop
	async dragAndDrop(sourceSelector: string, targetSelector: string): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.dragAndDrop', {
			sessionId: this.sessionId,
			sourceSelector,
			targetSelector
		});
	}

	// Cookie management
	async getCookies(urls?: string[]): Promise<any[]> {
		await this.ensureSession();
		return await vscode.commands.executeCommand('_embeddedBrowser.getCookies', {
			sessionId: this.sessionId,
			urls
		}) as any[];
	}

	async setCookies(cookies: any[]): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.setCookies', {
			sessionId: this.sessionId,
			cookies
		});
	}

	async clearCookies(): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.clearCookies', {
			sessionId: this.sessionId
		});
	}

	// Scroll operations
	async scrollTo(x: number, y: number): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.scrollTo', {
			sessionId: this.sessionId,
			x,
			y
		});
	}

	async scrollBy(deltaX: number, deltaY: number): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.scrollBy', {
			sessionId: this.sessionId,
			deltaX,
			deltaY
		});
	}

	async scrollIntoView(selector: string): Promise<void> {
		await this.ensureSession();
		await vscode.commands.executeCommand('_embeddedBrowser.scrollIntoView', {
			sessionId: this.sessionId,
			selector
		});
	}
}
