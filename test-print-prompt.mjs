// Test script to call and print chat_systemMessage directly from prompts.ts
import { chat_systemMessage } from './src/vs/workbench/contrib/void/common/prompt/prompts.ts';

// Test data
const testParams = {
	workspaceFolders: ['E:\\metho-ide\\void'],
	openedURIs: [
		'E:\\metho-ide\\void\\src\\vs\\workbench\\contrib\\void\\common\\prompt\\prompts.ts',
		'E:\\metho-ide\\void\\package.json'
	],
	activeURI: 'E:\\metho-ide\\void\\src\\vs\\workbench\\contrib\\void\\common\\prompt\\prompts.ts',
	persistentTerminalIDs: ['terminal-1', 'terminal-2'],
	directoryStr: `src/
  vs/
    workbench/
      contrib/
        void/
          common/
            prompt/
              prompts.ts
package.json
README.md`,
	chatMode: 'agent',
	mcpTools: undefined,
	includeXMLToolDefinitions: true
};

console.log('='.repeat(120));
console.log('CALLING chat_systemMessage WITH AGENT MODE');
console.log('='.repeat(120));

const result = chat_systemMessage(testParams);

console.log(result);
console.log('\n' + '='.repeat(120));
console.log('Total characters:', result.length);
console.log('Total lines:', result.split('\n').length);
console.log('='.repeat(120));

const api = `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`;
