/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { IAgentMetadata } from '../../../agentRegistryService.js';
import { useAccessor } from '../util/services.js';
import { CircleSpinner } from './SidebarChat.js';
import { ChevronDown, ChevronRight, Plus, Pause, Play, Trash2, MoreVertical } from 'lucide-react';

interface AgentCardProps {
	agent: IAgentMetadata;
	onClick?: () => void;
	isActive?: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick, isActive }) => {
	const accessor = useAccessor();
	const agentRegistry = accessor.get('IAgentRegistryService');
	const [showMenu, setShowMenu] = useState(false);
	const [isHovered, setIsHovered] = useState(false);

	const statusConfig = {
		'idle': { color: '#6b7280', label: 'Idle', icon: '○' },
		'working': { color: '#3b82f6', label: 'Working', icon: <CircleSpinner size={12} /> },
		'awaiting_approval': { color: '#f59e0b', label: 'Awaiting', icon: '⏸' },
		'paused': { color: '#ef4444', label: 'Paused', icon: '■' }
	};

	const config = statusConfig[agent.status];
	const fileCount = agent.modifiedFiles.size;

	const handlePauseResume = (e: React.MouseEvent) => {
		e.stopPropagation();
		const newStatus = agent.status === 'paused' ? 'idle' : 'paused';
		agentRegistry.updateAgentStatus(agent.agentId, newStatus);
		setShowMenu(false);
	};

	const handleDelete = (e: React.MouseEvent) => {
		e.stopPropagation();
		agentRegistry.unregisterAgent(agent.agentId);
		setShowMenu(false);
	};

	return (
		<div
			className={`
				relative group
				flex items-center gap-2 px-2 py-1.5
				rounded-md border
				${isActive ? 'border-void-border-1 bg-void-bg-2' : 'border-void-border-3 bg-void-bg-1'}
				${onClick ? 'cursor-pointer hover:brightness-110' : ''}
				transition-all duration-200
				text-xs
				${isHovered ? 'shadow-sm' : ''}
			`}
			onClick={onClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				borderLeftColor: agent.color,
				borderLeftWidth: '3px',
				transform: isHovered ? 'translateX(2px)' : 'translateX(0)',
			}}
		>
			{/* Status indicator with pulse animation for working state */}
			<div
				className={`flex items-center justify-center w-4 h-4 ${agent.status === 'working' ? 'animate-pulse' : ''}`}
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
						<span
							className="text-void-fg-4 text-[10px] px-1 py-0.5 rounded bg-void-bg-3"
							data-tooltip-id='void-tooltip'
							data-tooltip-content={`${fileCount} file${fileCount !== 1 ? 's' : ''} modified`}
							data-tooltip-place='top'
						>
							{fileCount}
						</span>
					)}
				</div>
				{agent.taskDescription && (
					<span className="text-void-fg-3 text-[10px] truncate opacity-70">
						{agent.taskDescription}
					</span>
				)}
			</div>

			{/* Action menu button - shows on hover */}
			<div className={`
				flex-shrink-0 transition-opacity duration-200
				${isHovered || showMenu ? 'opacity-100' : 'opacity-0'}
			`}>
				<button
					onClick={(e) => {
						e.stopPropagation();
						setShowMenu(!showMenu);
					}}
					className="p-1 hover:bg-void-bg-3 rounded transition-colors"
				>
					<MoreVertical size={14} className="text-void-fg-3" />
				</button>

				{/* Dropdown menu */}
				{showMenu && (
					<div className="absolute right-0 top-full mt-1 z-50 bg-void-bg-1 border border-void-border-1 rounded-md shadow-lg min-w-[120px]">
						<button
							onClick={handlePauseResume}
							className="w-full px-3 py-1.5 text-left text-xs hover:bg-void-bg-2 flex items-center gap-2 text-void-fg-2"
						>
							{agent.status === 'paused' ? (
								<><Play size={12} /> Resume</>
							) : (
								<><Pause size={12} /> Pause</>
							)}
						</button>
						<button
							onClick={handleDelete}
							className="w-full px-3 py-1.5 text-left text-xs hover:bg-void-bg-2 flex items-center gap-2 text-void-warning"
						>
							<Trash2 size={12} /> Delete
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

const CreateAgentModal: React.FC<{ onClose: () => void; onCreate: (name: string, task: string) => void }> = ({ onClose, onCreate }) => {
	const [name, setName] = useState('');
	const [task, setTask] = useState('');

	const templates = [
		{ name: 'Auth Agent', task: 'Implement user authentication and authorization' },
		{ name: 'UI Agent', task: 'Update user interface and styling' },
		{ name: 'API Agent', task: 'Build REST API endpoints' },
		{ name: 'Test Agent', task: 'Write unit and integration tests' },
	];

	const handleCreate = () => {
		if (name.trim() && task.trim()) {
			onCreate(name.trim(), task.trim());
			onClose();
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
			<div
				className="bg-void-bg-1 border border-void-border-1 rounded-lg shadow-xl max-w-md w-full mx-4 animate-in fade-in duration-200"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-void-border-3">
					<h2 className="text-lg font-semibold text-void-fg-1">Create New Agent</h2>
					<button onClick={onClose} className="p-1 hover:bg-void-bg-2 rounded transition-colors">
						<Plus size={20} className="text-void-fg-3 rotate-45" />
					</button>
				</div>

				{/* Content */}
				<div className="p-4 space-y-4">
					{/* Name input */}
					<div>
						<label className="block text-xs font-medium text-void-fg-2 mb-1.5">Agent Name</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g., Feature Agent"
							className="w-full px-3 py-2 bg-void-bg-2 border border-void-border-3 rounded text-sm text-void-fg-1 focus:border-void-border-1 focus:outline-none transition-colors"
							autoFocus
						/>
					</div>

					{/* Task input */}
					<div>
						<label className="block text-xs font-medium text-void-fg-2 mb-1.5">Task Description</label>
						<textarea
							value={task}
							onChange={(e) => setTask(e.target.value)}
							placeholder="e.g., Implement user authentication"
							rows={3}
							className="w-full px-3 py-2 bg-void-bg-2 border border-void-border-3 rounded text-sm text-void-fg-1 focus:border-void-border-1 focus:outline-none transition-colors resize-none"
						/>
					</div>

					{/* Templates */}
					<div>
						<label className="block text-xs font-medium text-void-fg-2 mb-1.5">Quick Templates</label>
						<div className="grid grid-cols-2 gap-2">
							{templates.map((template, idx) => (
								<button
									key={idx}
									onClick={() => {
										setName(template.name);
										setTask(template.task);
									}}
									className="px-2 py-1.5 text-xs text-left bg-void-bg-2 hover:bg-void-bg-3 border border-void-border-3 rounded transition-colors"
								>
									<div className="font-medium text-void-fg-1">{template.name}</div>
									<div className="text-void-fg-4 text-[10px] truncate">{template.task}</div>
								</button>
							))}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="flex justify-end gap-2 p-4 border-t border-void-border-3">
					<button
						onClick={onClose}
						className="px-3 py-1.5 text-sm bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-2 rounded transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={handleCreate}
						disabled={!name.trim() || !task.trim()}
						className={`
							px-3 py-1.5 text-sm rounded transition-colors
							${name.trim() && task.trim()
								? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer'
								: 'bg-void-bg-3 text-void-fg-4 cursor-not-allowed opacity-50'
							}
						`}
					>
						Create Agent
					</button>
				</div>
			</div>
		</div>
	);
};

export const AgentStatusBar: React.FC<{ isVisible: boolean; onToggle: () => void }> = ({ isVisible, onToggle }) => {
	const accessor = useAccessor();
	const agentRegistry = accessor.get('IAgentRegistryService');
	const chatThreadService = accessor.get('IChatThreadService');

	const [agents, setAgents] = useState<IAgentMetadata[]>([]);
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [showCreateModal, setShowCreateModal] = useState(false);
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

	const handleCreateAgent = (name: string, task: string) => {
		chatThreadService.createAgentThread(name, task);
	};

	// Auto-collapse when no agents
	useEffect(() => {
		if (agents.length === 0) {
			setIsCollapsed(true);
		}
	}, [agents.length]);

	// Don't render if not visible
	if (!isVisible) {
		return null;
	}

	return (
		<>
			<div className="px-4 py-2 border-b border-void-border-3 animate-in slide-in-from-top duration-200">
				{/* Header with collapse button */}
				<div
					className="flex items-center justify-between mb-1.5 cursor-pointer select-none group"
					onClick={() => setIsCollapsed(!isCollapsed)}
				>
					<div className="flex items-center gap-1.5">
						<div className="transition-transform duration-200">
							{isCollapsed ? (
								<ChevronRight size={14} className="text-void-fg-3" />
							) : (
								<ChevronDown size={14} className="text-void-fg-3" />
							)}
						</div>
						<span className="text-xs font-medium text-void-fg-3 group-hover:text-void-fg-2 transition-colors">
							Active Agents
						</span>
						<span className="text-[10px] text-void-fg-4 opacity-60 px-1.5 py-0.5 rounded bg-void-bg-2">
							{agents.length}
						</span>
					</div>

					{/* Create agent button */}
					<button
						onClick={(e) => {
							e.stopPropagation();
							setShowCreateModal(true);
						}}
						className="p-1 hover:bg-void-bg-2 rounded transition-all duration-200 opacity-0 group-hover:opacity-100"
						data-tooltip-id='void-tooltip'
						data-tooltip-content='Create new agent'
						data-tooltip-place='top'
					>
						<Plus size={14} className="text-void-fg-3" />
					</button>
				</div>

				{/* Agent list with smooth collapse animation */}
				<div
					className={`
						overflow-hidden transition-all duration-300 ease-in-out
						${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[400px] opacity-100'}
					`}
				>
					{agents.length === 0 ? (
						<div className="py-4 text-center text-xs text-void-fg-4 opacity-60">
							No active agents. Click + to create one.
						</div>
					) : (
						<div className="flex flex-col gap-1.5 pt-1">
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
					)}
				</div>
			</div>

			{/* Create agent modal */}
			{showCreateModal && (
				<CreateAgentModal
					onClose={() => setShowCreateModal(false)}
					onCreate={handleCreateAgent}
				/>
			)}
		</>
	);
};
