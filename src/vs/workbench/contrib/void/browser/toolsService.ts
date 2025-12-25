import { CancellationToken } from '../../../../base/common/cancellation.js'
import { URI } from '../../../../base/common/uri.js'
import { IFileService } from '../../../../platform/files/common/files.js'
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js'
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js'
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js'
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js'
import { ISearchService } from '../../../services/search/common/search.js'
import { IEditCodeService } from './editCodeServiceInterface.js'
import { ITerminalToolService } from './terminalToolService.js'
import { LintErrorItem, BuiltinToolCallParams, BuiltinToolResultType, BuiltinToolName } from '../common/toolsServiceTypes.js'
import { IVoidModelService } from '../common/voidModelService.js'
import { EndOfLinePreference } from '../../../../editor/common/model.js'
import { IVoidCommandBarService } from './voidCommandBarService.js'
import { computeDirectoryTree1Deep, IDirectoryStrService, stringifyDirectoryTree1Deep } from '../common/directoryStrService.js'
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js'
import { timeout } from '../../../../base/common/async.js'
import { RawToolParamsObj } from '../common/sendLLMMessageTypes.js'
import { MAX_CHILDREN_URIs_PAGE, MAX_FILE_CHARS_PAGE, MAX_TERMINAL_BG_COMMAND_TIME, MAX_TERMINAL_INACTIVE_TIME } from '../common/prompt/prompts.js'
import { IVoidSettingsService } from '../common/voidSettingsService.js'
import { generateUuid } from '../../../../base/common/uuid.js'
import { IEmbeddedBrowserService } from '../../../../platform/embeddedBrowser/common/embeddedBrowser.js'
import { ICommandService } from '../../../../platform/commands/common/commands.js'


// tool use for AI
type ValidateBuiltinParams = { [T in BuiltinToolName]: (p: RawToolParamsObj) => BuiltinToolCallParams[T] }
type CallBuiltinTool = { [T in BuiltinToolName]: (p: BuiltinToolCallParams[T]) => Promise<{ result: BuiltinToolResultType[T] | Promise<BuiltinToolResultType[T]>, interruptTool?: () => void }> }
type BuiltinToolResultToString = { [T in BuiltinToolName]: (p: BuiltinToolCallParams[T], result: Awaited<BuiltinToolResultType[T]>) => string }


const isFalsy = (u: unknown) => {
	return !u || u === 'null' || u === 'undefined'
}

const validateStr = (argName: string, value: unknown) => {
	if (value === null) throw new Error(`Invalid LLM output: ${argName} was null.`)
	if (typeof value !== 'string') throw new Error(`Invalid LLM output format: ${argName} must be a string, but its type is "${typeof value}". Full value: ${JSON.stringify(value)}.`)
	return value
}


// We are NOT checking to make sure in workspace
const validateURI = (uriStr: unknown) => {
	if (uriStr === null) throw new Error(`Invalid LLM output: uri was null.`)
	if (typeof uriStr !== 'string') throw new Error(`Invalid LLM output format: Provided uri must be a string, but it's a(n) ${typeof uriStr}. Full value: ${JSON.stringify(uriStr)}.`)

	// Check if it's already a full URI with scheme (e.g., vscode-remote://, file://, etc.)
	// Look for :// pattern which indicates a scheme is present
	// Examples of supported URIs:
	// - vscode-remote://wsl+Ubuntu/home/user/file.txt (WSL)
	// - vscode-remote://ssh-remote+myserver/home/user/file.txt (SSH)
	// - file:///home/user/file.txt (local file with scheme)
	// - /home/user/file.txt (local file path, will be converted to file://)
	// - C:\Users\file.txt (Windows local path, will be converted to file://)
	if (uriStr.includes('://')) {
		try {
			const uri = URI.parse(uriStr)
			return uri
		} catch (e) {
			// If parsing fails, it's a malformed URI
			throw new Error(`Invalid URI format: ${uriStr}. Error: ${e}`)
		}
	} else {
		// No scheme present, treat as file path
		// This handles regular file paths like /home/user/file.txt or C:\Users\file.txt
		const uri = URI.file(uriStr)
		return uri
	}
}

const validateOptionalURI = (uriStr: unknown) => {
	if (isFalsy(uriStr)) return null
	return validateURI(uriStr)
}

const validateOptionalStr = (argName: string, str: unknown) => {
	if (isFalsy(str)) return null
	return validateStr(argName, str)
}


const validatePageNum = (pageNumberUnknown: unknown) => {
	if (!pageNumberUnknown) return 1
	const parsedInt = Number.parseInt(pageNumberUnknown + '')
	if (!Number.isInteger(parsedInt)) throw new Error(`Page number was not an integer: "${pageNumberUnknown}".`)
	if (parsedInt < 1) throw new Error(`Invalid LLM output format: Specified page number must be 1 or greater: "${pageNumberUnknown}".`)
	return parsedInt
}

const validateNumber = (numStr: unknown, opts: { default: number | null }) => {
	if (typeof numStr === 'number')
		return numStr
	if (isFalsy(numStr)) return opts.default

	if (typeof numStr === 'string') {
		const parsedInt = Number.parseInt(numStr + '')
		if (!Number.isInteger(parsedInt)) return opts.default
		return parsedInt
	}

	return opts.default
}

const validateProposedTerminalId = (terminalIdUnknown: unknown) => {
	if (!terminalIdUnknown) throw new Error(`A value for terminalID must be specified, but the value was "${terminalIdUnknown}"`)
	const terminalId = terminalIdUnknown + ''
	return terminalId
}

const validateBoolean = (b: unknown, opts: { default: boolean }) => {
	if (typeof b === 'string') {
		if (b === 'true') return true
		if (b === 'false') return false
	}
	if (typeof b === 'boolean') {
		return b
	}
	return opts.default
}


const checkIfIsFolder = (uriStr: string) => {
	uriStr = uriStr.trim()
	if (uriStr.endsWith('/') || uriStr.endsWith('\\')) return true
	return false
}

export interface IToolsService {
	readonly _serviceBrand: undefined;
	validateParams: ValidateBuiltinParams;
	callTool: CallBuiltinTool;
	stringOfResult: BuiltinToolResultToString;
}

export const IToolsService = createDecorator<IToolsService>('ToolsService');

export class ToolsService implements IToolsService {

	readonly _serviceBrand: undefined;

	public validateParams: ValidateBuiltinParams;
	public callTool: CallBuiltinTool;
	public stringOfResult: BuiltinToolResultToString;

	// Mutex to serialize mutating/terminal tool calls
	private _mutatingToolInProgress: boolean = false;
	private _currentMutatingTool: string | null = null;

	// Browser session management
	// Use the simple-browser extension's session ID for proper UI synchronization
	private readonly _defaultBrowserSessionId = 'simple-browser-default';
	private _browserSessionInitialized: boolean = false;

	constructor(
		@IFileService fileService: IFileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ISearchService searchService: ISearchService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IVoidModelService voidModelService: IVoidModelService,
		@IEditCodeService editCodeService: IEditCodeService,
		@ITerminalToolService private readonly terminalToolService: ITerminalToolService,
		@IVoidCommandBarService private readonly commandBarService: IVoidCommandBarService,
		@IDirectoryStrService private readonly directoryStrService: IDirectoryStrService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IEmbeddedBrowserService private readonly embeddedBrowserService: IEmbeddedBrowserService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		const queryBuilder = instantiationService.createInstance(QueryBuilder);

		this.validateParams = {
			read_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, start_line: startLineUnknown, end_line: endLineUnknown, page_number: pageNumberUnknown } = params
				const uri = validateURI(uriStr)
				const pageNumber = validatePageNum(pageNumberUnknown)

				let startLine = validateNumber(startLineUnknown, { default: null })
				let endLine = validateNumber(endLineUnknown, { default: null })

				if (startLine !== null && startLine < 1) startLine = null
				if (endLine !== null && endLine < 1) endLine = null

				return { uri, startLine, endLine, pageNumber }
			},
			ls_dir: (params: RawToolParamsObj) => {
				const { uri: uriStr, page_number: pageNumberUnknown } = params

				const uri = validateURI(uriStr)
				const pageNumber = validatePageNum(pageNumberUnknown)
				return { uri, pageNumber }
			},
			get_dir_tree: (params: RawToolParamsObj) => {
				const { uri: uriStr, } = params
				const uri = validateURI(uriStr)
				return { uri }
			},
			search_pathnames_only: (params: RawToolParamsObj) => {
				const {
					query: queryUnknown,
					search_in_folder: includeUnknown,
					page_number: pageNumberUnknown
				} = params

				const queryStr = validateStr('query', queryUnknown)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const includePattern = validateOptionalStr('include_pattern', includeUnknown)

				return { query: queryStr, includePattern, pageNumber }

			},
			search_for_files: (params: RawToolParamsObj) => {
				const {
					query: queryUnknown,
					search_in_folder: searchInFolderUnknown,
					is_regex: isRegexUnknown,
					page_number: pageNumberUnknown
				} = params
				const queryStr = validateStr('query', queryUnknown)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const searchInFolder = validateOptionalURI(searchInFolderUnknown)
				const isRegex = validateBoolean(isRegexUnknown, { default: false })
				return {
					query: queryStr,
					isRegex,
					searchInFolder,
					pageNumber
				}
			},
			search_in_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, query: queryUnknown, is_regex: isRegexUnknown } = params;
				const uri = validateURI(uriStr);
				const query = validateStr('query', queryUnknown);
				const isRegex = validateBoolean(isRegexUnknown, { default: false });
				return { uri, query, isRegex };
			},

			read_lint_errors: (params: RawToolParamsObj) => {
				const {
					uri: uriUnknown,
				} = params
				const uri = validateURI(uriUnknown)
				return { uri }
			},

			// ---

			create_file_or_folder: (params: RawToolParamsObj) => {
				const { uri: uriUnknown } = params
				const uri = validateURI(uriUnknown)
				const uriStr = validateStr('uri', uriUnknown)
				const isFolder = checkIfIsFolder(uriStr)
				return { uri, isFolder }
			},

			delete_file_or_folder: (params: RawToolParamsObj) => {
				const { uri: uriUnknown, is_recursive: isRecursiveUnknown } = params
				const uri = validateURI(uriUnknown)
				const isRecursive = validateBoolean(isRecursiveUnknown, { default: false })
				const uriStr = validateStr('uri', uriUnknown)
				const isFolder = checkIfIsFolder(uriStr)
				return { uri, isRecursive, isFolder }
			},

			rewrite_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, new_content: newContentUnknown } = params
				const uri = validateURI(uriStr)
				const newContent = validateStr('newContent', newContentUnknown)
				return { uri, newContent }
			},

			edit_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, search_replace_blocks: searchReplaceBlocksUnknown } = params
				const uri = validateURI(uriStr)
				const searchReplaceBlocks = validateStr('searchReplaceBlocks', searchReplaceBlocksUnknown)
				return { uri, searchReplaceBlocks }
			},

			// ---

			run_command: (params: RawToolParamsObj) => {
				const { command: commandUnknown, cwd: cwdUnknown } = params
				const command = validateStr('command', commandUnknown)
				const cwd = validateOptionalStr('cwd', cwdUnknown)
				const terminalId = generateUuid()
				return { command, cwd, terminalId }
			},
			run_persistent_command: (params: RawToolParamsObj) => {
				const { command: commandUnknown, persistent_terminal_id: persistentTerminalIdUnknown } = params;
				const command = validateStr('command', commandUnknown);
				const persistentTerminalId = validateProposedTerminalId(persistentTerminalIdUnknown)
				return { command, persistentTerminalId };
			},
			open_persistent_terminal: (params: RawToolParamsObj) => {
				const { cwd: cwdUnknown } = params;
				const cwd = validateOptionalStr('cwd', cwdUnknown)
				// No parameters needed; will open a new background terminal
				return { cwd };
			},
			kill_persistent_terminal: (params: RawToolParamsObj) => {
				const { persistent_terminal_id: terminalIdUnknown } = params;
				const persistentTerminalId = validateProposedTerminalId(terminalIdUnknown);
				return { persistentTerminalId };
			},

			// ========================================
			// BROWSER TOOLS
			// ========================================

			browser_open: (params: RawToolParamsObj) => {
				const { url: urlUnknown } = params;
				// URL is optional - defaults to Google if not provided
				const url = urlUnknown ? validateStr('url', urlUnknown) : null;
				if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
					throw new Error('URL must start with http:// or https://');
				}
				return { url };
			},

			browser_navigate: (params: RawToolParamsObj) => {
				const { url: urlUnknown } = params;
				const url = validateStr('url', urlUnknown);
				// Basic URL validation - must start with http:// or https://
				if (!url.startsWith('http://') && !url.startsWith('https://')) {
					throw new Error('URL must start with http:// or https://');
				}
				return { url };
			},

			browser_screenshot: (_params: RawToolParamsObj) => {
				return {};
			},

			browser_get_content: (_params: RawToolParamsObj) => {
				return {};
			},

			browser_get_accessibility_tree: (_params: RawToolParamsObj) => {
				return {};
			},

			browser_click: (params: RawToolParamsObj) => {
				const { selector: selectorUnknown } = params;
				const selector = validateStr('selector', selectorUnknown);
				return { selector };
			},

			browser_type: (params: RawToolParamsObj) => {
				const { selector: selectorUnknown, text: textUnknown, delay: delayUnknown } = params;
				const selector = validateStr('selector', selectorUnknown);
				const text = validateStr('text', textUnknown);
				const delay = validateNumber(delayUnknown, { default: null });
				return { selector, text, delay };
			},

			browser_fill: (params: RawToolParamsObj) => {
				const { selector: selectorUnknown, value: valueUnknown } = params;
				const selector = validateStr('selector', selectorUnknown);
				const value = validateStr('value', valueUnknown);
				return { selector, value };
			},

			browser_press: (params: RawToolParamsObj) => {
				const { key: keyUnknown } = params;
				const key = validateStr('key', keyUnknown);
				return { key };
			},

			browser_hover: (params: RawToolParamsObj) => {
				const { selector: selectorUnknown } = params;
				const selector = validateStr('selector', selectorUnknown);
				return { selector };
			},

			browser_wait_for_selector: (params: RawToolParamsObj) => {
				const { selector: selectorUnknown, timeout: timeoutUnknown } = params;
				const selector = validateStr('selector', selectorUnknown);
				const timeout = validateNumber(timeoutUnknown, { default: null });
				return { selector, timeout };
			},

			browser_evaluate: (params: RawToolParamsObj) => {
				const { script: scriptUnknown } = params;
				const script = validateStr('script', scriptUnknown);
				return { script };
			},

			browser_back: (_params: RawToolParamsObj) => {
				return {};
			},

			browser_forward: (_params: RawToolParamsObj) => {
				return {};
			},

			browser_reload: (_params: RawToolParamsObj) => {
				return {};
			},

			browser_get_current_url: (_params: RawToolParamsObj) => {
				return {};
			},

			browser_close: (_params: RawToolParamsObj) => {
				return {};
			},

		}


		this.callTool = {
			read_file: async ({ uri, startLine, endLine, pageNumber }) => {
				await voidModelService.initializeModel(uri)
				const { model } = await voidModelService.getModelSafe(uri)
				if (model === null) { throw new Error(`No contents; File does not exist.`) }

				let contents: string
				if (startLine === null && endLine === null) {
					contents = model.getValue(EndOfLinePreference.LF)
				}
				else {
					const startLineNumber = startLine === null ? 1 : startLine
					const endLineNumber = endLine === null ? model.getLineCount() : endLine
					contents = model.getValueInRange({ startLineNumber, startColumn: 1, endLineNumber, endColumn: Number.MAX_SAFE_INTEGER }, EndOfLinePreference.LF)
				}

				const totalNumLines = model.getLineCount()

				const fromIdx = MAX_FILE_CHARS_PAGE * (pageNumber - 1)
				const toIdx = MAX_FILE_CHARS_PAGE * pageNumber - 1
				const fileContents = contents.slice(fromIdx, toIdx + 1) // paginate
				const hasNextPage = (contents.length - 1) - toIdx >= 1
				const totalFileLen = contents.length
				return { result: { fileContents, totalFileLen, hasNextPage, totalNumLines } }
			},

			ls_dir: async ({ uri, pageNumber }) => {
				const dirResult = await computeDirectoryTree1Deep(fileService, uri, pageNumber)
				return { result: dirResult }
			},

			get_dir_tree: async ({ uri }) => {
				const str = await this.directoryStrService.getDirectoryStrTool(uri)
				return { result: { str } }
			},

			search_pathnames_only: async ({ query: queryStr, includePattern, pageNumber }) => {

				const query = queryBuilder.file(workspaceContextService.getWorkspace().folders.map(f => f.uri), {
					filePattern: queryStr,
					includePattern: includePattern ?? undefined,
					sortByScore: true, // makes results 10x better
				})
				const data = await searchService.fileSearch(query, CancellationToken.None)

				const fromIdx = MAX_CHILDREN_URIs_PAGE * (pageNumber - 1)
				const toIdx = MAX_CHILDREN_URIs_PAGE * pageNumber - 1
				const uris = data.results
					.slice(fromIdx, toIdx + 1) // paginate
					.map(({ resource, results }) => resource)

				const hasNextPage = (data.results.length - 1) - toIdx >= 1
				return { result: { uris, hasNextPage } }
			},

			search_for_files: async ({ query: queryStr, isRegex, searchInFolder, pageNumber }) => {
				const searchFolders = searchInFolder === null ?
					workspaceContextService.getWorkspace().folders.map(f => f.uri)
					: [searchInFolder]

				const query = queryBuilder.text({
					pattern: queryStr,
					isRegExp: isRegex,
				}, searchFolders)

				const data = await searchService.textSearch(query, CancellationToken.None)

				const fromIdx = MAX_CHILDREN_URIs_PAGE * (pageNumber - 1)
				const toIdx = MAX_CHILDREN_URIs_PAGE * pageNumber - 1
				const uris = data.results
					.slice(fromIdx, toIdx + 1) // paginate
					.map(({ resource, results }) => resource)

				const hasNextPage = (data.results.length - 1) - toIdx >= 1
				return { result: { queryStr, uris, hasNextPage } }
			},
			search_in_file: async ({ uri, query, isRegex }) => {
				await voidModelService.initializeModel(uri);
				const { model } = await voidModelService.getModelSafe(uri);
				if (model === null) { throw new Error(`No contents; File does not exist.`); }
				const contents = model.getValue(EndOfLinePreference.LF);
				const contentOfLine = contents.split('\n');
				const totalLines = contentOfLine.length;
				const regex = isRegex ? new RegExp(query) : null;
				const lines: number[] = []
				for (let i = 0; i < totalLines; i++) {
					const line = contentOfLine[i];
					if ((isRegex && regex!.test(line)) || (!isRegex && line.includes(query))) {
						const matchLine = i + 1;
						lines.push(matchLine);
					}
				}
				return { result: { lines } };
			},

			read_lint_errors: async ({ uri }) => {
				await timeout(1000)
				const { lintErrors } = this._getLintErrors(uri)
				return { result: { lintErrors } }
			},

			// ---

			create_file_or_folder: async ({ uri, isFolder }) => {
				this._acquireMutatingLock('create_file_or_folder');
				try {
					if (isFolder)
						await fileService.createFolder(uri)
					else {
						await fileService.createFile(uri)
					}
					return { result: {} }
				} finally {
					this._releaseMutatingLock();
				}
			},

			delete_file_or_folder: async ({ uri, isRecursive }) => {
				this._acquireMutatingLock('delete_file_or_folder');
				try {
					await fileService.del(uri, { recursive: isRecursive })
					return { result: {} }
				} finally {
					this._releaseMutatingLock();
				}
			},

			rewrite_file: async ({ uri, newContent }) => {
				this._acquireMutatingLock('rewrite_file');
				try {
					await voidModelService.initializeModel(uri)
					if (this.commandBarService.getStreamState(uri) === 'streaming') {
						throw new Error(`Another LLM is currently making changes to this file. Please stop streaming for now and ask the user to resume later.`)
					}
					await editCodeService.callBeforeApplyOrEdit(uri)
					editCodeService.instantlyRewriteFile({ uri, newContent })
					// at end, get lint errors
					const lintErrorsPromise = Promise.resolve().then(async () => {
						await timeout(2000)
						const { lintErrors } = this._getLintErrors(uri)
						this._releaseMutatingLock();
						return { lintErrors }
					})
					return { result: lintErrorsPromise }
				} catch (error) {
					this._releaseMutatingLock();
					throw error;
				}
			},

			edit_file: async ({ uri, searchReplaceBlocks }) => {
				this._acquireMutatingLock('edit_file');
				try {
					await voidModelService.initializeModel(uri)
					if (this.commandBarService.getStreamState(uri) === 'streaming') {
						throw new Error(`Another LLM is currently making changes to this file. Please stop streaming for now and ask the user to resume later.`)
					}
					await editCodeService.callBeforeApplyOrEdit(uri)
					editCodeService.instantlyApplySearchReplaceBlocks({ uri, searchReplaceBlocks })

					// at end, get lint errors
					const lintErrorsPromise = Promise.resolve().then(async () => {
						await timeout(2000)
						const { lintErrors } = this._getLintErrors(uri)
						this._releaseMutatingLock();
						return { lintErrors }
					})

					return { result: lintErrorsPromise }
				} catch (error) {
					this._releaseMutatingLock();
					throw error;
				}
			},
			// ---
			run_command: async ({ command, cwd, terminalId }) => {
				this._acquireMutatingLock('run_command');
				try {
					const { resPromise, interrupt } = await this.terminalToolService.runCommand(command, { type: 'temporary', cwd, terminalId })
					// Wrap the result promise to release lock after completion
					const wrappedPromise = resPromise.then((result) => {
						this._releaseMutatingLock();
						return result;
					}).catch((error) => {
						this._releaseMutatingLock();
						throw error;
					});
					return { result: wrappedPromise, interruptTool: interrupt }
				} catch (error) {
					this._releaseMutatingLock();
					throw error;
				}
			},
			run_persistent_command: async ({ command, persistentTerminalId }) => {
				this._acquireMutatingLock('run_persistent_command');
				try {
					const { resPromise, interrupt } = await this.terminalToolService.runCommand(command, { type: 'persistent', persistentTerminalId })
					// Wrap the result promise to release lock after completion
					const wrappedPromise = resPromise.then((result) => {
						this._releaseMutatingLock();
						return result;
					}).catch((error) => {
						this._releaseMutatingLock();
						throw error;
					});
					return { result: wrappedPromise, interruptTool: interrupt }
				} catch (error) {
					this._releaseMutatingLock();
					throw error;
				}
			},
			open_persistent_terminal: async ({ cwd }) => {
				this._acquireMutatingLock('open_persistent_terminal');
				try {
					const persistentTerminalId = await this.terminalToolService.createPersistentTerminal({ cwd })
					return { result: { persistentTerminalId } }
				} finally {
					this._releaseMutatingLock();
				}
			},
			kill_persistent_terminal: async ({ persistentTerminalId }) => {
				this._acquireMutatingLock('kill_persistent_terminal');
				try {
					// Close the background terminal by sending exit
					await this.terminalToolService.killPersistentTerminal(persistentTerminalId)
					return { result: {} }
				} finally {
					this._releaseMutatingLock();
				}
			},

			// ========================================
			// BROWSER TOOLS
			// ========================================

			browser_open: async ({ url }) => {
				this._acquireMutatingLock('browser_open');
				try {
					// Call the simple-browser extension command to open the visible browser panel
					// This also creates/syncs the backend automation session
					await this.commandService.executeCommand('simpleBrowser.showAgenticBrowser', url || 'https://www.google.com');
					this._browserSessionInitialized = true;
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_open', { url: url || 'https://www.google.com' });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_navigate: async ({ url }) => {
				this._acquireMutatingLock('browser_navigate');
				try {
					// Call the simple-browser extension command to navigate
					// This ensures the visible browser panel is synced with backend
					await this.commandService.executeCommand('simpleBrowser.navigate', url);
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_navigate', { url });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_screenshot: async () => {
				this._acquireMutatingLock('browser_screenshot');
				try {
					const screenshot = await this.embeddedBrowserService.screenshot(this._defaultBrowserSessionId);
					return { result: { screenshot } };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_screenshot', {});
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_get_content: async () => {
				this._acquireMutatingLock('browser_get_content');
				try {
					const html = await this.embeddedBrowserService.getContent(this._defaultBrowserSessionId);
					return { result: { html } };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_get_content', {});
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_get_accessibility_tree: async () => {
				this._acquireMutatingLock('browser_get_accessibility_tree');
				try {
					const tree = await this.embeddedBrowserService.getAccessibilityTree(this._defaultBrowserSessionId);
					return { result: { tree } };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_get_accessibility_tree', {});
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_click: async ({ selector }) => {
				this._acquireMutatingLock('browser_click');
				try {
					// Call simple-browser extension command to ensure UI synchronization
					await this.commandService.executeCommand('simpleBrowser.click', selector);
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_click', { selector });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_type: async ({ selector, text, delay }) => {
				this._acquireMutatingLock('browser_type');
				try {
					await this.embeddedBrowserService.type(this._defaultBrowserSessionId, selector, text, { delay: delay || undefined });
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_type', { selector, text });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_fill: async ({ selector, value }) => {
				this._acquireMutatingLock('browser_fill');
				try {
					await this.embeddedBrowserService.fill(this._defaultBrowserSessionId, selector, value);
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_fill', { selector, value });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_press: async ({ key }) => {
				this._acquireMutatingLock('browser_press');
				try {
					await this.embeddedBrowserService.press(this._defaultBrowserSessionId, key);
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_press', { key });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_hover: async ({ selector }) => {
				this._acquireMutatingLock('browser_hover');
				try {
					await this.embeddedBrowserService.hover(this._defaultBrowserSessionId, selector);
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_hover', { selector });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_wait_for_selector: async ({ selector, timeout }) => {
				this._acquireMutatingLock('browser_wait_for_selector');
				try {
					await this.embeddedBrowserService.waitForSelector(this._defaultBrowserSessionId, selector, timeout || undefined);
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_wait_for_selector', { selector });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_evaluate: async ({ script }) => {
				this._acquireMutatingLock('browser_evaluate');
				try {
					const result = await this.embeddedBrowserService.evaluate(this._defaultBrowserSessionId, script);
					return { result: { result } };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_evaluate', { script });
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_back: async () => {
				this._acquireMutatingLock('browser_back');
				try {
					// Call simple-browser extension command to ensure UI synchronization
					await this.commandService.executeCommand('simpleBrowser.back');
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_back', {});
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_forward: async () => {
				this._acquireMutatingLock('browser_forward');
				try {
					// Call simple-browser extension command to ensure UI synchronization
					await this.commandService.executeCommand('simpleBrowser.forward');
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_forward', {});
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_reload: async () => {
				this._acquireMutatingLock('browser_reload');
				try {
					// Call simple-browser extension command to ensure UI synchronization
					await this.commandService.executeCommand('simpleBrowser.reload');
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_reload', {});
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_get_current_url: async () => {
				this._acquireMutatingLock('browser_get_current_url');
				try {
					const url = await this.embeddedBrowserService.getCurrentUrl(this._defaultBrowserSessionId);
					return { result: { url: url || '' } };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_get_current_url', {});
				} finally {
					this._releaseMutatingLock();
				}
			},

			browser_close: async () => {
				this._acquireMutatingLock('browser_close');
				try {
					// Call the simple-browser extension command to close the browser
					await this.commandService.executeCommand('simpleBrowser.closeBrowser');
					this._browserSessionInitialized = false;
					return { result: {} };
				} catch (error) {
					throw this._formatBrowserError(error, 'browser_close', {});
				} finally {
					this._releaseMutatingLock();
				}
			},
		}


		const nextPageStr = (hasNextPage: boolean) => hasNextPage ? '\n\n(more on next page...)' : ''

		const stringifyLintErrors = (lintErrors: LintErrorItem[]) => {
			return lintErrors
				.map((e, i) => `Error ${i + 1}:\nLines Affected: ${e.startLineNumber}-${e.endLineNumber}\nError message:${e.message}`)
				.join('\n\n')
				.substring(0, MAX_FILE_CHARS_PAGE)
		}

		// given to the LLM after the call for successful tool calls
		this.stringOfResult = {
			read_file: (params, result) => {
				return `${params.uri.fsPath}\n\`\`\`\n${result.fileContents}\n\`\`\`${nextPageStr(result.hasNextPage)}${result.hasNextPage ? `\nMore info because truncated: this file has ${result.totalNumLines} lines, or ${result.totalFileLen} characters.` : ''}`
			},
			ls_dir: (params, result) => {
				const dirTreeStr = stringifyDirectoryTree1Deep(params, result)
				return dirTreeStr // + nextPageStr(result.hasNextPage) // already handles num results remaining
			},
			get_dir_tree: (params, result) => {
				return result.str
			},
			search_pathnames_only: (params, result) => {
				return result.uris.map(uri => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_for_files: (params, result) => {
				return result.uris.map(uri => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_in_file: (params, result) => {
				const { model } = voidModelService.getModel(params.uri)
				if (!model) return '<Error getting string of result>'
				const lines = result.lines.map(n => {
					const lineContent = model.getValueInRange({ startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: Number.MAX_SAFE_INTEGER }, EndOfLinePreference.LF)
					return `Line ${n}:\n\`\`\`\n${lineContent}\n\`\`\``
				}).join('\n\n');
				return lines;
			},
			read_lint_errors: (params, result) => {
				return result.lintErrors ?
					stringifyLintErrors(result.lintErrors)
					: 'No lint errors found.'
			},
			// ---
			create_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully created.`
			},
			delete_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully deleted.`
			},
			edit_file: (params, result) => {
				const lintErrsString = (
					this.voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			rewrite_file: (params, result) => {
				const lintErrsString = (
					this.voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			run_command: (params, result) => {
				const { resolveReason, result: result_, } = result
				// success
				if (resolveReason.type === 'done') {
					return `${result_}\n(exit code ${resolveReason.exitCode})`
				}
				// normal command
				if (resolveReason.type === 'timeout') {
					return `${result_}\nTerminal command ran, but was automatically killed by Void after ${MAX_TERMINAL_INACTIVE_TIME}s of inactivity and did not finish successfully. To try with more time, open a persistent terminal and run the command there.`
				}
				throw new Error(`Unexpected internal error: Terminal command did not resolve with a valid reason.`)
			},

			run_persistent_command: (params, result) => {
				const { resolveReason, result: result_, } = result
				const { persistentTerminalId } = params
				// success
				if (resolveReason.type === 'done') {
					return `${result_}\n(exit code ${resolveReason.exitCode})`
				}
				// bg command
				if (resolveReason.type === 'timeout') {
					return `${result_}\nTerminal command is running in terminal ${persistentTerminalId}. The given outputs are the results after ${MAX_TERMINAL_BG_COMMAND_TIME} seconds.`
				}
				throw new Error(`Unexpected internal error: Terminal command did not resolve with a valid reason.`)
			},

			open_persistent_terminal: (_params, result) => {
				const { persistentTerminalId } = result;
				return `Successfully created persistent terminal. persistentTerminalId="${persistentTerminalId}"`;
			},
			kill_persistent_terminal: (params, _result) => {
				return `Successfully closed terminal "${params.persistentTerminalId}".`;
			},

			// ========================================
			// BROWSER TOOLS
			// ========================================

			browser_open: (params, _result) => {
				return `Successfully opened browser${params.url ? ` at ${params.url}` : ''}`;
			},

			browser_navigate: (params, _result) => {
				return `Successfully navigated to ${params.url}`;
			},

			browser_screenshot: (_params, result) => {
				const screenshotLength = result.screenshot?.length || 0;
				const preview = screenshotLength > 100 ? result.screenshot.substring(0, 100) + '...' : result.screenshot;
				return `Screenshot captured (${screenshotLength} bytes)\nBase64 PNG data: ${preview}`;
			},

			browser_get_content: (_params, result) => {
				const html = result.html || '';
				const truncated = html.length > 50000 ? html.substring(0, 50000) + '\n... [content truncated - showing first 50,000 characters]' : html;
				return `Page HTML content (${html.length} characters):\n${truncated}`;
			},

			browser_get_accessibility_tree: (_params, result) => {
				return `Accessibility Tree:\n${result.tree}`;
			},

			browser_click: (params, _result) => {
				return `Successfully clicked element: ${params.selector}`;
			},

			browser_type: (params, _result) => {
				return `Successfully typed "${params.text}" into element: ${params.selector}`;
			},

			browser_fill: (params, _result) => {
				return `Successfully filled element ${params.selector} with value: ${params.value}`;
			},

			browser_press: (params, _result) => {
				return `Successfully pressed key: ${params.key}`;
			},

			browser_hover: (params, _result) => {
				return `Successfully hovered over element: ${params.selector}`;
			},

			browser_wait_for_selector: (params, _result) => {
				return `Element found and ready: ${params.selector}`;
			},

			browser_evaluate: (_params, result) => {
				const resultStr = typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : String(result.result);
				return `JavaScript evaluation result:\n${resultStr}`;
			},

			browser_back: (_params, _result) => {
				return `Successfully navigated back`;
			},

			browser_forward: (_params, _result) => {
				return `Successfully navigated forward`;
			},

			browser_reload: (_params, _result) => {
				return `Successfully reloaded page`;
			},

			browser_get_current_url: (_params, result) => {
				return `Current URL: ${result.url}`;
			},

			browser_close: (_params, _result) => {
				return `Successfully closed browser`;
			},
		}



	}


	private _acquireMutatingLock(toolName: string): void {
		if (this._mutatingToolInProgress) {
			throw new Error(`Cannot run ${toolName} while another mutating/terminal tool (${this._currentMutatingTool}) is in progress. Mutating and terminal tools must run sequentially and alone. Please wait for the current operation to complete.`);
		}
		this._mutatingToolInProgress = true;
		this._currentMutatingTool = toolName;
	}

	private _releaseMutatingLock(): void {
		this._mutatingToolInProgress = false;
		this._currentMutatingTool = null;
	}

	private _getLintErrors(uri: URI): { lintErrors: LintErrorItem[] | null } {
		const lintErrors = this.markerService
			.read({ resource: uri })
			.filter(l => l.severity === MarkerSeverity.Error || l.severity === MarkerSeverity.Warning)
			.slice(0, 100)
			.map(l => ({
				code: typeof l.code === 'string' ? l.code : l.code?.value || '',
				message: (l.severity === MarkerSeverity.Error ? '(error) ' : '(warning) ') + l.message,
				startLineNumber: l.startLineNumber,
				endLineNumber: l.endLineNumber,
			} satisfies LintErrorItem))

		if (!lintErrors.length) return { lintErrors: null }
		return { lintErrors, }
	}

	// Session is now managed by simple-browser extension via VS Code commands
	// No need to create session here

	private _formatBrowserError(error: any, toolName: string, params: any): Error {
		let message = '';

		const errorCode = error?.code || error?.name;

		switch (errorCode) {
			case 'ELEMENT_NOT_FOUND':
				message = `Element not found: "${params.selector || 'unknown'}". The element may not exist on the page, or the selector may be incorrect. Try using browser_get_accessibility_tree to find valid selectors.`;
				break;
			case 'ELEMENT_NOT_VISIBLE':
				message = `Element "${params.selector || 'unknown'}" exists but is not visible. It may be hidden by CSS (display:none, visibility:hidden) or off-screen. Try scrolling or waiting for it to appear.`;
				break;
			case 'ELEMENT_NOT_INTERACTABLE':
				message = `Element "${params.selector || 'unknown'}" is not interactable. It may be covered by another element, disabled, or not ready yet. Try using browser_wait_for_selector first.`;
				break;
			case 'NAVIGATION_TIMEOUT':
				message = `Navigation timed out. The page may be slow to load or unresponsive. Try increasing timeout or checking the URL.`;
				break;
			case 'NAVIGATION_FAILED':
				message = `Navigation to "${params.url || 'unknown'}" failed. Check that the URL is correct and accessible.`;
				break;
			case 'INVALID_SELECTOR':
				message = `Invalid CSS selector: "${params.selector || 'unknown'}". Make sure the selector syntax is valid CSS.`;
				break;
			case 'INVALID_URL':
				message = `Invalid URL: "${params.url || 'unknown'}". URLs must start with http:// or https://.`;
				break;
			case 'SESSION_NOT_FOUND':
				message = `Browser session not found. The browser may have been closed. Will attempt to recreate the session automatically.`;
				this._browserSessionInitialized = false; // Auto-recreate on next operation
				break;
			case 'OPERATION_TIMEOUT':
				message = `Operation timed out after ${error.details?.timeout || 30000}ms. The page may be slow or the element may not appear. Try increasing timeout with browser_wait_for_selector.`;
				break;
			case 'SCRIPT_EXECUTION_FAILED':
				message = `JavaScript execution failed: ${error.details?.message || 'Unknown error'}. Check the script syntax and ensure it doesn't reference undefined variables.`;
				break;
			default:
				message = error?.message || 'Unknown browser error';
		}

		return new Error(`Browser error in ${toolName}: ${message}`);
	}

	public dispose(): void {
		// Clean up browser session on disposal
		if (this._browserSessionInitialized) {
			this.embeddedBrowserService.destroySession(this._defaultBrowserSessionId)
				.catch(err => {
					// Session may already be destroyed, which is fine
					console.warn('Failed to cleanup browser session on dispose:', err);
				});
			this._browserSessionInitialized = false;
		}
	}

}

registerSingleton(IToolsService, ToolsService, InstantiationType.Eager);
