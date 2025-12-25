/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { IEmbeddedBrowserService, BrowserSessionOptions, NavigationState } from '../common/embeddedBrowser.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';

/**
 * Browser-side (renderer) client for the EmbeddedBrowserService.
 * Communicates with the main process via IPC.
 */
export class EmbeddedBrowserClient extends Disposable implements IEmbeddedBrowserService {
	declare readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	private readonly _onNavigate = this._register(new Emitter<{ sessionId: string; url: string }>());
	readonly onNavigate = this._onNavigate.event;

	private readonly _onLoad = this._register(new Emitter<{ sessionId: string; url: string }>());
	readonly onLoad = this._onLoad.event;

	private readonly _onConsoleMessage = this._register(new Emitter<{ sessionId: string; type: string; text: string }>());
	readonly onConsoleMessage = this._onConsoleMessage.event;

	private readonly _onError = this._register(new Emitter<{ sessionId: string; error: any }>());
	readonly onError = this._onError.event;

	private readonly _onSessionDestroyed = this._register(new Emitter<string>());
	readonly onSessionDestroyed = this._onSessionDestroyed.event;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		super();
		this.channel = mainProcessService.getChannel('embeddedBrowser');

		// Subscribe to events from main process
		this._register(this.channel.listen<{ sessionId: string; url: string }>('onNavigate')(e => this._onNavigate.fire(e)));
		this._register(this.channel.listen<{ sessionId: string; url: string }>('onLoad')(e => this._onLoad.fire(e)));
		this._register(this.channel.listen<{ sessionId: string; type: string; text: string }>('onConsoleMessage')(e => this._onConsoleMessage.fire(e)));
		this._register(this.channel.listen<{ sessionId: string; error: any }>('onError')(e => this._onError.fire(e)));
		this._register(this.channel.listen<string>('onSessionDestroyed')(sessionId => this._onSessionDestroyed.fire(sessionId)));
	}

	// Lifecycle
	createSession(sessionId: string, options?: BrowserSessionOptions): Promise<void> {
		return this.channel.call('createSession', { sessionId, options });
	}

	destroySession(sessionId: string): Promise<void> {
		return this.channel.call('destroySession', { sessionId });
	}

	// Navigation
	navigate(sessionId: string, url: string): Promise<void> {
		return this.channel.call('navigate', { sessionId, url });
	}

	back(sessionId: string): Promise<void> {
		return this.channel.call('back', { sessionId });
	}

	forward(sessionId: string): Promise<void> {
		return this.channel.call('forward', { sessionId });
	}

	reload(sessionId: string): Promise<void> {
		return this.channel.call('reload', { sessionId });
	}

	getCurrentUrl(sessionId: string): Promise<string> {
		return this.channel.call('getCurrentUrl', { sessionId });
	}

	getNavigationState(sessionId: string): Promise<NavigationState> {
		return this.channel.call('getNavigationState', { sessionId });
	}

	// Interaction
	click(sessionId: string, selector: string, options?: any): Promise<void> {
		return this.channel.call('click', { sessionId, selector, options });
	}

	type(sessionId: string, selector: string, text: string, options?: any): Promise<void> {
		return this.channel.call('type', { sessionId, selector, text, options });
	}

	fill(sessionId: string, selector: string, value: string): Promise<void> {
		return this.channel.call('fill', { sessionId, selector, value });
	}

	press(sessionId: string, key: string): Promise<void> {
		return this.channel.call('press', { sessionId, key });
	}

	hover(sessionId: string, selector: string): Promise<void> {
		return this.channel.call('hover', { sessionId, selector });
	}

	focus(sessionId: string, selector: string): Promise<void> {
		return this.channel.call('focus', { sessionId, selector });
	}

	dragAndDrop(sessionId: string, sourceSelector: string, targetSelector: string): Promise<void> {
		return this.channel.call('dragAndDrop', { sessionId, sourceSelector, targetSelector });
	}

	// Capture
	screenshot(sessionId: string): Promise<string> {
		return this.channel.call('screenshot', { sessionId });
	}

	getContent(sessionId: string): Promise<string> {
		return this.channel.call('getContent', { sessionId });
	}

	getAccessibilityTree(sessionId: string): Promise<string> {
		return this.channel.call('getAccessibilityTree', { sessionId });
	}

	// Evaluation
	evaluate(sessionId: string, script: string): Promise<any> {
		return this.channel.call('evaluate', { sessionId, script });
	}

	// Wait operations
	waitForSelector(sessionId: string, selector: string, timeout?: number): Promise<void> {
		return this.channel.call('waitForSelector', { sessionId, selector, timeout });
	}

	waitForNavigation(sessionId: string, timeout?: number): Promise<void> {
		return this.channel.call('waitForNavigation', { sessionId, timeout });
	}

	// Window control
	setViewportSize(sessionId: string, width: number, height: number): Promise<void> {
		return this.channel.call('setViewportSize', { sessionId, width, height });
	}

	showBrowser(sessionId: string): Promise<void> {
		return this.channel.call('showBrowser', { sessionId });
	}

	hideBrowser(sessionId: string): Promise<void> {
		return this.channel.call('hideBrowser', { sessionId });
	}

	// Cookie management
	getCookies(sessionId: string, urls?: string[]): Promise<any[]> {
		return this.channel.call('getCookies', { sessionId, urls });
	}

	setCookies(sessionId: string, cookies: any[]): Promise<void> {
		return this.channel.call('setCookies', { sessionId, cookies });
	}

	clearCookies(sessionId: string): Promise<void> {
		return this.channel.call('clearCookies', { sessionId });
	}

	// Scroll operations
	scrollTo(sessionId: string, x: number, y: number): Promise<void> {
		return this.channel.call('scrollTo', { sessionId, x, y });
	}

	scrollBy(sessionId: string, deltaX: number, deltaY: number): Promise<void> {
		return this.channel.call('scrollBy', { sessionId, deltaX, deltaY });
	}

	scrollIntoView(sessionId: string, selector: string): Promise<void> {
		return this.channel.call('scrollIntoView', { sessionId, selector });
	}
}

// Register the service
registerSingleton(IEmbeddedBrowserService, EmbeddedBrowserClient, InstantiationType.Delayed);
