/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../base/common/event.js';
import { IEmbeddedBrowserService } from '../common/embeddedBrowser.js';

export class EmbeddedBrowserChannel implements IServerChannel {

	constructor(private readonly service: IEmbeddedBrowserService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onNavigate':
				return this.service.onNavigate;
			case 'onLoad':
				return this.service.onLoad;
			case 'onConsoleMessage':
				return this.service.onConsoleMessage;
			default:
				throw new Error(`Event not found: ${event}`);
		}
	}

	async call(_: unknown, command: string, params: any): Promise<any> {
		try {
			switch (command) {
				// Lifecycle
				case 'createSession':
					return await this.service.createSession(params.sessionId, params.options);
				case 'destroySession':
					return await this.service.destroySession(params.sessionId);

				// Navigation
				case 'navigate':
					return await this.service.navigate(params.sessionId, params.url);
				case 'back':
					return await this.service.back(params.sessionId);
				case 'forward':
					return await this.service.forward(params.sessionId);
				case 'reload':
					return await this.service.reload(params.sessionId);
				case 'getCurrentUrl':
					return await this.service.getCurrentUrl(params.sessionId);
				case 'getNavigationState':
					return await this.service.getNavigationState(params.sessionId);

				// Interaction
				case 'click':
					return await this.service.click(params.sessionId, params.selector);
				case 'type':
					return await this.service.type(params.sessionId, params.selector, params.text);
				case 'fill':
					return await this.service.fill(params.sessionId, params.selector, params.value);
				case 'press':
					return await this.service.press(params.sessionId, params.key);
				case 'hover':
					return await this.service.hover(params.sessionId, params.selector);
				case 'focus':
					return await this.service.focus(params.sessionId, params.selector);
				case 'dragAndDrop':
					return await this.service.dragAndDrop(params.sessionId, params.sourceSelector, params.targetSelector);

				// Capture
				case 'screenshot':
					return await this.service.screenshot(params.sessionId);
				case 'getContent':
					return await this.service.getContent(params.sessionId);
				case 'getAccessibilityTree':
					return await this.service.getAccessibilityTree(params.sessionId);

				// Evaluation
				case 'evaluate':
					return await this.service.evaluate(params.sessionId, params.script);

				// Wait operations
				case 'waitForSelector':
					return await this.service.waitForSelector(params.sessionId, params.selector, params.timeout);
				case 'waitForNavigation':
					return await this.service.waitForNavigation(params.sessionId, params.timeout);

				// Window control
				case 'setViewportSize':
					return await this.service.setViewportSize(params.sessionId, params.width, params.height);
				case 'showBrowser':
					return await this.service.showBrowser(params.sessionId);
				case 'hideBrowser':
					return await this.service.hideBrowser(params.sessionId);

				// Cookie management
				case 'getCookies':
					return await this.service.getCookies(params.sessionId, params.urls);
				case 'setCookies':
					return await this.service.setCookies(params.sessionId, params.cookies);
				case 'clearCookies':
					return await this.service.clearCookies(params.sessionId);

				// Scroll operations
				case 'scrollTo':
					return await this.service.scrollTo(params.sessionId, params.x, params.y);
				case 'scrollBy':
					return await this.service.scrollBy(params.sessionId, params.deltaX, params.deltaY);
				case 'scrollIntoView':
					return await this.service.scrollIntoView(params.sessionId, params.selector);

				default:
					throw new Error(`Command not found: ${command}`);
			}
		} catch (error) {
			console.error('[EmbeddedBrowserChannel] Call error:', error);
			throw error;
		}
	}
}
