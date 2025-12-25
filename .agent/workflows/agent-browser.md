# Agent Browser

Agentic browser control integrated into the simple-browser extension for AI-powered web automation.

## Quick Start

```
Command Palette → "Browser Tools: Open Agentic Browser"
```

## Available Commands

| Command | Description |
|---------|-------------|
| `simpleBrowser.showAgenticBrowser` | Open browser with automation enabled |
| `simpleBrowser.navigate` | Navigate to URL |
| `simpleBrowser.back` | Go back |
| `simpleBrowser.forward` | Go forward |
| `simpleBrowser.reload` | Reload page |
| `simpleBrowser.click` | Click element by CSS selector |
| `simpleBrowser.type` | Type text into element |
| `simpleBrowser.fill` | Fill form field |
| `simpleBrowser.press` | Press keyboard key |
| `simpleBrowser.hover` | Hover over element |
| `simpleBrowser.screenshot` | Take screenshot (returns base64) |
| `simpleBrowser.getContent` | Get page HTML |
| `simpleBrowser.getAccessibilityTree` | Get accessibility tree |
| `simpleBrowser.evaluate` | Execute JavaScript |
| `simpleBrowser.waitForSelector` | Wait for element to appear |
| `simpleBrowser.closeBrowser` | Close browser session |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Window                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Orbit Browser (Webview)                 │    │
│  │              ← Visual Display →                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                           ↕ Sync                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Hidden WebContentsView + CDP                 │    │
│  │              ← Automation Backend →                  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### Main Process
- `src/vs/platform/embeddedBrowser/electron-main/embeddedBrowserService.ts` - Core service
- `src/vs/platform/embeddedBrowser/electron-main/embeddedBrowserChannel.ts` - IPC channel

### Workbench
- `src/vs/platform/embeddedBrowser/common/embeddedBrowser.ts` - Interface
- `src/vs/platform/embeddedBrowser/electron-sandbox/embeddedBrowserService.ts` - Client
- `src/vs/workbench/contrib/embeddedBrowser/browser/embeddedBrowser.contribution.ts` - Commands

### Extension
- `extensions/simple-browser/src/browserService.ts` - Extension client
- `extensions/simple-browser/src/extension.ts` - Command handlers

## How It Works

1. **Visual Browser**: Simple-browser webview panel (what user sees)
2. **Automation Backend**: Hidden WebContentsView with CDP debugger
3. **Sync**: After navigation actions, URL is fetched and webview updates

## Example Usage

```typescript
// Navigate
await vscode.commands.executeCommand('simpleBrowser.navigate', 'https://example.com');

// Click a button
await vscode.commands.executeCommand('simpleBrowser.click', 'button.submit');

// Type text
await vscode.commands.executeCommand('simpleBrowser.type', 'input#search', 'hello');

// Take screenshot
const base64 = await vscode.commands.executeCommand('simpleBrowser.screenshot');
```

## CDP Domains Used

- **DOM** - Element queries, focus
- **Input** - Mouse events, keyboard events
- **Accessibility** - Accessibility tree

## Notes

- Automation runs on hidden view, visible browser syncs after actions
- Click/Enter key press automatically syncs if navigation occurs
- Screenshot captures from automation view (same content as visible)
