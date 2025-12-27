/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { IAgentMetadata } from '../../../agentRegistryService.js';
import { useAccessor } from '../util/services.js';
import { CircleSpinner } from './SidebarChat.js';

interface AgentCardProps {
	agent: IAgentMetadata;
	onClick?: () => void;
	isActive?: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, isActive }) => {
	const statusConfig = {
		'idle': { color: '#6b7280', label: 'Idle', icon: '○' },
		'working': { color: '#3b82f6', label: 'Working', icon: <CircleSpinner size={12} /> },
		'awaiting_approval': { color: '#f59e0b', label: 'Awaiting', icon: '⏸' },
		'paused': { color: '#ef4444', label: 'Paused', icon: '■' }
	};

	const config = statusConfig[agent.status];
	const fileCount = agent.modifiedFiles.size;

	return (
		<div
			className={`
				flex items-center gap-2 px-2 py-1.5
				rounded-md border
				${isActive ? 'border-void-border-1 bg-void-bg-2' : 'border-void-border-3 bg-void-bg-1'}
				${onClick ? 'cursor-pointer hover:brightness-110' : ''}
				transition-all duration-200
				text-xs
			`}
			onClick={onClick}
			style={{ borderLeftColor: agent.color, borderLeftWidth: '3px' }}
		>
			{/* Status indicator */}
			<div
				className="flex items-center justify-center w-4 h-4"
				style={{ color: config.color }}
				data-tooltip-id='void-tooltip'
				data-tooltip-content={config.label}
				data-tooltip-place='top'
			>
				{typeof config.icon === 'string' ? (
					<span className="text-sm">{config.icon}</span>
				) : (
					config.icon
				)}
			</div>

			{/* Agent info */}
			<div className="flex flex-col min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="font-medium text-void-fg-1 truncate">
						{agent.name}
					</span>
					{fileCount > 0 && (
						<span className="text-void-fg-4 text-[10px]">
							{fileCount} file{fileCount !== 1 ? 's' : ''}
						</span>
					)}
				</div>
				{agent.taskDescription && (
					<span className="text-void-fg-3 text-[10px] truncate opacity-70">
						{agent.taskDescription}
					</span>
				)}
			</div>
		</div>
	);
};

export const AgentStatusBar: React.FC = () => {
	const accessor = useAccessor();
	const agentRegistry = accessor.get('IAgentRegistryService');
	const chatThreadService = accessor.get('IChatThreadService');

	const [agents, setAgents] = useState<IAgentMetadata[]>([]);
	const currentThreadId = chatThreadService.state.currentThreadId;

	// Update agents list
	useEffect(() => {
		const updateAgents = () => {
			setAgents(agentRegistry.getAllAgents());
		};

		updateAgents();

		// Subscribe to agent events
		const disposables = [
			agentRegistry.onDidRegisterAgent(() => updateAgents()),
			agentRegistry.onDidUnregisterAgent(() => updateAgents()),
			agentRegistry.onDidChangeAgentStatus(() => updateAgents()),
			agentRegistry.onDidModifyFile(() => updateAgents())
		];

		// Poll for updates (fallback)
		const interval = setInterval(updateAgents, 2000);

		return () => {
			disposables.forEach(d => d.dispose());
			clearInterval(interval);
		};
	}, [agentRegistry]);

	// Don't show if no agents
	if (agents.length === 0) {
		return null;
	}

	return (
		<div className="px-4 py-2 border-b border-void-border-3">
			<div className="flex items-center gap-1.5 mb-1.5">
				<span className="text-xs font-medium text-void-fg-3">Active Agents</span>
				<span className="text-[10px] text-void-fg-4 opacity-60">
					{agents.length}
				</span>
			</div>
			<div className="flex flex-col gap-1.5">
				{agents.map(agent => {
					const isActive = agent.threadId === currentThreadId;
					return (
						<AgentCard
							key={agent.agentId}
							agent={agent}
							isActive={isActive}
							onClick={() => {
								chatThreadService.switchToThread(agent.threadId);
							}}
						/>
					);
				})}
			</div>
		</div>
	);
};
