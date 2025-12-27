/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { IFileConflict } from '../../../conflictDetectionService.js';
import { useAccessor } from '../util/services.js';
import { AlertTriangle, Check, X } from 'lucide-react';
import { getBasename } from './SidebarChat.js';

interface ConflictResolutionModalProps {
	conflict: IFileConflict;
	onClose: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({ conflict, onClose }) => {
	const accessor = useAccessor();
	const agentRegistry = accessor.get('IAgentRegistryService');
	const editCodeService = accessor.get('IEditCodeService');
	const conflictDetection = accessor.get('IConflictDetectionService');

	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

	const agents = conflict.conflictingAgents
		.map(id => agentRegistry.getAgent(id))
		.filter(Boolean);

	const handleAcceptAgent = (agentId: string) => {
		// Accept this agent's changes
		editCodeService.acceptOrRejectAllDiffAreas({
			uri: conflict.uri,
			behavior: 'accept',
			removeCtrlKs: false,
			agentId: agentId,
			_addToHistory: true
		});

		// Reject other agents' changes
		conflict.conflictingAgents
			.filter(id => id !== agentId)
			.forEach(id => {
				editCodeService.acceptOrRejectAllDiffAreas({
					uri: conflict.uri,
					behavior: 'reject',
					removeCtrlKs: false,
					agentId: id,
					_addToHistory: true
				});
			});

		// Mark conflict as resolved
		conflictDetection.resolveConflict(conflict.uri, 'accept_all');
		onClose();
	};

	const handleManualMerge = () => {
		// Open the file for manual editing
		const commandService = accessor.get('ICommandService');
		commandService.executeCommand('vscode.open', conflict.uri);
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="bg-void-bg-1 border border-void-border-1 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-void-border-3">
					<div className="flex items-center gap-2">
						<AlertTriangle className="text-void-warning" size={20} />
						<h2 className="text-lg font-semibold text-void-fg-1">
							Conflict Detected
						</h2>
					</div>
					<button
						onClick={onClose}
						className="p-1 hover:bg-void-bg-2 rounded transition-colors"
					>
						<X size={20} className="text-void-fg-3" />
					</button>
				</div>

				{/* Content */}
				<div className="p-4 overflow-y-auto flex-1">
					<p className="text-sm text-void-fg-2 mb-4">
						Multiple agents have modified <span className="font-mono text-void-fg-1">{getBasename(conflict.uri.fsPath)}</span>.
						Choose which agent's changes to keep:
					</p>

					{/* Agent options */}
					<div className="space-y-3">
						{agents.map(agent => {
							if (!agent) return null;
							const diffs = editCodeService.getDiffsByAgent(agent.agentId, conflict.uri);
							const isSelected = selectedAgentId === agent.agentId;

							return (
								<div
									key={agent.agentId}
									className={`
										border rounded-lg p-3 cursor-pointer transition-all
										${isSelected
											? 'border-void-border-1 bg-void-bg-2'
											: 'border-void-border-3 hover:border-void-border-2 hover:bg-void-bg-1-alt'
										}
									`}
									onClick={() => setSelectedAgentId(agent.agentId)}
									style={{ borderLeftColor: agent.color, borderLeftWidth: '3px' }}
								>
									<div className="flex items-center justify-between mb-2">
										<div className="flex items-center gap-2">
											<div
												className="w-3 h-3 rounded-full"
												style={{ backgroundColor: agent.color }}
											/>
											<span className="font-medium text-void-fg-1">
												{agent.name}
											</span>
										</div>
										<span className="text-xs text-void-fg-4">
											{diffs.length} change{diffs.length !== 1 ? 's' : ''}
										</span>
									</div>
									{agent.taskDescription && (
										<p className="text-xs text-void-fg-3 opacity-70">
											{agent.taskDescription}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between p-4 border-t border-void-border-3 gap-3">
					<button
						onClick={handleManualMerge}
						className="px-3 py-1.5 text-sm text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 rounded transition-colors"
					>
						Manual Merge
					</button>
					<div className="flex gap-2">
						<button
							onClick={onClose}
							className="px-3 py-1.5 text-sm bg-void-bg-2 hover:bg-void-bg-3 text-void-fg-2 rounded transition-colors"
						>
							Cancel
						</button>
						<button
							onClick={() => selectedAgentId && handleAcceptAgent(selectedAgentId)}
							disabled={!selectedAgentId}
							className={`
								px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1.5
								${selectedAgentId
									? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer'
									: 'bg-void-bg-3 text-void-fg-4 cursor-not-allowed opacity-50'
								}
							`}
						>
							<Check size={14} />
							Accept Selected
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export const ConflictNotifications: React.FC = () => {
	const accessor = useAccessor();
	const conflictDetection = accessor.get('IConflictDetectionService');

	const [conflicts, setConflicts] = useState<IFileConflict[]>([]);
	const [selectedConflict, setSelectedConflict] = useState<IFileConflict | null>(null);

	useEffect(() => {
		// Initial load
		setConflicts(conflictDetection.getActiveConflicts());

		// Subscribe to new conflicts
		const disposables = [
			conflictDetection.onDidDetectConflict(conflict => {
				setConflicts(prev => [...prev, conflict]);
			}),
			conflictDetection.onDidResolveConflict(uri => {
				setConflicts(prev => prev.filter(c => c.uri.fsPath !== uri.fsPath));
			})
		];

		return () => {
			disposables.forEach(d => d.dispose());
		};
	}, [conflictDetection]);

	// Show modal for first unresolved conflict
	useEffect(() => {
		if (conflicts.length > 0 && !selectedConflict) {
			setSelectedConflict(conflicts[0]);
		}
	}, [conflicts, selectedConflict]);

	if (!selectedConflict) {
		return null;
	}

	return (
		<ConflictResolutionModal
			conflict={selectedConflict}
			onClose={() => setSelectedConflict(null)}
		/>
	);
};
