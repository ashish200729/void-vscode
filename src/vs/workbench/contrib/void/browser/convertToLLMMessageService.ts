import { Disposable } from '../../../../base/common/lifecycle.js';
import { deepClone } from '../../../../base/common/objects.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChatMessage } from '../common/chatThreadServiceTypes.js';
import { getIsReasoningEnabledState, getReservedOutputTokenSpace, getModelCapabilities } from '../common/modelCapabilities.js';
import { reParsedToolXMLString, chat_systemMessage } from '../common/prompt/prompts.js';
import { AnthropicLLMChatMessage, AnthropicReasoning, GeminiLLMChatMessage, LLMChatMessage, LLMFIMMessage, OpenAILLMChatMessage, RawToolParamsObj } from '../common/sendLLMMessageTypes.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { ChatMode, FeatureName, ModelSelection, ProviderName } from '../common/voidSettingsTypes.js';
import { IDirectoryStrService } from '../common/directoryStrService.js';
import { ITerminalToolService } from './terminalToolService.js';
import { IVoidModelService } from '../common/voidModelService.js';
import { URI } from '../../../../base/common/uri.js';
import { EndOfLinePreference } from '../../../../editor/common/model.js';
import { ToolName } from '../common/toolsServiceTypes.js';
import { IMCPService } from '../common/mcpService.js';

export const EMPTY_MESSAGE = '(empty message)'



type SimpleLLMMessage = {
	role: 'tool';
	content: string;
	id: string;
	name: ToolName;
	rawParams: RawToolParamsObj;
} | {
	role: 'user';
	content: string;
	images?: string[]; // Array of image URLs (data URIs or URLs)
} | {
	role: 'assistant';
	content: string;
	anthropicReasoning: AnthropicReasoning[] | null;
}



const CHARS_PER_TOKEN = 4 // assume abysmal chars per token
const TRIM_TO_LEN = 120

// Supported image MIME types for Anthropic API
type AnthropicImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

// Helper functions to parse data URIs and extract base64 data
const parseDataURI = (dataUri: string): { mimeType: AnthropicImageMimeType; data: string } | null => {
	// Format: data:image/jpeg;base64,/9j/4AAQSkZJRg...
	const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
	if (!match) {
		// If it's not a data URI, treat it as a regular URL
		return null
	}

	// Map MIME type to Anthropic-supported types
	const rawMimeType = match[1].toLowerCase()
	let mimeType: AnthropicImageMimeType = 'image/jpeg' // default

	// Map common MIME types to Anthropic-supported types
	if (rawMimeType === 'image/png') mimeType = 'image/png'
	else if (rawMimeType === 'image/jpeg' || rawMimeType === 'image/jpg') mimeType = 'image/jpeg'
	else if (rawMimeType === 'image/gif') mimeType = 'image/gif'
	else if (rawMimeType === 'image/webp') mimeType = 'image/webp'
	// If unsupported, default to jpeg (will be converted if needed)

	return {
		mimeType,
		data: match[2]
	}
}





// convert messages as if about to send to openai
/*
reference - https://platform.openai.com/docs/guides/function-calling#function-calling-steps
openai MESSAGE (role=assistant):
"tool_calls":[{
	"type": "function",
	"id": "call_12345xyz",
	"function": {
	"name": "get_weather",
	"arguments": "{\"latitude\":48.8566,\"longitude\":2.3522}"
}]

openai RESPONSE (role=user):
{   "role": "tool",
	"tool_call_id": tool_call.id,
	"content": str(result)    }

also see
openai on prompting - https://platform.openai.com/docs/guides/reasoning#advice-on-prompting
openai on developer system message - https://cdn.openai.com/spec/model-spec-2024-05-08.html#follow-the-chain-of-command
*/


const prepareMessages_openai_tools = (messages: SimpleLLMMessage[]): AnthropicOrOpenAILLMMessage[] => {

	const newMessages: OpenAILLMChatMessage[] = [];

	for (let i = 0; i < messages.length; i += 1) {
		const currMsg = messages[i]

		if (currMsg.role === 'user') {
			// If user message has images, format as array with text and image_url
			if (currMsg.images && currMsg.images.length > 0) {
				const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

				// Add text content - always add text entry when images are present (even if empty)
				// This ensures OpenAI receives a valid content array format
				const textContent = currMsg.content || '';
				content.push({ type: 'text', text: textContent });

				// Add all images
				for (const imageUrl of currMsg.images) {
					content.push({ type: 'image_url', image_url: { url: imageUrl } });
				}

				newMessages.push({
					role: 'user',
					content: content,
				});
			} else {
				// No images, use string content format
				newMessages.push(currMsg as OpenAILLMChatMessage);
			}
			continue
		}

		if (currMsg.role !== 'tool') {
			newMessages.push(currMsg as OpenAILLMChatMessage)
			continue
		}

		// 🚀 FIX: Collect ALL consecutive tool messages FIRST, then add all tool_calls to assistant, then all tool responses
		// This ensures proper ordering and consistency across all providers

		// Collect all consecutive tool messages (with proper type narrowing)
		type ToolMessage = Extract<SimpleLLMMessage, { role: 'tool' }>
		const toolMessages: ToolMessage[] = [];
		let j = i;
		while (j < messages.length && messages[j].role === 'tool') {
			const toolMsg = messages[j];
			if (toolMsg.role === 'tool') { // Type guard
				if (toolMsg.id !== 'dummy') {
					toolMessages.push(toolMsg);
				}
			}
			j++;
		}

		// Get the last added message (which should be the assistant message)
		const prevMsg = newMessages.length > 0 ? newMessages[newMessages.length - 1] : undefined

		// Add ALL tool_calls to the assistant message
		if (prevMsg?.role === 'assistant') {
			// Initialize tool_calls array if not present
			if (!prevMsg.tool_calls) {
				prevMsg.tool_calls = [];
			}
			// Add all tool_calls
			for (const toolMsg of toolMessages) {
				prevMsg.tool_calls.push({
					type: 'function',
					id: toolMsg.id,
					function: {
						name: toolMsg.name,
						arguments: JSON.stringify(toolMsg.rawParams)
					}
				});
			}
		}

		// Add all tool response messages
		for (const toolMsg of toolMessages) {
			newMessages.push({
				role: 'tool',
				tool_call_id: toolMsg.id,
				content: toolMsg.content,
			})
		}

		// Skip ahead past the tools we just processed
		i = j - 1; // -1 because the loop will increment i
		continue
	}
	return newMessages

}



// convert messages as if about to send to anthropic
/*
https://docs.anthropic.com/en/docs/build-with-claude/tool-use#tool-use-examples
anthropic MESSAGE (role=assistant):
"content": [{
	"type": "text",
	"text": "<thinking>I need to call the get_weather function, and the user wants SF, which is likely San Francisco, CA.</thinking>"
}, {
	"type": "tool_use",
	"id": "toolu_01A09q90qw90lq917835lq9",
	"name": "get_weather",
	"input": { "location": "San Francisco, CA", "unit": "celsius" }
}]
anthropic RESPONSE (role=user):
"content": [{
	"type": "tool_result",
	"tool_use_id": "toolu_01A09q90qw90lq917835lq9",
	"content": "15 degrees"
}]


Converts:
assistant: ...content
tool: (id, name, params)
->
assistant: ...content, call(name, id, params)
user: ...content, result(id, content)
*/

type AnthropicOrOpenAILLMMessage = AnthropicLLMChatMessage | OpenAILLMChatMessage

const prepareMessages_anthropic_tools = (messages: SimpleLLMMessage[], supportsAnthropicReasoning: boolean): AnthropicOrOpenAILLMMessage[] => {
	const newMessages: AnthropicLLMChatMessage[] = [];

	for (let i = 0; i < messages.length; i += 1) {
		const currMsg = messages[i]

		// add anthropic reasoning
		if (currMsg.role === 'assistant') {
			if (currMsg.anthropicReasoning && supportsAnthropicReasoning) {
				const content = currMsg.content
				newMessages.push({
					role: 'assistant',
					content: content ? [...currMsg.anthropicReasoning, { type: 'text' as const, text: content }] : currMsg.anthropicReasoning
				})
			}
			else {
				newMessages.push({
					role: 'assistant',
					content: currMsg.content,
					// strip away anthropicReasoning
				})
			}
			continue
		}

		if (currMsg.role === 'user') {
			// If user message has images, format as array with text and image
			if (currMsg.images && currMsg.images.length > 0) {
				const content: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: AnthropicImageMimeType; data: string } }> = [];

				// Add text content if it exists
				if (currMsg.content) {
					content.push({ type: 'text', text: currMsg.content });
				}

				// Add all images in Anthropic format: { type: 'image', source: { type: 'base64', media_type: string, data: string } }
				for (const imageUrl of currMsg.images) {
					const parsed = parseDataURI(imageUrl)
					if (parsed) {
						content.push({
							type: 'image',
							source: {
								type: 'base64',
								media_type: parsed.mimeType,
								data: parsed.data
							}
						});
					} else {
						// If it's a URL, convert to base64 if possible, or skip
						// For now, we'll skip URLs that aren't data URIs for Anthropic
						console.warn('Anthropic API requires base64-encoded images. URL images are not supported.')
					}
				}

				newMessages.push({
					role: 'user',
					content: content,
				});
			} else {
				// No images, use string or array format
				newMessages.push({
					role: 'user',
					content: currMsg.content,
				})
			}
			continue
		}

		if (currMsg.role === 'tool') {
			// 🚀 FIX: Collect ALL consecutive tool messages FIRST, then add all tool_use blocks to assistant, then all tool_results to user
			// This ensures every tool_result has a corresponding tool_use in the previous assistant message

			// Collect all consecutive tool messages (with proper type narrowing)
			type ToolMessage = Extract<SimpleLLMMessage, { role: 'tool' }>
			const toolMessages: ToolMessage[] = [];
			let j = i;
			while (j < messages.length && messages[j].role === 'tool') {
				const toolMsg = messages[j];
				if (toolMsg.role === 'tool') { // Type guard
					if (toolMsg.id !== 'dummy') {
						toolMessages.push(toolMsg);
					}
				}
				j++;
			}

			// Get the last added message (which should be the assistant message)
			const prevMsg = newMessages.length > 0 ? newMessages[newMessages.length - 1] : undefined

			// Add ALL tool_use blocks to the assistant message
			if (prevMsg?.role === 'assistant') {
				if (typeof prevMsg.content === 'string') prevMsg.content = [{ type: 'text', text: prevMsg.content }]

				// Add all tool_use blocks
				for (const toolMsg of toolMessages) {
					prevMsg.content.push({
						type: 'tool_use',
						id: toolMsg.id,
						name: toolMsg.name,
						input: toolMsg.rawParams
					})
				}
			}

			// Collect all tool results corresponding to the tool_use blocks we just added
			const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
			for (const toolMsg of toolMessages) {
				toolResults.push({
					type: 'tool_result',
					tool_use_id: toolMsg.id,
					content: toolMsg.content
				});
			}

			// Add ONE user message with all tool results
			newMessages.push({
				role: 'user',
				content: toolResults
			});

			// Skip ahead past the tools we just processed
			i = j - 1; // -1 because the loop will increment i
			continue
		}

	}

	// All tool messages have been converted to user messages
	return newMessages
}


const prepareMessages_XML_tools = (messages: SimpleLLMMessage[], supportsAnthropicReasoning: boolean): AnthropicOrOpenAILLMMessage[] => {

	const llmChatMessages: AnthropicOrOpenAILLMMessage[] = [];
	for (let i = 0; i < messages.length; i += 1) {

		const c = messages[i]

		if (c.role === 'assistant') {
			// if called tool(s) (message(s) after it), re-add their XML to the message
			// Support multiple consecutive tool calls (parallel execution)
			let content: AnthropicOrOpenAILLMMessage['content'] = c.content

			// Collect all consecutive tool calls after this assistant message
			const toolXMLs: string[] = [];
			let j = i + 1;
			while (j < messages.length && messages[j].role === 'tool') {
				const toolMsg = messages[j];
				if (toolMsg.role === 'tool') { // Type guard
					if (toolMsg.id !== 'dummy') {
						toolXMLs.push(reParsedToolXMLString(toolMsg.name, toolMsg.rawParams));
					}
				}
				j++;
			}

			if (toolXMLs.length > 0) {
				content = `${content}\n\n${toolXMLs.join('\n')}`;
			}

			// anthropic reasoning
			if (c.anthropicReasoning && supportsAnthropicReasoning) {
				content = content ? [...c.anthropicReasoning, { type: 'text' as const, text: content }] : c.anthropicReasoning
			}
			llmChatMessages.push({
				role: 'assistant',
				content
			})
		}
		// add user or tool to the previous user message
		else if (c.role === 'user' || c.role === 'tool') {
			if (c.role === 'tool' && c.id === 'dummy') {
				continue
			}
			if (c.role === 'tool')
				c.content = `<${c.name}_result>\n${c.content}\n</${c.name}_result>`

			// Handle user messages with images - XML format doesn't support native images, so we'll encode them
			// For providers using XML format, images might not be supported, but we'll format them appropriately
			if (c.role === 'user' && c.images && c.images.length > 0) {
				// For XML format, we can't easily embed images in the message structure
				// This would require provider-specific handling
				// For now, we'll create an array content format similar to Anthropic if possible
				const content: Array<{ type: 'text'; text: string } | { type: 'tool_result'; tool_use_id: string; content: string } | { type: 'image'; source: { type: 'base64'; media_type: AnthropicImageMimeType; data: string } }> = [];

				if (c.content) {
					content.push({ type: 'text', text: c.content });
				}

				// Add images in Anthropic-compatible format (works for providers that support arrays)
				for (const imageUrl of c.images) {
					const parsed = parseDataURI(imageUrl)
					if (parsed) {
						content.push({
							type: 'image',
							source: {
								type: 'base64',
								media_type: parsed.mimeType,
								data: parsed.data
							}
						});
					}
				}

				const userMessageWithImages: AnthropicLLMChatMessage = {
					role: 'user',
					content: content as Extract<AnthropicLLMChatMessage, { role: 'user' }>['content']
				}

				if (llmChatMessages.length === 0 || llmChatMessages[llmChatMessages.length - 1].role !== 'user') {
					llmChatMessages.push(userMessageWithImages)
				} else {
					// If previous message is user with array content, merge
					const prevMsg = llmChatMessages[llmChatMessages.length - 1]
					if (prevMsg.role === 'user') {
						// Only merge if both are user messages
						// Convert to proper user content type
						if (Array.isArray(prevMsg.content)) {
							// Check if it's already user content (not assistant content)
							const isUserContent = prevMsg.content.every(c =>
								c.type === 'text' ||
								c.type === 'tool_result' ||
								c.type === 'image'
							)
							if (isUserContent) {
								// Merge arrays - both are user content
								const userContent = prevMsg.content as Extract<AnthropicLLMChatMessage, { role: 'user' }>['content']
								prevMsg.content = [...userContent, ...content] as Extract<AnthropicLLMChatMessage, { role: 'user' }>['content']
							} else {
								// Previous content is assistant content, don't merge
								llmChatMessages.push(userMessageWithImages)
							}
						} else if (typeof prevMsg.content === 'string') {
							// Convert string to array and merge
							prevMsg.content = [{ type: 'text', text: prevMsg.content }, ...content] as Extract<AnthropicLLMChatMessage, { role: 'user' }>['content']
						}
					} else {
						llmChatMessages.push(userMessageWithImages)
					}
				}
			} else {
				// No images, use string format
				if (llmChatMessages.length === 0 || llmChatMessages[llmChatMessages.length - 1].role !== 'user')
					llmChatMessages.push({
						role: 'user',
						content: c.content
					})
				else
					llmChatMessages[llmChatMessages.length - 1].content += '\n\n' + c.content
			}
		}
	}
	return llmChatMessages
}


// --- CHAT ---

const prepareOpenAIOrAnthropicMessages = ({
	messages: messages_,
	systemMessage,
	aiInstructions,
	supportsSystemMessage,
	specialToolFormat,
	supportsAnthropicReasoning,
	contextWindow,
	reservedOutputTokenSpace,
}: {
	messages: SimpleLLMMessage[],
	systemMessage: string,
	aiInstructions: string,
	supportsSystemMessage: false | 'system-role' | 'developer-role' | 'separated',
	specialToolFormat: 'openai-style' | 'anthropic-style' | undefined,
	supportsAnthropicReasoning: boolean,
	contextWindow: number,
	reservedOutputTokenSpace: number | null | undefined,
}): { messages: AnthropicOrOpenAILLMMessage[], separateSystemMessage: string | undefined } => {

	reservedOutputTokenSpace = Math.max(
		contextWindow * 1 / 2, // reserve at least 1/4 of the token window length
		reservedOutputTokenSpace ?? 4_096 // defaults to 4096
	)
	let messages: (SimpleLLMMessage | { role: 'system', content: string })[] = deepClone(messages_)

	// ================ system message ================
	// A COMPLETE HACK: last message is system message for context purposes

	const sysMsgParts: string[] = []
	if (aiInstructions) sysMsgParts.push(`GUIDELINES (from the user's .voidrules file):\n${aiInstructions}`)
	if (systemMessage) sysMsgParts.push(systemMessage)
	const combinedSystemMessage = sysMsgParts.join('\n\n')

	messages.unshift({ role: 'system', content: combinedSystemMessage })

	// ================ trim ================
	messages = messages.map(m => ({ ...m, content: m.role !== 'tool' ? m.content.trim() : m.content }))

	type MesType = (typeof messages)[0]

	// ================ fit into context ================

	// the higher the weight, the higher the desire to truncate - TRIM HIGHEST WEIGHT MESSAGES
	const alreadyTrimmedIdxes = new Set<number>()
	const weight = (message: MesType, messages: MesType[], idx: number) => {
		const base = message.content.length

		let multiplier: number
		multiplier = 1 + (messages.length - 1 - idx) / messages.length // slow rampdown from 2 to 1 as index increases
		if (message.role === 'user') {
			multiplier *= 1
		}
		else if (message.role === 'system') {
			multiplier *= .01 // very low weight
		}
		else {
			multiplier *= 10 // llm tokens are far less valuable than user tokens
		}

		// any already modified message should not be trimmed again
		if (alreadyTrimmedIdxes.has(idx)) {
			multiplier = 0
		}
		// 1st and last messages should be very low weight
		if (idx <= 1 || idx >= messages.length - 1 - 3) {
			multiplier *= .05
		}
		return base * multiplier
	}

	const _findLargestByWeight = (messages_: MesType[]) => {
		let largestIndex = -1
		let largestWeight = -Infinity
		for (let i = 0; i < messages.length; i += 1) {
			const m = messages[i]
			const w = weight(m, messages_, i)
			if (w > largestWeight) {
				largestWeight = w
				largestIndex = i
			}
		}
		return largestIndex
	}

	let totalLen = 0
	for (const m of messages) { totalLen += m.content.length }
	const charsNeedToTrim = totalLen - Math.max(
		(contextWindow - reservedOutputTokenSpace) * CHARS_PER_TOKEN, // can be 0, in which case charsNeedToTrim=everything, bad
		5_000 // ensure we don't trim at least 5k chars (just a random small value)
	)


	// <----------------------------------------->
	// 0                      |    |             |
	//                        |    contextWindow |
	//                     contextWindow - maxOut|putTokens
	//                                          totalLen
	let remainingCharsToTrim = charsNeedToTrim
	let i = 0

	while (remainingCharsToTrim > 0) {
		i += 1
		if (i > 100) break

		const trimIdx = _findLargestByWeight(messages)
		const m = messages[trimIdx]

		// if can finish here, do
		const numCharsWillTrim = m.content.length - TRIM_TO_LEN
		if (numCharsWillTrim > remainingCharsToTrim) {
			// trim remainingCharsToTrim + '...'.length chars
			m.content = m.content.slice(0, m.content.length - remainingCharsToTrim - '...'.length).trim() + '...'
			break
		}

		remainingCharsToTrim -= numCharsWillTrim
		m.content = m.content.substring(0, TRIM_TO_LEN - '...'.length) + '...'
		alreadyTrimmedIdxes.add(trimIdx)
	}

	// ================ system message hack ================
	const newSysMsg = messages.shift()!.content


	// ================ tools and anthropicReasoning ================
	// SYSTEM MESSAGE HACK: we shifted (removed) the system message role, so now SimpleLLMMessage[] is valid

	let llmChatMessages: AnthropicOrOpenAILLMMessage[] = []
	if (!specialToolFormat) { // XML tool behavior
		llmChatMessages = prepareMessages_XML_tools(messages as SimpleLLMMessage[], supportsAnthropicReasoning)
	}
	else if (specialToolFormat === 'anthropic-style') {
		llmChatMessages = prepareMessages_anthropic_tools(messages as SimpleLLMMessage[], supportsAnthropicReasoning)
	}
	else if (specialToolFormat === 'openai-style') {
		llmChatMessages = prepareMessages_openai_tools(messages as SimpleLLMMessage[])
	}
	const llmMessages = llmChatMessages


	// ================ system message add as first llmMessage ================

	let separateSystemMessageStr: string | undefined = undefined

	// if supports system message
	if (supportsSystemMessage) {
		if (supportsSystemMessage === 'separated')
			separateSystemMessageStr = newSysMsg
		else if (supportsSystemMessage === 'system-role')
			llmMessages.unshift({ role: 'system', content: newSysMsg }) // add new first message
		else if (supportsSystemMessage === 'developer-role')
			llmMessages.unshift({ role: 'developer', content: newSysMsg }) // add new first message
	}
	// if does not support system message
	else {
		const newFirstMessage = {
			role: 'user',
			content: `<SYSTEM_MESSAGE>\n${newSysMsg}\n</SYSTEM_MESSAGE>\n${llmMessages[0].content}`
		} as const
		llmMessages.splice(0, 1) // delete first message
		llmMessages.unshift(newFirstMessage) // add new first message
	}


	// ================ no empty message ================
	for (let i = 0; i < llmMessages.length; i += 1) {
		const currMsg: AnthropicOrOpenAILLMMessage = llmMessages[i]
		const nextMsg: AnthropicOrOpenAILLMMessage | undefined = llmMessages[i + 1]

		if (currMsg.role === 'tool') continue

		// if content is a string, replace string with empty msg
		if (typeof currMsg.content === 'string') {
			currMsg.content = currMsg.content || EMPTY_MESSAGE
		}
		else {
			// allowed to be empty if has a tool in it or following it
			if (currMsg.content.find(c => c.type === 'tool_result' || c.type === 'tool_use')) {
				currMsg.content = currMsg.content.filter(c => !(c.type === 'text' && !c.text)) as any
				continue
			}
			if (nextMsg?.role === 'tool') continue

			// Check if message has images - if so, don't require text
			// Support both Anthropic format ('image') and OpenAI format ('image_url')
			const hasImages = currMsg.content.some(c => c.type === 'image' || c.type === 'image_url')

			// replace any empty text entries with empty msg, and make sure there's at least 1 entry
			// For messages with images, allow empty text strings (OpenAI supports this)
			for (const c of currMsg.content) {
				if (c.type === 'text') {
					// If message has images, keep empty strings as-is (OpenAI allows empty text with images)
					// Otherwise, replace empty strings with EMPTY_MESSAGE
					if (!hasImages) {
						c.text = c.text || EMPTY_MESSAGE
					}
				}
			}
			// If no content and no images, add empty message
			if (currMsg.content.length === 0 && !hasImages) {
				currMsg.content = [{ type: 'text', text: EMPTY_MESSAGE }]
			}
			// If has images but no text, add empty text entry (required by some providers)
			// Note: OpenAI allows image-only messages, but some providers may require at least empty text
			// However, prepareMessages_openai_tools already adds text when images are present, so this is mainly for other formats
			if (hasImages && !currMsg.content.some(c => c.type === 'text')) {
				currMsg.content.unshift({ type: 'text', text: '' })
			}
		}
	}

	return {
		messages: llmMessages,
		separateSystemMessage: separateSystemMessageStr,
	} as const
}




type GeminiUserPart = (GeminiLLMChatMessage & { role: 'user' })['parts'][0]
type GeminiModelPart = (GeminiLLMChatMessage & { role: 'model' })['parts'][0]
const prepareGeminiMessages = (messages: AnthropicLLMChatMessage[]) => {
	let latestToolName: ToolName | undefined = undefined
	const messages2: GeminiLLMChatMessage[] = messages.map((m): GeminiLLMChatMessage | null => {
		if (m.role === 'assistant') {
			if (typeof m.content === 'string') {
				return { role: 'model', parts: [{ text: m.content }] }
			}
			else {
				const parts: GeminiModelPart[] = m.content.map((c): GeminiModelPart | null => {
					if (c.type === 'text') {
						return { text: c.text }
					}
					else if (c.type === 'tool_use') {
						latestToolName = c.name
						return { functionCall: { id: c.id, name: c.name, args: c.input } }
					}
					else return null
				}).filter(m => !!m)
				return { role: 'model', parts, }
			}
		}
		else if (m.role === 'user') {
			if (typeof m.content === 'string') {
				return { role: 'user', parts: [{ text: m.content }] } satisfies GeminiLLMChatMessage
			}
			else {
				const parts: GeminiUserPart[] = m.content.map((c): GeminiUserPart | null => {
					if (c.type === 'text') {
						return { text: c.text }
					}
					else if (c.type === 'tool_result') {
						if (!latestToolName) return null
						return { functionResponse: { id: c.tool_use_id, name: latestToolName, response: { output: c.content } } }
					}
					else if (c.type === 'image') {
						// Convert Anthropic image format to Gemini inlineData format
						// Anthropic: { type: 'image', source: { type: 'base64', media_type: string, data: string } }
						// Gemini: { inlineData: { mimeType: string, data: string } }
						return {
							inlineData: {
								mimeType: c.source.media_type,
								data: c.source.data
							}
						}
					}
					else return null
				}).filter(m => !!m)
				return { role: 'user', parts, }
			}

		}
		else return null
	}).filter(m => !!m)

	return messages2
}


const prepareMessages = (params: {
	messages: SimpleLLMMessage[],
	systemMessage: string,
	aiInstructions: string,
	supportsSystemMessage: false | 'system-role' | 'developer-role' | 'separated',
	specialToolFormat: 'openai-style' | 'anthropic-style' | 'gemini-style' | undefined,
	supportsAnthropicReasoning: boolean,
	contextWindow: number,
	reservedOutputTokenSpace: number | null | undefined,
	providerName: ProviderName
}): { messages: LLMChatMessage[], separateSystemMessage: string | undefined } => {

	let specialFormat = params.specialToolFormat // this is just for ts stupidness

	// For OpenAI-compatible providers, default to 'openai-style' when specialToolFormat is undefined
	// This ensures images and other features work correctly with OpenAI-compatible APIs
	const openAICompatibleProviders: ProviderName[] = [
		'openAI', 'openRouter', 'openAICompatible', 'deepseek', 'groq', 'xAI', 'mistral',
		'ollama', 'vLLM', 'lmStudio', 'liteLLM'
	]
	if (!specialFormat && openAICompatibleProviders.includes(params.providerName)) {
		specialFormat = 'openai-style'
	}

	// if need to convert to gemini style of messaes, do that (treat as anthropic style, then convert to gemini style)
	if (params.providerName === 'gemini' || specialFormat === 'gemini-style') {
		const res = prepareOpenAIOrAnthropicMessages({ ...params, specialToolFormat: specialFormat === 'gemini-style' ? 'anthropic-style' : undefined })
		const messages = res.messages as AnthropicLLMChatMessage[]
		const messages2 = prepareGeminiMessages(messages)
		return { messages: messages2, separateSystemMessage: res.separateSystemMessage }
	}

	return prepareOpenAIOrAnthropicMessages({ ...params, specialToolFormat: specialFormat })
}




export interface IConvertToLLMMessageService {
	readonly _serviceBrand: undefined;
	prepareLLMSimpleMessages: (opts: { simpleMessages: SimpleLLMMessage[], systemMessage: string, modelSelection: ModelSelection | null, featureName: FeatureName }) => { messages: LLMChatMessage[], separateSystemMessage: string | undefined }
	prepareLLMChatMessages: (opts: { chatMessages: ChatMessage[], chatMode: ChatMode, modelSelection: ModelSelection | null }) => Promise<{ messages: LLMChatMessage[], separateSystemMessage: string | undefined }>
	prepareFIMMessage(opts: { messages: LLMFIMMessage, }): { prefix: string, suffix: string, stopTokens: string[] }
}

export const IConvertToLLMMessageService = createDecorator<IConvertToLLMMessageService>('ConvertToLLMMessageService');


class ConvertToLLMMessageService extends Disposable implements IConvertToLLMMessageService {
	_serviceBrand: undefined;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IDirectoryStrService private readonly directoryStrService: IDirectoryStrService,
		@ITerminalToolService private readonly terminalToolService: ITerminalToolService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IVoidModelService private readonly voidModelService: IVoidModelService,
		@IMCPService private readonly mcpService: IMCPService,
	) {
		super()
	}

	// Read .voidrules files from workspace folders
	private _getVoidRulesFileContents(): string {
		try {
			const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
			let voidRules = '';
			for (const folder of workspaceFolders) {
				const uri = URI.joinPath(folder.uri, '.voidrules')
				const { model } = this.voidModelService.getModel(uri)
				if (!model) continue
				voidRules += model.getValue(EndOfLinePreference.LF) + '\n\n';
			}
			return voidRules.trim();
		}
		catch (e) {
			return ''
		}
	}

	// Get combined AI instructions from settings and .voidrules files
	private _getCombinedAIInstructions(): string {
		const globalAIInstructions = this.voidSettingsService.state.globalSettings.aiInstructions;
		const voidRulesFileContent = this._getVoidRulesFileContents();

		const ans: string[] = []
		if (globalAIInstructions) ans.push(globalAIInstructions)
		if (voidRulesFileContent) ans.push(voidRulesFileContent)
		return ans.join('\n\n')
	}


	// system message
	private _generateChatMessagesSystemMessage = async (chatMode: ChatMode, specialToolFormat: 'openai-style' | 'anthropic-style' | 'gemini-style' | undefined) => {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders.map(f => f.uri.fsPath)

		const openedURIs = this.modelService.getModels().filter(m => m.isAttachedToEditor()).map(m => m.uri.fsPath) || [];
		const activeURI = this.editorService.activeEditor?.resource?.fsPath;

		const directoryStr = await this.directoryStrService.getAllDirectoriesStr({
			cutOffMessage: chatMode === 'agent' || chatMode === 'gather' ?
				`...Directories string cut off, use tools to read more...`
				: `...Directories string cut off, ask user for more if necessary...`
		})

		const includeXMLToolDefinitions = !specialToolFormat

		const mcpTools = this.mcpService.getMCPTools()

		const persistentTerminalIDs = this.terminalToolService.listPersistentTerminalIds()
		const systemMessage = chat_systemMessage({ workspaceFolders, openedURIs, directoryStr, activeURI, persistentTerminalIDs, chatMode, mcpTools, includeXMLToolDefinitions })

		// Debug logging (can be disabled in production)
		// console.log('=== SYSTEM MESSAGE (first 3000 chars) ===\n', systemMessage.substring(0, 3000))
		// console.log('=== SYSTEM MESSAGE (last 1000 chars) ===\n', systemMessage.substring(systemMessage.length - 1000))
		// console.log('=== includeXMLToolDefinitions ===', includeXMLToolDefinitions)
		// console.log('=== chatMode ===', chatMode)

		return systemMessage
	}




	// --- LLM Chat messages ---

	private _chatMessagesToSimpleMessages(chatMessages: ChatMessage[]): SimpleLLMMessage[] {
		const simpleLLMMessages: SimpleLLMMessage[] = []

		for (const m of chatMessages) {
			if (m.role === 'checkpoint') continue
			if (m.role === 'interrupted_streaming_tool') continue
			if (m.role === 'assistant') {
				simpleLLMMessages.push({
					role: m.role,
					content: m.displayContent,
					anthropicReasoning: m.anthropicReasoning,
				})
			}
			else if (m.role === 'tool') {
				simpleLLMMessages.push({
					role: m.role,
					content: m.content,
					name: m.name,
					id: m.id,
					rawParams: m.rawParams,
				})
			}
			else if (m.role === 'user') {
				simpleLLMMessages.push({
					role: m.role,
					content: m.content,
					images: m.images,
				})
			}
		}
		return simpleLLMMessages
	}

	prepareLLMSimpleMessages: IConvertToLLMMessageService['prepareLLMSimpleMessages'] = ({ simpleMessages, systemMessage, modelSelection, featureName }) => {
		if (modelSelection === null) return { messages: [], separateSystemMessage: undefined }

		const { overridesOfModel } = this.voidSettingsService.state

		const { providerName, modelName } = modelSelection
		const {
			specialToolFormat,
			contextWindow,
			supportsSystemMessage,
		} = getModelCapabilities(providerName, modelName, overridesOfModel)

		const modelSelectionOptions = this.voidSettingsService.state.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName]

		// Get combined AI instructions
		const aiInstructions = this._getCombinedAIInstructions();

		const isReasoningEnabled = getIsReasoningEnabledState(featureName, providerName, modelName, modelSelectionOptions, overridesOfModel)
		const reservedOutputTokenSpace = getReservedOutputTokenSpace(providerName, modelName, { isReasoningEnabled, overridesOfModel })

		const { messages, separateSystemMessage } = prepareMessages({
			messages: simpleMessages,
			systemMessage,
			aiInstructions,
			supportsSystemMessage,
			specialToolFormat,
			supportsAnthropicReasoning: providerName === 'anthropic',
			contextWindow,
			reservedOutputTokenSpace,
			providerName,
		})
		return { messages, separateSystemMessage };
	}
	prepareLLMChatMessages: IConvertToLLMMessageService['prepareLLMChatMessages'] = async ({ chatMessages, chatMode, modelSelection }) => {
		if (modelSelection === null) return { messages: [], separateSystemMessage: undefined }

		const { overridesOfModel } = this.voidSettingsService.state

		const { providerName, modelName } = modelSelection
		const {
			specialToolFormat,
			contextWindow,
			supportsSystemMessage,
		} = getModelCapabilities(providerName, modelName, overridesOfModel)

		const { disableSystemMessage } = this.voidSettingsService.state.globalSettings;
		const fullSystemMessage = await this._generateChatMessagesSystemMessage(chatMode, specialToolFormat)
		const systemMessage = disableSystemMessage ? '' : fullSystemMessage;

		const modelSelectionOptions = this.voidSettingsService.state.optionsOfModelSelection['Chat'][modelSelection.providerName]?.[modelSelection.modelName]

		// Get combined AI instructions
		const aiInstructions = this._getCombinedAIInstructions();
		const isReasoningEnabled = getIsReasoningEnabledState('Chat', providerName, modelName, modelSelectionOptions, overridesOfModel)
		const reservedOutputTokenSpace = getReservedOutputTokenSpace(providerName, modelName, { isReasoningEnabled, overridesOfModel })
		const llmMessages = this._chatMessagesToSimpleMessages(chatMessages)

		const { messages, separateSystemMessage } = prepareMessages({
			messages: llmMessages,
			systemMessage,
			aiInstructions,
			supportsSystemMessage,
			specialToolFormat,
			supportsAnthropicReasoning: providerName === 'anthropic',
			contextWindow,
			reservedOutputTokenSpace,
			providerName,
		})
		return { messages, separateSystemMessage };
	}


	// --- FIM ---

	prepareFIMMessage: IConvertToLLMMessageService['prepareFIMMessage'] = ({ messages }) => {
		// Get combined AI instructions with the provided aiInstructions as the base
		const combinedInstructions = this._getCombinedAIInstructions();

		let prefix = `\
${!combinedInstructions ? '' : `\
// Instructions:
// Do not output an explanation. Try to avoid outputting comments. Only output the middle code.
${combinedInstructions.split('\n').map(line => `//${line}`).join('\n')}`}

${messages.prefix}`

		const suffix = messages.suffix
		const stopTokens = messages.stopTokens
		return { prefix, suffix, stopTokens }
	}


}


registerSingleton(IConvertToLLMMessageService, ConvertToLLMMessageService, InstantiationType.Eager);








/*
Gemini has this, but they're openai-compat so we don't need to implement this
gemini request:
{   "role": "assistant",
	"content": null,
	"function_call": {
		"name": "get_weather",
		"arguments": {
			"latitude": 48.8566,
			"longitude": 2.3522
		}
	}
}

gemini response:
{   "role": "assistant",
	"function_response": {
		"name": "get_weather",
			"response": {
			"temperature": "15°C",
				"condition": "Cloudy"
		}
	}
}
*/



