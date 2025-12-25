/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IEmbeddedBrowserService = createDecorator<IEmbeddedBrowserService>('embeddedBrowserService');

export interface NavigationState {
	url: string;
	canGoBack: boolean;
	canGoForward: boolean;
}

export interface IEmbeddedBrowserService {
	readonly _serviceBrand: undefined;

	// Lifecycle
	createSession(sessionId: string, options?: BrowserSessionOptions): Promise<void>;
	destroySession(sessionId: string): Promise<void>;

	// Navigation
	navigate(sessionId: string, url: string): Promise<void>;
	back(sessionId: string): Promise<void>;
	forward(sessionId: string): Promise<void>;
	reload(sessionId: string): Promise<void>;
	getCurrentUrl(sessionId: string): Promise<string>;
	getNavigationState(sessionId: string): Promise<NavigationState>;

	// Interaction (using CDP)
	click(sessionId: string, selector: string, options?: ClickOptions): Promise<void>;
	type(sessionId: string, selector: string, text: string, options?: TypeOptions): Promise<void>;
	fill(sessionId: string, selector: string, value: string): Promise<void>;
	press(sessionId: string, key: string): Promise<void>;
	hover(sessionId: string, selector: string): Promise<void>;
	focus(sessionId: string, selector: string): Promise<void>;
	dragAndDrop(sessionId: string, sourceSelector: string, targetSelector: string): Promise<void>;

	// Capture
	screenshot(sessionId: string): Promise<string>; // base64 PNG
	getContent(sessionId: string): Promise<string>; // HTML
	getAccessibilityTree(sessionId: string): Promise<string>; // Readable format

	// JavaScript evaluation
	evaluate(sessionId: string, script: string): Promise<any>;

	// Wait operations
	waitForSelector(sessionId: string, selector: string, timeout?: number): Promise<void>;
	waitForNavigation(sessionId: string, timeout?: number): Promise<void>;

	// Window control
	setViewportSize(sessionId: string, width: number, height: number): Promise<void>;
	showBrowser(sessionId: string): Promise<void>;
	hideBrowser(sessionId: string): Promise<void>;

	// Cookie management
	getCookies(sessionId: string, urls?: string[]): Promise<Cookie[]>;
	setCookies(sessionId: string, cookies: Cookie[]): Promise<void>;
	clearCookies(sessionId: string): Promise<void>;

	// Scroll operations
	scrollTo(sessionId: string, x: number, y: number): Promise<void>;
	scrollBy(sessionId: string, deltaX: number, deltaY: number): Promise<void>;
	scrollIntoView(sessionId: string, selector: string): Promise<void>;

	// Events
	readonly onNavigate: Event<{ sessionId: string; url: string }>;
	readonly onLoad: Event<{ sessionId: string; url: string }>;
	readonly onConsoleMessage: Event<{ sessionId: string; type: string; text: string }>;
	readonly onError: Event<{ sessionId: string; error: any }>;
	readonly onSessionDestroyed: Event<string>;
}

export interface BrowserSessionOptions {
	url?: string;
	width?: number;
	height?: number;
	visible?: boolean;
	javascript?: boolean;
}

export interface KeyboardModifiers {
	shift?: boolean;
	ctrl?: boolean;
	alt?: boolean;
	meta?: boolean;
}

export interface ClickOptions {
	clickCount?: number;  // 1 for single click, 2 for double click
	button?: 'left' | 'right' | 'middle';
	modifiers?: KeyboardModifiers;
}

export interface TypeOptions {
	delay?: number;  // Delay between keystrokes in milliseconds
}

export interface Cookie {
	name: string;
	value: string;
	domain?: string;
	path?: string;
	expires?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
}

export class NullEmbeddedBrowserService implements IEmbeddedBrowserService {
	readonly _serviceBrand: undefined;
	readonly onNavigate = Event.None;
	readonly onLoad = Event.None;
	readonly onConsoleMessage = Event.None;
	readonly onError = Event.None;
	readonly onSessionDestroyed = Event.None;

	createSession(): Promise<void> { throw new Error('Not implemented'); }
	destroySession(): Promise<void> { throw new Error('Not implemented'); }
	navigate(): Promise<void> { throw new Error('Not implemented'); }
	back(): Promise<void> { throw new Error('Not implemented'); }
	forward(): Promise<void> { throw new Error('Not implemented'); }
	reload(): Promise<void> { throw new Error('Not implemented'); }
	getCurrentUrl(): Promise<string> { throw new Error('Not implemented'); }
	getNavigationState(): Promise<NavigationState> { throw new Error('Not implemented'); }
	click(): Promise<void> { throw new Error('Not implemented'); }
	type(): Promise<void> { throw new Error('Not implemented'); }
	fill(): Promise<void> { throw new Error('Not implemented'); }
	press(): Promise<void> { throw new Error('Not implemented'); }
	hover(): Promise<void> { throw new Error('Not implemented'); }
	focus(): Promise<void> { throw new Error('Not implemented'); }
	dragAndDrop(): Promise<void> { throw new Error('Not implemented'); }
	screenshot(): Promise<string> { throw new Error('Not implemented'); }
	getContent(): Promise<string> { throw new Error('Not implemented'); }
	getAccessibilityTree(): Promise<string> { throw new Error('Not implemented'); }
	evaluate(): Promise<any> { throw new Error('Not implemented'); }
	waitForSelector(): Promise<void> { throw new Error('Not implemented'); }
	waitForNavigation(): Promise<void> { throw new Error('Not implemented'); }
	setViewportSize(): Promise<void> { throw new Error('Not implemented'); }
	showBrowser(): Promise<void> { throw new Error('Not implemented'); }
	hideBrowser(): Promise<void> { throw new Error('Not implemented'); }
	getCookies(): Promise<Cookie[]> { throw new Error('Not implemented'); }
	setCookies(): Promise<void> { throw new Error('Not implemented'); }
	clearCookies(): Promise<void> { throw new Error('Not implemented'); }
	scrollTo(): Promise<void> { throw new Error('Not implemented'); }
	scrollBy(): Promise<void> { throw new Error('Not implemented'); }
	scrollIntoView(): Promise<void> { throw new Error('Not implemented'); }
}
