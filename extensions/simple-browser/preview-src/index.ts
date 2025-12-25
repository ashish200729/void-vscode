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

// Navigation constants
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
		case 'updateState':
			{
				// Lightweight state update without HTML regeneration
				const { url, canGoBack, canGoForward } = e.data;

				// Update URL bar
				input.value = formatUrlForDisplay(url);
				updateSecurityIcon(url);

				// Update navigation buttons
				backButton.disabled = !canGoBack;
				forwardButton.disabled = !canGoForward;

				// Update iframe if URL changed
				const currentIframeSrc = iframe.src;
				const normalizedNewUrl = normalizeUrl(url);
				if (currentIframeSrc !== normalizedNewUrl && normalizedNewUrl) {
					iframe.src = normalizedNewUrl;
				}
				break;
			}
		case 'showLoading':
			{
				document.body.classList.add('loading');
				break;
			}
		case 'hideLoading':
			{
				if (typeof hideLoading === 'function') {
					hideLoading();
				} else {
					document.body.classList.remove('loading');
				}
				break;
			}
		case 'showError':
			{
				if (typeof showError === 'function') {
					showError(e.data.message);
				}
				break;
			}
		case 'scrollTo':
			{
				// Scroll the iframe's content window
				try {
					iframe.contentWindow?.scrollTo(e.data.x, e.data.y);
				} catch (err) {
					// Ignore cross-origin errors
				}
				break;
			}
		case 'scrollBy':
			{
				// Scroll the iframe's content window
				try {
					iframe.contentWindow?.scrollBy(e.data.deltaX, e.data.deltaY);
				} catch (err) {
					// Ignore cross-origin errors
				}
				break;
			}
		case 'scrollIntoView':
			{
				// Scroll element into view in the iframe
				try {
					const doc = iframe.contentWindow?.document;
					if (doc) {
						const element = doc.querySelector(e.data.selector);
						if (element) {
							element.scrollIntoView({ behavior: 'smooth', block: 'center' });
						}
					}
				} catch (err) {
					// Ignore cross-origin errors or selector errors
				}
				break;
			}
	}
});

onceDocumentLoaded(() => {
	setInterval(() => {
		const iframeFocused = document.activeElement?.tagName === 'IFRAME';
		document.body.classList.toggle('iframe-focused', iframeFocused);
	}, 50);

	// Update button states based on backend history
	function updateNavigationButtons(canGoBack: boolean, canGoForward: boolean) {
		backButton.disabled = !canGoBack;
		forwardButton.disabled = !canGoForward;
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
		// Send navigation request to backend
		vscode.postMessage({
			type: 'navigate',
			url: url
		});
	});

	// Handle Enter key press
	input.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			const url = inputToUrl(input.value);
			// Send navigation request to backend
			vscode.postMessage({
				type: 'navigate',
				url: url
			});
			input.blur();
		} else if (e.key === 'Escape') {
			// Just blur and reset to current displayed URL
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
		// Send forward request to backend
		vscode.postMessage({
			type: 'forward'
		});
	});

	backButton.addEventListener('click', () => {
		// Send back request to backend
		vscode.postMessage({
			type: 'back'
		});
	});

	homeButton.addEventListener('click', () => {
		// Send navigate to home URL request to backend
		vscode.postMessage({
			type: 'navigate',
			url: homeUrl
		});
	});

	openExternalButton.addEventListener('click', () => {
		vscode.postMessage({
			type: 'openExternal',
			url: input.value
		});
	});

	errorRetryButton.addEventListener('click', () => {
		hideError();
		// Send reload request to backend
		vscode.postMessage({
			type: 'reload'
		});
	});

	reloadButton.addEventListener('click', () => {
		// Send reload request to backend
		vscode.postMessage({
			type: 'reload'
		});
	});

	const initialUrl = normalizeUrl(settings.url) || homeUrl;

	// Initial page load - just set iframe src directly
	// Backend will handle navigation from this point
	if (initialUrl) {
		iframe.src = initialUrl;
		input.value = formatUrlForDisplay(initialUrl);
		updateSecurityIcon(initialUrl);
		document.body.classList.add('loading');

		// Also notify backend about initial URL (if needed)
		vscode.postMessage({
			type: 'navigate',
			url: initialUrl
		});
	}

	toggleFocusLockIndicatorEnabled(settings.focusLockIndicatorEnabled);
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

