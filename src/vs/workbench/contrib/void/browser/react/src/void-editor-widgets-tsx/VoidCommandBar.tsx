/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useRef } from 'react';
import { useAccessor, useCommandBarState, useIsDark } from '../util/services.js';
import { VoidCommandBarProps } from '../../../voidCommandBarService.js';
import {
	Check,
	EllipsisVertical,
	MoveDown,
	MoveLeft,
	MoveRight,
	MoveUp,
	X
} from 'lucide-react';
import {
	VOID_GOTO_NEXT_DIFF_ACTION_ID,
	VOID_GOTO_PREV_DIFF_ACTION_ID,
	VOID_GOTO_NEXT_URI_ACTION_ID,
	VOID_GOTO_PREV_URI_ACTION_ID,
	VOID_ACCEPT_FILE_ACTION_ID,
	VOID_REJECT_FILE_ACTION_ID,
	VOID_ACCEPT_ALL_DIFFS_ACTION_ID,
	VOID_REJECT_ALL_DIFFS_ACTION_ID
} from '../../../actionIDs.js';

import '../styles.css';

// --- Reusable UI Components ---

const Separator = () => (
	<div className="h-4 w-[1px] bg-void-border-2 opacity-50 mx-1" />
);

const IconButton = ({
	icon: Icon,
	onClick,
	disabled,
	tooltip,
	active,
	className = ''
}: {
	icon: React.ElementType,
	onClick: () => void,
	disabled?: boolean,
	tooltip?: string,
	active?: boolean,
	className?: string
}) => (
	<button
		type="button"
		onClick={disabled ? undefined : onClick}
		disabled={disabled}
		className={`
			p-1 rounded-sm
			flex items-center justify-center
			transition-all duration-200
			${disabled
				? 'opacity-30 cursor-not-allowed'
				: 'cursor-pointer hover:bg-void-bg-2-hover hover:scale-105 active:scale-95'
			}
			${active ? 'bg-void-bg-2-hover' : ''}
			text-void-fg-1
			${className}
		`}
		data-tooltip-id="void-tooltip"
		data-tooltip-content={tooltip}
		data-tooltip-delay-show={500}
	>
		<Icon size={16} strokeWidth={2} />
	</button>
);

const ActionButton = ({
	text,
	icon: Icon,
	onClick,
	variant = 'primary',
	tooltip,
	className = ''
}: {
	text: string,
	icon?: React.ElementType,
	onClick: () => void,
	variant?: 'primary' | 'secondary' | 'danger',
	tooltip?: string,
	className?: string
}) => {
	// Inline styles for VS Code theme variables to ensure correct theming
	const getStyle = () => {
		if (variant === 'primary') {
			return {
				backgroundColor: 'var(--vscode-button-background)',
				color: 'var(--vscode-button-foreground)',
			};
		}
		// Secondary / Danger usually map to secondary actions in this context
		return {
			backgroundColor: 'var(--vscode-button-secondaryBackground)',
			color: 'var(--vscode-button-secondaryForeground)',
		};
	};

	return (
		<button
			type="button"
			onClick={onClick}
			style={getStyle()}
			className={`
				px-2 py-0.5 rounded-sm
				flex items-center gap-1.5
				text-[11px] font-medium
				cursor-pointer
				transition-all duration-200
				hover:brightness-110 active:scale-95
				h-6
				border-none
				${className}
			`}
			data-tooltip-id="void-tooltip"
			data-tooltip-content={tooltip}
			data-tooltip-delay-show={500}
		>
			{Icon && <Icon size={12} strokeWidth={2.5} />}
			<span>{text}</span>
		</button>
	);
};

// --- Main Components ---

export const VoidCommandBarMain = ({ uri, editor }: VoidCommandBarProps) => {
	const isDark = useIsDark();

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<VoidCommandBar uri={uri} editor={editor} />
		</div>
	);
};

export const VoidCommandBar = ({ uri, editor }: VoidCommandBarProps) => {
	const accessor = useAccessor();
	const editCodeService = accessor.get('IEditCodeService');
	const metricsService = accessor.get('IMetricsService');
	const commandBarService = accessor.get('IVoidCommandBarService');
	const keybindingService = accessor.get('IKeybindingService');

	const { stateOfURI: commandBarState, sortedURIs: sortedCommandBarURIs } = useCommandBarState();
	const [showAcceptRejectAllButtons, setShowAcceptRejectAllButtons] = useState(false);

	// _latestValidUriIdxRef is used to remember place in navigation
	const _latestValidUriIdxRef = useRef<number | null>(null);

	// Find current index
	const i_ = sortedCommandBarURIs.findIndex(e => e.fsPath === uri?.fsPath);
	const currFileIdx = i_ === -1 ? null : i_;

	useEffect(() => {
		if (currFileIdx !== null) _latestValidUriIdxRef.current = currFileIdx;
	}, [currFileIdx]);

	// Auto-scroll to diff when URI changes
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			if (!uri) return;
			const s = commandBarService.stateOfURI[uri.fsPath];
			if (!s) return;
			const { diffIdx } = s;
			commandBarService.goToDiffIdx(diffIdx ?? 0);
		}, 50);
		return () => clearTimeout(timeoutId);
	}, [uri, commandBarService]);

	if (uri?.scheme !== 'file') return null;

	// --- Derived State & Variables ---

	const currDiffIdx = uri ? commandBarState[uri.fsPath]?.diffIdx ?? null : null;
	const sortedDiffIds = uri ? commandBarState[uri.fsPath]?.sortedDiffIds ?? [] : [];
	// used to check if we should render at all
	const sortedDiffZoneIds = uri ? commandBarState[uri.fsPath]?.sortedDiffZoneIds ?? [] : [];

	const isADiffInThisFile = sortedDiffIds.length !== 0;
	// const isADiffZoneInThisFile = sortedDiffZoneIds.length !== 0; // Unused
	const isADiffZoneInAnyFile = sortedCommandBarURIs.length !== 0;

	const streamState = uri ? commandBarService.getStreamState(uri) : null;
	// Only show Accept/Reject if not streaming and has changes
	const showAcceptRejectAll = streamState === 'idle-has-changes';

	// Nav Indices
	const nextDiffIdx = commandBarService.getNextDiffIdx(1);
	const prevDiffIdx = commandBarService.getNextDiffIdx(-1);
	const nextURIIdx = commandBarService.getNextUriIdx(1);
	const prevURIIdx = commandBarService.getNextUriIdx(-1);

	const upDownDisabled = prevDiffIdx === null || nextDiffIdx === null;
	const leftRightDisabled = prevURIIdx === null || nextURIIdx === null;

	// --- Actions ---

	const onAcceptFile = () => {
		if (!uri) return;
		editCodeService.acceptOrRejectAllDiffAreas({ uri, behavior: 'accept', removeCtrlKs: false, _addToHistory: true });
		metricsService.capture('Accept File', {});
	};
	const onRejectFile = () => {
		if (!uri) return;
		editCodeService.acceptOrRejectAllDiffAreas({ uri, behavior: 'reject', removeCtrlKs: false, _addToHistory: true });
		metricsService.capture('Reject File', {});
	};

	const onAcceptAll = () => {
		commandBarService.acceptOrRejectAllFiles({ behavior: 'accept' });
		metricsService.capture('Accept All', {});
		setShowAcceptRejectAllButtons(false);
	};

	const onRejectAll = () => {
		commandBarService.acceptOrRejectAllFiles({ behavior: 'reject' });
		metricsService.capture('Reject All', {});
		setShowAcceptRejectAllButtons(false);
	};

	// --- Keybindings ---

	const lookupKey = (id: string) => {
		const kb = keybindingService.lookupKeybinding(id);
		// processRawKeybindingText handles OS specific logic
		return editCodeService.processRawKeybindingText(kb?.getLabel() || kb?.getAriaLabel() || '');
	};

	const upKeybindLabel = lookupKey(VOID_GOTO_PREV_DIFF_ACTION_ID);
	const downKeybindLabel = lookupKey(VOID_GOTO_NEXT_DIFF_ACTION_ID);
	const leftKeybindLabel = lookupKey(VOID_GOTO_PREV_URI_ACTION_ID);
	const rightKeybindLabel = lookupKey(VOID_GOTO_NEXT_URI_ACTION_ID);
	const acceptFileKeybindLabel = lookupKey(VOID_ACCEPT_FILE_ACTION_ID);
	const rejectFileKeybindLabel = lookupKey(VOID_REJECT_FILE_ACTION_ID);
	const acceptAllKeybindLabel = lookupKey(VOID_ACCEPT_ALL_DIFFS_ACTION_ID);
	const rejectAllKeybindLabel = lookupKey(VOID_REJECT_ALL_DIFFS_ACTION_ID);

	if (!isADiffZoneInAnyFile) return null;

	// --- UX: Condensed Bar (If not in a tracked file) ---
	if (currFileIdx === null) {
		return (
			<div className="pointer-events-auto">
				<div className="flex items-center gap-2 p-1.5 bg-void-bg-2 rounded-md shadow-lg border border-void-border-2">
					<span className="text-xs font-medium text-void-fg-2 px-2">
						{`${sortedCommandBarURIs.length} file${sortedCommandBarURIs.length === 1 ? '' : 's'} changed`}
					</span>

					<Separator />

					<ActionButton
						text="Next File"
						icon={MoveRight}
						onClick={() => commandBarService.goToURIIdx(nextURIIdx)}
						variant="primary"
					/>
				</div>
			</div>
		);
	}

	// --- UX: Main Bar ---
	return (
		<div className="pointer-events-auto flex flex-col items-end gap-1">

			{/* Accept/Reject All Context Menu (floats above) */}
			{showAcceptRejectAllButtons && showAcceptRejectAll && (
				<div className="flex bg-void-bg-2 rounded-md shadow-xl border border-void-border-2 p-1 gap-1 animate-in fade-in zoom-in-95 duration-150 origin-bottom-right mb-1">
					<ActionButton
						text="Accept All"
						icon={Check}
						onClick={onAcceptAll}
						variant="primary"
						tooltip={acceptAllKeybindLabel}
					/>
					<ActionButton
						text="Reject All"
						icon={X}
						onClick={onRejectAll}
						variant="secondary"
						tooltip={rejectAllKeybindLabel}
					/>
				</div>
			)}

			{/* Main Control Bar */}
			<div className="flex items-center gap-1 p-1 bg-void-bg-2 rounded-md shadow-lg border border-void-border-1 ring-1 ring-black/5">

				{/* Diff Navigation */}
				<div className="flex items-center gap-0.5">
					<IconButton
						icon={MoveUp}
						onClick={() => commandBarService.goToDiffIdx(prevDiffIdx)}
						disabled={upDownDisabled}
						tooltip={upKeybindLabel}
					/>
					<div className="flex flex-col items-center justify-center min-w-[50px] px-1 select-none cursor-default">
						<span className="text-[9px] uppercase text-void-fg-3 font-semibold leading-none tracking-widest opacity-80">diff</span>
						<span className="text-xs text-void-fg-1 font-mono leading-none mt-0.5">
							{isADiffInThisFile ? `${(currDiffIdx ?? 0) + 1}/${sortedDiffIds.length}` : '-'}
						</span>
					</div>
					<IconButton
						icon={MoveDown}
						onClick={() => commandBarService.goToDiffIdx(nextDiffIdx)}
						disabled={upDownDisabled}
						tooltip={downKeybindLabel}
					/>
				</div>

				<Separator />

				{/* File Navigation */}
				<div className="flex items-center gap-0.5">
					<IconButton
						icon={MoveLeft}
						onClick={() => commandBarService.goToURIIdx(prevURIIdx)}
						disabled={leftRightDisabled}
						tooltip={leftKeybindLabel}
					/>
					<div className="flex flex-col items-center justify-center min-w-[50px] px-1 select-none cursor-default">
						<span className="text-[9px] uppercase text-void-fg-3 font-semibold leading-none tracking-widest opacity-80">file</span>
						<span className="text-xs text-void-fg-1 font-mono leading-none mt-0.5">
							{currFileIdx !== null ? `${currFileIdx + 1}/${sortedCommandBarURIs.length}` : '-'}
						</span>
					</div>
					<IconButton
						icon={MoveRight}
						onClick={() => commandBarService.goToURIIdx(nextURIIdx)}
						disabled={leftRightDisabled}
						tooltip={rightKeybindLabel}
					/>
				</div>

				{/* Actions (Accept/Reject) - Only if there are changes */}
				{showAcceptRejectAll && (
					<>
						<Separator />
						<div className="flex items-center gap-1 pl-1">
							<ActionButton
								text="Accept"
								icon={Check}
								onClick={onAcceptFile}
								variant="primary"
								tooltip={acceptFileKeybindLabel}
							/>
							<ActionButton
								text="Reject"
								icon={X}
								onClick={onRejectFile}
								variant="secondary"
								tooltip={rejectFileKeybindLabel}
							/>

							{/* More Options */}
							<IconButton
								icon={EllipsisVertical}
								onClick={() => setShowAcceptRejectAllButtons(!showAcceptRejectAllButtons)}
								active={showAcceptRejectAllButtons}
								tooltip="More options"
								className="ml-1"
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
};
