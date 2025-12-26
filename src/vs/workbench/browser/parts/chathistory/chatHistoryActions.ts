/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ChatHistoryVisibleContext } from '../../../common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

// Register icons for chat history toggle
const chatHistoryIcon = registerIcon('chat-history-icon', Codicon.history, localize('chatHistoryIcon', 'Icon for the chat history panel.'));
const chatHistoryOffIcon = registerIcon('chat-history-off-icon', Codicon.history, localize('chatHistoryOffIcon', 'Icon for the chat history panel (off).'));

export class ToggleChatHistoryAction extends Action2 {

	static readonly ID = 'workbench.action.toggleChatHistory';
	static readonly LABEL = localize2('toggleChatHistory', "Toggle Chat History Visibility");

	constructor() {
		super({
			id: ToggleChatHistoryAction.ID,
			title: ToggleChatHistoryAction.LABEL,
			category: Categories.View,
			f1: true,
			icon: chatHistoryIcon,
			toggled: ChatHistoryVisibleContext,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH
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
			precondition: ChatHistoryVisibleContext,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setPartHidden(true, Parts.CHATHISTORY_PART);
	}
});

// Add chat history toggle to the Layout Control Menu (titlebar)
MenuRegistry.appendMenuItem(MenuId.LayoutControlMenu, {
	group: '2_pane_toggles',
	command: {
		id: ToggleChatHistoryAction.ID,
		title: localize('toggleChatHistoryMenu', "Toggle Chat History"),
		icon: chatHistoryOffIcon,
		toggled: { condition: ChatHistoryVisibleContext, icon: chatHistoryIcon }
	},
	when: ContextKeyExpr.or(
		ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'),
		ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')
	),
	order: 3
});
