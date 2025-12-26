/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { TodoItem } from '../../../../common/chatThreadServiceTypes.js';
import { Check, Circle, Loader } from 'lucide-react';

interface TodoListDisplayProps {
	todos: TodoItem[];
	readonly?: boolean;
}

export const TodoListDisplay = ({ todos, readonly = false }: TodoListDisplayProps) => {
	if (!todos || todos.length === 0) return null;

	const completedCount = todos.filter(t => t.status === 'completed').length;
	const progressPercent = (completedCount / todos.length) * 100;

	return (
		<div className="todo-list-container my-3 p-3 rounded border border-void-border">
			{/* Progress bar */}
			<div className="mb-2">
				<div className="flex justify-between text-xs text-void-fg-3 mb-1">
					<span>Progress</span>
					<span>{completedCount}/{todos.length} completed</span>
				</div>
				<div className="h-1.5 bg-void-bg-4 rounded overflow-hidden">
					<div
						className="h-full bg-void-accent transition-all duration-300"
						style={{ width: `${progressPercent}%` }}
					/>
				</div>
			</div>

			{/* Todo items */}
			<div className="space-y-2 mt-3">
				{todos.map(todo => (
					<TodoItemRow key={todo.id} item={todo} readonly={readonly} />
				))}
			</div>
		</div>
	);
};

const TodoItemRow = ({ item, readonly }: { item: TodoItem; readonly: boolean }) => {
	const Icon = item.status === 'completed' ? Check :
				 item.status === 'in_progress' ? Loader : Circle;

	const textStyle = item.status === 'completed' ? 'line-through opacity-60' : '';

	return (
		<div className="flex items-start gap-2 text-sm">
			<Icon
				size={16}
				className={`mt-0.5 flex-shrink-0 ${
					item.status === 'completed' ? 'text-green-500' :
					item.status === 'in_progress' ? 'text-blue-500' :
					'text-void-fg-3'
				}`}
			/>
			<span className={`flex-1 ${textStyle}`}>{item.content}</span>
		</div>
	);
};


