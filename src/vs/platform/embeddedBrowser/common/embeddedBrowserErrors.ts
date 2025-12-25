/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Error codes for browser automation operations
 */
export enum BrowserErrorCode {
	SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
	SESSION_DESTROYING = 'SESSION_DESTROYING',
	ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
	ELEMENT_NOT_VISIBLE = 'ELEMENT_NOT_VISIBLE',
	ELEMENT_NOT_INTERACTABLE = 'ELEMENT_NOT_INTERACTABLE',
	NAVIGATION_TIMEOUT = 'NAVIGATION_TIMEOUT',
	NAVIGATION_FAILED = 'NAVIGATION_FAILED',
	CDP_COMMAND_FAILED = 'CDP_COMMAND_FAILED',
	INVALID_SELECTOR = 'INVALID_SELECTOR',
	INVALID_URL = 'INVALID_URL',
	SCRIPT_EXECUTION_FAILED = 'SCRIPT_EXECUTION_FAILED',
	WINDOW_DESTROYED = 'WINDOW_DESTROYED',
	OPERATION_TIMEOUT = 'OPERATION_TIMEOUT'
}

/**
 * Custom error class for browser automation with detailed context
 */
export class BrowserError extends Error {
	constructor(
		message: string,
		public readonly sessionId: string,
		public readonly code: BrowserErrorCode,
		public readonly details?: any
	) {
		super(message);
		this.name = 'BrowserError';
		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, BrowserError);
		}
	}

	/**
	 * Convert error to a plain object for serialization across IPC
	 */
	toJSON(): any {
		return {
			name: this.name,
			message: this.message,
			sessionId: this.sessionId,
			code: this.code,
			details: this.details,
			stack: this.stack
		};
	}

	/**
	 * Create BrowserError from serialized object
	 */
	static fromJSON(obj: any): BrowserError {
		const error = new BrowserError(
			obj.message,
			obj.sessionId,
			obj.code,
			obj.details
		);
		if (obj.stack) {
			error.stack = obj.stack;
		}
		return error;
	}
}
