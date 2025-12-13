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
const urlBar = header.querySelector<HTMLElement>('.url-bar')!;
const securityIcon = header.querySelector<HTMLElement>('.security-icon')!;
const clearButton = header.querySelector<HTMLButtonElement>('.clear-button')!;

// Error overlay elements
const errorOverlay = document.querySelector<HTMLElement>('.error-overlay')!;
const errorMessage = document.querySelector<HTMLElement>('.error-message')!;
const errorRetryButton = document.querySelector<HTMLButtonElement>('.error-retry-button')!;

// Navigation history management
const navigationHistory: string[] = [];
let currentHistoryIndex = -1;
const homeUrl = 'https://www.google.com/';
const searchEngineUrl = 'https://www.google.com/search?q=';

// Loading state management
let loadingTimeout: number | null = null;
const LOADING_TIMEOUT_MS = 30000; // 30 seconds timeout

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

// Format URL for display (clean version)
function formatUrlForDisplay(url: string): string {
	try {
		const urlObj = new URL(url);
		// Remove vscodeBrowserReqId parameter
		urlObj.searchParams.delete('vscodeBrowserReqId');
		return urlObj.toString();
	} catch {
		return url;
	}
}

window.addEventListener('message', e => {
	switch (e.data.type) {
		case 'focus':
			{
				iframe.focus();
				break;
			}
		case 'didChangeFocusLockIndicatorEnabled':
			{
				toggleFocusLockIndicatorEnabled(e.data.enabled);
				break;
			}
	}
});

onceDocumentLoaded(() => {
	setInterval(() => {
		const iframeFocused = document.activeElement?.tagName === 'IFRAME';
		document.body.classList.toggle('iframe-focused', iframeFocused);
	}, 50);

	// Update button states
	function updateNavigationButtons() {
		backButton.disabled = currentHistoryIndex <= 0;
		forwardButton.disabled = currentHistoryIndex >= navigationHistory.length - 1;
	}

	// Clear loading timeout
	function clearLoadingTimeout() {
		if (loadingTimeout !== null) {
			clearTimeout(loadingTimeout);
			loadingTimeout = null;
		}
	}

	// Hide loading state
	function hideLoading() {
		clearLoadingTimeout();
		document.body.classList.remove('loading');
	}

	// Show error state
	function showError(message: string) {
		hideLoading();
		errorMessage.textContent = message;
		errorOverlay.classList.add('visible');
		iframe.style.visibility = 'hidden';
	}

	// Hide error state
	function hideError() {
		errorOverlay.classList.remove('visible');
		iframe.style.visibility = 'visible';
	}

	iframe.addEventListener('load', () => {
		// Update button states when iframe loads
		updateNavigationButtons();
		// Hide loading indicator
		hideLoading();
		// Hide any error overlay
		hideError();
	});

	iframe.addEventListener('error', () => {
		// Show error on load failure
		showError('The page failed to load. Please check your connection and try again.');
	});

	input.addEventListener('change', e => {
		const inputValue = (e.target as HTMLInputElement).value;
		const url = inputToUrl(inputValue);
		navigateTo(url, true);
	});

	// Handle Enter key press
	input.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			const url = inputToUrl(input.value);
			navigateTo(url, true);
			input.blur();
		} else if (e.key === 'Escape') {
			// Restore current URL and blur
			if (navigationHistory[currentHistoryIndex]) {
				input.value = formatUrlForDisplay(navigationHistory[currentHistoryIndex]);
			}
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
		if (currentHistoryIndex < navigationHistory.length - 1) {
			currentHistoryIndex++;
			const url = navigationHistory[currentHistoryIndex];
			navigateTo(url, false);
		}
	});

	backButton.addEventListener('click', () => {
		if (currentHistoryIndex > 0) {
			currentHistoryIndex--;
			const url = navigationHistory[currentHistoryIndex];
			navigateTo(url, false);
		}
	});

	homeButton.addEventListener('click', () => {
		navigateTo(homeUrl, true);
	});

	openExternalButton.addEventListener('click', () => {
		vscode.postMessage({
			type: 'openExternal',
			url: input.value
		});
	});

	errorRetryButton.addEventListener('click', () => {
		hideError();
		if (navigationHistory[currentHistoryIndex]) {
			navigateTo(navigationHistory[currentHistoryIndex], false);
		}
	});

	reloadButton.addEventListener('click', () => {
		// Reload the current page
		if (navigationHistory[currentHistoryIndex]) {
			navigateTo(navigationHistory[currentHistoryIndex], false);
		}
	});

	const initialUrl = normalizeUrl(settings.url) || homeUrl;
	navigateTo(initialUrl, true);

	toggleFocusLockIndicatorEnabled(settings.focusLockIndicatorEnabled);

	function navigateTo(rawUrl: string, addToHistory: boolean): void {
		const normalizedUrl = normalizeUrl(rawUrl);

		if (!normalizedUrl) {
			return;
		}

		// Hide any previous error
		hideError();

		// Show loading indicator
		document.body.classList.add('loading');

		// Set loading timeout
		clearLoadingTimeout();
		loadingTimeout = window.setTimeout(() => {
			showError('The page took too long to load. Please check your connection and try again.');
		}, LOADING_TIMEOUT_MS);

		// Update security icon
		updateSecurityIcon(normalizedUrl);

		try {
			const url = new URL(normalizedUrl);

			// Try to bust the cache for the iframe
			// There does not appear to be any way to reliably do this except modifying the url
			url.searchParams.append('vscodeBrowserReqId', Date.now().toString());

			const finalUrl = url.toString();
			iframe.src = finalUrl;

			// Show clean URL without the vscodeBrowserReqId parameter
			input.value = formatUrlForDisplay(normalizedUrl);

			// Add to history if this is a new navigation
			if (addToHistory) {
				// Remove any forward history
				navigationHistory.splice(currentHistoryIndex + 1);
				navigationHistory.push(normalizedUrl);
				currentHistoryIndex = navigationHistory.length - 1;
			}

			updateNavigationButtons();
		} catch {
			iframe.src = normalizedUrl;
			input.value = normalizedUrl;

			if (addToHistory && normalizedUrl) {
				navigationHistory.splice(currentHistoryIndex + 1);
				navigationHistory.push(normalizedUrl);
				currentHistoryIndex = navigationHistory.length - 1;
			}

			updateNavigationButtons();
		}

		vscode.setState({ url: normalizedUrl });
	}
});

function toggleFocusLockIndicatorEnabled(enabled: boolean) {
	document.body.classList.toggle('enable-focus-lock-indicator', enabled);
}

function normalizeUrl(rawUrl: string): string {
	const trimmedUrl = rawUrl.trim();

	if (!trimmedUrl) {
		return trimmedUrl;
	}

	try {
		return new URL(trimmedUrl).toString();
	} catch {
		try {
			return new URL(`https://${trimmedUrl}`).toString();
		} catch {
			return trimmedUrl;
		}
	}
}

