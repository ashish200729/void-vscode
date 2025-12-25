/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Validation utilities for browser automation operations
 */
export class BrowserValidator {
	private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];
	private static readonly BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:', 'about:'];

	/**
	 * Validate and sanitize a URL
	 */
	static validateUrl(url: string): { valid: boolean; error?: string; sanitized?: string } {
		if (!url || typeof url !== 'string') {
			return { valid: false, error: 'URL must be a non-empty string' };
		}

		const trimmed = url.trim();
		if (trimmed.length === 0) {
			return { valid: false, error: 'URL cannot be empty' };
		}

		// Try to parse as URL
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(trimmed);
		} catch {
			// Try adding https:// prefix
			try {
				parsedUrl = new URL(`https://${trimmed}`);
			} catch {
				return { valid: false, error: 'Invalid URL format' };
			}
		}

		// Check protocol
		if (this.BLOCKED_PROTOCOLS.includes(parsedUrl.protocol)) {
			return {
				valid: false,
				error: `Protocol ${parsedUrl.protocol} is not allowed for security reasons`
			};
		}

		if (!this.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
			return {
				valid: false,
				error: `Protocol ${parsedUrl.protocol} is not supported. Only http: and https: are allowed.`
			};
		}

		return { valid: true, sanitized: parsedUrl.toString() };
	}

	/**
	 * Validate a CSS selector
	 */
	static validateSelector(selector: string): { valid: boolean; error?: string } {
		if (!selector || typeof selector !== 'string') {
			return { valid: false, error: 'Selector must be a non-empty string' };
		}

		const trimmed = selector.trim();
		if (trimmed.length === 0) {
			return { valid: false, error: 'Selector cannot be empty' };
		}

		// Try to validate selector syntax by attempting to parse it
		// Note: This is a basic check. Invalid selectors will still be caught by CDP.
		try {
			// Test if it's a valid selector by checking for obvious syntax errors
			if (trimmed.includes('<<') || trimmed.includes('>>')) {
				return { valid: false, error: 'Selector contains invalid syntax' };
			}
		} catch (err: any) {
			return { valid: false, error: `Invalid CSS selector: ${err.message}` };
		}

		return { valid: true };
	}

	/**
	 * Sanitize a JavaScript script for execution
	 */
	static sanitizeScript(script: string, maxLength: number = 50000): { valid: boolean; error?: string; sanitized?: string } {
		if (!script || typeof script !== 'string') {
			return { valid: false, error: 'Script must be a non-empty string' };
		}

		if (script.length > maxLength) {
			return { valid: false, error: `Script exceeds maximum length of ${maxLength} characters` };
		}

		// Check for dangerous Node.js patterns
		// These should not be accessible in the browser context, but check anyway
		const dangerousPatterns = [
			/require\s*\(/i,
			/process\./i,
			/__dirname/i,
			/__filename/i,
		];

		for (const pattern of dangerousPatterns) {
			if (pattern.test(script)) {
				return { valid: false, error: 'Script contains potentially dangerous Node.js code patterns' };
			}
		}

		return { valid: true, sanitized: script };
	}

	/**
	 * Validate keyboard key name
	 */
	static validateKey(key: string): { valid: boolean; error?: string } {
		if (!key || typeof key !== 'string') {
			return { valid: false, error: 'Key must be a non-empty string' };
		}

		const trimmed = key.trim();
		if (trimmed.length === 0) {
			return { valid: false, error: 'Key cannot be empty' };
		}

		// List of valid special keys (CDP Input.dispatchKeyEvent supports these)
		const validSpecialKeys = [
			'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
			'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Space', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
			'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
		];

		// Allow single characters or valid special keys
		if (trimmed.length === 1 || validSpecialKeys.includes(trimmed)) {
			return { valid: true };
		}

		return { valid: false, error: `Invalid key: ${trimmed}. Must be a single character or special key name.` };
	}
}
