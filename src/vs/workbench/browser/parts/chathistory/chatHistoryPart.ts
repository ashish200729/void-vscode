/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatHistoryPart.css';
import { Part } from '../../part.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatHistoryFocusContext, ChatHistoryVisibleContext } from '../../../common/contextkeys.js';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { $, trackFocus } from '../../../../base/browser/dom.js';
import { LayoutPriority } from '../../../../base/browser/ui/splitview/splitview.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export const IChatHistoryService = createDecorator<IChatHistoryService>('chatHistoryService');

export interface IChatHistoryService {
	readonly _serviceBrand: undefined;
	focus(): void;
	setVisible(visible: boolean): void;
}

export class ChatHistoryPart extends Part implements IChatHistoryService {

	declare readonly _serviceBrand: undefined;

	static readonly ID = 'workbench.parts.chathistory';

	readonly minimumWidth: number = 200;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	readonly priority = LayoutPriority.Low;

	private chatHistoryFocusContextKey: IContextKey<boolean>;
	private chatHistoryVisibleContextKey: IContextKey<boolean>;

	private content: HTMLElement | undefined;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(Parts.CHATHISTORY_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.chatHistoryFocusContextKey = ChatHistoryFocusContext.bindTo(this.contextKeyService);
		this.chatHistoryVisibleContextKey = ChatHistoryVisibleContext.bindTo(this.contextKeyService);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		parent.classList.add('chathistory');

		// Create content container
		this.content = $('.chathistory-content');
		parent.appendChild(this.content);

		// Mount React component - but defer accessor usage
		this.instantiationService.invokeFunction(accessor => {
			// Import dynamically to avoid circular dependencies
			import('../../../contrib/void/browser/react/out/chathistory-tsx/index.js').then(module => {
				if (this.content) {
					this.instantiationService.invokeFunction(innerAccessor => {
						const disposeFn = module.mountChatHistory(this.content!, innerAccessor)?.dispose;
						this._register(toDisposable(() => disposeFn?.()));
					});
				}
			});
		});

		// Track focus
		const focusTracker = this._register(trackFocus(parent));
		this._register(focusTracker.onDidFocus(() => this.chatHistoryFocusContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.chatHistoryFocusContextKey.set(false)));

		return parent;
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();
		if (container) {
			container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || '';
			container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';

			const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
			container.style.borderRightColor = borderColor ?? '';
			container.style.borderRightStyle = borderColor ? 'solid' : 'none';
			container.style.borderRightWidth = borderColor ? '1px' : '0px';
		}
	}

	override setVisible(visible: boolean): void {
		this.chatHistoryVisibleContextKey.set(visible);
		super.setVisible(visible);
	}

	focus(): void {
		this.content?.focus();
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);

		if (this.content) {
			this.content.style.width = `${width}px`;
			this.content.style.height = `${height}px`;
		}
	}

	override toJSON(): object {
		return {
			type: Parts.CHATHISTORY_PART
		};
	}
}

registerSingleton(IChatHistoryService, ChatHistoryPart, InstantiationType.Eager);
