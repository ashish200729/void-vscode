/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SimpleBrowserManager } from './simpleBrowserManager';
import { SimpleBrowserView } from './simpleBrowserView';
import { BrowserService } from './browserService';

declare class URL {
	constructor(input: string, base?: string | URL);
	hostname: string;
}

const openApiCommand = 'simpleBrowser.api.open';
const showCommand = 'simpleBrowser.show';

const enabledHosts = new Set<string>([
	'localhost',
	// localhost IPv4
	'127.0.0.1',
	// localhost IPv6
	'[0:0:0:0:0:0:0:1]',
	'[::1]',
	// all interfaces IPv4
	'0.0.0.0',
	// all interfaces IPv6
	'[0:0:0:0:0:0:0:0]',
	'[::]'
]);

const openerId = 'simpleBrowser.open';

export function activate(context: vscode.ExtensionContext) {

	const manager = new SimpleBrowserManager(context.extensionUri);
	context.subscriptions.push(manager);

	// Initialize browser service for agentic control
	const browserService = new BrowserService();
	context.subscriptions.push(browserService);

	// ========== EVENT-DRIVEN STATE SYNCHRONIZATION ==========
	// Listen to navigation events and automatically sync UI state
	browserService.setOnNavigate(async (_url) => {
		try {
			const view = manager.getActiveView();
			if (view) {
				// Query actual navigation state from backend
				const state = await browserService.getNavigationState();
				view.updateState(state.url, state.canGoBack, state.canGoForward);
			}
		} catch (error) {
			// Gracefully handle errors - don't crash the UI
			// Error silently ignored to prevent UI crashes
		}
	});

	context.subscriptions.push(vscode.window.registerWebviewPanelSerializer(SimpleBrowserView.viewType, {
		deserializeWebviewPanel: async (panel, state) => {
			manager.restore(panel, state);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand(showCommand, async (url?: string) => {
		// Use default URL (Google) if no URL is provided
		if (!url) {
			url = 'https://www.google.com/';
		}

		manager.show(url);

		// Ensure backend session exists and navigate there too
		await browserService.navigate(url);

		// Query and sync state
		try {
			const state = await browserService.getNavigationState();
			const view = manager.getActiveView();
			if (view) {
				view.updateState(state.url, state.canGoBack, state.canGoForward);
			}
		} catch (error) {
			// Gracefully handle state sync errors - error silently ignored
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand(openApiCommand, async (url: vscode.Uri, showOptions?: {
		preserveFocus?: boolean;
		viewColumn: vscode.ViewColumn;
	}) => {
		const urlString = url.toString(true);
		manager.show(url, showOptions);

		// Ensure backend session exists and navigate there too
		await browserService.navigate(urlString);

		// Query and sync state
		try {
			const state = await browserService.getNavigationState();
			const view = manager.getActiveView();
			if (view) {
				view.updateState(state.url, state.canGoBack, state.canGoForward);
			}
		} catch (error) {
			// Gracefully handle state sync errors - error silently ignored
		}
	}));

	context.subscriptions.push(vscode.window.registerExternalUriOpener(openerId, {
		canOpenExternalUri(uri: vscode.Uri) {
			// We have to replace the IPv6 hosts with IPv4 because URL can't handle IPv6.
			const originalUri = new URL(uri.toString(true));
			if (enabledHosts.has(originalUri.hostname)) {
				return isWeb()
					? vscode.ExternalUriOpenerPriority.Default
					: vscode.ExternalUriOpenerPriority.Option;
			}

			return vscode.ExternalUriOpenerPriority.None;
		},
		openExternalUri(resolveUri: vscode.Uri) {
			const urlString = resolveUri.toString(true);
			manager.show(resolveUri, {
				viewColumn: vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active
			});

			// Sync with backend (ignore errors silently)
			browserService.navigate(urlString).catch(() => { /* noop */ });
		}
	}, {
		schemes: ['http', 'https'],
		label: vscode.l10n.t("Open in simple browser"),
	}));

	// ========== AGENTIC BROWSER TOOL COMMANDS ==========

	// Navigation
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.navigate', async (url?: string) => {
		if (!url) {
			url = await vscode.window.showInputBox({ prompt: 'Enter URL to navigate to', value: 'https://' });
		}
		if (url) {
			// Navigate in backend - event listener will automatically update UI
			await browserService.navigate(url);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.back', async () => {
		// Navigate in backend - event listener will automatically update UI
		await browserService.back();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.forward', async () => {
		// Navigate in backend - event listener will automatically update UI
		await browserService.forward();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.reload', async () => {
		// Reload in backend - event listener will automatically update UI
		await browserService.reload();
	}));

	// Interaction
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.click', async (selector?: string) => {
		if (!selector) {
			selector = await vscode.window.showInputBox({ prompt: 'Enter CSS selector to click' });
		}
		if (selector) {
			// Click in backend
			await browserService.click(selector);

			// Query and sync state in case click caused navigation
			try {
				const state = await browserService.getNavigationState();
				const view = manager.getActiveView();
				if (view) {
					view.updateState(state.url, state.canGoBack, state.canGoForward);
				}
			} catch (error) {
				// Gracefully handle state sync errors - error silently ignored
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.type', async (selector?: string, text?: string) => {
		if (!selector) {
			selector = await vscode.window.showInputBox({ prompt: 'Enter CSS selector' });
		}
		if (!text) {
			text = await vscode.window.showInputBox({ prompt: 'Enter text to type' });
		}
		if (selector && text) {
			await browserService.type(selector, text);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.fill', async (selector?: string, value?: string) => {
		if (!selector) {
			selector = await vscode.window.showInputBox({ prompt: 'Enter CSS selector' });
		}
		if (!value) {
			value = await vscode.window.showInputBox({ prompt: 'Enter value to fill' });
		}
		if (selector && value) {
			await browserService.fill(selector, value);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.press', async (key?: string) => {
		if (!key) {
			key = await vscode.window.showInputBox({ prompt: 'Enter key to press (e.g., Enter, Tab, Escape)' });
		}
		if (key) {
			// Press key in backend - event listener will handle any navigation
			await browserService.press(key);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.hover', async (selector?: string) => {
		if (!selector) {
			selector = await vscode.window.showInputBox({ prompt: 'Enter CSS selector to hover' });
		}
		if (selector) {
			await browserService.hover(selector);
		}
	}));

	// Capture
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.screenshot', async () => {
		const base64 = await browserService.screenshot();
		vscode.window.showInformationMessage(`Screenshot captured (${base64.length} bytes base64)`);
		return base64;
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.getContent', async () => {
		const content = await browserService.getContent();
		return content;
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.getAccessibilityTree', async () => {
		const tree = await browserService.getAccessibilityTree();
		return tree;
	}));

	// Evaluation
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.evaluate', async (script?: string) => {
		if (!script) {
			script = await vscode.window.showInputBox({ prompt: 'Enter JavaScript to execute' });
		}
		if (script) {
			const result = await browserService.evaluate(script);
			return result;
		}
	}));

	// Wait
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.waitForSelector', async (selector?: string) => {
		if (!selector) {
			selector = await vscode.window.showInputBox({ prompt: 'Enter CSS selector to wait for' });
		}
		if (selector) {
			await browserService.waitForSelector(selector);
		}
	}));

	// Window control
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.showAgenticBrowser', async (url?: string) => {
		const targetUrl = url ?? 'https://www.google.com';
		// Show the webview panel (visible browser in VS Code)
		manager.show(targetUrl);
		// Start the automation session (hidden WebContentsView for CDP)
		await browserService.createSession({ url: targetUrl, visible: false });

		// Query and sync state
		try {
			const state = await browserService.getNavigationState();
			const view = manager.getActiveView();
			if (view) {
				view.updateState(state.url, state.canGoBack, state.canGoForward);
			}
		} catch (error) {
			// Gracefully handle state sync errors - error silently ignored
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.hideAgenticBrowser', async () => {
		await browserService.hideBrowser();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.closeBrowser', async () => {
		// Close the visible webview panel
		manager.closeActiveView();
		// Also destroy the backend session
		await browserService.destroySession();
	}));

	// Phase 3 Commands: Drag and Drop
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.dragAndDrop', async (sourceSelector?: string, targetSelector?: string) => {
		if (!sourceSelector) {
			sourceSelector = await vscode.window.showInputBox({ prompt: 'Enter source CSS selector' });
		}
		if (!targetSelector) {
			targetSelector = await vscode.window.showInputBox({ prompt: 'Enter target CSS selector' });
		}
		if (sourceSelector && targetSelector) {
			await browserService.dragAndDrop(sourceSelector, targetSelector);
		}
	}));

	// Phase 3 Commands: Cookie Management
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.getCookies', async (urls?: string[]) => {
		const cookies = await browserService.getCookies(urls);
		vscode.window.showInformationMessage(`Retrieved ${cookies.length} cookies`);
		return cookies;
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.setCookies', async (cookies?: any[]) => {
		if (!cookies) {
			vscode.window.showErrorMessage('Please provide cookies as parameter');
			return;
		}
		await browserService.setCookies(cookies);
		vscode.window.showInformationMessage(`Set ${cookies.length} cookies`);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.clearCookies', async () => {
		await browserService.clearCookies();
		vscode.window.showInformationMessage('All cookies cleared');
	}));

	// Phase 3 Commands: Scroll Operations
	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.scrollTo', async (x?: number, y?: number) => {
		if (x === undefined) {
			const input = await vscode.window.showInputBox({ prompt: 'Enter X coordinate', value: '0' });
			x = input ? parseInt(input) : 0;
		}
		if (y === undefined) {
			const input = await vscode.window.showInputBox({ prompt: 'Enter Y coordinate', value: '0' });
			y = input ? parseInt(input) : 0;
		}
		// Execute on backend
		await browserService.scrollTo(x, y);
		// Also scroll the visible webview
		const view = manager.getActiveView();
		if (view) {
			view.scrollTo(x, y);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.scrollBy', async (deltaX?: number, deltaY?: number) => {
		if (deltaX === undefined) {
			const input = await vscode.window.showInputBox({ prompt: 'Enter X delta', value: '0' });
			deltaX = input ? parseInt(input) : 0;
		}
		if (deltaY === undefined) {
			const input = await vscode.window.showInputBox({ prompt: 'Enter Y delta', value: '100' });
			deltaY = input ? parseInt(input) : 100;
		}
		// Execute on backend
		await browserService.scrollBy(deltaX, deltaY);
		// Also scroll the visible webview
		const view = manager.getActiveView();
		if (view) {
			view.scrollBy(deltaX, deltaY);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('simpleBrowser.scrollIntoView', async (selector?: string) => {
		if (!selector) {
			selector = await vscode.window.showInputBox({ prompt: 'Enter CSS selector to scroll into view' });
		}
		if (selector) {
			// Execute on backend
			await browserService.scrollIntoView(selector);
			// Also scroll the visible webview
			const view = manager.getActiveView();
			if (view) {
				view.scrollIntoView(selector);
			}
		}
	}));
}

function isWeb(): boolean {
	// @ts-expect-error
	return typeof navigator !== 'undefined' && vscode.env.uiKind === vscode.UIKind.Web;
}
