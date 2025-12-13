/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export type AgentEditorMode = 'agents' | 'editor';

export class AgentEditorToggleControl extends Disposable {

	private readonly _onDidChangeMode = this._register(new Emitter<AgentEditorMode>());
	readonly onDidChangeMode: Event<AgentEditorMode> = this._onDidChangeMode.event;

	readonly element: HTMLElement;

	private readonly agentsButton: HTMLButtonElement;
	private readonly editorButton: HTMLButtonElement;

	private _currentMode: AgentEditorMode;

	get currentMode(): AgentEditorMode {
		return this._currentMode;
	}

	/**
	 * Creates the Agent/Editor toggle control.
	 * @param initialMode The initial mode to start with. This should be derived from
	 *                    the current sidebar position configuration to ensure persistence.
	 */
	constructor(initialMode: AgentEditorMode = 'editor') {
		super();

		this._currentMode = initialMode;

		// Create container
		this.element = $('div.agent-editor-toggle');

		// Create sliding background pill
		const pill = document.createElement('div');
		pill.className = 'toggle-background';
		this.element.appendChild(pill);


		// Create Agents button
		this.agentsButton = document.createElement('button');
		this.agentsButton.className = 'toggle-button';
		this.agentsButton.textContent = 'Agents';
		this.agentsButton.setAttribute('role', 'tab');
		this.agentsButton.title = 'Agent Mode';

		// Create Editor button
		this.editorButton = document.createElement('button');
		this.editorButton.className = 'toggle-button';
		this.editorButton.textContent = 'Editor';
		this.editorButton.setAttribute('role', 'tab');
		this.editorButton.title = 'Editor Mode';

		// Append buttons
		this.element.appendChild(this.agentsButton);
		this.element.appendChild(this.editorButton);

		// Set initial active state
		this.updateActiveState();

		// Register click handlers
		this._register({
			dispose: () => {
				this.agentsButton.onclick = null;
				this.editorButton.onclick = null;
			}
		});

		this.agentsButton.onclick = () => this.setMode('agents');
		this.editorButton.onclick = () => this.setMode('editor');
	}

	private updateActiveState(): void {
		const isAgentsActive = this._currentMode === 'agents';

		// We toggle a class on the container to move the pill via CSS
		this.element.classList.toggle('mode-agents', isAgentsActive);
		this.element.classList.toggle('mode-editor', !isAgentsActive);

		this.agentsButton.classList.toggle('active', isAgentsActive);
		this.editorButton.classList.toggle('active', !isAgentsActive);

		this.agentsButton.setAttribute('aria-selected', String(isAgentsActive));
		this.editorButton.setAttribute('aria-selected', String(!isAgentsActive));
	}

	setMode(mode: AgentEditorMode): void {
		if (this._currentMode !== mode) {
			this._currentMode = mode;
			this.updateActiveState();
			this._onDidChangeMode.fire(mode);
		}
	}
}
