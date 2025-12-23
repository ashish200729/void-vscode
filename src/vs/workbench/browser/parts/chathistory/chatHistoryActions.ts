/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ChatHistoryVisibleContext, AgentEditorModeContext } from '../../../common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';

// Register icon for chat history toggle
const chatHistoryIcon = registerIcon('chat-history-icon', Codicon.history, localize('chatHistoryIcon', 'Icon for the chat history panel.'));

export class ToggleChatHistoryAction extends Action2 {

	static readonly ID = 'workbench.action.toggleChatHistory';
	static readonly LABEL = localize2('toggleChatHistory', "Toggle Chat History Visibility");

	constructor() {
		super({
			id: ToggleChatHistoryAction.ID,
			title: ToggleChatHistoryAction.LABEL,
			category: Categories.View,
			f1: true,
			precondition: AgentEditorModeContext.isEqualTo('agents'),
			icon: chatHistoryIcon,
			toggled: ChatHistoryVisibleContext,
			menu: [
				{
					id: MenuId.TitleBar,
					when: AgentEditorModeContext.isEqualTo('agents'),
					group: 'navigation',
					order: 0
				}
			],
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
				when: AgentEditorModeContext.isEqualTo('agents')
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setPartHidden(
			layoutService.isVisible(Parts.CHATHISTORY_PART),
			Parts.CHATHISTORY_PART
		);
	}
}

registerAction2(ToggleChatHistoryAction);

registerAction2(class FocusChatHistoryAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.focusChatHistory',
			title: localize2('focusChatHistory', "Focus into Chat History"),
			category: Categories.View,
			f1: true,
			precondition: AgentEditorModeContext.isEqualTo('agents'),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);

		if (!layoutService.isVisible(Parts.CHATHISTORY_PART)) {
			layoutService.setPartHidden(false, Parts.CHATHISTORY_PART);
		}

		layoutService.focusPart(Parts.CHATHISTORY_PART);
	}
});

registerAction2(class CloseChatHistoryAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.closeChatHistory',
			title: localize2('closeChatHistory', "Hide Chat History"),
			category: Categories.View,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatHistoryVisibleContext,
				AgentEditorModeContext.isEqualTo('agents')
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setPartHidden(true, Parts.CHATHISTORY_PART);
	}
});
