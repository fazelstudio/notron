/**
 * Built-in Snippets
 *
 * Snippet data per language. Registered through the snippet registry so the
 * completion engine stays untouched when snippets are added or changed.
 */

import { snippetRegistry } from '../../workbench/snippetRegistry';

snippetRegistry.registerAll([
  {
    language: 'javascript',
    priority: 10,
    snippets: [
      { prefix: 'log', description: 'console.log', body: 'console.log($1)$0' },
      { prefix: 'fn', description: 'Function declaration', body: 'function ${1:name}(${2:args}) {\n\t$0\n}' },
      { prefix: 'import', description: 'Import module', body: "import { $2 } from '$1'$0" }
    ]
  },
  {
    language: 'typescript',
    priority: 10,
    snippets: [
      { prefix: 'log', description: 'console.log', body: 'console.log($1)$0' },
      { prefix: 'fn', description: 'Function declaration', body: 'function ${1:name}(${2:args}): ${3:void} {\n\t$0\n}' },
      { prefix: 'iface', description: 'Interface', body: 'interface ${1:Name} {\n\t$0\n}' }
    ]
  },
  {
    language: 'python',
    priority: 10,
    snippets: [
      { prefix: 'main', description: 'Main guard', body: "if __name__ == '__main__':\n\t$0" },
      { prefix: 'def', description: 'Function definition', body: 'def ${1:name}(${2:args}) -> ${3:None}:\n\t$0' },
      { prefix: 'class', description: 'Class definition', body: 'class ${1:Name}:\n\tdef __init__(self) -> None:\n\t\t$0' }
    ]
  },
  {
    language: 'rust',
    priority: 10,
    snippets: [
      { prefix: 'fn', description: 'Function', body: 'fn ${1:name}(${2}) {\n\t$0\n}' },
      { prefix: 'test', description: 'Test module', body: '#[cfg(test)]\nmod tests {\n\tuse super::*;\n\n\t#[test]\n\tfn ${1:name}() {\n\t\t$0\n\t}\n}' }
    ]
  },
  {
    language: 'go',
    priority: 10,
    snippets: [
      { prefix: 'func', description: 'Function', body: 'func ${1:name}(${2}) ${3} {\n\t$0\n}' },
      { prefix: 'main', description: 'Main function', body: 'func main() {\n\t$0\n}' }
    ]
  },
  {
    language: 'markdown',
    priority: 10,
    snippets: [{ prefix: 'code', description: 'Fenced code block', body: '```${1:language}\n$0\n```' }]
  }
]);
