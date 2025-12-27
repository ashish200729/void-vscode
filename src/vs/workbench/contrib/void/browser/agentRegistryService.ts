/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export const IAgentRegistryService = createDecorator<IAgentRegistryService>('agentRegistryService');

export interface IAgentMetadata {
	agentId: string;
	threadId: string;
	name: string;
	taskDescription: string;
	status: 'idle' | 'working' | 'awaiting_approval' | 'paused';
	modifiedFiles: Set<string>; // URI.fsPath
	createdAt: Date;
	lastActiveAt: Date;
	color: string; // For UI visualization
}

export interface IAgentRegistryService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a new agent in the system
	 */
	registerAgent(metadata: Omit<IAgentMetadata, 'createdAt' | 'lastActiveAt' | 'modifiedFiles'>): void;

	/**
	 * Unregister an agent from the system
	 */
	unregisterAgent(agentId: string): void;

	/**
	 * Get metadata for a specific agent
	 */
	getAgent(agentId: string): IAgentMetadata | undefined;

	/**
	 * Get all registered agents
	 */
	getAllAgents(): IAgentMetadata[];

	/**
	 * Get all agents that are modifying a specific file
	 */
	getAgentsModifyingFile(uri: URI): IAgentMetadata[];

	/**
	 * Update the status of an agent
	 */
	updateAgentStatus(agentId: string, status: IAgentMetadata['status']): void;

	/**
	 * Add a file to the list of files modified by an agent
	 */
	addModifiedFile(agentId: string, uri: URI): void;

	/**
	 * Remove a file from the list of files modified by an agent
	 */
	removeModifiedFile(agentId: string, uri: URI): void;

	/**
	 * Get the agent associated with a thread
	 */
	getAgentByThreadId(threadId: string): IAgentMetadata | undefined;

	/**
	 * Event fired when an agent is registered
	 */
	readonly onDidRegisterAgent: Event<IAgentMetadata>;

	/**
	 * Event fired when an agent is unregistered
	 */
	readonly onDidUnregisterAgent: Event<string>;

	/**
	 * Event fired when an agent's status changes
	 */
	readonly onDidChangeAgentStatus: Event<{ agentId: string; status: IAgentMetadata['status'] }>;

	/**
	 * Event fired when an agent modifies a file
	 */
	readonly onDidModifyFile: Event<{ agentId: string; uri: URI }>;
}

export class AgentRegistryService extends Disposable implements IAgentRegistryService {
	declare readonly _serviceBrand: undefined;

	private agents: Map<string, IAgentMetadata> = new Map();
	private threadToAgent: Map<string, string> = new Map(); // threadId -> agentId

	private readonly _onDidRegisterAgent = this._register(new Emitter<IAgentMetadata>());
	readonly onDidRegisterAgent = this._onDidRegisterAgent.event;

	private readonly _onDidUnregisterAgent = this._register(new Emitter<string>());
	readonly onDidUnregisterAgent = this._onDidUnregisterAgent.event;

	private readonly _onDidChangeAgentStatus = this._register(new Emitter<{ agentId: string; status: IAgentMetadata['status'] }>());
	readonly onDidChangeAgentStatus = this._onDidChangeAgentStatus.event;

	private readonly _onDidModifyFile = this._register(new Emitter<{ agentId: string; uri: URI }>());
	readonly onDidModifyFile = this._onDidModifyFile.event;

	private agentColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
	private colorIndex = 0;

	registerAgent(metadata: Omit<IAgentMetadata, 'createdAt' | 'lastActiveAt' | 'modifiedFiles'>): void {
		const fullMetadata: IAgentMetadata = {
			...metadata,
			modifiedFiles: new Set(),
			createdAt: new Date(),
			lastActiveAt: new Date(),
			color: metadata.color || this.agentColors[this.colorIndex++ % this.agentColors.length]
		};

		this.agents.set(metadata.agentId, fullMetadata);
		this.threadToAgent.set(metadata.threadId, metadata.agentId);
		this._onDidRegisterAgent.fire(fullMetadata);
	}

	unregisterAgent(agentId: string): void {
		const agent = this.agents.get(agentId);
		if (agent) {
			this.threadToAgent.delete(agent.threadId);
			this.agents.delete(agentId);
			this._onDidUnregisterAgent.fire(agentId);
		}
	}

	getAgent(agentId: string): IAgentMetadata | undefined {
		return this.agents.get(agentId);
	}

	getAllAgents(): IAgentMetadata[] {
		return Array.from(this.agents.values());
	}

	getAgentsModifyingFile(uri: URI): IAgentMetadata[] {
		return Array.from(this.agents.values())
			.filter(agent => agent.modifiedFiles.has(uri.fsPath));
	}

	updateAgentStatus(agentId: string, status: IAgentMetadata['status']): void {
		const agent = this.agents.get(agentId);
		if (agent) {
			agent.status = status;
			agent.lastActiveAt = new Date();
			this._onDidChangeAgentStatus.fire({ agentId, status });
		}
	}

	addModifiedFile(agentId: string, uri: URI): void {
		const agent = this.agents.get(agentId);
		if (agent) {
			agent.modifiedFiles.add(uri.fsPath);
			agent.lastActiveAt = new Date();
			this._onDidModifyFile.fire({ agentId, uri });
		}
	}

	removeModifiedFile(agentId: string, uri: URI): void {
		const agent = this.agents.get(agentId);
		if (agent) {
			agent.modifiedFiles.delete(uri.fsPath);
		}
	}

	getAgentByThreadId(threadId: string): IAgentMetadata | undefined {
		const agentId = this.threadToAgent.get(threadId);
		return agentId ? this.agents.get(agentId) : undefined;
	}
}

registerSingleton(IAgentRegistryService, AgentRegistryService, InstantiationType.Eager);
