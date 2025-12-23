# Chat History Sidebar Implementation

## Overview
This document describes the implementation of the **Chat History Sidebar** - a new workbench Part that displays chat conversation history in the Void IDE. The sidebar is only visible in **Agent Mode** and appears as the leftmost panel.

---

## Architecture

### Part Structure
The Chat History sidebar follows VS Code's Part architecture pattern:
- Extends the `Part` base class
- Implements `ISerializableView` interface for grid layout integration
- Uses React for UI rendering
- Registered as a singleton service

### Layout Position
**Agent Mode** (sidebar on right):
```
ChatHistory → Void Chat (AuxiliaryBar) → Editor → Sidebar (File Tree) → ActivityBar
```

**Editor Mode** (sidebar on left):
```
ActivityBar → Sidebar → Editor (ChatHistory hidden)
```

---

## Files Modified

### 1. Layout Service Definition
**File**: `src/vs/workbench/services/layout/browser/layoutService.ts`

**Changes**: Added `CHATHISTORY_PART` to the Parts enum

```typescript
export const enum Parts {
    TITLEBAR_PART = 'workbench.parts.titlebar',
    BANNER_PART = 'workbench.parts.banner',
    ACTIVITYBAR_PART = 'workbench.parts.activitybar',
    SIDEBAR_PART = 'workbench.parts.sidebar',
    CHATHISTORY_PART = 'workbench.parts.chathistory',  // NEW
    PANEL_PART = 'workbench.parts.panel',
    AUXILIARYBAR_PART = 'workbench.parts.auxiliarybar',
    EDITOR_PART = 'workbench.parts.editor',
    STATUSBAR_PART = 'workbench.parts.statusbar'
}
```

---

### 2. Context Keys
**File**: `src/vs/workbench/common/contextkeys.ts`

**Changes**: Added context keys for tracking chat history state

```typescript
//#region < --- Chat History --- >
export const ActiveChatHistoryContext = new RawContextKey<string>(
    'activeChatHistory',
    '',
    localize('activeChatHistory', "The identifier of the active chat history view")
);

export const ChatHistoryFocusContext = new RawContextKey<boolean>(
    'chatHistoryFocus',
    false,
    localize('chatHistoryFocus', "Whether the chat history has keyboard focus")
);

export const ChatHistoryVisibleContext = new RawContextKey<boolean>(
    'chatHistoryVisible',
    false,
    localize('chatHistoryVisible', "Whether the chat history is visible")
);
//#endregion
```

**Purpose**:
- `ActiveChatHistoryContext`: Tracks which chat history item is active
- `ChatHistoryFocusContext`: Tracks keyboard focus state
- `ChatHistoryVisibleContext`: Tracks visibility state for conditional UI

---

### 3. Core Layout Manager
**File**: `src/vs/workbench/browser/layout.ts`

**Key Changes**:

#### a) Import and Property Declaration
```typescript
import { IChatHistoryService } from './parts/chathistory/chatHistoryPart.js';

// In Workbench class:
private chatHistoryPartView!: ISerializableView;
```

#### b) Layout State Keys
```typescript
const LayoutStateKeys = {
    // ... existing keys
    CHATHISTORY_SIZE: new InitializationStateKey<number>(
        'chatHistory.size',
        StorageScope.PROFILE,
        StorageTarget.MACHINE,
        280
    ),
    CHATHISTORY_HIDDEN: new RuntimeStateKey<boolean>(
        'chatHistory.hidden',
        StorageScope.WORKSPACE,
        StorageTarget.MACHINE,
        true
    ),
};
```

#### c) Layout Classes
```typescript
const enum LayoutClasses {
    // ... existing
    CHATHISTORY_HIDDEN = 'nochathistory',
}
```

#### d) Service Instantiation
Forces early instantiation of the Chat History Part:
```typescript
// Line ~333
accessor.get(IBannerService);
accessor.get(IChatHistoryService);  // Force instantiation
```

#### e) Visibility Check
```typescript
// Lines ~1254-1255, 1278-1279
case Parts.CHATHISTORY_PART:
    return !this.stateModel.getRuntimeValue(LayoutStateKeys.CHATHISTORY_HIDDEN);
```

#### f) Focus Handler
```typescript
// Lines ~1189-1193
case Parts.CHATHISTORY_PART: {
    const chatHistoryPart = this.getPart(Parts.CHATHISTORY_PART);
    if (chatHistoryPart && 'focus' in chatHistoryPart) {
        (chatHistoryPart as any).focus();
    }
    break;
}
```

#### g) Visibility Management
```typescript
// Lines ~2105-2125
private setChatHistoryHidden(hidden: boolean, skipLayout?: boolean): void {
    this.stateModel.setRuntimeValue(LayoutStateKeys.CHATHISTORY_HIDDEN, hidden);

    if (hidden) {
        this.mainContainer.classList.add(LayoutClasses.CHATHISTORY_HIDDEN);
    } else {
        this.mainContainer.classList.remove(LayoutClasses.CHATHISTORY_HIDDEN);
    }

    const chatHistoryPart = this.getPart(Parts.CHATHISTORY_PART);
    if (chatHistoryPart && 'setVisible' in chatHistoryPart) {
        (chatHistoryPart as any).setVisible(!hidden);
    }

    // Guard check to prevent error before grid is initialized
    if (this.workbenchGrid) {
        this.workbenchGrid.setViewVisible(this.chatHistoryPartView, !hidden);
    }
}
```

#### h) Grid Layout Integration
```typescript
// Lines ~1549-1592
const chatHistoryPart = this.getPart(Parts.CHATHISTORY_PART);
this.chatHistoryPartView = chatHistoryPart;

const viewMap = {
    [Parts.ACTIVITYBAR_PART]: this.activityBarPartView,
    [Parts.BANNER_PART]: this.bannerPartView,
    [Parts.TITLEBAR_PART]: this.titleBarPartView,
    [Parts.EDITOR_PART]: this.editorPartView,
    [Parts.PANEL_PART]: this.panelPartView,
    [Parts.SIDEBAR_PART]: this.sideBarPartView,
    [Parts.CHATHISTORY_PART]: this.chatHistoryPartView,  // NEW
    [Parts.STATUSBAR_PART]: this.statusBarPartView,
    [Parts.AUXILIARYBAR_PART]: this.auxiliaryBarPartView
};

// Register visibility change handler
for (const part of [..., chatHistoryPart, ...]) {
    this._register(part.onDidVisibilityChange((visible) => {
        // ...
        if (part === chatHistoryPart) {
            this.setChatHistoryHidden(!visible, true);
        }
        // ...
    }));
}
```

#### i) Size Persistence
```typescript
// Lines ~1627-1631
const chatHistorySize = this.stateModel.getRuntimeValue(LayoutStateKeys.CHATHISTORY_HIDDEN)
    ? this.workbenchGrid.getViewCachedVisibleSize(this.chatHistoryPartView)
    : this.workbenchGrid.getViewSize(this.chatHistoryPartView).width;
this.stateModel.setInitializationValue(LayoutStateKeys.CHATHISTORY_SIZE, chatHistorySize as number);
```

#### j) Grid Descriptor Creation
```typescript
// Lines ~2510-2516
const chatHistorySize = this.stateModel.getInitializationValue(LayoutStateKeys.CHATHISTORY_SIZE);
const chatHistoryNode: ISerializedLeafNode = {
    type: 'leaf',
    data: { type: Parts.CHATHISTORY_PART },
    size: chatHistorySize,
    visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.CHATHISTORY_HIDDEN)
};
```

#### k) Middle Section Arrangement
**CRITICAL**: This determines the visual order of parts

```typescript
// Lines ~2381-2413
private arrangeMiddleSectionNodes(nodes: {
    editor: ISerializedNode;
    panel: ISerializedNode;
    activityBar: ISerializedNode;
    sideBar: ISerializedNode;
    chatHistory: ISerializedNode;  // NEW
    auxiliaryBar: ISerializedNode
}, availableWidth: number, availableHeight: number): ISerializedNode[] {

    const chatHistorySize = this.stateModel.getRuntimeValue(LayoutStateKeys.CHATHISTORY_HIDDEN)
        ? 0
        : nodes.chatHistory.size;

    // Include chatHistorySize in width calculation
    nodes.editor.size = availableWidth - activityBarSize - sideBarSize
        - chatHistorySize - panelSize - auxiliaryBarSize;

    if (sideBarPosition === Position.LEFT) {
        // EDITOR MODE
        result.push(nodes.auxiliaryBar);
        result.splice(0, 0, nodes.chatHistory);  // Hidden, 0 size
        result.splice(0, 0, nodes.sideBar);
        result.splice(0, 0, nodes.activityBar);
        // Result: ActivityBar → Sidebar → (ChatHistory) → Editor
    } else {
        // AGENT MODE
        result.push(nodes.activityBar);            // Add to right end
        result.push(nodes.auxiliaryBar);           // Add to right end
        result.splice(0, 0, nodes.sideBar);        // Insert at position 0
        result.splice(0, 0, nodes.chatHistory);    // Insert at position 0 (before sideBar)
        // Result: ChatHistory → Sidebar → Editor → AuxiliaryBar → ActivityBar
    }
}
```

**Key Insight**: Using `result.splice(0, 0, ...)` inserts at the beginning. The order matters:
1. Insert `sideBar` at position 0: `[sideBar, editor]`
2. Insert `chatHistory` at position 0: `[chatHistory, sideBar, editor]` ✅

---

### 4. Workbench Initialization
**File**: `src/vs/workbench/browser/workbench.ts`

**Changes**: Added CHATHISTORY_PART to parts creation loop

```typescript
// Line ~335
for (const { id, role, classes, options } of [
    { id: Parts.TITLEBAR_PART, role: 'none', classes: ['titlebar'] },
    { id: Parts.BANNER_PART, role: 'banner', classes: ['banner'] },
    { id: Parts.ACTIVITYBAR_PART, role: 'none', classes: ['activitybar', ...] },
    { id: Parts.SIDEBAR_PART, role: 'none', classes: ['sidebar', ...] },
    { id: Parts.CHATHISTORY_PART, role: 'complementary', classes: ['chathistory'] },  // NEW
    { id: Parts.EDITOR_PART, role: 'main', classes: ['editor'], options: {...} },
    // ...
]) {
    const partContainer = this.createPart(id, role, classes);
    this.getPart(id).create(partContainer, options);
}
```

---

### 5. Module Imports
**File**: `src/vs/workbench/workbench.common.main.ts`

**Changes**: Import chat history modules

```typescript
// Lines ~51-52
import './browser/parts/banner/bannerPart.js';
import './browser/parts/chathistory/chatHistoryPart.js';       // NEW
import './browser/parts/chathistory/chatHistoryActions.js';    // NEW
import './browser/parts/statusbar/statusbarPart.js';
```

---

### 6. Agent Mode Integration
**File**: `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts`

**Changes**: Auto show/hide chat history based on mode

```typescript
// Lines ~469-476
// Set initial visibility
if (initialMode === 'agents') {
    this.layoutService.setPartHidden(false, Parts.CHATHISTORY_PART);
} else {
    this.layoutService.setPartHidden(true, Parts.CHATHISTORY_PART);
}

// Lines ~478-493
this._register(this.agentEditorToggle.onDidChangeMode(mode => {
    // Update sidebar position
    const newPosition = mode === 'agents' ? 'right' : 'left';
    this.configurationService.updateValue('workbench.sideBar.location', newPosition);

    // Update context key
    agentEditorModeContextKey.set(mode);

    // Show/hide chat history based on mode
    if (mode === 'agents') {
        this.layoutService.setPartHidden(false, Parts.CHATHISTORY_PART);
    } else {
        this.layoutService.setPartHidden(true, Parts.CHATHISTORY_PART);
    }
}));
```

---

## Files Created

### 1. Chat History Part (Core Implementation)
**File**: `src/vs/workbench/browser/parts/chathistory/chatHistoryPart.ts`

```typescript
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
        // CRITICAL: Must set this.element for ISerializableView interface
        this.element = parent;
        parent.classList.add('chathistory');

        // Create content container
        this.content = $('.chathistory-content');
        parent.appendChild(this.content);

        // Mount React component - defer accessor usage to avoid lifecycle issues
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

        // Track focus for context keys
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

// Register as singleton service with eager instantiation
registerSingleton(IChatHistoryService, ChatHistoryPart, InstantiationType.Eager);
```

**Key Points**:
- **Line 61**: `this.element = parent` is CRITICAL - required by `ISerializableView` interface for grid layout
- **Lines 68-78**: React mounting uses double `invokeFunction` to handle async import timing
- **Lines 81-84**: Focus tracking for context keys
- **Lines 88-99**: Theme color application matching sidebar styles

---

### 2. Actions
**File**: `src/vs/workbench/browser/parts/chathistory/chatHistoryActions.ts`

```typescript
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ChatHistoryVisibleContext, AgentEditorModeContext } from '../../../common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';

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
```

**Actions**:
1. **Toggle**: `Ctrl+Shift+H` (Agent mode only)
2. **Focus**: Focuses into chat history, shows if hidden
3. **Close**: Hides the chat history

---

### 3. CSS Styles
**File**: `src/vs/workbench/browser/parts/chathistory/media/chatHistoryPart.css`

```css
.monaco-workbench.nochathistory .part.chathistory {
    display: none !important;
    visibility: hidden !important;
}

.monaco-workbench .part.chathistory {
    display: flex;
    flex-direction: column;
    background-color: var(--vscode-sideBar-background);
    color: var(--vscode-sideBar-foreground);
}

.monaco-workbench .part.chathistory > .content {
    flex: 1;
    overflow: hidden;
}

.monaco-workbench .part.chathistory > .content .chathistory-content {
    width: 100%;
    height: 100%;
    overflow: auto;
}
```

---

### 4. React Components

#### a) Mount Function
**File**: `src/vs/workbench/contrib/void/browser/react/src/chathistory-tsx/index.tsx`

```typescript
import { mountFnGenerator } from '../util/mountFnGenerator.js'
import { ChatHistory } from './ChatHistory.js'

export const mountChatHistory = mountFnGenerator(ChatHistory)
```

#### b) Main Component
**File**: `src/vs/workbench/contrib/void/browser/react/src/chathistory-tsx/ChatHistory.tsx`

```typescript
import { useIsDark } from '../util/services.js';
import '../styles.css';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';

export const ChatHistory = ({ className }: { className?: string }) => {
    const isDark = useIsDark();

    return (
        <div
            className={`@@void-scope ${isDark ? 'dark' : ''}`}
            style={{ width: '100%', height: '100%' }}
        >
            <div className={`w-full h-full bg-void-bg-2 text-void-fg-1`}>
                <div className={`w-full h-full p-4`}>
                    <ErrorBoundary>
                        <ChatHistoryContent />
                    </ErrorBoundary>
                </div>
            </div>
        </div>
    );
};

const ChatHistoryContent = () => {
    return (
        <div className="flex flex-col h-full">
            <h2 className="text-lg font-semibold mb-4">Chat History</h2>
            <div className="flex-1 overflow-auto">
                <p className="text-void-fg-3 text-sm">
                    Your chat history will appear here.
                </p>
            </div>
        </div>
    );
};
```

#### c) Build Configuration
**File**: `src/vs/workbench/contrib/void/browser/react/tsup.config.js`

```javascript
export default defineConfig({
    entry: [
        './src2/void-editor-widgets-tsx/index.tsx',
        './src2/sidebar-tsx/index.tsx',
        './src2/chathistory-tsx/index.tsx',  // NEW
        './src2/void-settings-tsx/index.tsx',
        './src2/void-tooltip/index.tsx',
        './src2/void-onboarding/index.tsx',
        './src2/quick-edit-tsx/index.tsx',
        './src2/diff/index.tsx',
    ],
    // ... rest of config
})
```

---

## Build Process

### 1. Build React Components
```bash
cd src/vs/workbench/contrib/void/browser/react
node build.js
```

This compiles:
- `src2/chathistory-tsx/index.tsx` → `out/chathistory-tsx/index.js`

### 2. Compile TypeScript
```bash
cd E:\metho-ide\void
npm run compile
```

Or for watching during development:
```bash
npm run watch
```

---

## Key Technical Concepts

### 1. ISerializableView Interface
All Parts must implement this interface to work with the grid layout:

```typescript
interface ISerializableView extends IView {
    readonly element: HTMLElement;  // The DOM element
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly minimumHeight: number;
    readonly maximumHeight: number;
    readonly onDidChange: Event<IViewSize | undefined>;
    setVisible(visible: boolean): void;
    layout(width: number, height: number, top: number, left: number): void;
    toJSON(): object;
}
```

**CRITICAL**: The `element` property MUST be set in `createContentArea()`:
```typescript
protected override createContentArea(parent: HTMLElement): HTMLElement {
    this.element = parent;  // ← REQUIRED!
    // ... rest of implementation
    return parent;
}
```

### 2. Grid Layout System
VS Code uses `SerializableGrid` to manage workbench layout:
- Parts are arranged in a tree structure
- Each Part is a "view" in the grid
- The grid handles resizing, visibility, and persistence

### 3. Service Registration
```typescript
registerSingleton(IChatHistoryService, ChatHistoryPart, InstantiationType.Eager);
```

- `InstantiationType.Eager`: Service is instantiated immediately on startup
- Forces `accessor.get(IChatHistoryService)` in layout.ts ensures early initialization

### 4. React Mounting Pattern
Uses double `invokeFunction` to handle async imports:

```typescript
this.instantiationService.invokeFunction(accessor => {
    import('...').then(module => {
        if (this.content) {
            this.instantiationService.invokeFunction(innerAccessor => {
                // Use innerAccessor here
            });
        }
    });
});
```

This prevents "service accessor is only valid during invocation" errors.

---

## Troubleshooting

### Issue: "Unknown part workbench.parts.chathistory"
**Cause**: Part service not instantiated early enough

**Solution**: Add `accessor.get(IChatHistoryService)` in layout.ts around line 333

### Issue: "Failed to execute 'appendChild' on 'Node'"
**Cause**: `this.element` not set in `createContentArea()`

**Solution**: Add `this.element = parent;` at the start of `createContentArea()`

### Issue: Chat History appears in wrong position
**Cause**: Incorrect splice order in `arrangeMiddleSectionNodes()`

**Solution**: Ensure correct order:
```typescript
result.splice(0, 0, nodes.sideBar);      // Insert first
result.splice(0, 0, nodes.chatHistory);  // Insert before sideBar
```

### Issue: Layout not updating after code changes
**Solutions**:
1. Clear workspace cache:
   ```powershell
   Remove-Item "C:\Users\[USER]\AppData\Roaming\Void\User\workspaceStorage\*" -Recurse -Force
   ```
2. Full rebuild:
   ```bash
   npm run compile
   ```
3. Restart application

---

## Testing Checklist

- [ ] Chat History appears in Agent mode
- [ ] Chat History hidden in Editor mode
- [ ] Chat History is leftmost panel in Agent mode
- [ ] Order: ChatHistory → VoidChat (AuxiliaryBar) → Editor → Sidebar → ActivityBar
- [ ] `Ctrl+Shift+H` toggles visibility (Agent mode only)
- [ ] Resize persists across sessions
- [ ] Visibility state persists per workspace
- [ ] Focus tracking works (context keys update)
- [ ] Theme colors apply correctly
- [ ] No console errors on load
- [ ] Grid layout calculates sizes correctly

---

## Extension Points

### Adding Content to Chat History
The React component can be extended to:
1. Fetch chat threads from a service
2. Display conversation list with timestamps
3. Allow clicking to load/switch conversations
4. Search/filter conversations
5. Delete/archive conversations

### Example Service Integration
```typescript
// In ChatHistory.tsx
import { useVoidThreadsService } from '../util/services.js';

const ChatHistoryContent = () => {
    const threadsService = useVoidThreadsService();
    const threads = threadsService.getThreads();

    return (
        <div className="flex flex-col h-full">
            <h2 className="text-lg font-semibold mb-4">Chat History</h2>
            <div className="flex-1 overflow-auto">
                {threads.map(thread => (
                    <ThreadItem
                        key={thread.id}
                        thread={thread}
                        onClick={() => threadsService.loadThread(thread.id)}
                    />
                ))}
            </div>
        </div>
    );
};
```

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Position: Left of Void Chat | User requested leftmost position in Agent mode |
| Only visible in Agent mode | Follows Void Chat sidebar pattern |
| Uses React | Consistent with other Void UI components |
| Singleton service | Only one instance needed, eager instantiation |
| Size: 280px default | Matches sidebar default width |
| Storage: Profile for size | Size preference follows user across workspaces |
| Storage: Workspace for visibility | Visibility state is per-project |
| Priority: Low | Non-critical UI element |
| Keybinding: Ctrl+Shift+H | Follows VS Code convention (H for History) |

---

## References

- **Part Base Class**: `src/vs/workbench/browser/part.ts`
- **Layout Service**: `src/vs/workbench/services/layout/browser/layoutService.ts`
- **Grid System**: `src/vs/base/browser/ui/grid/grid.ts`
- **Reference Implementation**: `src/vs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart.ts`
- **Banner Part Example**: `src/vs/workbench/browser/parts/banner/bannerPart.ts`

---

## Future Enhancements

1. **Thread Management**: Display actual chat conversations
2. **Search**: Search across all chat history
3. **Filters**: Filter by date, model, status
4. **Export**: Export chat history to markdown/JSON
5. **Star/Pin**: Mark important conversations
6. **Timestamps**: Show relative/absolute timestamps
7. **Preview**: Show message preview on hover
8. **Context Menu**: Right-click options (delete, rename, etc.)
9. **Drag & Drop**: Reorder conversations
10. **Keyboard Navigation**: Arrow keys to navigate list

---

## Contact & Support

For questions or issues with this implementation:
- Review the plan file: `C:\Users\dharm\.claude\plans\ethereal-shimmying-pancake.md`
- Check this documentation
- Review reference implementations in the codebase
- Test with the checklist above

---

**Last Updated**: December 23, 2025
**Version**: 1.0
**Status**: ✅ Implemented and Working
