/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState, useMemo } from 'react';
import { useIsDark, useAccessor, useChatThreadsState, useFullChatThreadsStreamState } from '../util/services.js';
import '../styles.css';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { IconShell1 } from '../markdown/ApplyBlockHoverButtons.js';
import { Check, Copy, LoaderCircle, MessageCircleQuestion, Trash2, X, MoreHorizontal } from 'lucide-react';
import { IsRunningType, ThreadType } from '../../../chatThreadService.js';

export const ChatHistory = ({ className }: { className?: string }) => {
	const isDark = useIsDark();

	return (
		<div
			className={`@@void-scope ${isDark ? 'dark' : ''}`}
			style={{ width: '100%', height: '100%' }}
		>
			<div
				className={`
					w-full h-full
					bg-void-bg-2
					text-void-fg-1
				`}
			>
				<div className={`w-full h-full flex flex-col`}>
					<ErrorBoundary>
						<ChatHistoryContent />
					</ErrorBoundary>
				</div>
			</div>
		</div>
	);
};

const ChatHistoryContent = () => {
	const [visibleCount, setVisibleCount] = useState(5);
	const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [isSearchFocused, setIsSearchFocused] = useState(false);

	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');

	const threadsState = useChatThreadsState();
	const { allThreads, currentThreadId } = threadsState;

	const streamState = useFullChatThreadsStreamState();

	const runningThreadIds: { [threadId: string]: IsRunningType | undefined } = {};
	for (const threadId in streamState) {
		const isRunning = streamState[threadId]?.isRunning;
		if (isRunning) {
			runningThreadIds[threadId] = isRunning;
		}
	}

	// Handle new thread creation
	const handleNewThread = () => {
		try {
			chatThreadsService.openNewThread();
		} catch (error) {
			console.error('Error creating new thread:', error);
		}
	};

	// Filtered and sorted threads with memoization for performance
	const sortedThreadIds = useMemo(() => {
		if (!allThreads) {
			return [];
		}

		// Filter threads: non-empty and matching search query
		return Object.keys(allThreads)
			.filter((threadId) => {
				const thread = allThreads[threadId];
				if (!thread || thread.messages.length === 0) return false;

				// Apply search filter
				if (searchQuery.trim()) {
					const firstUserMsg = thread.messages.find((msg) => msg.role === 'user');
					const content = (firstUserMsg?.role === 'user' && firstUserMsg.displayContent) || '';
					return content.toLowerCase().includes(searchQuery.toLowerCase().trim());
				}

				return true;
			})
			.sort((threadId1, threadId2) => {
				const time1 = allThreads[threadId1]?.lastModified ?? 0;
				const time2 = allThreads[threadId2]?.lastModified ?? 0;
				return time1 > time2 ? -1 : 1;
			});
	}, [allThreads, searchQuery]);

	if (!allThreads) {
		return (
			<div className="flex flex-col h-full">
				<ChatHistoryHeader
					onNewThread={handleNewThread}
					searchQuery={searchQuery}
					setSearchQuery={setSearchQuery}
					isSearchFocused={isSearchFocused}
					setIsSearchFocused={setIsSearchFocused}
					threadCount={0}
				/>
				<div className="flex-1 overflow-auto px-2">
					<div className="flex flex-col items-center justify-center h-full text-void-fg-3">
						<MessageSquarePlus size={48} className="opacity-50 mb-4" />
						<p className="text-sm">Error accessing chat history.</p>
					</div>
				</div>
			</div>
		);
	}

	const displayThreads = sortedThreadIds.slice(0, visibleCount);
	const hasMoreThreads = sortedThreadIds.length > visibleCount;

	return (
		<div className="flex flex-col h-full">
			<ChatHistoryHeader
				onNewThread={handleNewThread}
				searchQuery={searchQuery}
				setSearchQuery={setSearchQuery}
				isSearchFocused={isSearchFocused}
				setIsSearchFocused={setIsSearchFocused}
				threadCount={sortedThreadIds.length}
			/>

			<div className="flex-1 overflow-y-auto overflow-x-hidden">
				{sortedThreadIds.length === 0 ? (
					searchQuery.trim() ? (
						// No search results
						<div className="flex flex-col items-center justify-center h-full text-void-fg-3 px-4 text-center">
							<p className="text-xs">No agents match "{searchQuery}"</p>
							<button
								onClick={() => setSearchQuery('')}
								className="mt-2 text-[10px] text-void-fg-2 hover:text-void-fg-1 underline"
							>
								Clear search
							</button>
						</div>
					) : (
						// Empty state - no threads at all
						<div className="flex flex-col items-center justify-center h-full text-void-fg-3 px-4 text-center">
							<p className="text-xs mb-1">No agents found</p>
							<button
								onClick={handleNewThread}
								className="text-[10px] opacity-60 hover:opacity-100 hover:underline"
							>
								Create New Agent
							</button>
						</div>
					)
				) : (
					<div className="flex flex-col w-full select-none pb-2">
						{/* Flat list of threads */}
						<div className="flex flex-col">
							{displayThreads.map((threadId, i) => {
								const pastThread = allThreads[threadId];
								if (!pastThread) return null;

								return (
									<PastThreadElement
										key={pastThread.id}
										pastThread={pastThread}
										idx={i}
										hoveredIdx={hoveredIdx}
										setHoveredIdx={setHoveredIdx}
										isRunning={runningThreadIds[pastThread.id]}
										isActive={currentThreadId === pastThread.id}
									/>
								);
							})}
						</div>

						{/* More button */}
						{hasMoreThreads && (
							<div
								className="flex items-center gap-2 py-1 px-3 mx-1 rounded-sm text-xs cursor-pointer text-void-fg-3 hover:text-void-fg-1 hover:bg-zinc-700/5 dark:hover:bg-zinc-300/5 transition-all opacity-80 hover:opacity-100"
								onClick={() => setVisibleCount((prev) => prev + 5)}
							>
								<MoreHorizontal size={12} className="flex-shrink-0 opacity-60" />
								<span className="truncate">More</span>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

// Header component with controls
const ChatHistoryHeader = ({
	onNewThread,
	searchQuery,
	setSearchQuery,
	isSearchFocused,
	setIsSearchFocused,
	threadCount,
}: {
	onNewThread: () => void;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	isSearchFocused: boolean;
	setIsSearchFocused: (focused: boolean) => void;
	threadCount: number;
}) => {
	return (
		<div className="flex flex-col gap-2 mb-2 flex-shrink-0 p-3 pb-1">
			{/* Search Bar */}
			<div
				className={`
					flex items-center gap-2 px-2 py-1.5 rounded
					bg-zinc-700/5 dark:bg-zinc-300/5
					border border-transparent
					${isSearchFocused ? 'border-void-stroke-1' : ''}
					transition-all
				`}
			>
				<input
					type="text"
					placeholder="Search Agents..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					onFocus={() => setIsSearchFocused(true)}
					onBlur={() => setIsSearchFocused(false)}
					className="flex-1 bg-transparent outline-none text-xs text-void-fg-1 placeholder:text-void-fg-3 placeholder:opacity-50"
				/>
			</div>

			{/* New Agent Button */}
			<button
				onClick={onNewThread}
				className={`
					w-full py-1.5 rounded
					border border-zinc-700/10 dark:border-zinc-300/10
					hover:bg-zinc-700/5 dark:hover:bg-zinc-300/5
					text-xs text-void-fg-1 transition-colors
					flex items-center justify-center gap-2 opacity-80 hover:opacity-100
				`}
			>
				New Agent
			</button>

			<div className="mt-1 text-[10px] font-semibold text-void-fg-3 opacity-50 uppercase tracking-wider pl-1">
				Agents
			</div>
		</div>
	);
};

// Format date to display as today, yesterday, or date
const formatDate = (date: Date) => {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	if (date >= today) {
		return 'Today';
	} else if (date >= yesterday) {
		return 'Yesterday';
	} else {
		return `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
	}
};

// Format time to 12-hour format
const formatTime = (date: Date) => {
	return date.toLocaleString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});
};

const DuplicateButton = ({ threadId }: { threadId: string }) => {
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');

	const handleDuplicate = (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			chatThreadsService.duplicateThread(threadId);
		} catch (error) {
			console.error('Error duplicating thread:', error);
		}
	};

	return (
		<IconShell1
			Icon={Copy}
			className="size-[11px]"
			onClick={handleDuplicate}
			data-tooltip-id="void-tooltip"
			data-tooltip-place="top"
			data-tooltip-content="Duplicate thread"
		/>
	);
};

const TrashButton = ({ threadId }: { threadId: string }) => {
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');

	const [isTrashPressed, setIsTrashPressed] = useState(false);

	const handleTrashClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsTrashPressed(true);
	};

	const handleCancel = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsTrashPressed(false);
	};

	const handleConfirm = (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			chatThreadsService.deleteThread(threadId);
			setIsTrashPressed(false);
		} catch (error) {
			console.error('Error deleting thread:', error);
			setIsTrashPressed(false);
		}
	};

	return isTrashPressed ? (
		<div className="flex flex-nowrap text-nowrap gap-1" onClick={(e) => e.stopPropagation()}>
			<IconShell1
				Icon={X}
				className="size-[11px]"
				onClick={handleCancel}
				data-tooltip-id="void-tooltip"
				data-tooltip-place="top"
				data-tooltip-content="Cancel"
			/>
			<IconShell1
				Icon={Check}
				className="size-[11px]"
				onClick={handleConfirm}
				data-tooltip-id="void-tooltip"
				data-tooltip-place="top"
				data-tooltip-content="Confirm delete"
			/>
		</div>
	) : (
		<IconShell1
			Icon={Trash2}
			className="size-[11px]"
			onClick={handleTrashClick}
			data-tooltip-id="void-tooltip"
			data-tooltip-place="top"
			data-tooltip-content="Delete thread"
		/>
	);
};

const PastThreadElement = ({
	pastThread,
	idx,
	hoveredIdx,
	setHoveredIdx,
	isRunning,
	isActive,
}: {
	pastThread: ThreadType;
	idx: number;
	hoveredIdx: number | null;
	setHoveredIdx: (idx: number | null) => void;
	isRunning: IsRunningType | undefined;
	isActive?: boolean;
}) => {
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');

	let firstMsg = null;
	const firstUserMsgIdx = pastThread.messages.findIndex((msg) => msg.role === 'user');

	if (firstUserMsgIdx !== -1) {
		const firstUserMsgObj = pastThread.messages[firstUserMsgIdx];
		firstMsg = (firstUserMsgObj.role === 'user' && firstUserMsgObj.displayContent) || '';
	} else {
		firstMsg = 'New Chat';
	}

	const displayMsg = firstMsg; // Let CSS handle truncation

	const handleClick = (e: React.MouseEvent) => {
		// Prevent click if clicking on action buttons
		if ((e.target as HTMLElement).closest('[data-action-button]')) {
			return;
		}
		try {
			chatThreadsService.switchToThread(pastThread.id);
		} catch (error) {
			console.error('Error switching thread:', error);
		}
	};

	return (
		<div
			key={pastThread.id}
			className={`
				group relative flex items-center justify-between
				py-1 px-3 mx-1 rounded-sm text-xs cursor-pointer transition-all
				${isActive
					? 'bg-void-bg-3 text-void-fg-1'
					: 'text-void-fg-2 hover:bg-zinc-700/5 dark:hover:bg-zinc-300/5 hover:text-void-fg-1'
				}
			`}
			onClick={handleClick}
			onMouseEnter={() => setHoveredIdx(idx)}
			onMouseLeave={() => setHoveredIdx(null)}
		>
			<div className="flex items-center gap-2 min-w-0 overflow-hidden flex-1">
				{/* Status indicator */}
				{isRunning === 'LLM' || isRunning === 'tool' || isRunning === 'idle' ? (
					<LoaderCircle className="animate-spin text-void-fg-3 flex-shrink-0" size={10} />
				) : isRunning === 'awaiting_user' ? (
					<MessageCircleQuestion className="text-void-fg-3 flex-shrink-0" size={10} />
				) : null}

				{/* Thread title */}
				<span
					className="truncate opacity-90"
					title={firstMsg}
				>
					{displayMsg}
				</span>
			</div>

			{/* Action buttons or details */}
			<div className="flex items-center pl-2 flex-shrink-0 h-4" data-action-button>
				{idx === hoveredIdx ? (
					<div className="flex items-center gap-1">
						<DuplicateButton threadId={pastThread.id} />
						<TrashButton threadId={pastThread.id} />
					</div>
				) : (
					<span className="text-[10px] text-void-fg-3 opacity-50 whitespace-nowrap">
						{formatDate(new Date(pastThread.lastModified))}
					</span>
				)}
			</div>
		</div>
	);
};
