/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentRegistryService } from './agentRegistryService.js';

export const IConflictDetectionService = createDecorator<IConflictDetectionService>('conflictDetectionService');

export type ConflictType = 'concurrent_edit' | 'overlapping_changes';

export interface IFileConflict {
	uri: URI;
	conflictingAgents: string[]; // agentIds
	conflictType: ConflictType;
	timestamp: Date;
	resolved: boolean;
}

export interface IConflictDetectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Detect conflicts for a specific file
	 */
	detectConflicts(uri: URI): IFileConflict | null;

	/**
	 * Get all active (unresolved) conflicts
	 */
	getActiveConflicts(): IFileConflict[];

	/**
	 * Get conflict for a specific file
	 */
	getConflict(uri: URI): IFileConflict | null;

	/**
	 * Resolve a conflict
	 */
	resolveConflict(uri: URI, resolution: 'accept_all' | 'manual'): void;

	/**
	 * Subscribe to conflict events
	 */
	readonly onDidDetectConflict: Event<IFileConflict>;

	/**
	 * Event fired when a conflict is resolved
	 */
	readonly onDidResolveConflict: Event<URI>;
}

export class ConflictDetectionService extends Disposable implements IConflictDetectionService {
	declare readonly _serviceBrand: undefined;

	private conflicts: Map<string, IFileConflict> = new Map(); // uri.fsPath -> conflict

	private readonly _onDidDetectConflict = this._register(new Emitter<IFileConflict>());
	readonly onDidDetectConflict = this._onDidDetectConflict.event;

	private readonly _onDidResolveConflict = this._register(new Emitter<URI>());
	readonly onDidResolveConflict = this._onDidResolveConflict.event;

	constructor(
		@IAgentRegistryService private readonly agentRegistry: IAgentRegistryService
	) {
		super();

		// Listen to file modifications and detect conflicts
		this._register(this.agentRegistry.onDidModifyFile(({ agentId, uri }) => {
			this.detectConflicts(uri);
		}));
	}

	detectConflicts(uri: URI): IFileConflict | null {
		const agents = this.agentRegistry.getAgentsModifyingFile(uri);

		// Conflict exists if more than one agent is modifying the same file
		if (agents.length > 1) {
			const existingConflict = this.conflicts.get(uri.fsPath);

			// Check if this is a new conflict or an update to existing one
			const agentIds = agents.map(a => a.agentId).sort();
			const existingAgentIds = existingConflict?.conflictingAgents.sort();

			const isNewConflict = !existingConflict ||
				JSON.stringify(agentIds) !== JSON.stringify(existingAgentIds);

			if (isNewConflict) {
				const conflict: IFileConflict = {
					uri,
					conflictingAgents: agentIds,
					conflictType: 'concurrent_edit',
					timestamp: new Date(),
					resolved: false
				};

				this.conflicts.set(uri.fsPath, conflict);
				this._onDidDetectConflict.fire(conflict);
				return conflict;
			}

			return existingConflict;
		} else {
			// No conflict - remove if one existed
			const existingConflict = this.conflicts.get(uri.fsPath);
			if (existingConflict && !existingConflict.resolved) {
				this.resolveConflict(uri, 'accept_all');
			}
		}

		return null;
	}

	getActiveConflicts(): IFileConflict[] {
		return Array.from(this.conflicts.values())
			.filter(conflict => !conflict.resolved);
	}

	getConflict(uri: URI): IFileConflict | null {
		return this.conflicts.get(uri.fsPath) || null;
	}

	resolveConflict(uri: URI, resolution: 'accept_all' | 'manual'): void {
		const conflict = this.conflicts.get(uri.fsPath);
		if (conflict) {
			conflict.resolved = true;
			this._onDidResolveConflict.fire(uri);

			// Clean up resolved conflicts after a delay
			setTimeout(() => {
				this.conflicts.delete(uri.fsPath);
			}, 5000);
		}
	}
}

registerSingleton(IConflictDetectionService, ConflictDetectionService, InstantiationType.Eager);
