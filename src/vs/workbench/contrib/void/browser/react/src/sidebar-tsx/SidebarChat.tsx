/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { ButtonHTMLAttributes, FormEvent, FormHTMLAttributes, Fragment, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useSettingsState, useActiveURI, useCommandBarState, useFullChatThreadsStreamState } from '../util/services.js';
import { ScrollType } from '../../../../../../../editor/common/editorCommon.js';

import { ChatMarkdownRender, ChatMessageLocation, getApplyBoxId } from '../markdown/ChatMarkdownRender.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ErrorDisplay } from './ErrorDisplay.js';
import { BlockCode, TextAreaFns, VoidCustomDropdownBox, VoidInputBox2, VoidSlider, VoidSwitch, VoidDiffEditor } from '../util/inputs.js';
import { ModelDropdown, } from '../void-settings-tsx/ModelDropdown.js';
import { PastThreadsList } from './SidebarThreadSelector.js';
import { VOID_CTRL_L_ACTION_ID } from '../../../actionIDs.js';
import { VOID_OPEN_SETTINGS_ACTION_ID } from '../../../voidSettingsPane.js';
import { ChatMode, displayInfoOfProviderName, FeatureName, isFeatureNameDisabled } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { WarningBox } from '../void-settings-tsx/WarningBox.js';
import { getModelCapabilities, getIsReasoningEnabledState } from '../../../../common/modelCapabilities.js';
import { AlertTriangle, File, Ban, Check, ChevronRight, Dot, FileIcon, Pencil, Undo, Undo2, X, Flag, Copy as CopyIcon, Info, CirclePlus, Ellipsis, CircleEllipsis, Folder, ALargeSmall, TypeOutline, Text, Image as ImageIcon } from 'lucide-react';
import { ChatMessage, CheckpointEntry, StagingSelectionItem, ToolMessage } from '../../../../common/chatThreadServiceTypes.js';
import { approvalTypeOfBuiltinToolName, BuiltinToolCallParams, BuiltinToolName, ToolName, LintErrorItem, ToolApprovalType, toolApprovalTypes } from '../../../../common/toolsServiceTypes.js';
import { CopyButton, EditToolAcceptRejectButtonsHTML, IconShell1, JumpToFileButton, JumpToTerminalButton, StatusIndicator, StatusIndicatorForApplyButton, useApplyStreamState, useEditToolStreamState } from '../markdown/ApplyBlockHoverButtons.js';
import { IsRunningType } from '../../../chatThreadService.js';
import { acceptAllBg, acceptBorder, buttonFontSize, buttonTextColor, rejectAllBg, rejectBg, rejectBorder } from '../../../../common/helpers/colors.js';
import { builtinToolNames, isABuiltinToolName, MAX_FILE_CHARS_PAGE, MAX_TERMINAL_INACTIVE_TIME } from '../../../../common/prompt/prompts.js';
import { RawToolCallObj, RawToolParamsObj } from '../../../../common/sendLLMMessageTypes.js';
import ErrorBoundary from './ErrorBoundary.js';
import { ToolApprovalTypeSwitch } from '../void-settings-tsx/Settings.js';

import { persistentTerminalNameOfId } from '../../../terminalToolService.js';
import { removeMCPToolNamePrefix } from '../../../../common/mcpServiceTypes.js';
import { TextShimmer } from '../util/TextShimmer.js';



export const IconX = ({ size, className = '', ...props }: { size: number, className?: string } & React.SVGProps<SVGSVGElement>) => {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width={size}
			height={size}
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			className={className}
			{...props}
		>
			<path
				strokeLinecap='round'
				strokeLinejoin='round'
				d='M6 18 18 6M6 6l12 12'
			/>
		</svg>
	);
};

const IconArrowUp = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			width={size}
			height={size}
			className={className}
			viewBox="0 0 20 20"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fill="black"
				fillRule="evenodd"
				clipRule="evenodd"
				d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
			></path>
		</svg>
	);
};


const IconSquare = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			className={className}
			stroke="black"
			fill="black"
			strokeWidth="0"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect x="2" y="2" width="20" height="20" rx="4" ry="4" />
		</svg>
	);
};


export const IconWarning = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			className={className}
			stroke="currentColor"
			fill="currentColor"
			strokeWidth="0"
			viewBox="0 0 16 16"
			width={size}
			height={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M7.56 1h.88l6.54 12.26-.44.74H1.44L1 13.26 7.56 1zM8 2.28L2.28 13H13.7L8 2.28zM8.625 12v-1h-1.25v1h1.25zm-1.25-2V6h1.25v4h-1.25z"
			/>
		</svg>
	);
};


export const IconLoading = ({ className = '' }: { className?: string }) => {
	const [dotCount, setDotCount] = useState(1);

	useEffect(() => {
		const intervalId = setInterval(() => {
			setDotCount((prev) => (prev >= 3 ? 1 : prev + 1));
		}, 350);
		return () => clearInterval(intervalId);
	}, []);

	return (
		<div
			className={`inline-flex items-center justify-center font-medium text-sm tracking-wider text-gray-500 dark:text-gray-400 transition-all duration-200 ${className}`}
		>
			<span className="inline-block animate-pulse">Working{'.'.repeat(dotCount)}</span>
		</div>
	);
};

export const CircleSpinner = ({ size = 14, className = '' }: { size?: number, className?: string }) => {
	return (
		<svg
			className={`animate-spin ${className}`}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="3"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	);
};


// SLIDER ONLY:
const ReasoningOptionSlider = ({ featureName }: { featureName: FeatureName }) => {
	const accessor = useAccessor()

	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()

	const modelSelection = voidSettingsState.modelSelectionOfFeature[featureName]
	const overridesOfModel = voidSettingsState.overridesOfModel

	if (!modelSelection) return null

	const { modelName, providerName } = modelSelection
	const { reasoningCapabilities } = getModelCapabilities(providerName, modelName, overridesOfModel)
	const { canTurnOffReasoning, reasoningSlider: reasoningBudgetSlider } = reasoningCapabilities || {}

	const modelSelectionOptions = voidSettingsState.optionsOfModelSelection[featureName][providerName]?.[modelName]
	const isReasoningEnabled = getIsReasoningEnabledState(featureName, providerName, modelName, modelSelectionOptions, overridesOfModel)

	if (canTurnOffReasoning && !reasoningBudgetSlider) { // if it's just a on/off toggle without a power slider
		return <div className='flex items-center gap-x-2'>
			<span className='text-void-fg-3 text-xs pointer-events-none inline-block w-10 pr-1'>Thinking</span>
			<VoidSwitch
				size='xxs'
				value={isReasoningEnabled}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && !newVal
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff })
				}}
			/>
		</div>
	}

	if (reasoningBudgetSlider?.type === 'budget_slider') { // if it's a slider
		const { min: min_, max, default: defaultVal } = reasoningBudgetSlider

		const nSteps = 8 // only used in calculating stepSize, stepSize is what actually matters
		const stepSize = Math.round((max - min_) / nSteps)

		const valueIfOff = min_ - stepSize
		const min = canTurnOffReasoning ? valueIfOff : min_
		const value = isReasoningEnabled ? voidSettingsState.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName]?.reasoningBudget ?? defaultVal
			: valueIfOff

		return <div className='flex items-center gap-x-2'>
			<span className='text-void-fg-3 text-xs pointer-events-none inline-block w-10 pr-1'>Thinking</span>
			<VoidSlider
				width={50}
				size='xs'
				min={min}
				max={max}
				step={stepSize}
				value={value}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && newVal === valueIfOff
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff, reasoningBudget: newVal })
				}}
			/>
			<span className='text-void-fg-3 text-xs pointer-events-none'>{isReasoningEnabled ? `${value} tokens` : 'Thinking disabled'}</span>
		</div>
	}

	if (reasoningBudgetSlider?.type === 'effort_slider') {

		const { values, default: defaultVal } = reasoningBudgetSlider

		const min = canTurnOffReasoning ? -1 : 0
		const max = values.length - 1

		const currentEffort = voidSettingsState.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName]?.reasoningEffort ?? defaultVal
		const valueIfOff = -1
		const value = isReasoningEnabled && currentEffort ? values.indexOf(currentEffort) : valueIfOff

		const currentEffortCapitalized = currentEffort.charAt(0).toUpperCase() + currentEffort.slice(1, Infinity)

		return <div className='flex items-center gap-x-2'>
			<span className='text-void-fg-3 text-xs pointer-events-none inline-block w-10 pr-1'>Thinking</span>
			<VoidSlider
				width={30}
				size='xs'
				min={min}
				max={max}
				step={1}
				value={value}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && newVal === valueIfOff
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff, reasoningEffort: values[newVal] ?? undefined })
				}}
			/>
			<span className='text-void-fg-3 text-xs pointer-events-none'>{isReasoningEnabled ? `${currentEffortCapitalized}` : 'Thinking disabled'}</span>
		</div>
	}

	return null
}



const nameOfChatMode = {
	'normal': 'Chat',
	'gather': 'Gather',
	'agent': 'Agent',
}

const detailOfChatMode = {
	'normal': 'Normal chat mode',
	'gather': 'Reads files, but can\'t edit',
	'agent': 'Edits files and uses tools',
}


const ChatModeDropdown = ({ className }: { className: string }) => {
	const accessor = useAccessor()

	const voidSettingsService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()

	const options: ChatMode[] = useMemo(() => ['normal', 'gather', 'agent'], [])

	const onChangeOption = useCallback((newVal: ChatMode) => {
		voidSettingsService.setGlobalSetting('chatMode', newVal)
	}, [voidSettingsService])

	return <VoidCustomDropdownBox
		className={className}
		options={options}
		selectedOption={settingsState.globalSettings.chatMode}
		onChangeOption={onChangeOption}
		getOptionDisplayName={(val) => nameOfChatMode[val]}
		getOptionDropdownName={(val) => nameOfChatMode[val]}
		getOptionDropdownDetail={(val) => detailOfChatMode[val]}
		getOptionsEqual={(a, b) => a === b}
		matchInputWidth={false}
		offsetPx={-3}
	/>
}





interface VoidChatAreaProps {
	// Required
	children: React.ReactNode; // This will be the input component

	// Form controls
	onSubmit: () => void;
	onAbort: () => void;
	isStreaming: boolean;
	isDisabled?: boolean;
	divRef?: React.RefObject<HTMLDivElement | null>;

	// UI customization
	className?: string;
	showModelDropdown?: boolean;
	showSelections?: boolean;
	showProspectiveSelections?: boolean;
	loadingIcon?: React.ReactNode;

	selections?: StagingSelectionItem[]
	setSelections?: (s: StagingSelectionItem[]) => void
	// selections?: any[];
	// onSelectionsChange?: (selections: any[]) => void;

	onClickAnywhere?: () => void;
	// Optional close button
	onClose?: () => void;
	// Optional image button in bottom row
	imageButton?: React.ReactNode;
	// Drag and drop handlers for images
	onDragEnter?: (e: React.DragEvent) => void;
	onDragOver?: (e: React.DragEvent) => void;
	onDragLeave?: (e: React.DragEvent) => void;
	onDrop?: (e: React.DragEvent) => void;
	isDragOver?: boolean;

	featureName: FeatureName;
}

export const VoidChatArea: React.FC<VoidChatAreaProps> = ({
	children,
	onSubmit,
	onAbort,
	onClose,
	onClickAnywhere,
	divRef,
	isStreaming = false,
	isDisabled = false,
	className = '',
	showModelDropdown = true,
	showSelections = false,
	showProspectiveSelections = false,
	selections,
	setSelections,
	featureName,
	loadingIcon,
	imageButton,
	onDragEnter,
	onDragOver,
	onDragLeave,
	onDrop,
	isDragOver = false,
}) => {
	return (
		<div
			ref={divRef}
			className={`
				gap-x-1
                flex flex-col p-2 relative input text-left shrink-0
                rounded-md
                bg-void-bg-1
				transition-all duration-200
				border ${isDragOver ? 'border-void-border-1 border-2 border-dashed bg-void-bg-2-alt/50 ring-2 ring-void-border-1/30' : 'border-void-border-3'} focus-within:border-void-border-1 hover:border-void-border-1
				max-h-[80vh] overflow-y-auto
                ${className}
            `}
			onClick={(e) => {
				onClickAnywhere?.()
			}}
			onDragEnter={onDragEnter}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			{/* Selections section */}
			{showSelections && selections && setSelections && (
				<SelectedFiles
					type='staging'
					selections={selections}
					setSelections={setSelections}
					showProspectiveSelections={showProspectiveSelections}
				/>
			)}

			{/* Input section */}
			<div className="relative w-full">
				{children}

				{/* Close button (X) if onClose is provided */}
				{onClose && (
					<div className='absolute -top-1 -right-1 cursor-pointer z-1'>
						<IconX
							size={12}
							className="stroke-[2] opacity-80 text-void-fg-3 hover:brightness-95"
							onClick={onClose}
						/>
					</div>
				)}
			</div>

			{/* Bottom row */}
			<div className='flex flex-row justify-between items-end gap-1'>
			{showModelDropdown && (
				<div className="flex flex-col gap-y-1">
					<ReasoningOptionSlider featureName={featureName} />

					<div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-nowrap">
					{featureName === 'Chat' && (
						<ChatModeDropdown className="text-xs text-void-fg-3 bg-transparent p-0 min-w-[100px]" />
					)}
					<ModelDropdown
						featureName={featureName}
						className="text-xs text-void-fg-3 bg-transparent p-0"
					/>
					</div>
				</div>
				)}

				<div className="flex items-center gap-2">

					{imageButton}

					{isStreaming && loadingIcon}

					{isStreaming ? (
						<ButtonStop onClick={onAbort} />
					) : (
						<ButtonSubmit
							onClick={onSubmit}
							disabled={isDisabled}
						/>
					)}
				</div>

			</div>
		</div>
	);
};




type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>
const DEFAULT_BUTTON_SIZE = 22;
export const ButtonSubmit = ({ className, disabled, ...props }: ButtonProps & Required<Pick<ButtonProps, 'disabled'>>) => {

	return <button
		type='button'
		className={`rounded-full flex-shrink-0 flex-grow-0 flex items-center justify-center
			${disabled ? 'bg-vscode-disabled-fg cursor-default' : 'bg-white cursor-pointer'}
			${className}
		`}
		// data-tooltip-id='void-tooltip'
		// data-tooltip-content={'Send'}
		// data-tooltip-place='left'
		{...props}
	>
		<IconArrowUp size={DEFAULT_BUTTON_SIZE} className="stroke-[2] p-[2px]" />
	</button>
}

export const ButtonAddImage = ({ className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
	return <button
		type='button'
		className={`rounded-full flex-shrink-0 flex-grow-0 cursor-pointer flex items-center justify-center
			bg-void-bg-3 hover:bg-void-bg-2 text-void-fg-3 hover:text-void-fg-2
			transition-all duration-200 hover:scale-105 active:scale-95
			${className}
		`}
		onClick={onClick}
		{...props}
		title="Add image (or drag & drop)"
	>
		<ImageIcon size={DEFAULT_BUTTON_SIZE} className="stroke-[2] p-[2px]" />
	</button>
}

export const ButtonStop = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
	return <button
		className={`rounded-full flex-shrink-0 flex-grow-0 cursor-pointer flex items-center justify-center
			bg-white
			${className}
		`}
		type='button'
		{...props}
	>
		<IconSquare size={DEFAULT_BUTTON_SIZE} className="stroke-[3] p-[7px]" />
	</button>
}



const scrollToBottom = (divRef: { current: HTMLElement | null }) => {
	if (divRef.current) {
		divRef.current.scrollTop = divRef.current.scrollHeight;
	}
};



const ScrollToBottomContainer = ({ children, className, style, scrollContainerRef }: { children: React.ReactNode, className?: string, style?: React.CSSProperties, scrollContainerRef: React.MutableRefObject<HTMLDivElement | null> }) => {
	const [isAtBottom, setIsAtBottom] = useState(true); // Start at bottom

	const divRef = scrollContainerRef

	const onScroll = () => {
		const div = divRef.current;
		if (!div) return;

		const isBottom = Math.abs(
			div.scrollHeight - div.clientHeight - div.scrollTop
		) < 4;

		setIsAtBottom(isBottom);
	};

	// When children change (new messages added)
	useEffect(() => {
		if (isAtBottom) {
			scrollToBottom(divRef);
		}
	}, [children, isAtBottom]); // Dependency on children to detect new messages

	// Initial scroll to bottom
	useEffect(() => {
		scrollToBottom(divRef);
	}, []);

	return (
		<div
			ref={divRef}
			onScroll={onScroll}
			className={className}
			style={style}
		>
			{children}
		</div>
	);
};

export const getRelative = (uri: URI, accessor: ReturnType<typeof useAccessor>) => {
	const workspaceContextService = accessor.get('IWorkspaceContextService')
	let path: string
	const isInside = workspaceContextService.isInsideWorkspace(uri)
	if (isInside) {
		const f = workspaceContextService.getWorkspace().folders.find(f => uri.fsPath?.startsWith(f.uri.fsPath))
		if (f) { path = uri.fsPath.replace(f.uri.fsPath, '') }
		else { path = uri.fsPath }
	}
	else {
		path = uri.fsPath
	}
	return path || undefined
}

export const getFolderName = (pathStr: string) => {
	// 'unixify' path
	pathStr = pathStr.replace(/[/\\]+/g, '/') // replace any / or \ or \\ with /
	const parts = pathStr.split('/') // split on /
	// Filter out empty parts (the last element will be empty if path ends with /)
	const nonEmptyParts = parts.filter(part => part.length > 0)
	if (nonEmptyParts.length === 0) return '/' // Root directory
	if (nonEmptyParts.length === 1) return nonEmptyParts[0] + '/' // Only one folder
	// Get the last two parts
	const lastTwo = nonEmptyParts.slice(-2)
	return lastTwo.join('/') + '/'
}

export const getBasename = (pathStr: string, parts: number = 1) => {
	// 'unixify' path
	pathStr = pathStr.replace(/[/\\]+/g, '/') // replace any / or \ or \\ with /
	const allParts = pathStr.split('/') // split on /
	if (allParts.length === 0) return pathStr
	return allParts.slice(-parts).join('/')
}



// Open file utility function
export const voidOpenFileFn = (
	uri: URI,
	accessor: ReturnType<typeof useAccessor>,
	range?: [number, number]
) => {
	const commandService = accessor.get('ICommandService')
	const editorService = accessor.get('ICodeEditorService')

	// Get editor selection from CodeSelection range
	let editorSelection = undefined;

	// If we have a selection, create an editor selection from the range
	if (range) {
		editorSelection = {
			startLineNumber: range[0],
			startColumn: 1,
			endLineNumber: range[1],
			endColumn: Number.MAX_SAFE_INTEGER,
		};
	}

	// open the file
	commandService.executeCommand('vscode.open', uri).then(() => {

		// select the text
		setTimeout(() => {
			if (!editorSelection) return;

			const editor = editorService.getActiveCodeEditor()
			if (!editor) return;

			editor.setSelection(editorSelection)
			editor.revealRange(editorSelection, ScrollType.Immediate)

		}, 50) // needed when document was just opened and needs to initialize

	})

};


export const SelectedFiles = (
	{ type, selections, setSelections, showProspectiveSelections, messageIdx, }:
		| { type: 'past', selections: StagingSelectionItem[]; setSelections?: undefined, showProspectiveSelections?: undefined, messageIdx: number, }
		| { type: 'staging', selections: StagingSelectionItem[]; setSelections: ((newSelections: StagingSelectionItem[]) => void), showProspectiveSelections?: boolean, messageIdx?: number }
) => {

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const modelReferenceService = accessor.get('IVoidModelService')




	// state for tracking prospective files
	const { uri: currentURI } = useActiveURI()
	const [recentUris, setRecentUris] = useState<URI[]>([])
	const maxRecentUris = 10
	const maxProspectiveFiles = 3
	useEffect(() => { // handle recent files
		if (!currentURI) return
		setRecentUris(prev => {
			const withoutCurrent = prev.filter(uri => uri.fsPath !== currentURI.fsPath) // remove duplicates
			const withCurrent = [currentURI, ...withoutCurrent]
			return withCurrent.slice(0, maxRecentUris)
		})
	}, [currentURI])
	const [prospectiveSelections, setProspectiveSelections] = useState<StagingSelectionItem[]>([])


	// handle prospective files
	useEffect(() => {
		const computeRecents = async () => {
			const prospectiveURIs = recentUris
				.filter(uri => !selections.find(s => s.type === 'File' && s.uri.fsPath === uri.fsPath))
				.slice(0, maxProspectiveFiles)

			const answer: StagingSelectionItem[] = []
			for (const uri of prospectiveURIs) {
				answer.push({
					type: 'File',
					uri: uri,
					language: (await modelReferenceService.getModelSafe(uri)).model?.getLanguageId() || 'plaintext',
					state: { wasAddedAsCurrentFile: false },
				})
			}
			return answer
		}

		// add a prospective file if type === 'staging' and if the user is in a file, and if the file is not selected yet
		if (type === 'staging' && showProspectiveSelections) {
			computeRecents().then((a) => setProspectiveSelections(a))
		}
		else {
			setProspectiveSelections([])
		}
	}, [recentUris, selections, type, showProspectiveSelections])


	const allSelections = [...selections, ...prospectiveSelections]

	if (allSelections.length === 0) {
		return null
	}

	return (
		<div className='flex items-center flex-wrap text-left relative gap-x-0.5 gap-y-1 pb-0.5'>

			{allSelections.map((selection, i) => {

				const isThisSelectionProspective = i > selections.length - 1

				const thisKey = selection.type === 'CodeSelection' ? selection.type + selection.language + selection.range + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
					: selection.type === 'File' ? selection.type + selection.language + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
						: selection.type === 'Folder' ? selection.type + selection.language + selection.state + selection.uri.fsPath
							: i

				const SelectionIcon = (
					selection.type === 'File' ? File
						: selection.type === 'Folder' ? Folder
							: selection.type === 'CodeSelection' ? Text
								: (undefined as never)
				)

				return <div // container for summarybox and code
					key={thisKey}
					className={`flex flex-col space-y-[1px]`}
				>
					{/* tooltip for file path */}
					<span className="truncate overflow-hidden text-ellipsis"
						data-tooltip-id='void-tooltip'
						data-tooltip-content={getRelative(selection.uri, accessor)}
						data-tooltip-place='top'
						data-tooltip-delay-show={3000}
					>
						{/* summarybox */}
						<div
							className={`
								flex items-center gap-1 relative
								px-1
								w-fit h-fit
								select-none
								text-xs text-nowrap
								border rounded-sm
								${isThisSelectionProspective ? 'bg-void-bg-1 text-void-fg-3 opacity-80' : 'bg-void-bg-1 hover:brightness-95 text-void-fg-1'}
								${isThisSelectionProspective
									? 'border-void-border-2'
									: 'border-void-border-1'
								}
								hover:border-void-border-1
								transition-all duration-150
							`}
							onClick={() => {
								if (type !== 'staging') return; // (never)
								if (isThisSelectionProspective) { // add prospective selection to selections
									setSelections([...selections, selection])
								}
								else if (selection.type === 'File') { // open files
									voidOpenFileFn(selection.uri, accessor);

									const wasAddedAsCurrentFile = selection.state.wasAddedAsCurrentFile
									if (wasAddedAsCurrentFile) {
										// make it so the file is added permanently, not just as the current file
										const newSelection: StagingSelectionItem = { ...selection, state: { ...selection.state, wasAddedAsCurrentFile: false } }
										setSelections([
											...selections.slice(0, i),
											newSelection,
											...selections.slice(i + 1)
										])
									}
								}
								else if (selection.type === 'CodeSelection') {
									voidOpenFileFn(selection.uri, accessor, selection.range);
								}
								else if (selection.type === 'Folder') {
									// TODO!!! reveal in tree
								}
							}}
						>
							{<SelectionIcon size={10} />}

							{ // file name and range
								getBasename(selection.uri.fsPath)
								+ (selection.type === 'CodeSelection' ? ` (${selection.range[0]}-${selection.range[1]})` : '')
							}

							{selection.type === 'File' && selection.state.wasAddedAsCurrentFile && messageIdx === undefined && currentURI?.fsPath === selection.uri.fsPath ?
								<span className={`text-[8px] 'void-opacity-60 text-void-fg-4`}>
									{`(Current File)`}
								</span>
								: null
							}

							{type === 'staging' && !isThisSelectionProspective ? // X button
								<div // box for making it easier to click
									className='cursor-pointer z-1 self-stretch flex items-center justify-center'
									onClick={(e) => {
										e.stopPropagation(); // don't open/close selection
										if (type !== 'staging') return;
										setSelections([...selections.slice(0, i), ...selections.slice(i + 1)])
									}}
								>
									<IconX
										className='stroke-[2]'
										size={10}
									/>
								</div>
								: <></>
							}
						</div>
					</span>
				</div>

			})}


		</div>

	)
}


type ToolHeaderParams = {
	icon?: React.ReactNode;
	iconTooltip?: string;
	title: React.ReactNode;
	desc1: React.ReactNode;
	desc1OnClick?: () => void;
	desc2?: React.ReactNode;
	isError?: boolean;
	info?: string;
	desc1Info?: string;
	isRejected?: boolean;
	numResults?: number;
	hasNextPage?: boolean;
	children?: React.ReactNode;
	bottomChildren?: React.ReactNode;
	onClick?: () => void;
	desc2OnClick?: () => void;
	isOpen?: boolean;
	className?: string;
	isRunning?: boolean;
}

export const ToolHeaderWrapper = ({
	icon,
	iconTooltip,
	title,
	desc1,
	desc1OnClick,
	desc1Info,
	desc2,
	numResults,
	hasNextPage,
	children,
	info,
	bottomChildren,
	isError,
	onClick,
	desc2OnClick,
	isOpen,
	isRejected,
	className,
	isRunning = false,
}: ToolHeaderParams) => {
	const [isOpen_, setIsOpen] = useState(false);

	const isExpanded = isOpen !== undefined ? isOpen : isOpen_;
	const isDropdown = children !== undefined;
	const isClickable = !!(isDropdown || onClick);
	const isDesc1Clickable = !!desc1OnClick;

	// Detect if running from icon tooltip (fallback detection)
	const detectedIsRunning = iconTooltip === 'Running...' || isRunning;

	const desc1HTML = (
		<span
			className={`ml-1 text-[9px] italic truncate text-void-fg-4
				${isDesc1Clickable ? 'cursor-pointer' : ''}
			`}
			onClick={desc1OnClick}
			{...desc1Info
				? {
						'data-tooltip-id': 'void-tooltip',
						'data-tooltip-content': desc1Info,
						'data-tooltip-place': 'top',
						'data-tooltip-delay-show': 1000,
				  }
				: {}}
		>
			{desc1}
		</span>
	);

	const showErrorBadge = isError && !icon;
	const showRejectedBadge = isRejected && !icon;

	const iconTooltipProps = iconTooltip
		? {
				'data-tooltip-id': 'void-tooltip',
				'data-tooltip-content': iconTooltip,
				'data-tooltip-place': 'top' as const,
		  }
		: {};

	return (
		<div className={`w-full relative ${className || ''}`}>

			{/* header */}
			<div
				className={`relative flex items-center justify-between select-none
					${isRejected ? 'line-through opacity-50' : ''}
				`}
			>
			{/* left section */}
			<div className="flex items-center gap-1 overflow-hidden min-w-0">
				{/* clickable title section */}
				<div
					className={`flex items-center gap-0.5 min-w-0 overflow-hidden
						${isClickable ? 'cursor-pointer' : ''}
					`}
					onClick={() => {
						if (isDropdown) setIsOpen((v) => !v);
						if (onClick) onClick();
					}}
				>
					{isDropdown && (
						<ChevronRight
							className={`h-2.5 w-2.5 text-void-fg-4 transition-transform duration-150 ease-in-out ${
								isExpanded ? 'rotate-90' : ''
							}`}
						/>
					)}
					{icon && (
						<span
							className="flex items-center justify-center text-void-fg-4"
							{...iconTooltipProps}
						>
							{icon}
						</span>
					)}

					{detectedIsRunning && typeof title === 'string' ? (
						<TextShimmer
							className="font-medium text-[10px] text-void-fg-3 truncate"
							duration={1.5}
							spread={3}
						>
							{title}
						</TextShimmer>
					) : (
						<span className="font-medium text-[10px] text-void-fg-3 truncate">
							{title}
						</span>
					)}

					{!isDesc1Clickable && desc1HTML}
				</div>

				{isDesc1Clickable && desc1HTML}
			</div>

			{/* right section */}
			<div className="flex items-center gap-1 flex-shrink-0 text-[9px] text-void-fg-4">
					{info && (
						<CircleEllipsis
							className="opacity-60"
							size={10}
							data-tooltip-id="void-tooltip"
							data-tooltip-content={info}
							data-tooltip-place="top-end"
						/>
					)}

					{showErrorBadge && (
						<AlertTriangle
							className="text-void-fg-4 opacity-70"
							size={10}
							data-tooltip-id="void-tooltip"
							data-tooltip-content={'Error running tool'}
							data-tooltip-place="top"
						/>
					)}
					{showRejectedBadge && (
						<Ban
							className="text-void-fg-4 opacity-60"
							size={10}
							data-tooltip-id="void-tooltip"
							data-tooltip-content={'Canceled'}
							data-tooltip-place="top"
						/>
					)}

					{desc2 && (
						<span
							onClick={desc2OnClick}
							className="cursor-pointer"
						>
							{desc2}
						</span>
					)}

					{numResults !== undefined && (
						<span className="ml-0.5 text-void-fg-4 opacity-70">
							{`${numResults}${hasNextPage ? '+' : ''} result${
								numResults !== 1 ? 's' : ''
							}`}
						</span>
					)}
				</div>
			</div>

	{/* collapsible children */}
	<div
		className={`overflow-hidden text-void-fg-4 transition-all duration-200 ease-in-out
			${isExpanded ? 'opacity-100' : 'opacity-0 max-h-0'}
		`}
	>
		{children}
	</div>

			{bottomChildren}
		</div>
	);
};



const EditTool = ({ toolMessage, threadId, messageIdx, content }: Parameters<ResultWrapper<'edit_file' | 'rewrite_file'>>[0] & { content: string }) => {
	const accessor = useAccessor()
	const isError = false
	const isRejected = toolMessage.type === 'rejected'

	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
	const statusIconMeta = getToolStatusIconMeta(toolMessage)

	const { rawParams, params, name } = toolMessage
	const desc1OnClick = params?.uri ? () => voidOpenFileFn(params.uri, accessor) : undefined
	const isRunning = toolMessage.type === 'running_now' || toolMessage.type === 'tool_request'

	const editToolType = toolMessage.name === 'edit_file' ? 'diff' : 'rewrite'
	const isEditRunning = isRunning

	const componentParams: ToolHeaderParams = {
		title,
		desc1,
		desc1OnClick,
		desc1Info,
		isError,
		isRejected,
		icon: statusIconMeta?.icon,
		iconTooltip: statusIconMeta?.tooltip,
		isRunning,
	}

	// Handle running state
	if (isEditRunning && params?.uri) {
		componentParams.children = (
			<EditToolCardWrapper isRunning={true}>
				<ToolChildrenWrapper>
					<EditToolChildren
						uri={params.uri}
						code={content}
						type={editToolType}
					/>
				</ToolChildrenWrapper>
			</EditToolCardWrapper>
		)
	}
	// Handle completed states
	else if (toolMessage.type === 'success' || toolMessage.type === 'rejected' || toolMessage.type === 'tool_error') {
		if (params?.uri) {
			const applyBoxId = getApplyBoxId({
				threadId: threadId,
				messageIdx: messageIdx,
				tokenIdx: 'N/A',
			})
			componentParams.desc2 = (
				<EditToolHeaderButtons
					applyBoxId={applyBoxId}
					uri={params.uri}
					codeStr={content}
					toolName={name}
					threadId={threadId}
				/>
			)

			componentParams.children = (
				<EditToolCardWrapper isRunning={false}>
					<ToolChildrenWrapper>
						<EditToolChildren
							uri={params.uri}
							code={content}
							type={editToolType}
						/>
					</ToolChildrenWrapper>
				</EditToolCardWrapper>
			)
		}

		// Handle lint errors for success/rejected
		if ((toolMessage.type === 'success' || toolMessage.type === 'rejected') && toolMessage.result?.lintErrors) {
			componentParams.bottomChildren = (
				<BottomChildren title='Lint errors'>
					{toolMessage.result.lintErrors.map((error, i) => (
						<div key={i} className='whitespace-nowrap'>
							Lines {error.startLineNumber}-{error.endLineNumber}: {error.message}
						</div>
					))}
				</BottomChildren>
			)
		}
		// Handle tool errors
		else if (toolMessage.type === 'tool_error') {
			componentParams.bottomChildren = (
				<BottomChildren title='Error'>
					<CodeChildren>
						{toolMessage.result}
					</CodeChildren>
				</BottomChildren>
			)
		}
	}

	return <ToolHeaderWrapper {...componentParams} />
}

const SimplifiedToolHeader = ({
	title,
	children,
}: {
	title: string;
	children?: React.ReactNode;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const isDropdown = children !== undefined;
	return (
		<div>
			<div className="w-full">
				{/* header */}
				<div
					className={`select-none flex items-center min-h-[24px] ${isDropdown ? 'cursor-pointer' : ''}`}
					onClick={() => {
						if (isDropdown) { setIsOpen(v => !v); }
					}}
				>
					{isDropdown && (
						<ChevronRight
							className={`text-void-fg-3 mr-0.5 h-4 w-4 flex-shrink-0 transition-transform duration-100 ease-[cubic-bezier(0.4,0,0.2,1)] ${isOpen ? 'rotate-90' : ''}`}
						/>
					)}
					<div className="flex items-center w-full overflow-hidden">
						<span className="text-void-fg-3">{title}</span>
					</div>
				</div>
				{/* children */}
				{<div
					className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'opacity-100' : 'max-h-0 opacity-0'} text-void-fg-4`}
				>
					{children}
				</div>}
			</div>
		</div>
	);
};




const UserMessageComponent = ({ chatMessage, messageIdx, isCheckpointGhost, currCheckpointIdx, _scrollToBottom }: { chatMessage: ChatMessage & { role: 'user' }, messageIdx: number, currCheckpointIdx: number | undefined, isCheckpointGhost: boolean, _scrollToBottom: (() => void) | null }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	// global state
	let isBeingEdited = false
	let stagingSelections: StagingSelectionItem[] = []
	let setIsBeingEdited = (_: boolean) => { }
	let setStagingSelections = (_: StagingSelectionItem[]) => { }

	if (messageIdx !== undefined) {
		const _state = chatThreadsService.getCurrentMessageState(messageIdx)
		isBeingEdited = _state.isBeingEdited
		stagingSelections = _state.stagingSelections
		setIsBeingEdited = (v) => chatThreadsService.setCurrentMessageState(messageIdx, { isBeingEdited: v })
		setStagingSelections = (s) => chatThreadsService.setCurrentMessageState(messageIdx, { stagingSelections: s })
	}


	// local state
	const mode: ChatBubbleMode = isBeingEdited ? 'edit' : 'display'
	const [isFocused, setIsFocused] = useState(false)
	const [isHovered, setIsHovered] = useState(false)
	const [isDisabled, setIsDisabled] = useState(false)
	const [textAreaRefState, setTextAreaRef] = useState<HTMLTextAreaElement | null>(null)
	const textAreaFnsRef = useRef<TextAreaFns | null>(null)
	const [editImages, setEditImages] = useState<string[]>([])
	// initialize on first render, and when edit was just enabled
	const _mustInitialize = useRef(true)
	const _justEnabledEdit = useRef(false)
	useEffect(() => {
		const canInitialize = mode === 'edit' && textAreaRefState
		const shouldInitialize = _justEnabledEdit.current || _mustInitialize.current
		if (canInitialize && shouldInitialize) {
			setStagingSelections(
				(chatMessage.selections || []).map(s => { // quick hack so we dont have to do anything more
					if (s.type === 'File') return { ...s, state: { ...s.state, wasAddedAsCurrentFile: false, } }
					else return s
				})
			)

			// Initialize images for edit mode
			setEditImages(chatMessage.images || [])

			if (textAreaFnsRef.current)
				textAreaFnsRef.current.setValue(chatMessage.displayContent || '')

			textAreaRefState.focus();

			_justEnabledEdit.current = false
			_mustInitialize.current = false
		}

	}, [chatMessage, mode, _justEnabledEdit, textAreaRefState, textAreaFnsRef.current, _justEnabledEdit.current, _mustInitialize.current])

	const onOpenEdit = () => {
		setIsBeingEdited(true)
		chatThreadsService.setCurrentlyFocusedMessageIdx(messageIdx)
		_justEnabledEdit.current = true
	}
	const onCloseEdit = () => {
		setIsFocused(false)
		setIsHovered(false)
		setIsBeingEdited(false)
		chatThreadsService.setCurrentlyFocusedMessageIdx(undefined)

	}

	const EditSymbol = mode === 'display' ? Pencil : X

	// Hooks must not be conditional: define edit image handlers outside mode branches
	const handleEditImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		const imagePromises: Promise<string>[] = []
		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (!file.type.startsWith('image/')) continue

			const promise = new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = (event) => {
					const dataUrl = event.target?.result as string
					resolve(dataUrl)
				}
				reader.onerror = reject
				reader.readAsDataURL(file)
			})
			imagePromises.push(promise)
		}

		Promise.all(imagePromises).then((dataUrls) => {
			setEditImages(prev => [...prev, ...dataUrls])
		}).catch((error) => {
			console.error('Error reading image files:', error)
		})

		e.target.value = ''
	}, [])

	const removeEditImage = useCallback((index: number) => {
		setEditImages(prev => prev.filter((_, i) => i !== index))
	}, [])


	let chatbubbleContents: React.ReactNode
	if (mode === 'display') {
		chatbubbleContents = <>
			<SelectedFiles type='past' messageIdx={messageIdx} selections={chatMessage.selections || []} />
			{/* Display images if present */}
			{chatMessage.images && chatMessage.images.length > 0 && (
				<div className='flex flex-wrap gap-1.5 px-0.5 mb-1'>
					{chatMessage.images.map((imageUrl, index) => (
						<img
							key={index}
							src={imageUrl}
							alt={`Image ${index + 1}`}
							className='w-12 h-12 object-cover rounded border border-void-border-3 shadow-sm'
						/>
					))}
				</div>
			)}
			<span className='px-0.5'>{chatMessage.displayContent}</span>
		</>
	}
	else if (mode === 'edit') {

		const onSubmit = async () => {

			if (isDisabled) return;
			if (!textAreaRefState) return;
			if (messageIdx === undefined) return;

			// cancel any streams on this thread
			const threadId = chatThreadsService.state.currentThreadId

			await chatThreadsService.abortRunning(threadId)

			// update state
			setIsBeingEdited(false)
			chatThreadsService.setCurrentlyFocusedMessageIdx(undefined)

			// stream the edit
			const userMessage = textAreaRefState.value;
			try {
				// Images are preserved from the original message when editing
				// The editUserMessageAndStreamResponse method automatically preserves images
				await chatThreadsService.editUserMessageAndStreamResponse({ userMessage, messageIdx, threadId })
			} catch (e) {
				console.error('Error while editing message:', e)
			}
			await chatThreadsService.focusCurrentChat()
			requestAnimationFrame(() => _scrollToBottom?.())
		}

		const onAbort = async () => {
			const threadId = chatThreadsService.state.currentThreadId
			await chatThreadsService.abortRunning(threadId)
		}

		const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Escape') {
				onCloseEdit()
			}
			if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
				onSubmit()
			}
		}

		if (!chatMessage.content) { // don't show if empty and not loading (if loading, want to show).
			return null
		}

		chatbubbleContents = <VoidChatArea
			featureName='Chat'
			onSubmit={onSubmit}
			onAbort={onAbort}
			isStreaming={false}
			isDisabled={isDisabled}
			showSelections={true}
			showProspectiveSelections={false}
			selections={stagingSelections}
			setSelections={setStagingSelections}
		>
			<VoidInputBox2
				enableAtToMention
				ref={setTextAreaRef}
				className='min-h-[81px] max-h-[500px] px-0.5'
				placeholder="Edit your message..."
				onChangeText={(text) => setIsDisabled(!text)}
				onFocus={() => {
					setIsFocused(true)
					chatThreadsService.setCurrentlyFocusedMessageIdx(messageIdx);
				}}
				onBlur={() => {
					setIsFocused(false)
				}}
				onKeyDown={onKeyDown}
				fnsRef={textAreaFnsRef}
				multiline={true}
			/>

			{/* Image upload and preview for edit mode */}
			<div className='flex flex-col gap-1 mt-1'>
				{editImages.length > 0 && (
					<div className='flex flex-wrap gap-1.5'>
						{editImages.map((imageUrl, index) => (
							<div key={index} className='relative'>
								<img
									src={imageUrl}
									alt={`Edit ${index + 1}`}
									className='w-12 h-12 object-cover rounded border border-void-border-3 shadow-sm'
								/>
								<button
									type='button'
									onClick={() => removeEditImage(index)}
									className='absolute -top-1 -right-1 bg-void-bg-3 rounded-full p-0.5 hover:brightness-125 cursor-pointer shadow-sm'
								>
									<IconX size={12} className='stroke-[2]' />
								</button>
							</div>
						))}
					</div>
				)}
				<label className='cursor-pointer text-xs text-void-fg-3 hover:text-void-fg-2 inline-flex items-center gap-1'>
					<input
						type='file'
						accept='image/*'
						multiple
						onChange={handleEditImageSelect}
						className='hidden'
					/>
					<svg width={14} height={14} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}>
						<rect x='3' y='3' width='18' height='18' rx='2' ry='2' />
						<circle cx='8.5' cy='8.5' r='1.5' />
						<polyline points='21 15 16 10 5 21' />
					</svg>
					Add image{editImages.length > 0 ? ` (${editImages.length})` : ''}
				</label>
			</div>
		</VoidChatArea>
	}

	const isMsgAfterCheckpoint = currCheckpointIdx !== undefined && currCheckpointIdx === messageIdx - 1

	return <div
		// align chatbubble accoridng to role
		className={`
        relative ml-auto
        ${mode === 'edit' ? 'w-full max-w-full'
				: mode === 'display' ? `self-end w-fit max-w-full whitespace-pre-wrap` : '' // user words should be pre
			}

        ${isCheckpointGhost && !isMsgAfterCheckpoint ? 'opacity-50 pointer-events-none' : ''}
    `}
		onMouseEnter={() => setIsHovered(true)}
		onMouseLeave={() => setIsHovered(false)}
	>
		<div
			// style chatbubble according to role
			className={`
            text-left rounded-lg max-w-full
            ${mode === 'edit' ? ''
					: mode === 'display' ? 'p-2 flex flex-col bg-void-bg-1 text-void-fg-1 overflow-x-auto cursor-pointer' : ''
				}
        `}
			onClick={() => { if (mode === 'display') { onOpenEdit() } }}
		>
			{chatbubbleContents}
		</div>



		<div
			className="absolute -top-1 -right-1 translate-x-0 -translate-y-0 z-1"
		// data-tooltip-id='void-tooltip'
		// data-tooltip-content='Edit message'
		// data-tooltip-place='left'
		>
			<EditSymbol
				size={18}
				className={`
                    cursor-pointer
                    p-[2px]
                    bg-void-bg-1 border border-void-border-1 rounded-md
                    transition-opacity duration-200 ease-in-out
                    ${isHovered || (isFocused && mode === 'edit') ? 'opacity-100' : 'opacity-0'}
                `}
				onClick={() => {
					if (mode === 'display') {
						onOpenEdit()
					} else if (mode === 'edit') {
						onCloseEdit()
					}
				}}
			/>
		</div>


	</div>

}

const SmallProseWrapper = ({ children }: { children: React.ReactNode }) => {
	return <div className='
text-void-fg-3
prose
prose-sm
break-words
max-w-none
leading-relaxed
text-[13px]

[&>:first-child]:!mt-0
[&>:last-child]:!mb-0

prose-h1:text-[14px]
prose-h1:my-3
prose-h1:leading-tight
prose-h1:text-void-fg-2

prose-h2:text-[13px]
prose-h2:my-3
prose-h2:leading-tight
prose-h2:text-void-fg-2

prose-h3:text-[13px]
prose-h3:my-2.5
prose-h3:leading-tight
prose-h3:text-void-fg-2

prose-h4:text-[13px]
prose-h4:my-2
prose-h4:leading-tight
prose-h4:text-void-fg-2

prose-p:my-2
prose-p:leading-relaxed
prose-hr:my-2
prose-hr:border-void-border-3/20

prose-ul:my-2
prose-ul:pl-4
prose-ul:list-outside
prose-ul:list-disc
prose-ul:leading-relaxed

prose-ol:my-2
prose-ol:pl-4
prose-ol:list-outside
prose-ol:list-decimal
prose-ol:leading-relaxed

marker:text-inherit

prose-blockquote:pl-2
prose-blockquote:my-2
prose-blockquote:border-l-2
prose-blockquote:border-l-void-border-3/30
prose-blockquote:italic

prose-code:text-void-fg-2
prose-code:text-[12px]
prose-code:bg-void-bg-2-alt/40
prose-code:px-1
prose-code:py-0.5
prose-code:rounded
prose-code:before:content-none
prose-code:after:content-none

prose-pre:text-[12px]
prose-pre:p-2
prose-pre:my-2
prose-pre:bg-void-bg-2-alt/50
prose-pre:border
prose-pre:border-void-border-3/20
prose-pre:rounded

prose-table:text-[13px]
'>
		{children}
	</div>
}

const ProseWrapper = ({ children }: { children: React.ReactNode }) => {
	return <div className='
text-void-fg-1
prose
prose-sm
break-words
prose-p:block
prose-p:leading-relaxed
prose-p:my-2.5
prose-hr:my-4
prose-hr:border-void-border-3/30
prose-pre:my-2
prose-pre:bg-void-bg-2-alt/50
prose-pre:border
prose-pre:border-void-border-3/20
prose-pre:rounded
marker:text-inherit
prose-ol:list-outside
prose-ol:list-decimal
prose-ol:leading-relaxed
prose-ol:my-2
prose-ul:list-outside
prose-ul:list-disc
prose-ul:leading-relaxed
prose-ul:my-2
prose-li:my-1
prose-code:before:content-none
prose-code:after:content-none
prose-code:text-void-fg-1
prose-code:bg-void-bg-2-alt/40
prose-code:px-1
prose-code:py-0.5
prose-code:rounded
prose-headings:prose-sm
prose-headings:font-bold
prose-headings:text-void-fg-1
prose-headings:my-3
prose-headings:leading-tight
prose-blockquote:border-l-2
prose-blockquote:border-l-void-border-1/50
prose-blockquote:pl-3
prose-blockquote:my-3
prose-blockquote:italic
prose-blockquote:text-void-fg-2

max-w-none
'
	>
		{children}
	</div>
}
const AssistantMessageComponent = ({ chatMessage, isCheckpointGhost, isCommitted, messageIdx }: { chatMessage: ChatMessage & { role: 'assistant' }, isCheckpointGhost: boolean, messageIdx: number, isCommitted: boolean }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	const reasoningStr = chatMessage.reasoning?.trim() || null
	const hasReasoning = !!reasoningStr
	const isDoneReasoning = !!chatMessage.displayContent
	const thread = chatThreadsService.getCurrentThread()


	const chatMessageLocation: ChatMessageLocation = {
		threadId: thread.id,
		messageIdx: messageIdx,
	}

	const isEmpty = !chatMessage.displayContent && !chatMessage.reasoning
	if (isEmpty) return null

	return <div className={`w-full ${isCheckpointGhost ? 'opacity-50' : ''}`}>
		{/* reasoning token */}
		{hasReasoning &&
			<div className={`mb-3 last:mb-0 ${isCheckpointGhost ? 'opacity-50' : ''}`}>
				<ReasoningWrapper isDoneReasoning={isDoneReasoning} isStreaming={!isCommitted}>
					<SmallProseWrapper>
						<ChatMarkdownRender
							string={reasoningStr}
							chatMessageLocation={chatMessageLocation}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</SmallProseWrapper>
				</ReasoningWrapper>
			</div>
		}

		{/* assistant message */}
		{chatMessage.displayContent &&
			<div className={isCheckpointGhost ? 'opacity-50' : ''}>
				<ProseWrapper>
					<ChatMarkdownRender
						string={chatMessage.displayContent || ''}
						chatMessageLocation={chatMessageLocation}
						isApplyEnabled={true}
						isLinkDetectionEnabled={true}
					/>
				</ProseWrapper>
			</div>
		}
	</div>

}

const ReasoningWrapper = ({ isDoneReasoning, isStreaming, children }: { isDoneReasoning: boolean, isStreaming: boolean, children: React.ReactNode }) => {
	const isDone = isDoneReasoning || !isStreaming
	const isWriting = !isDone
	const [isOpen, setIsOpen] = useState(isWriting)
	useEffect(() => {
		if (!isWriting) setIsOpen(false) // if just finished reasoning, close
	}, [isWriting])
	// Don't show loading icon inside reasoning block - the main loading indicator handles this
	return <ToolHeaderWrapper title='Reasoning' desc1={''} isOpen={isOpen} onClick={() => setIsOpen(v => !v)}>
		<ToolChildrenWrapper>
			<div className='!select-text cursor-auto'>
				{children}
			</div>
		</ToolChildrenWrapper>
	</ToolHeaderWrapper>
}




// should either be past or "-ing" tense, not present tense. Eg. when the LLM searches for something, the user expects it to say "I searched for X" or "I am searching for X". Not "I search X".

const loadingTitleWrapper = (item: React.ReactNode): React.ReactNode => {
	// Only apply shimmer if item is a string
	if (typeof item === 'string') {
		return <TextShimmer
			className="flex items-center flex-nowrap"
			duration={1.5}
			spread={3}
		>
			{item}
		</TextShimmer>
	}
	return <span className='flex items-center flex-nowrap'>
		{item}
	</span>
}

const titleOfBuiltinToolName = {
	'read_file': { done: 'Read file', proposed: 'Read file', running: loadingTitleWrapper('Reading file') },
	'ls_dir': { done: 'Inspected folder', proposed: 'Inspect folder', running: loadingTitleWrapper('Inspecting folder') },
	'get_dir_tree': { done: 'Inspected folder tree', proposed: 'Inspect folder tree', running: loadingTitleWrapper('Inspecting folder tree') },
	'search_pathnames_only': { done: 'Searched by file name', proposed: 'Search by file name', running: loadingTitleWrapper('Searching by file name') },
	'search_for_files': { done: 'Searched', proposed: 'Search', running: loadingTitleWrapper('Searching') },
	'create_file_or_folder': { done: `Created`, proposed: `Create`, running: loadingTitleWrapper(`Creating`) },
	'delete_file_or_folder': { done: `Deleted`, proposed: `Delete`, running: loadingTitleWrapper(`Deleting`) },
	'edit_file': { done: `Edited file`, proposed: 'Edit file', running: loadingTitleWrapper('Editing file') },
	'rewrite_file': { done: `Wrote file`, proposed: 'Write file', running: loadingTitleWrapper('Writing file') },
	'run_command': { done: `Ran terminal`, proposed: 'Run terminal', running: loadingTitleWrapper('Running terminal') },
	'run_persistent_command': { done: `Ran terminal`, proposed: 'Run terminal', running: loadingTitleWrapper('Running terminal') },

	'open_persistent_terminal': { done: `Opened terminal`, proposed: 'Open terminal', running: loadingTitleWrapper('Opening terminal') },
	'kill_persistent_terminal': { done: `Killed terminal`, proposed: 'Kill terminal', running: loadingTitleWrapper('Killing terminal') },

	'read_lint_errors': { done: `Read lint errors`, proposed: 'Read lint errors', running: loadingTitleWrapper('Reading lint errors') },
	'search_in_file': { done: 'Searched in file', proposed: 'Search in file', running: loadingTitleWrapper('Searching in file') },
} as const satisfies Record<BuiltinToolName, { done: any, proposed: any, running: any }>

type ToolStatusIconMeta = {
	icon: React.ReactNode;
	tooltip: string;
}

const TOOL_STATUS_ICON_SIZE = 12

const getToolStatusIconMeta = (toolMessage: Pick<ChatMessage & { role: 'tool' }, 'name' | 'type' | 'mcpServerName'>): ToolStatusIconMeta | null => {
	switch (toolMessage.type) {
		case 'running_now':
			return null
		case 'tool_request':
			return {
				icon: <CirclePlus size={TOOL_STATUS_ICON_SIZE} className='text-void-fg-3 flex-shrink-0' />,
				tooltip: 'Waiting for approval',
			}
		case 'success':
			return null
		case 'tool_error':
		case 'invalid_params':
			return {
				icon: <AlertTriangle size={TOOL_STATUS_ICON_SIZE} className='text-void-warning flex-shrink-0' />,
				tooltip: 'Error running tool',
			}
		case 'rejected':
			return {
				icon: <X size={TOOL_STATUS_ICON_SIZE} style={{ color: rejectBorder }} className='flex-shrink-0' />,
				tooltip: 'Canceled',
			}
		default:
			return null
	}
}


const getTitle = (toolMessage: Pick<ChatMessage & { role: 'tool' }, 'name' | 'type' | 'mcpServerName'>): React.ReactNode => {
	const t = toolMessage

	// non-built-in title
	if (!builtinToolNames.includes(t.name as BuiltinToolName)) {
		// descriptor of Running or Ran etc
		const descriptor =
			t.type === 'success' ? 'Called'
				: t.type === 'running_now' ? 'Calling'
					: t.type === 'tool_request' ? 'Call'
						: t.type === 'rejected' ? 'Call'
							: t.type === 'invalid_params' ? 'Call'
								: t.type === 'tool_error' ? 'Call'
									: 'Call'


		const title = `${descriptor} ${toolMessage.mcpServerName || 'MCP'}`
		if (t.type === 'running_now' || t.type === 'tool_request')
			return loadingTitleWrapper(title)
		return title
	}

	// built-in title
	else {
		const toolName = t.name as BuiltinToolName
		if (t.type === 'success') return titleOfBuiltinToolName[toolName].done
		if (t.type === 'running_now') return titleOfBuiltinToolName[toolName].running
		return titleOfBuiltinToolName[toolName].proposed
	}
}


const toolNameToDesc = (toolName: BuiltinToolName, _toolParams: BuiltinToolCallParams[BuiltinToolName] | undefined, accessor: ReturnType<typeof useAccessor>, rawParams?: RawToolParamsObj): {
	desc1: React.ReactNode,
	desc1Info?: string,
} => {

	if (!_toolParams || (typeof _toolParams === 'object' && _toolParams !== null && !(_toolParams instanceof URI) && Object.keys(_toolParams).length === 0)) {
		// If params is empty, try to extract basic info from rawParams for display
		if (rawParams) {
			const x = {
				'read_file': () => {
					const uriStr = rawParams.uri as string | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: getBasename(uri.fsPath),
								desc1Info: getRelative(uri, accessor),
							};
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				},
				'ls_dir': () => {
					const uriStr = rawParams.uri as string | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: getFolderName(uri.fsPath),
								desc1Info: getRelative(uri, accessor),
							};
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				},
				'get_dir_tree': () => {
					const uriStr = rawParams.uri as string | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: getFolderName(uri.fsPath) ?? '/',
								desc1Info: getRelative(uri, accessor),
							}
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				},
				'search_pathnames_only': () => {
					const query = rawParams.query as string | undefined
					return { desc1: query ? `"${query}"` : '' }
				},
				'search_for_files': () => {
					const query = rawParams.query as string | undefined
					return { desc1: query ? `"${query}"` : '' }
				},
				'search_in_file': () => {
					const query = rawParams.query as string | undefined
					const uriStr = rawParams.uri as string | undefined
					let desc1Info: string | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							desc1Info = getRelative(uri, accessor)
						} catch {}
					}
					return {
						desc1: query ? `"${query}"` : '',
						desc1Info,
					};
				},
				'create_file_or_folder': () => {
					const uriStr = rawParams.uri as string | undefined
					const isFolder = rawParams.is_folder as boolean | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: isFolder ? (getFolderName(uri.fsPath) ?? '/') : getBasename(uri.fsPath),
								desc1Info: getRelative(uri, accessor),
							}
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				},
				'delete_file_or_folder': () => {
					const uriStr = rawParams.uri as string | undefined
					const isFolder = rawParams.is_folder as boolean | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: isFolder ? (getFolderName(uri.fsPath) ?? '/') : getBasename(uri.fsPath),
								desc1Info: getRelative(uri, accessor),
							}
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				},
				'rewrite_file': () => {
					const uriStr = rawParams.uri as string | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: getBasename(uri.fsPath),
								desc1Info: getRelative(uri, accessor),
							}
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				},
				'edit_file': () => {
					const uriStr = rawParams.uri as string | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: getBasename(uri.fsPath),
								desc1Info: getRelative(uri, accessor),
							}
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				},
				'run_command': () => {
					const command = rawParams.command as string | undefined
					return { desc1: command ? `"${command}"` : '' }
				},
				'run_persistent_command': () => {
					const command = rawParams.command as string | undefined
					return { desc1: command ? `"${command}"` : '' }
				},
				'open_persistent_terminal': () => {
					return { desc1: '' }
				},
				'kill_persistent_terminal': () => {
					const id = rawParams.persistent_terminal_id as string | undefined
					return { desc1: id || '' }
				},
				'read_lint_errors': () => {
					const uriStr = rawParams.uri as string | undefined
					if (uriStr) {
						try {
							const uri = URI.parse(uriStr)
							return {
								desc1: getBasename(uri.fsPath),
								desc1Info: getRelative(uri, accessor),
							}
						} catch {
							return { desc1: uriStr }
						}
					}
					return { desc1: '' }
				}
			}
			try {
				return x[toolName]?.() || { desc1: '' }
			} catch {
				return { desc1: '' }
			}
		}
		return { desc1: '', };
	}

	const x = {
		'read_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['read_file']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			};
		},
		'ls_dir': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['ls_dir']
			return {
				desc1: getFolderName(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			};
		},
		'search_pathnames_only': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_pathnames_only']
			return {
				desc1: `"${toolParams.query}"`,
			}
		},
		'search_for_files': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_for_files']
			return {
				desc1: `"${toolParams.query}"`,
			}
		},
		'search_in_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_in_file'];
			return {
				desc1: `"${toolParams.query}"`,
				desc1Info: getRelative(toolParams.uri, accessor),
			};
		},
		'create_file_or_folder': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_file_or_folder']
			return {
				desc1: toolParams.isFolder ? getFolderName(toolParams.uri.fsPath) ?? '/' : getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'delete_file_or_folder': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['delete_file_or_folder']
			return {
				desc1: toolParams.isFolder ? getFolderName(toolParams.uri.fsPath) ?? '/' : getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'rewrite_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['rewrite_file']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'edit_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['edit_file']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'run_command': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['run_command']
			return {
				desc1: `"${toolParams.command}"`,
			}
		},
		'run_persistent_command': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['run_persistent_command']
			return {
				desc1: `"${toolParams.command}"`,
			}
		},
		'open_persistent_terminal': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['open_persistent_terminal']
			return { desc1: '' }
		},
		'kill_persistent_terminal': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['kill_persistent_terminal']
			return { desc1: toolParams.persistentTerminalId }
		},
		'get_dir_tree': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['get_dir_tree']
			return {
				desc1: getFolderName(toolParams.uri.fsPath) ?? '/',
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'read_lint_errors': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['read_lint_errors']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		}
	}

	try {
		return x[toolName]?.() || { desc1: '' }
	}
	catch {
		return { desc1: '' }
	}
}

const ToolRequestAcceptRejectButtons = ({ toolName }: { toolName: ToolName }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const metricsService = accessor.get('IMetricsService')
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()

	const onAccept = useCallback(() => {
		try { // this doesn't need to be wrapped in try/catch anymore
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.approveLatestToolRequest(threadId)
			metricsService.capture('Tool Request Accepted', {})
		} catch (e) { console.error('Error while approving message in chat:', e) }
	}, [chatThreadsService, metricsService])

	const onReject = useCallback(() => {
		try {
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.rejectLatestToolRequest(threadId)
		} catch (e) { console.error('Error while approving message in chat:', e) }
		metricsService.capture('Tool Request Rejected', {})
	}, [chatThreadsService, metricsService])

	const approveButton = (
		<button
			onClick={onAccept}
			className={`
                px-1.5 py-0.5
                bg-[var(--vscode-button-background)]
                text-[var(--vscode-button-foreground)]
                hover:bg-[var(--vscode-button-hoverBackground)]
                rounded
                text-xs font-medium
            `}
		>
			Approve
		</button>
	)

	const cancelButton = (
		<button
			onClick={onReject}
			className={`
                px-1.5 py-0.5
                bg-[var(--vscode-button-secondaryBackground)]
                text-[var(--vscode-button-secondaryForeground)]
                hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                rounded
                text-xs font-medium
            `}
		>
			Cancel
		</button>
	)

	const approvalType = isABuiltinToolName(toolName) ? approvalTypeOfBuiltinToolName[toolName] : 'MCP tools'
	const approvalToggle = approvalType ? <div key={approvalType} className="flex items-center ml-1.5 gap-x-1">
		<ToolApprovalTypeSwitch size='xs' approvalType={approvalType} desc={`Auto-approve ${approvalType}`} />
	</div> : null

	return <div className="flex gap-1.5 mx-0.5 items-center">
		{approveButton}
		{cancelButton}
		{approvalToggle}
	</div>
}

export const EditToolCardWrapper = ({ children, isRunning }: { children: React.ReactNode, isRunning?: boolean }) => (
	<div className="relative bg-void-bg-3 rounded-sm">
		{isRunning && (
			<>
				<div className="absolute inset-0 pointer-events-none rounded-sm border-sweep-animation" />
				<style>{`
					.border-sweep-animation {
						border: 1px solid transparent;
						background:
							linear-gradient(var(--vscode-void-bg-3), var(--vscode-void-bg-3)) padding-box,
							linear-gradient(90deg, transparent 0%, rgba(96, 165, 250, 0.4) 25%, rgba(96, 165, 250, 0.6) 50%, rgba(96, 165, 250, 0.4) 75%, transparent 100%) border-box;
						background-size: 100% 100%, 250% 100%;
						animation: border-sweep 3s linear infinite;
					}
					@keyframes border-sweep {
						from { background-position: 0 0, 250% 0; }
						to { background-position: 0 0, -250% 0; }
					}
					@keyframes fadeInDropdown {
						from {
							opacity: 0;
							transform: scale(0.95);
						}
						to {
							opacity: 1;
							transform: scale(1);
						}
					}
				`}</style>
			</>
		)}
		{children}
	</div>
);

export const ToolChildrenWrapper = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	return <div className={`${className ? className : ''} cursor-default select-none`}>
		<div className='px-1.5 min-w-full overflow-hidden'>
			{children}
		</div>
	</div>
}
export const CodeChildren = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	return <div className={`${className ?? ''} p-0.5 rounded-sm overflow-auto text-xs`}>
		<div className='!select-text cursor-auto'>
			{children}
		</div>
	</div>
}

export const ListableToolItem = ({ name, onClick, isSmall, className, showDot }: { name: React.ReactNode, onClick?: () => void, isSmall?: boolean, className?: string, showDot?: boolean }) => {
	return <div
		className={`
			${onClick ? 'hover:brightness-125 hover:cursor-pointer transition-all duration-200 ' : ''}
			flex items-center flex-nowrap whitespace-nowrap
			${className ? className : ''}
			`}
		onClick={onClick}
	>
		{showDot === false ? null : <div className="flex-shrink-0"><svg className="w-0.5 h-0.5 opacity-60 mr-1 fill-current" viewBox="0 0 100 40"><rect x="0" y="15" width="100" height="10" /></svg></div>}
		<div className={`text-xs ${isSmall ? 'italic text-void-fg-4 flex items-center' : ''}`}>{name}</div>
	</div>
}



const EditToolChildren = ({ uri, code, type }: { uri: URI | undefined, code: string, type: 'diff' | 'rewrite' }) => {

	const content = type === 'diff' ?
		<VoidDiffEditor uri={uri} searchReplaceBlocks={code} />
		: <ChatMarkdownRender string={`\`\`\`\n${code}\n\`\`\``} codeURI={uri} chatMessageLocation={undefined} />

	return <div className='!select-text cursor-auto'>
		<SmallProseWrapper>
			{content}
		</SmallProseWrapper>
	</div>

}


const LintErrorChildren = ({ lintErrors }: { lintErrors: LintErrorItem[] }) => {
	return <div className="text-[10px] text-void-fg-4 opacity-80 border-l-2 border-void-warning px-1.5 py-0.5 flex flex-col gap-0.5 overflow-x-auto whitespace-nowrap">
		{lintErrors.map((error, i) => (
			<div key={i}>Lines {error.startLineNumber}-{error.endLineNumber}: {error.message}</div>
		))}
	</div>
}

const BottomChildren = ({ children, title }: { children: React.ReactNode, title: string }) => {
	const [isOpen, setIsOpen] = useState(false);
	if (!children) return null;
	return (
		<div className="w-full px-1.5 mt-0.5">
			<div
				className={`flex items-center cursor-pointer select-none transition-colors duration-150 pl-0 py-0.5 rounded group`}
				onClick={() => setIsOpen(o => !o)}
				style={{ background: 'none' }}
			>
				<ChevronRight
					className={`mr-0.5 h-2.5 w-2.5 flex-shrink-0 transition-transform duration-100 text-void-fg-4 group-hover:text-void-fg-3 ${isOpen ? 'rotate-90' : ''}`}
				/>
				<span className="font-medium text-void-fg-4 group-hover:text-void-fg-3 text-[10px]">{title}</span>
			</div>
			<div
				className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'opacity-100' : 'max-h-0 opacity-0'} text-[10px] pl-3`}
			>
				<div className="overflow-x-auto text-void-fg-4 opacity-90 border-l-2 border-void-warning px-1.5 py-0.5">
					{children}
				</div>
			</div>
		</div>
	);
}


const EditToolHeaderButtons = ({ applyBoxId, uri, codeStr, toolName, threadId }: { threadId: string, applyBoxId: string, uri: URI, codeStr: string, toolName: 'edit_file' | 'rewrite_file' }) => {
	const { streamState } = useEditToolStreamState({ applyBoxId, uri })
	return <div className='flex items-center gap-1'>
		{/* <StatusIndicatorForApplyButton applyBoxId={applyBoxId} uri={uri} /> */}
		{/* <JumpToFileButton uri={uri} /> */}
		{streamState === 'idle-no-changes' && <CopyButton codeStr={codeStr} toolTipName='Copy' />}
	</div>
}



const InvalidTool = ({ toolName, message, mcpServerName }: { toolName: ToolName, message: string, mcpServerName: string | undefined }) => {
	const accessor = useAccessor()
	const title = getTitle({ name: toolName, type: 'invalid_params', mcpServerName })
	const desc1 = 'Invalid parameters'
	const statusIconMeta = getToolStatusIconMeta({ name: toolName, type: 'invalid_params', mcpServerName })
	const isError = true
	const componentParams: ToolHeaderParams = {
		title,
		desc1,
		isError,
		icon: statusIconMeta?.icon,
		iconTooltip: statusIconMeta?.tooltip,
	}

	componentParams.children = <ToolChildrenWrapper>
		<CodeChildren className='bg-void-bg-3'>
			{message}
		</CodeChildren>
	</ToolChildrenWrapper>
	return <ToolHeaderWrapper {...componentParams} />
}

const CanceledTool = ({ toolName, mcpServerName }: { toolName: ToolName, mcpServerName: string | undefined }) => {
	const accessor = useAccessor()
	const title = getTitle({ name: toolName, type: 'rejected', mcpServerName })
	const desc1 = ''
	const statusIconMeta = getToolStatusIconMeta({ name: toolName, type: 'rejected', mcpServerName })
	const isRejected = true
	const componentParams: ToolHeaderParams = {
		title,
		desc1,
		isRejected,
		icon: statusIconMeta?.icon,
		iconTooltip: statusIconMeta?.tooltip,
	}
	return <ToolHeaderWrapper {...componentParams} />
}


const CommandTool = ({ toolMessage, type, threadId }: { threadId: string } & ({
	toolMessage: Exclude<ToolMessage<'run_command'>, { type: 'invalid_params' }>
	type: 'run_command'
} | {
	toolMessage: Exclude<ToolMessage<'run_persistent_command'>, { type: 'invalid_params' }>
	type: | 'run_persistent_command'
})) => {
	const accessor = useAccessor()

	const commandService = accessor.get('ICommandService')
	const terminalToolsService = accessor.get('ITerminalToolService')
	const toolsService = accessor.get('IToolsService')
	const isError = false
	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
	const statusIconMeta = getToolStatusIconMeta(toolMessage)
	const streamState = useChatThreadsStreamState(threadId)

	const divRef = useRef<HTMLDivElement | null>(null)

	const isRejected = toolMessage.type === 'rejected'
	const isRunning = toolMessage.type === 'running_now'
	const { rawParams, params } = toolMessage
	const componentParams: ToolHeaderParams = {
		title,
		desc1,
		desc1Info,
		isError,
		isRejected,
		icon: statusIconMeta?.icon,
		iconTooltip: statusIconMeta?.tooltip,
		isRunning,
	}


	const effect = async () => {
		if (streamState?.isRunning !== 'tool') return
		if (type !== 'run_command' || toolMessage.type !== 'running_now') return;

		// wait for the interruptor so we know it's running

		await streamState?.interrupt
		const container = divRef.current;
		if (!container) return;

		const terminal = terminalToolsService.getTemporaryTerminal(toolMessage.params.terminalId);
		if (!terminal) return;

		try {
			terminal.attachToElement(container);
			terminal.setVisible(true)
		} catch {
		}

		// Listen for size changes of the container and keep the terminal layout in sync.
		const resizeObserver = new ResizeObserver((entries) => {
			const height = entries[0].borderBoxSize[0].blockSize;
			const width = entries[0].borderBoxSize[0].inlineSize;
			if (typeof terminal.layout === 'function') {
				terminal.layout({ width, height });
			}
		});

		resizeObserver.observe(container);
		return () => { terminal.detachFromElement(); resizeObserver?.disconnect(); }
	}

	useEffect(() => {
		effect()
	}, [terminalToolsService, toolMessage, toolMessage.type, type]);

	if (toolMessage.type === 'success') {
		const { result } = toolMessage

		// it's unclear that this is a button and not an icon.
		// componentParams.desc2 = <JumpToTerminalButton
		// 	onClick={() => { terminalToolsService.openTerminal(terminalId) }}
		// />

		let msg: string
		if (type === 'run_command') msg = toolsService.stringOfResult['run_command'](toolMessage.params, result)
		else msg = toolsService.stringOfResult['run_persistent_command'](toolMessage.params, result)

		if (type === 'run_persistent_command') {
			componentParams.info = persistentTerminalNameOfId(toolMessage.params.persistentTerminalId)
		}

		componentParams.children = <ToolChildrenWrapper className='whitespace-pre text-nowrap overflow-auto text-xs'>
			<div className='!select-text cursor-auto'>
				<BlockCode initValue={`${msg.trim()}`} language='shellscript' />
			</div>
		</ToolChildrenWrapper>
	}
	else if (toolMessage.type === 'tool_error') {
		const { result } = toolMessage
		componentParams.bottomChildren = <BottomChildren title='Error'>
			<CodeChildren>
				{result}
			</CodeChildren>
		</BottomChildren>
	}
	else if (toolMessage.type === 'running_now') {
		if (type === 'run_command')
			componentParams.children = <div ref={divRef} className='relative h-[300px] text-sm' />
	}
	else if (toolMessage.type === 'rejected' || toolMessage.type === 'tool_request') {
	}

	return <>
		<ToolHeaderWrapper {...componentParams} isOpen={type === 'run_command' && toolMessage.type === 'running_now' ? true : undefined} />
	</>
}

type WrapperProps<T extends ToolName> = { toolMessage: Exclude<ToolMessage<T>, { type: 'invalid_params' }>, messageIdx: number, threadId: string }
const MCPToolWrapper = ({ toolMessage }: WrapperProps<string>) => {
	const accessor = useAccessor()
	const mcpService = accessor.get('IMCPService')

	const title = getTitle(toolMessage)
	const desc1 = removeMCPToolNamePrefix(toolMessage.name)
	const statusIconMeta = getToolStatusIconMeta(toolMessage)

	const isError = false
	const isRejected = toolMessage.type === 'rejected'
	const isRunning = toolMessage.type === 'running_now' || toolMessage.type === 'tool_request'
	const { rawParams, params } = toolMessage

	const componentParams: ToolHeaderParams = {
		title,
		desc1,
		isError,
		isRejected,
		icon: statusIconMeta?.icon,
		iconTooltip: statusIconMeta?.tooltip,
		isRunning,
	}

	// Add copy button for params
	if (params) {
		try {
			const paramsStr = JSON.stringify(params, null, 2)
			componentParams.desc2 = <CopyButton codeStr={paramsStr} toolTipName={`Copy inputs: ${paramsStr}`} />
		} catch (e) {
			console.warn('Failed to stringify MCP tool params:', e)
		}
	}

	componentParams.info = !toolMessage.mcpServerName ? 'MCP tool not found' : undefined

	// Handle different tool states
	if (toolMessage.type === 'success') {
		const { result } = toolMessage
		try {
			const resultStr = result ? mcpService.stringifyResult(result) : 'null'
			componentParams.children = (
				<ToolChildrenWrapper>
					<SmallProseWrapper>
						<ChatMarkdownRender
							string={`\`\`\`json\n${resultStr}\n\`\`\``}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</SmallProseWrapper>
				</ToolChildrenWrapper>
			)
		} catch (e) {
			console.error('Error rendering MCP tool result:', e)
			componentParams.children = (
				<ToolChildrenWrapper>
					<CodeChildren>
						{String(result)}
					</CodeChildren>
				</ToolChildrenWrapper>
			)
		}
	}
	else if (toolMessage.type === 'tool_error') {
		const { result } = toolMessage
		componentParams.bottomChildren = (
			<BottomChildren title='Error'>
				<CodeChildren>
					{result}
				</CodeChildren>
			</BottomChildren>
		)
	}
	else if (toolMessage.type === 'tool_request') {
		// Show pending state - no children needed, buttons will be shown separately
	}
	else if (toolMessage.type === 'running_now') {
		// Show loading state - icon already shows spinner
	}

	return <ToolHeaderWrapper {...componentParams} />
}

type ResultWrapper<T extends ToolName> = (props: WrapperProps<T>) => React.ReactNode

const builtinToolNameToComponent: { [T in BuiltinToolName]: { resultWrapper: ResultWrapper<T>, } } = {
	'read_file': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')

			const title = getTitle(toolMessage)

			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams);
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			let range: [number, number] | undefined = undefined
			if (toolMessage.params.startLine !== null || toolMessage.params.endLine !== null) {
				const start = toolMessage.params.startLine === null ? `1` : `${toolMessage.params.startLine}`
				const end = toolMessage.params.endLine === null ? `` : `${toolMessage.params.endLine}`
				const addStr = `(${start}-${end})`
				componentParams.desc1 += ` ${addStr}`
				range = [params.startLine || 1, params.endLine || 1]
			}

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor, range) }
				if (result.hasNextPage && params.pageNumber === 1)  // first page
					componentParams.desc2 = `(truncated after ${Math.round(MAX_FILE_CHARS_PAGE) / 1000}k)`
				else if (params.pageNumber > 1) // subsequent pages
					componentParams.desc2 = `(part ${params.pageNumber})`
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				// JumpToFileButton removed in favor of FileLinkText
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}

			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'get_dir_tree': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')

			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			if (params.uri) {
				const rel = getRelative(params.uri, accessor)
				if (rel) componentParams.info = `Only search in ${rel}`
			}

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.children = <ToolChildrenWrapper>
					<SmallProseWrapper>
						<ChatMarkdownRender
							string={`\`\`\`\n${result.str}\n\`\`\``}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</SmallProseWrapper>
				</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}

			return <ToolHeaderWrapper {...componentParams} />

		}
	},
	'ls_dir': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const explorerService = accessor.get('IExplorerService')
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			if (params.uri) {
				const rel = getRelative(params.uri, accessor)
				if (rel) componentParams.info = `Only search in ${rel}`
			}

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.numResults = result.children?.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = !result.children || (result.children.length ?? 0) === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.children.map((child, i) => (<ListableToolItem key={i}
							name={`${child.name}${child.isDirectory ? '/' : ''}`}
							className='w-full overflow-auto'
							onClick={() => {
								voidOpenFileFn(child.uri, accessor)
								// commandService.executeCommand('workbench.view.explorer'); // open in explorer folders view instead
								// explorerService.select(child.uri, true);
							}}
						/>))}
						{result.hasNextPage &&
							<ListableToolItem name={`Results truncated (${result.itemsRemaining} remaining).`} isSmall={true} className='w-full overflow-auto' />
						}
					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'search_pathnames_only': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			if (params.includePattern) {
				componentParams.info = `Only search in ${params.includePattern}`
			}

			if (toolMessage.type === 'success') {
				const { result, rawParams } = toolMessage
				componentParams.numResults = result.uris.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = result.uris.length === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.uris.map((uri, i) => (<ListableToolItem key={i}
							name={getBasename(uri.fsPath)}
							className='w-full overflow-auto'
							onClick={() => { voidOpenFileFn(uri, accessor) }}
						/>))}
						{result.hasNextPage &&
							<ListableToolItem name={'Results truncated.'} isSmall={true} className='w-full overflow-auto' />
						}

					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'search_for_files': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			if (params.searchInFolder || params.isRegex) {
				let info: string[] = []
				if (params.searchInFolder) {
					const rel = getRelative(params.searchInFolder, accessor)
					if (rel) info.push(`Only search in ${rel}`)
				}
				if (params.isRegex) { info.push(`Uses regex search`) }
				componentParams.info = info.join('; ')
			}

			if (toolMessage.type === 'success') {
				const { result, rawParams } = toolMessage
				componentParams.numResults = result.uris.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = result.uris.length === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.uris.map((uri, i) => (<ListableToolItem key={i}
							name={getBasename(uri.fsPath)}
							className='w-full overflow-auto'
							onClick={() => { voidOpenFileFn(uri, accessor) }}
						/>))}
						{result.hasNextPage &&
							<ListableToolItem name={`Results truncated.`} isSmall={true} className='w-full overflow-auto' />
						}

					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}
			return <ToolHeaderWrapper {...componentParams} />
		}
	},

	'search_in_file': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor();
			const toolsService = accessor.get('IToolsService');
			const title = getTitle(toolMessage);
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams);
			const statusIconMeta = getToolStatusIconMeta(toolMessage);

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const { rawParams, params } = toolMessage;
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			};

			const infoarr: string[] = []
			const uriStr = getRelative(params.uri, accessor)
			if (uriStr) infoarr.push(uriStr)
			if (params.isRegex) infoarr.push('Uses regex search')
			componentParams.info = infoarr.join('; ')

			if (toolMessage.type === 'success') {
				const { result } = toolMessage; // result is array of snippets
				componentParams.numResults = result.lines.length;
				componentParams.children = result.lines.length === 0 ? undefined :
					<ToolChildrenWrapper>
						<CodeChildren className='bg-void-bg-3'>
							<pre className='font-mono whitespace-pre'>
								{toolsService.stringOfResult['search_in_file'](params, result)}
							</pre>
						</CodeChildren>
					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage;
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}

			return <ToolHeaderWrapper {...componentParams} />;
		}
	},

	'read_lint_errors': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')

			const title = getTitle(toolMessage)

			const { uri } = toolMessage.params ?? {}
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			componentParams.info = getRelative(uri, accessor) // full path

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
				if (result.lintErrors)
					componentParams.children = <LintErrorChildren lintErrors={result.lintErrors} />
				else
					componentParams.children = `No lint errors found.`

			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				// JumpToFileButton removed in favor of FileLinkText
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}

			return <ToolHeaderWrapper {...componentParams} />
		},
	},

	// ---

	'create_file_or_folder': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)


			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			componentParams.info = getRelative(params.uri, accessor) // full path

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'rejected') {
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				if (params) { componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) } }
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// nothing more is needed
			}
			else if (toolMessage.type === 'tool_request') {
				// nothing more is needed
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'delete_file_or_folder': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isFolder = toolMessage.params?.isFolder ?? false
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			componentParams.info = getRelative(params.uri, accessor) // full path

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'rejected') {
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				if (params) { componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) } }
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'tool_request') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'rewrite_file': {
		resultWrapper: (params) => {
			return <EditTool {...params} content={params.toolMessage.params.newContent} />
		}
	},
	'edit_file': {
		resultWrapper: (params) => {
			return <EditTool {...params} content={params.toolMessage.params.searchReplaceBlocks} />
		}
	},

	// ---

	'run_command': {
		resultWrapper: (params) => {
			return <CommandTool {...params} type='run_command' />
		}
	},

	'run_persistent_command': {
		resultWrapper: (params) => {
			return <CommandTool {...params} type='run_persistent_command' />
		}
	},
	'open_persistent_terminal': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const terminalToolsService = accessor.get('ITerminalToolService')

			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const title = getTitle(toolMessage)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

			const relativePath = params.cwd ? getRelative(URI.file(params.cwd), accessor) : ''
			componentParams.info = relativePath ? `Running in ${relativePath}` : undefined

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				const { persistentTerminalId } = result
				componentParams.desc1 = persistentTerminalNameOfId(persistentTerminalId)
				componentParams.onClick = () => terminalToolsService.focusPersistentTerminal(persistentTerminalId)
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// Show loading state - no additional children needed, icon already shows spinner
			}

			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'kill_persistent_terminal': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const terminalToolsService = accessor.get('ITerminalToolService')

			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor, toolMessage.rawParams)
			const title = getTitle(toolMessage)
			const statusIconMeta = getToolStatusIconMeta(toolMessage)

			if (toolMessage.type === 'tool_request') return null // do not show past requests

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = {
				title,
				desc1,
				desc1Info,
				isError,
				isRejected,
				icon: statusIconMeta?.icon,
				iconTooltip: statusIconMeta?.tooltip,
			}

		if (toolMessage.type === 'success') {
			const { persistentTerminalId } = params
			componentParams.desc1 = persistentTerminalNameOfId(persistentTerminalId)
			componentParams.onClick = () => terminalToolsService.focusPersistentTerminal(persistentTerminalId)
		}
		else if (toolMessage.type === 'tool_error') {
			const { result } = toolMessage
			componentParams.bottomChildren = <BottomChildren title='Error'>
				<CodeChildren>
					{result}
				</CodeChildren>
			</BottomChildren>
		}
		else if (toolMessage.type === 'running_now') {
			// Show loading state - no additional children needed, icon already shows spinner
		}

		return <ToolHeaderWrapper {...componentParams} />
	},
},
};


const Checkpoint = ({ message, threadId, messageIdx, isCheckpointGhost, threadIsRunning }: { message: CheckpointEntry, threadId: string; messageIdx: number, isCheckpointGhost: boolean, threadIsRunning: boolean }) => {
	const accessor = useAccessor()
	const chatThreadService = accessor.get('IChatThreadService')
	const streamState = useFullChatThreadsStreamState()

	const isRunning = useChatThreadsStreamState(threadId)?.isRunning
	const isDisabled = useMemo(() => {
		if (isRunning) return true
		return !!Object.keys(streamState).find((threadId2) => streamState[threadId2]?.isRunning)
	}, [isRunning, streamState])

	return <div
		className={`flex items-center justify-center px-2 `}
	>
		<div
			className={`
                    text-xs
                    text-void-fg-3
                    select-none
                    ${isCheckpointGhost ? 'opacity-50' : 'opacity-100'}
					${isDisabled ? 'cursor-default' : 'cursor-pointer'}
                `}
			style={{ position: 'relative', display: 'inline-block' }} // allow absolute icon
			onClick={() => {
				if (threadIsRunning) return
				if (isDisabled) return
				chatThreadService.jumpToCheckpointBeforeMessageIdx({
					threadId,
					messageIdx,
					jumpToUserModified: messageIdx === (chatThreadService.state.allThreads[threadId]?.messages.length ?? 0) - 1
				})
			}}
			{...isDisabled ? {
				'data-tooltip-id': 'void-tooltip',
				'data-tooltip-content': `Disabled ${isRunning ? 'when running' : 'because another thread is running'}`,
				'data-tooltip-place': 'top',
			} : {}}
		>
			Checkpoint
		</div>
	</div>
}


type ChatBubbleMode = 'display' | 'edit'
type ChatBubbleProps = {
	chatMessage: ChatMessage,
	messageIdx: number,
	isCommitted: boolean,
	chatIsRunning: IsRunningType,
	threadId: string,
	currCheckpointIdx: number | undefined,
	_scrollToBottom: (() => void) | null,
}

const ChatBubble = (props: ChatBubbleProps) => {
	return <ErrorBoundary>
		<_ChatBubble {...props} />
	</ErrorBoundary>
}

const _ChatBubble = ({ threadId, chatMessage, currCheckpointIdx, isCommitted, messageIdx, chatIsRunning, _scrollToBottom }: ChatBubbleProps) => {
	const role = chatMessage.role

	const isCheckpointGhost = messageIdx > (currCheckpointIdx ?? Infinity) && !chatIsRunning // whether to show as gray (if chat is running, for good measure just dont show any ghosts)

	if (role === 'user') {
		return <UserMessageComponent
			chatMessage={chatMessage}
			isCheckpointGhost={isCheckpointGhost}
			currCheckpointIdx={currCheckpointIdx}
			messageIdx={messageIdx}
			_scrollToBottom={_scrollToBottom}
		/>
	}
	else if (role === 'assistant') {
		return <AssistantMessageComponent
			chatMessage={chatMessage}
			isCheckpointGhost={isCheckpointGhost}
			messageIdx={messageIdx}
			isCommitted={isCommitted}
		/>
	}
	else if (role === 'tool') {
		// Handle invalid params case first
		if (chatMessage.type === 'invalid_params') {
			return <div className={`my-0.25 ${isCheckpointGhost ? 'opacity-50' : ''}`}>
				<InvalidTool toolName={chatMessage.name} message={chatMessage.content} mcpServerName={chatMessage.mcpServerName} />
			</div>
		}

		// Determine which wrapper to use
		const toolName = chatMessage.name
		const isBuiltInTool = isABuiltinToolName(toolName)

		// Get the appropriate wrapper component
		let ToolResultWrapper: ResultWrapper<ToolName> | undefined
		if (isBuiltInTool) {
			const toolComponent = builtinToolNameToComponent[toolName]
			ToolResultWrapper = toolComponent?.resultWrapper as ResultWrapper<ToolName> | undefined
		} else {
			ToolResultWrapper = MCPToolWrapper as ResultWrapper<ToolName>
		}

		// Render tool with error boundary
		if (!ToolResultWrapper) {
			console.warn(`No tool wrapper found for tool: ${toolName}`)
			return null
		}

		return (
			<>
				<div className={`transition-opacity duration-300 ease-in-out my-0.25 ${isCheckpointGhost ? 'opacity-50' : 'opacity-100'}`}>
					<ErrorBoundary>
						<ToolResultWrapper
							toolMessage={chatMessage}
							messageIdx={messageIdx}
							threadId={threadId}
						/>
					</ErrorBoundary>
				</div>
				{chatMessage.type === 'tool_request' && (
					<div className={`my-0.25 ${isCheckpointGhost ? 'opacity-50 pointer-events-none' : ''}`}>
						<ErrorBoundary>
							<ToolRequestAcceptRejectButtons toolName={chatMessage.name} />
						</ErrorBoundary>
					</div>
				)}
			</>
		)
	}

	else if (role === 'interrupted_streaming_tool') {
		return <div className={`my-0.25 ${isCheckpointGhost ? 'opacity-50' : ''}`}>
			<CanceledTool toolName={chatMessage.name} mcpServerName={chatMessage.mcpServerName} />
		</div>
	}

	else if (role === 'checkpoint') {
		return <Checkpoint
			threadId={threadId}
			message={chatMessage}
			messageIdx={messageIdx}
			isCheckpointGhost={isCheckpointGhost}
			threadIsRunning={!!chatIsRunning}
		/>
	}

}

type ParallelToolGroupProps = {
    messages: Array<{ message: ChatMessage, index: number }>,
    previousMessages: ChatMessage[],
    threadId: string,
    currCheckpointIdx: number | undefined,
    isRunning: IsRunningType,
    scrollContainerRef: React.MutableRefObject<HTMLDivElement | null>,
}

const ParallelToolGroup = ({
    messages,
    previousMessages,
    threadId,
    currCheckpointIdx,
    isRunning,
    scrollContainerRef,
}: ParallelToolGroupProps) => {
    return (
        <>
            {messages.map(({ index }) => {
                const previousMessage = index > 0 ? previousMessages[index - 1] : null
                const previousRole = previousMessage?.role
                const currentRole = previousMessages[index]?.role
                const addGap = (previousRole === 'user' && currentRole === 'assistant') ||
                               (previousRole === 'assistant' && currentRole === 'user')

                return (
                    <div key={`tool-${index}`} className={addGap ? 'mt-2' : 'mt-1'}>
                        <ChatBubble
                            currCheckpointIdx={currCheckpointIdx}
                            chatMessage={previousMessages[index]}
                            messageIdx={index}
                            isCommitted={true}
                            chatIsRunning={isRunning}
                            threadId={threadId}
                            _scrollToBottom={() => scrollToBottom(scrollContainerRef)}
                        />
                    </div>
                )
            })}
        </>
    )
}

const CommandBarInChat = () => {
	const { stateOfURI: commandBarStateOfURI, sortedURIs: sortedCommandBarURIs } = useCommandBarState()
	const numFilesChanged = sortedCommandBarURIs.length

	const accessor = useAccessor()
	const editCodeService = accessor.get('IEditCodeService')
	const commandService = accessor.get('ICommandService')
	const chatThreadsState = useChatThreadsState()
	const commandBarState = useCommandBarState()
	const chatThreadsStreamState = useChatThreadsStreamState(chatThreadsState.currentThreadId)

	// (
	// 	<IconShell1
	// 		Icon={CopyIcon}
	// 		onClick={copyChatToClipboard}
	// 		data-tooltip-id='void-tooltip'
	// 		data-tooltip-place='top'
	// 		data-tooltip-content='Copy chat JSON'
	// 	/>
	// )

	const [fileDetailsOpenedState, setFileDetailsOpenedState] = useState<'auto-opened' | 'auto-closed' | 'user-opened' | 'user-closed'>('auto-closed');
	const isFileDetailsOpened = fileDetailsOpenedState === 'auto-opened' || fileDetailsOpenedState === 'user-opened';


	useEffect(() => {
		// close the file details if there are no files
		// this converts 'user-closed' to 'auto-closed'
		if (numFilesChanged === 0) {
			setFileDetailsOpenedState('auto-closed')
		}
		// open the file details if it hasnt been closed
		if (numFilesChanged > 0 && fileDetailsOpenedState !== 'user-closed') {
			setFileDetailsOpenedState('auto-opened')
		}
	}, [fileDetailsOpenedState, setFileDetailsOpenedState, numFilesChanged])


	const isFinishedMakingThreadChanges = (
		// there are changed files
		commandBarState.sortedURIs.length !== 0
		// none of the files are streaming
		&& commandBarState.sortedURIs.every(uri => !commandBarState.stateOfURI[uri.fsPath]?.isStreaming)
	)

	// ======== status of agent ========
	// This icon answers the question "is the LLM doing work on this thread?"
	// assume it is single threaded for now
	// green = Running
	// orange = Requires action
	// dark = Done

	const threadStatus = (
		chatThreadsStreamState?.isRunning === 'awaiting_user' ? { title: 'Needs Approval', color: 'yellow', } as const
			: chatThreadsStreamState?.isRunning ? { title: 'Running', color: 'orange', } as const
				: { title: 'Done', color: 'dark', } as const
	)


	const threadStatusHTML = <StatusIndicator className='mx-1' indicatorColor={threadStatus.color} title={threadStatus.title} />


	// ======== info about changes ========
	// num files changed
	// acceptall + rejectall
	// popup info about each change (each with num changes + acceptall + rejectall of their own)

	const numFilesChangedStr = numFilesChanged === 0 ? 'No files with changes'
		: `${sortedCommandBarURIs.length} file${numFilesChanged === 1 ? '' : 's'} with changes`




	const acceptRejectAllButtons = <div
		// do this with opacity so that the height remains the same at all times
		className={`flex items-center gap-0.5
			${isFinishedMakingThreadChanges ? '' : 'opacity-0 pointer-events-none'}`
		}
	>
		<IconShell1 // RejectAllButtonWrapper
			// text="Reject All"
			// className="text-xs"
			Icon={X}
			onClick={() => {
				sortedCommandBarURIs.forEach(uri => {
					editCodeService.acceptOrRejectAllDiffAreas({
						uri,
						removeCtrlKs: true,
						behavior: "reject",
						_addToHistory: true,
					});
				});
			}}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='Reject all'
		/>

		<IconShell1 // AcceptAllButtonWrapper
			// text="Accept All"
			// className="text-xs"
			Icon={Check}
			onClick={() => {
				sortedCommandBarURIs.forEach(uri => {
					editCodeService.acceptOrRejectAllDiffAreas({
						uri,
						removeCtrlKs: true,
						behavior: "accept",
						_addToHistory: true,
					});
				});
			}}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='Accept all'
		/>



	</div>


	// !select-text cursor-auto
	const fileDetailsContent = <div className="px-2 gap-1 w-full overflow-y-auto">
		{sortedCommandBarURIs.map((uri, i) => {
			const basename = getBasename(uri.fsPath)

			const { sortedDiffIds, isStreaming } = commandBarStateOfURI[uri.fsPath] ?? {}
			const isFinishedMakingFileChanges = !isStreaming

			const numDiffs = sortedDiffIds?.length || 0

			const fileStatus = (isFinishedMakingFileChanges
				? { title: 'Done', color: 'dark', } as const
				: { title: 'Running', color: 'orange', } as const
			)

			const fileNameHTML = <div
				className="flex items-center gap-1.5 text-void-fg-3 hover:brightness-125 transition-all duration-200 cursor-pointer"
				onClick={() => voidOpenFileFn(uri, accessor)}
			>
				{/* <FileIcon size={14} className="text-void-fg-3" /> */}
				<span className="text-void-fg-3">{basename}</span>
			</div>




			const detailsContent = <div className='flex px-4'>
				<span className="text-void-fg-3 opacity-80">{numDiffs} diff{numDiffs !== 1 ? 's' : ''}</span>
			</div>

			const acceptRejectButtons = <div
				// do this with opacity so that the height remains the same at all times
				className={`flex items-center gap-0.5
					${isFinishedMakingFileChanges ? '' : 'opacity-0 pointer-events-none'}
				`}
			>
				{/* <JumpToFileButton
					uri={uri}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='Go to file'
				/> */}
				<IconShell1 // RejectAllButtonWrapper
					Icon={X}
					onClick={() => { editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: "reject", _addToHistory: true, }); }}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='Reject file'

				/>
				<IconShell1 // AcceptAllButtonWrapper
					Icon={Check}
					onClick={() => { editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: "accept", _addToHistory: true, }); }}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='Accept file'
				/>

			</div>

			const fileStatusHTML = <StatusIndicator className='mx-1' indicatorColor={fileStatus.color} title={fileStatus.title} />

			return (
				// name, details
				<div key={i} className="flex justify-between items-center">
					<div className="flex items-center">
						{fileNameHTML}
						{detailsContent}
					</div>
					<div className="flex items-center gap-2">
						{acceptRejectButtons}
						{fileStatusHTML}
					</div>
				</div>
			)
		})}
	</div>

	const fileDetailsButton = (
		<button
			className={`flex items-center gap-1 rounded ${numFilesChanged === 0 ? 'cursor-pointer' : 'cursor-pointer hover:brightness-125 transition-all duration-200'}`}
			onClick={() => isFileDetailsOpened ? setFileDetailsOpenedState('user-closed') : setFileDetailsOpenedState('user-opened')}
			type='button'
			disabled={numFilesChanged === 0}
		>
			<svg
				className="transition-transform duration-200 size-3.5"
				style={{
					transform: isFileDetailsOpened ? 'rotate(0deg)' : 'rotate(180deg)',
					transition: 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
				}}
				xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline>
			</svg>
			{numFilesChangedStr}
		</button>
	)

	return (
		<>
			{/* file details */}
			<div className='px-2'>
				<div
					className={`
						select-none
						flex w-full rounded-t-lg bg-void-bg-3
						text-void-fg-3 text-xs text-nowrap

						overflow-hidden transition-all duration-200 ease-in-out
						${isFileDetailsOpened ? 'max-h-24' : 'max-h-0'}
					`}
				>
					{fileDetailsContent}
				</div>
			</div>
			{/* main content */}
			<div
				className={`
					select-none
					flex w-full rounded-t-lg bg-void-bg-3
					text-void-fg-3 text-xs text-nowrap
					border-t border-l border-r border-zinc-300/10

					px-2 py-1
					justify-between
				`}
			>
				<div className="flex gap-2 items-center">
					{fileDetailsButton}
				</div>
				<div className="flex gap-2 items-center">
					{acceptRejectAllButtons}
					{threadStatusHTML}
				</div>
			</div>
		</>
	)
}



const EditToolSoFar = ({ toolCallSoFar }: { toolCallSoFar: RawToolCallObj }) => {
	if (!isABuiltinToolName(toolCallSoFar.name)) return null

	const accessor = useAccessor()

	// Safely parse URI
	let uri: URI | undefined
	try {
		if (toolCallSoFar.rawParams.uri && typeof toolCallSoFar.rawParams.uri === 'string') {
			uri = URI.file(toolCallSoFar.rawParams.uri)
		}
	} catch (e) {
		console.warn('Failed to parse URI for EditToolSoFar:', e)
	}

	const title = titleOfBuiltinToolName[toolCallSoFar.name]?.proposed || 'Editing file'

	const uriDone = toolCallSoFar.doneParams?.includes('uri') ?? false
	const uriStr = toolCallSoFar.rawParams['uri'] as string | undefined
	const desc1 = uriDone && uriStr ? getBasename(uriStr) : 'Generating...'

	const desc1OnClick = uri ? () => voidOpenFileFn(uri, accessor) : undefined

	// Show loading spinner icon
	const TOOL_STATUS_ICON_SIZE = 12
	const icon = <CircleSpinner size={TOOL_STATUS_ICON_SIZE} className='text-void-fg-3 flex-shrink-0' />
	const iconTooltip = 'Running...'

	// Get the code being generated
	const code = (toolCallSoFar.rawParams.search_replace_blocks ?? toolCallSoFar.rawParams.new_content ?? '') as string

	// Determine if we have any code to display
	const hasCode = !!(code && code.length > 0)

	return (
		<ToolHeaderWrapper
			title={title}
			desc1={desc1}
			desc1OnClick={desc1OnClick}
			icon={icon}
			iconTooltip={iconTooltip}
			isOpen={hasCode}
			isRunning={true}
		>
			{hasCode && uri ? (
				<ToolChildrenWrapper className='bg-void-bg-3'>
					<EditToolChildren
						uri={uri}
						code={code}
						type={'rewrite'} // as it streams, show in rewrite format, don't make a diff editor
					/>
				</ToolChildrenWrapper>
			) : null}
		</ToolHeaderWrapper>
	)
}


export const SidebarChat = () => {
	const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
	const textAreaFnsRef = useRef<TextAreaFns | null>(null)

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const chatThreadsService = accessor.get('IChatThreadService')

	const settingsState = useSettingsState()
	// ----- HIGHER STATE -----

	// threads state
	const chatThreadsState = useChatThreadsState()

	const currentThread = chatThreadsService.getCurrentThread()
	const previousMessages = currentThread?.messages ?? []

	const selections = currentThread.state.stagingSelections
	const setSelections = (s: StagingSelectionItem[]) => { chatThreadsService.setCurrentThreadState({ stagingSelections: s }) }

	// stream state
	const currThreadStreamState = useChatThreadsStreamState(chatThreadsState.currentThreadId)
	const isRunning = currThreadStreamState?.isRunning
	const latestError = currThreadStreamState?.error
	const { displayContentSoFar, toolCallSoFar, reasoningSoFar } = currThreadStreamState?.llmInfo ?? {}

	// this is just if it's currently being generated, NOT if it's currently running
	const toolIsGenerating = toolCallSoFar && !toolCallSoFar.isDone // show loading for slow tools (right now just edit)

	// Detect when AI is processing after tool completion (isRunning but no content yet and no tool generating)
	const isWaitingForAIResponse = isRunning && !displayContentSoFar && !reasoningSoFar && !toolIsGenerating

	// ----- SIDEBAR CHAT state (local) -----

	// state of current message
	const initVal = ''
	const [instructionsAreEmpty, setInstructionsAreEmpty] = useState(!initVal)

	// state to track when waiting for AI to start responding
	const [waitingForFirstAIMessage, setWaitingForFirstAIMessage] = useState(false)

	const isDisabled = instructionsAreEmpty || !!isFeatureNameDisabled('Chat', settingsState)

	const sidebarRef = useRef<HTMLDivElement>(null)
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)
	// State for images
	const [images, setImages] = useState<string[]>([])
	// State for drag and drop visual feedback
	const [isDragOver, setIsDragOver] = useState(false)

	// Helper function to process image files (used for file input, paste, and drop)
	const processImageFiles = useCallback((files: FileList | File[] | null | undefined) => {
		if (!files || files.length === 0) return

		const imagePromises: Promise<string>[] = []
		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (!file.type.startsWith('image/')) continue

			const promise = new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = (event) => {
					const dataUrl = event.target?.result as string
					resolve(dataUrl)
				}
				reader.onerror = reject
				reader.readAsDataURL(file)
			})
			imagePromises.push(promise)
		}

		if (imagePromises.length > 0) {
			Promise.all(imagePromises).then((dataUrls) => {
				setImages(prev => [...prev, ...dataUrls])
			}).catch((error) => {
				console.error('Error reading image files:', error)
			})
		}
	}, [])

	const onSubmit = useCallback(async (_forceSubmit?: string, _images?: string[]) => {

		if (isDisabled && !_forceSubmit) return
		if (isRunning) return

		const threadId = chatThreadsService.state.currentThreadId

		// send message to LLM
		const userMessage = _forceSubmit || textAreaRef.current?.value || ''
		const imagesToSend = _images ?? images

		try {
			await chatThreadsService.addUserMessageAndStreamResponse({ userMessage, _images: imagesToSend.length > 0 ? imagesToSend : undefined, threadId })
			// Set waiting state to true after sending message
			setWaitingForFirstAIMessage(true)
		} catch (e) {
			console.error('Error while sending message in chat:', e)
		}

		setSelections([]) // clear staging
		setImages([]) // clear images
		textAreaFnsRef.current?.setValue('')
		textAreaRef.current?.focus() // focus input after submit

	}, [chatThreadsService, isDisabled, isRunning, textAreaRef, textAreaFnsRef, setSelections, settingsState, images])

	const onAbort = async () => {
		const threadId = currentThread.id
		await chatThreadsService.abortRunning(threadId)
	}

	const keybindingString = accessor.get('IKeybindingService').lookupKeybinding(VOID_CTRL_L_ACTION_ID)?.getLabel()

	const threadId = currentThread.id
	const currCheckpointIdx = chatThreadsState.allThreads[threadId]?.state?.currCheckpointIdx ?? undefined  // if not exist, treat like checkpoint is last message (infinity)



	// resolve mount info
	const isResolved = chatThreadsState.allThreads[threadId]?.state.mountedInfo?.mountedIsResolvedRef.current
	useEffect(() => {
		if (isResolved) return
		chatThreadsState.allThreads[threadId]?.state.mountedInfo?._whenMountedResolver?.({
			textAreaRef: textAreaRef,
			scrollToBottom: () => scrollToBottom(scrollContainerRef),
		})

	}, [chatThreadsState, threadId, textAreaRef, scrollContainerRef, isResolved])

	// Clear waiting state when AI starts responding (first token arrives)
	useEffect(() => {
		if (waitingForFirstAIMessage && (displayContentSoFar || reasoningSoFar)) {
			setWaitingForFirstAIMessage(false)
		}
	}, [displayContentSoFar, reasoningSoFar, waitingForFirstAIMessage])

	// Reset waiting state when thread changes
	useEffect(() => {
		setWaitingForFirstAIMessage(false)
	}, [threadId])




	const previousMessagesHTML = useMemo(() => {
		// Simplified parallel tool grouping logic
		const PARALLEL_TOOLS = ['read_file', 'ls_dir', 'get_dir_tree', 'search_pathnames_only', 'search_for_files', 'search_in_file', 'read_lint_errors'] as const

		const isParallelTool = (msg: ChatMessage): boolean => {
			return msg.role === 'tool'
				&& msg.type !== 'invalid_params'
				&& isABuiltinToolName(msg.name)
				&& PARALLEL_TOOLS.includes(msg.name as any)
		}

		const groupedMessages: Array<{ type: 'single', message: ChatMessage, index: number } | { type: 'parallel', messages: Array<{ message: ChatMessage, index: number }> }> = []
		let currentParallelGroup: Array<{ message: ChatMessage, index: number }> = []

		for (let i = 0; i < previousMessages.length; i++) {
			const message = previousMessages[i]

			if (isParallelTool(message)) {
				currentParallelGroup.push({ message, index: i })

				// Check if next message is also a parallel tool (within reasonable distance)
				let foundNextParallelTool = false
				for (let j = i + 1; j < Math.min(i + 4, previousMessages.length); j++) {
					const nextMsg = previousMessages[j]
					if (isParallelTool(nextMsg)) {
						foundNextParallelTool = true
						break
					}
					// Stop if we hit a user message or checkpoint
					if (nextMsg.role === 'user' || nextMsg.role === 'checkpoint') {
						break
					}
				}

				// Close group if no more parallel tools found
				if (!foundNextParallelTool) {
					if (currentParallelGroup.length > 1) {
						groupedMessages.push({ type: 'parallel', messages: [...currentParallelGroup] })
					} else if (currentParallelGroup.length === 1) {
						groupedMessages.push({ type: 'single', message: currentParallelGroup[0].message, index: currentParallelGroup[0].index })
					}
					currentParallelGroup = []
				}
			} else {
				// Close any pending parallel group
				if (currentParallelGroup.length > 1) {
					groupedMessages.push({ type: 'parallel', messages: [...currentParallelGroup] })
				} else if (currentParallelGroup.length === 1) {
					groupedMessages.push({ type: 'single', message: currentParallelGroup[0].message, index: currentParallelGroup[0].index })
				}
				currentParallelGroup = []

				// Add current message as single
				groupedMessages.push({ type: 'single', message, index: i })
			}
		}

		// Handle remaining items in currentParallelGroup
		if (currentParallelGroup.length > 1) {
			groupedMessages.push({ type: 'parallel', messages: [...currentParallelGroup] })
		} else if (currentParallelGroup.length === 1) {
			groupedMessages.push({ type: 'single', message: currentParallelGroup[0].message, index: currentParallelGroup[0].index })
		}

		// Render grouped messages
		return groupedMessages.flatMap((group, groupIdx) => {
			if (group.type === 'single') {
				const i = group.index
				const previousMessage = i > 0 ? previousMessages[i - 1] : null
				const previousRole = previousMessage?.role
				const currentRole = group.message.role

				// Add extra spacing if switching between user and assistant messages
				const shouldAddGap = (previousRole === 'user' && currentRole === 'assistant') ||
									 (previousRole === 'assistant' && currentRole === 'user')

				return (
					<div key={`single-${i}`} className={shouldAddGap ? 'mt-2' : 'mt-1'}>
						<ChatBubble
							currCheckpointIdx={currCheckpointIdx}
							chatMessage={group.message}
							messageIdx={i}
							isCommitted={true}
							chatIsRunning={isRunning}
							threadId={threadId}
							_scrollToBottom={() => scrollToBottom(scrollContainerRef)}
						/>
					</div>
				)
			} else {
				// Parallel group - render all tools immediately
				return (
					<ParallelToolGroup
						key={`parallel-${groupIdx}-${group.messages[0]?.index ?? 'x'}`}
						messages={group.messages}
						previousMessages={previousMessages}
						threadId={threadId}
						currCheckpointIdx={currCheckpointIdx}
						isRunning={isRunning}
						scrollContainerRef={scrollContainerRef}
					/>
				)
			}
		})
	}, [previousMessages, threadId, currCheckpointIdx, isRunning])

	const streamingChatIdx = previousMessagesHTML.length
	const lastMessage = previousMessages[previousMessages.length - 1]
	const shouldAddGapForStreaming = lastMessage?.role === 'user'

	const currStreamingMessageHTML = reasoningSoFar || displayContentSoFar || isRunning ?
		<div className={shouldAddGapForStreaming ? 'mt-2' : 'mt-1'}>
			<ChatBubble
				key={'curr-streaming-msg'}
				currCheckpointIdx={currCheckpointIdx}
				chatMessage={{
					role: 'assistant',
					displayContent: displayContentSoFar ?? '',
					reasoning: reasoningSoFar ?? '',
					anthropicReasoning: null,
				}}
				messageIdx={streamingChatIdx}
				isCommitted={false}
				chatIsRunning={isRunning}
				threadId={threadId}
				_scrollToBottom={null}
			/>
		</div> : null


	// the tool currently being generated
	const generatingTool = toolIsGenerating ?
		toolCallSoFar.name === 'edit_file' || toolCallSoFar.name === 'rewrite_file' ? <EditToolSoFar
			key={'curr-streaming-tool'}
			toolCallSoFar={toolCallSoFar}
		/>
			: null
		: null

	const messagesHTML = <ScrollToBottomContainer
		key={'messages' + chatThreadsState.currentThreadId} // force rerender on all children if id changes
		scrollContainerRef={scrollContainerRef}
		className={`
			flex flex-col
			px-4 py-3
			w-full h-full
			overflow-x-hidden
			overflow-y-auto
			${previousMessagesHTML.length === 0 && !displayContentSoFar ? 'hidden' : ''}
		`}
	>
		{/* previous messages */}
		{previousMessagesHTML}
		{currStreamingMessageHTML}

		{/* Generating tool */}
		{generatingTool}

		{/* loading indicator - show when waiting for first AI response OR when AI is processing after tool completion */}
		{(waitingForFirstAIMessage || isWaitingForAIResponse) ? <ProseWrapper>
			{<IconLoading className='opacity-50 text-sm' />}
		</ProseWrapper> : null}


		{/* error message */}
		{latestError === undefined ? null :
			<div className='px-2 my-1'>
				<ErrorDisplay
					message={latestError.message}
					fullError={latestError.fullError}
					onDismiss={() => { chatThreadsService.dismissStreamError(currentThread.id) }}
					showDismiss={true}
				/>

				<WarningBox className='text-sm my-2 mx-4' onClick={() => { commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID) }} text='Open settings' />
			</div>
		}
	</ScrollToBottomContainer>


	const onChangeText = useCallback((newStr: string) => {
		setInstructionsAreEmpty(!newStr)
	}, [setInstructionsAreEmpty])
	const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			onSubmit()
		} else if (e.key === 'Escape' && isRunning) {
			onAbort()
		}
	}, [onSubmit, onAbort, isRunning])

	// Handle image file selection
	const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		processImageFiles(e.target.files)
		// Reset input
		e.target.value = ''
	}, [processImageFiles])

	// Handle paste event for images
	const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const clipboardData = e.clipboardData
		if (!clipboardData) return

		// Check if clipboard contains files (images)
		const files = clipboardData.files
		if (files && files.length > 0) {
			// Check if any files are images
			const hasImages = Array.from(files).some(file => file.type.startsWith('image/'))
			if (hasImages) {
				e.preventDefault() // Prevent default paste behavior
				processImageFiles(files)
			}
		}
		// Allow normal text paste if no images
	}, [processImageFiles])

	// Unified drag and drop handlers for images (reusable across all elements)
	// Check if the drag contains image files
	const hasImageFiles = useCallback((e: React.DragEvent): boolean => {
		if (!e.dataTransfer.types.includes('Files')) return false
		const items = Array.from(e.dataTransfer.items)
		return items.some(item => item.type.startsWith('image/'))
	}, [])

	// Create reusable drag handlers that can be attached to any element
	const createDragHandlers = useCallback(() => {
		const handleDragEnter = (e: React.DragEvent) => {
			if (hasImageFiles(e)) {
				e.preventDefault()
				setIsDragOver(true)
				e.dataTransfer.dropEffect = 'copy'
			}
		}

		const handleDragOver = (e: React.DragEvent) => {
			if (hasImageFiles(e)) {
				e.preventDefault() // Must preventDefault on each element to allow drop
				setIsDragOver(true)
				e.dataTransfer.dropEffect = 'copy'
			}
		}

		const handleDragLeave = (e: React.DragEvent) => {
			// Check if we're actually leaving the drop zone (not just entering a child)
			const relatedTarget = e.relatedTarget as Node | null
			const currentTarget = e.currentTarget as Node | null

			if (currentTarget && (!relatedTarget || !currentTarget.contains(relatedTarget))) {
				setIsDragOver(false)
			}
		}

		const handleDrop = (e: React.DragEvent) => {
			e.preventDefault()
			setIsDragOver(false)

			const files = e.dataTransfer.files
			if (files && files.length > 0) {
				processImageFiles(files)
			}
		}

		return { handleDragEnter, handleDragOver, handleDragLeave, handleDrop }
	}, [hasImageFiles, processImageFiles])

	// Get the handlers (created once and reused)
	const dragHandlers = createDragHandlers()

	// Remove image
	const removeImage = useCallback((index: number) => {
		setImages(prev => prev.filter((_, i) => i !== index))
	}, [])

	// File input ref for image button
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	const handleImageButtonClick = useCallback(() => {
		fileInputRef.current?.click()
	}, [])

	const chatAreaRef = useRef<HTMLDivElement | null>(null)

	const inputChatArea = <VoidChatArea
		featureName='Chat'
		onSubmit={() => onSubmit()}
		onAbort={onAbort}
		isStreaming={!!isRunning}
		isDisabled={isDisabled}
		showSelections={true}
		// showProspectiveSelections={previousMessagesHTML.length === 0}
		selections={selections}
		setSelections={setSelections}
		onClickAnywhere={() => { textAreaRef.current?.focus() }}
		divRef={chatAreaRef}
		imageButton={
			<>
				<input
					ref={fileInputRef}
					type='file'
					accept='image/*'
					multiple
					onChange={handleImageSelect}
					className='hidden'
				/>
				<ButtonAddImage onClick={handleImageButtonClick} />
			</>
		}
		onDragEnter={dragHandlers.handleDragEnter}
		onDragOver={dragHandlers.handleDragOver}
		onDragLeave={dragHandlers.handleDragLeave}
		onDrop={dragHandlers.handleDrop}
		isDragOver={isDragOver}
	>
		<div
			className='w-full min-h-[81px]'
			onDragEnter={dragHandlers.handleDragEnter}
			onDragOver={dragHandlers.handleDragOver}
			onDragLeave={dragHandlers.handleDragLeave}
			onDrop={dragHandlers.handleDrop}
		>
			<VoidInputBox2
				enableAtToMention
				className={`min-h-[81px] px-0.5 py-0.5`}
				placeholder={`@ to mention, ${keybindingString ? `${keybindingString} to add a selection. ` : ''}Enter instructions...`}
				onChangeText={onChangeText}
				onKeyDown={onKeyDown}
				onFocus={() => { chatThreadsService.setCurrentlyFocusedMessageIdx(undefined) }}
				onPaste={handlePaste}
				onDragEnter={dragHandlers.handleDragEnter}
				onDragOver={dragHandlers.handleDragOver}
				onDragLeave={dragHandlers.handleDragLeave}
				onDrop={dragHandlers.handleDrop}
				ref={textAreaRef}
				fnsRef={textAreaFnsRef}
				multiline={true}
			/>

			{/* Image preview */}
			{images.length > 0 && (
				<div
					className='flex flex-wrap gap-1.5 mt-1'
					onDragEnter={dragHandlers.handleDragEnter}
					onDragOver={dragHandlers.handleDragOver}
					onDragLeave={dragHandlers.handleDragLeave}
					onDrop={dragHandlers.handleDrop}
				>
					{images.map((imageUrl, index) => (
						<div key={index} className='relative'>
							<img
								src={imageUrl}
								alt={`Upload ${index + 1}`}
								className='w-12 h-12 object-cover rounded border border-void-border-3 shadow-sm'
							/>
							<button
								type='button'
								onClick={() => removeImage(index)}
								className='absolute -top-1 -right-1 bg-void-bg-3 rounded-full p-0.5 hover:brightness-125 cursor-pointer shadow-sm'
							>
								<IconX size={12} className='stroke-[2]' />
							</button>
						</div>
					))}
				</div>
			)}
		</div>

	</VoidChatArea>


	const isLandingPage = previousMessages.length === 0


	const initiallySuggestedPromptsHTML = <div className='flex flex-col gap-2 w-full text-nowrap text-void-fg-3 select-none'>
		{[
			'Summarize my codebase',
			'How do types work in Rust?',
			'Create a .voidrules file for me'
		].map((text, index) => (
			<div
				key={index}
				className='py-1 px-2 rounded text-sm bg-zinc-700/5 hover:bg-zinc-700/10 dark:bg-zinc-300/5 dark:hover:bg-zinc-300/10 cursor-pointer opacity-80 hover:opacity-100'
				onClick={() => onSubmit(text)}
			>
				{text}
			</div>
		))}
	</div>



	const threadPageInput = <div key={'input' + chatThreadsState.currentThreadId}>
		<div className='px-4'>
			<CommandBarInChat />
		</div>
		<div className='px-2 pb-2'>
			{inputChatArea}
		</div>
	</div>

	const landingPageInput = <div>
		<div className='pt-8'>
			{inputChatArea}
		</div>
	</div>

	const landingPageContent = <div
		ref={sidebarRef}
		className='w-full h-full max-h-full flex flex-col overflow-auto px-4'
	>
		<ErrorBoundary>
			{landingPageInput}
		</ErrorBoundary>

		{Object.keys(chatThreadsState.allThreads).length > 1 ? // show if there are threads
			<ErrorBoundary>
				<div className='pt-8 mb-2 text-void-fg-3 text-root select-none pointer-events-none'>Previous Threads</div>
				<PastThreadsList />
			</ErrorBoundary>
			:
			<ErrorBoundary>
				<div className='pt-8 mb-2 text-void-fg-3 text-root select-none pointer-events-none'>Suggestions</div>
				{initiallySuggestedPromptsHTML}
			</ErrorBoundary>
		}
	</div>


	// const threadPageContent = <div>
	// 	{/* Thread content */}
	// 	<div className='flex flex-col overflow-hidden'>
	// 		<div className={`overflow-hidden ${previousMessages.length === 0 ? 'h-0 max-h-0 pb-2' : ''}`}>
	// 			<ErrorBoundary>
	// 				{messagesHTML}
	// 			</ErrorBoundary>
	// 		</div>
	// 		<ErrorBoundary>
	// 			{inputForm}
	// 		</ErrorBoundary>
	// 	</div>
	// </div>
	const threadPageContent = <div
		ref={sidebarRef}
		className='w-full h-full flex flex-col overflow-hidden'
	>

		<ErrorBoundary>
			{messagesHTML}
		</ErrorBoundary>
		<ErrorBoundary>
			{threadPageInput}
		</ErrorBoundary>
	</div>


	return (
		<Fragment key={threadId} // force rerender when change thread
		>
			{isLandingPage ?
				landingPageContent
				: threadPageContent}
		</Fragment>
	)
}
