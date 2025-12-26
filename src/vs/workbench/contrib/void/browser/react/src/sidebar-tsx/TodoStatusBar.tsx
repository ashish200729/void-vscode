/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { TodoItem } from '../../../../common/chatThreadServiceTypes.js';
import { Loader, Circle, ChevronRight, ChevronDown, Check } from 'lucide-react';

interface TodoStatusBarProps {
	todos: TodoItem[];
}

interface DisplayTodos {
	current: TodoItem | undefined;
	next: TodoItem | undefined;
	completedCount: number;
	totalCount: number;
	pendingTodos: TodoItem[];
	completedTodos: TodoItem[];
}

const getDisplayTodos = (todos: TodoItem[]): DisplayTodos => {
	const inProgress = todos.find(t => t.status === 'in_progress');
	const pendingTodos = todos.filter(t => t.status === 'pending');
	const completedTodos = todos.filter(t => t.status === 'completed');
	const nextPending = pendingTodos[0];

	return {
		current: inProgress,
		next: nextPending,
		completedCount: completedTodos.length,
		totalCount: todos.length,
		pendingTodos,
		completedTodos
	};
};

export const TodoStatusBar = ({ todos }: TodoStatusBarProps) => {
	const [isExpanded, setIsExpanded] = useState(false);

	if (!todos || todos.length === 0) return null;

	const { current, next, completedCount, totalCount, pendingTodos, completedTodos } = getDisplayTodos(todos);

	// Don't show if there's nothing in progress and nothing pending
	if (!current && !next) return null;

	const progressPercent = (completedCount / totalCount) * 100;
	const hasMoreTodos = totalCount > (current ? 1 : 0) + (next ? 1 : 0);

	return (
		<div className="todo-status-bar mx-3 mb-2 mt-2 px-2.5 py-2 bg-void-bg-3 rounded-md">
			{/* Compact header with progress */}
			<div
				className="flex items-center justify-between mb-1.5 cursor-pointer group"
				onClick={() => hasMoreTodos && setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-1.5">
					<div className="w-1 h-1 rounded-full bg-void-accent animate-pulse" />
					<span className="text-xs font-semibold text-void-fg-2">Tasks</span>
					{hasMoreTodos && (
						<div className="opacity-0 group-hover:opacity-100 transition-opacity">
							{isExpanded ? (
								<ChevronDown size={12} className="text-void-fg-3" />
							) : (
								<ChevronRight size={12} className="text-void-fg-3" />
							)}
						</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-void-fg-3 font-medium">{completedCount}/{totalCount}</span>
					<div className="w-12 h-0.5 bg-void-bg-4 rounded-full overflow-hidden">
						<div
							className="h-full bg-void-accent transition-all duration-500 ease-out"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
				</div>
			</div>

			{/* Tasks container */}
			{!isExpanded ? (
				<div className="space-y-1">
					{/* Current task */}
					{current && (
						<div className="flex items-center gap-1.5 group">
							<Loader
								size={12}
								className="flex-shrink-0 text-void-accent animate-spin"
							/>
							<span className="text-xs text-void-fg-2 truncate flex-1 font-medium">
								{current.content}
							</span>
						</div>
					)}

					{/* Next task */}
					{next && (
						<div className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
							<Circle
								size={12}
								className="flex-shrink-0 text-void-fg-3"
							/>
							<span className="text-xs text-void-fg-3 truncate flex-1">
								{next.content}
							</span>
							{hasMoreTodos && (
								<ChevronRight
									size={10}
									className="flex-shrink-0 text-void-fg-3 opacity-50"
								/>
							)}
						</div>
					)}
				</div>
			) : (
				<div className="space-y-1.5 max-h-64 overflow-y-auto">
					{/* Current task */}
					{current && (
						<div className="flex items-center gap-1.5 group">
							<Loader
								size={12}
								className="flex-shrink-0 text-void-accent animate-spin"
							/>
							<span className="text-xs text-void-fg-2 flex-1 font-medium">
								{current.content}
							</span>
						</div>
					)}

					{/* All pending tasks */}
					{pendingTodos.map((todo) => (
						<div key={todo.id} className="flex items-center gap-1.5 opacity-70">
							<Circle
								size={12}
								className="flex-shrink-0 text-void-fg-3"
							/>
							<span className="text-xs text-void-fg-3 flex-1">
								{todo.content}
							</span>
						</div>
					))}

					{/* Completed tasks */}
					{completedTodos.length > 0 && (
						<>
							<div className="border-t border-void-border my-1.5 pt-1.5">
								<span className="text-xs text-void-fg-3 opacity-60 font-medium">Completed</span>
							</div>
							{completedTodos.map((todo) => (
								<div key={todo.id} className="flex items-center gap-1.5 opacity-50">
									<Check
										size={12}
										className="flex-shrink-0 text-green-500"
									/>
									<span className="text-xs text-void-fg-3 flex-1 line-through">
										{todo.content}
									</span>
								</div>
							))}
						</>
					)}
				</div>
			)}
		</div>
	);
};
