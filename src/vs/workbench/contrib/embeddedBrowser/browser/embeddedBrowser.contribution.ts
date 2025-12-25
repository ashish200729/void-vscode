/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IEmbeddedBrowserService } from '../../../../platform/embeddedBrowser/common/embeddedBrowser.js';

/**
 * Registers internal commands for embedded browser control.
 * These commands are called by the simple-browser extension.
 */
class EmbeddedBrowserCommandsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.embeddedBrowserCommands';

	constructor(
		@IEmbeddedBrowserService private readonly embeddedBrowserService: IEmbeddedBrowserService
	) {
		super();
		this.registerCommands();
	}

	private registerCommands(): void {
		// Lifecycle
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.createSession', async (_accessor, args: { sessionId: string; options?: any }) => {
			return this.embeddedBrowserService.createSession(args.sessionId, args.options);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.destroySession', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.destroySession(args.sessionId);
		}));

		// Navigation
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.navigate', async (_accessor, args: { sessionId: string; url: string }) => {
			return this.embeddedBrowserService.navigate(args.sessionId, args.url);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.back', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.back(args.sessionId);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.forward', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.forward(args.sessionId);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.reload', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.reload(args.sessionId);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.getCurrentUrl', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.getCurrentUrl(args.sessionId);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.getNavigationState', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.getNavigationState(args.sessionId);
		}));

		// Interaction
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.click', async (_accessor, args: { sessionId: string; selector: string }) => {
			return this.embeddedBrowserService.click(args.sessionId, args.selector);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.type', async (_accessor, args: { sessionId: string; selector: string; text: string }) => {
			return this.embeddedBrowserService.type(args.sessionId, args.selector, args.text);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.fill', async (_accessor, args: { sessionId: string; selector: string; value: string }) => {
			return this.embeddedBrowserService.fill(args.sessionId, args.selector, args.value);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.press', async (_accessor, args: { sessionId: string; key: string }) => {
			return this.embeddedBrowserService.press(args.sessionId, args.key);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.hover', async (_accessor, args: { sessionId: string; selector: string }) => {
			return this.embeddedBrowserService.hover(args.sessionId, args.selector);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.focus', async (_accessor, args: { sessionId: string; selector: string }) => {
			return this.embeddedBrowserService.focus(args.sessionId, args.selector);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.dragAndDrop', async (_accessor, args: { sessionId: string; sourceSelector: string; targetSelector: string }) => {
			return this.embeddedBrowserService.dragAndDrop(args.sessionId, args.sourceSelector, args.targetSelector);
		}));

		// Capture
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.screenshot', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.screenshot(args.sessionId);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.getContent', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.getContent(args.sessionId);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.getAccessibilityTree', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.getAccessibilityTree(args.sessionId);
		}));

		// Evaluation
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.evaluate', async (_accessor, args: { sessionId: string; script: string }) => {
			return this.embeddedBrowserService.evaluate(args.sessionId, args.script);
		}));

		// Wait operations
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.waitForSelector', async (_accessor, args: { sessionId: string; selector: string; timeout?: number }) => {
			return this.embeddedBrowserService.waitForSelector(args.sessionId, args.selector, args.timeout);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.waitForNavigation', async (_accessor, args: { sessionId: string; timeout?: number }) => {
			return this.embeddedBrowserService.waitForNavigation(args.sessionId, args.timeout);
		}));

		// Window control
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.setViewportSize', async (_accessor, args: { sessionId: string; width: number; height: number }) => {
			return this.embeddedBrowserService.setViewportSize(args.sessionId, args.width, args.height);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.showBrowser', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.showBrowser(args.sessionId);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.hideBrowser', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.hideBrowser(args.sessionId);
		}));

		// Cookie management
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.getCookies', async (_accessor, args: { sessionId: string; urls?: string[] }) => {
			return this.embeddedBrowserService.getCookies(args.sessionId, args.urls);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.setCookies', async (_accessor, args: { sessionId: string; cookies: any[] }) => {
			return this.embeddedBrowserService.setCookies(args.sessionId, args.cookies);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.clearCookies', async (_accessor, args: { sessionId: string }) => {
			return this.embeddedBrowserService.clearCookies(args.sessionId);
		}));

		// Scroll operations
		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.scrollTo', async (_accessor, args: { sessionId: string; x: number; y: number }) => {
			return this.embeddedBrowserService.scrollTo(args.sessionId, args.x, args.y);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.scrollBy', async (_accessor, args: { sessionId: string; deltaX: number; deltaY: number }) => {
			return this.embeddedBrowserService.scrollBy(args.sessionId, args.deltaX, args.deltaY);
		}));

		this._register(CommandsRegistry.registerCommand('_embeddedBrowser.scrollIntoView', async (_accessor, args: { sessionId: string; selector: string }) => {
			return this.embeddedBrowserService.scrollIntoView(args.sessionId, args.selector);
		}));
	}
}

// Register the contribution
registerWorkbenchContribution2(EmbeddedBrowserCommandsContribution.ID, EmbeddedBrowserCommandsContribution, WorkbenchPhase.BlockStartup);
