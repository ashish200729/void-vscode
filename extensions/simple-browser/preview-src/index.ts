/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onceDocumentLoaded } from './events';

const vscode = acquireVsCodeApi();

function getSettings() {
	const element = document.getElementById('simple-browser-settings');
	if (element) {
		const data = element.getAttribute('data-settings');
		if (data) {
			return JSON.parse(data);
		}
	}

	throw new Error(`Could not load settings`);
}

const settings = getSettings();

const iframe = document.querySelector('iframe')!;
const header = document.querySelector('.header')!;
const input = header.querySelector<HTMLInputElement>('.url-input')!;
const forwardButton = header.querySelector<HTMLButtonElement>('.forward-button')!;
const backButton = header.querySelector<HTMLButtonElement>('.back-button')!;
const reloadButton = header.querySelector<HTMLButtonElement>('.reload-button')!;
const homeButton = header.querySelector<HTMLButtonElement>('.home-button')!;
const openExternalButton = header.querySelector<HTMLButtonElement>('.open-external-button')!;

// URL bar elements
const securityIcon = header.querySelector<HTMLElement>('.security-icon')!;
const clearButton = header.querySelector<HTMLButtonElement>('.clear-button')!;

// Navigation constants
const homeUrl = 'https://www.google.com/';
const searchEngineUrl = 'https://www.google.com/search?q=';

// Client-side history management
let historyStack: string[] = [];
let historyIndex = -1;

// Check if input is a valid URL
function isValidUrl(input: string): boolean {
	try {
		const url = new URL(input);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		// Check if it looks like a domain (contains a dot and no spaces)
		if (!input.includes(' ') && input.includes('.')) {
			const parts = input.split('.');
			const lastPart = parts[parts.length - 1].split('/')[0];
			// Check if TLD is at least 2 characters
			if (lastPart.length >= 2) {
				return true;
			}
		}
		return false;
	}
}

// Convert input to URL (either direct URL or search)
function inputToUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) {
		return homeUrl;
	}

	if (isValidUrl(trimmed)) {
		try {
			new URL(trimmed);
			return trimmed;
		} catch {
			// Probably a domain without protocol
			return `https://${trimmed}`;
		}
	}

	// It's a search query
	return searchEngineUrl + encodeURIComponent(trimmed);
}

// Update security icon based on URL
function updateSecurityIcon(url: string): void {
	const iconElement = securityIcon.querySelector('i')!;

	try {
		const urlObj = new URL(url);
		if (urlObj.protocol === 'https:') {
			securityIcon.classList.add('secure');
			securityIcon.classList.remove('insecure');
			securityIcon.title = 'Connection is secure';
			iconElement.className = 'codicon codicon-lock';
		} else {
			securityIcon.classList.remove('secure');
			securityIcon.classList.add('insecure');
			securityIcon.title = 'Connection is not secure';
			iconElement.className = 'codicon codicon-unlock';
		}
	} catch {
		securityIcon.classList.remove('secure', 'insecure');
		securityIcon.title = '';
		iconElement.className = 'codicon codicon-globe';
	}
}

// Update navigation button states
function updateNavigationButtons(): void {
	backButton.disabled = historyIndex <= 0;
	forwardButton.disabled = historyIndex >= historyStack.length - 1;
}

// Navigate to a URL
function navigateToUrl(url: string, addToHistory: boolean = true): void {
	iframe.src = url;
	input.value = url;
	updateSecurityIcon(url);

	if (addToHistory) {
		// Remove any forward history when navigating to a new page
		historyStack = historyStack.slice(0, historyIndex + 1);
		historyStack.push(url);
		historyIndex = historyStack.length - 1;
	}

	updateNavigationButtons();
}

// Go back in history
function goBack(): void {
	if (historyIndex > 0) {
		historyIndex--;
		const url = historyStack[historyIndex];
		navigateToUrl(url, false);
	}
}

// Go forward in history
function goForward(): void {
	if (historyIndex < historyStack.length - 1) {
		historyIndex++;
		const url = historyStack[historyIndex];
		navigateToUrl(url, false);
	}
}

// Reload current page
function reload(): void {
	iframe.src = iframe.src;
}

window.addEventListener('message', e => {
	switch (e.data.type) {
		case 'focus':
			iframe.focus();
			break;
		case 'didChangeFocusLockIndicatorEnabled':
			toggleFocusLockIndicatorEnabled(e.data.enabled);
			break;
		case 'navigate':
			// Navigate from extension (e.g., when show is called with new URL)
			navigateToUrl(e.data.url);
			break;
	}
});

onceDocumentLoaded(() => {
	setInterval(() => {
		const iframeFocused = document.activeElement?.tagName === 'IFRAME';
		document.body.classList.toggle('iframe-focused', iframeFocused);
	}, 50);

	input.addEventListener('change', e => {
		const inputValue = (e.target as HTMLInputElement).value;
		const url = inputToUrl(inputValue);
		navigateToUrl(url);
	});

	// Handle Enter key press
	input.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			const url = inputToUrl(input.value);
			navigateToUrl(url);
			input.blur();
		} else if (e.key === 'Escape') {
			input.blur();
		}
	});

	// Select all text when focusing the input
	input.addEventListener('focus', () => {
		setTimeout(() => input.select(), 0);
	});

	// Clear button handler
	clearButton.addEventListener('click', () => {
		input.value = '';
		input.focus();
	});

	forwardButton.addEventListener('click', () => {
		goForward();
	});

	backButton.addEventListener('click', () => {
		goBack();
	});

	homeButton.addEventListener('click', () => {
		navigateToUrl(homeUrl);
	});

	openExternalButton.addEventListener('click', () => {
		vscode.postMessage({
			type: 'openExternal',
			url: input.value
		});
	});

	reloadButton.addEventListener('click', () => {
		reload();
	});

	// Initial page load
	const initialUrl = settings.url || homeUrl;
	navigateToUrl(initialUrl);

	toggleFocusLockIndicatorEnabled(settings.focusLockEnabled);
});

function toggleFocusLockIndicatorEnabled(enabled: boolean) {
	document.body.classList.toggle('enable-focus-lock-indicator', enabled);
}
