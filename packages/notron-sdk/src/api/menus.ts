/**
 * Menus
 *
 * Menu locations and when-clause evaluation for visibility.
 */
import type { Disposable } from './types.js';
import { toDisposable } from './types.js';

export type MenuLocation =
  | 'commandPalette'
  | 'editor/context'
  | 'editor/title'
  | 'explorer/context'
  | 'view/title'
  | 'view/item/context'
  | 'tab/context'
  | 'menubar/file'
  | 'menubar/edit'
  | 'menubar/view'
  | 'menubar/run'
  | 'menubar/help'
  | 'pane/context';

export type WhenContext = Record<string, unknown>;

type TokenType = 'IDENT' | 'STRING' | 'OP' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const ch = expr[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let val = '';
      while (j < n) {
        const c = expr[j]!;
        if (c === '\\' && j + 1 < n) {
          val += expr[j + 1]!;
          j += 2;
          continue;
        }
        if (c === quote) break;
        val += c;
        j++;
      }
      if (j >= n || expr[j] !== quote) {
        throw new Error(`Unterminated string at ${i}`);
      }
      tokens.push({ type: 'STRING', value: val });
      i = j + 1;
      continue;
    }
    if (expr.startsWith('===', i)) { tokens.push({ type: 'OP', value: '===' }); i += 3; continue; }
    if (expr.startsWith('!==', i)) { tokens.push({ type: 'OP', value: '!==' }); i += 3; continue; }
    if (expr.startsWith('=~', i)) { tokens.push({ type: 'OP', value: '=~' }); i += 2; continue; }
    if (expr.startsWith('==', i)) { tokens.push({ type: 'OP', value: '==' }); i += 2; continue; }
    if (expr.startsWith('!=', i)) { tokens.push({ type: 'OP', value: '!=' }); i += 2; continue; }
    if (expr.startsWith('&&', i)) { tokens.push({ type: 'OP', value: '&&' }); i += 2; continue; }
    if (expr.startsWith('||', i)) { tokens.push({ type: 'OP', value: '||' }); i += 2; continue; }
    if (expr.startsWith('>=', i)) { tokens.push({ type: 'OP', value: '>=' }); i += 2; continue; }
    if (expr.startsWith('<=', i)) { tokens.push({ type: 'OP', value: '<=' }); i += 2; continue; }
    if (ch === '!' && expr[i + 1] !== '=') {
      tokens.push({ type: 'OP', value: '!' });
      i++;
      continue;
    }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
    if (ch === '>' || ch === '<' || ch === '=') {
      tokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }
    let j = i;
    while (j < n && /[A-Za-z0-9_\-.:/]/.test(expr[j]!) ) {
      j++;
    }
    if (j > i) {
      const word = expr.slice(i, j);
      if (word === 'in' || word === 'not') {
        tokens.push({ type: 'OP', value: word });
      } else {
        tokens.push({ type: 'IDENT', value: word });
      }
      i = j;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at ${i}`);
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

class Parser {
  constructor(
    private tokens: Token[],
    private context: WhenContext,
  ) {}
  pos = 0;

  peek(): Token {
    return this.tokens[this.pos]!;
  }
  consume(): Token {
    return this.tokens[this.pos++]!;
  }
  match(type: TokenType, value?: string): boolean {
    const t = this.peek();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    this.pos++;
    return true;
  }
  expect(type: TokenType, value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${value ?? type} but got ${t.type}:${t.value}`);
    }
    return this.consume();
  }

  parseExpression(): boolean {
    return this.parseOr();
  }

  parseOr(): boolean {
    let left = this.parseAnd();
    while (this.match('OP', '||')) {
      const right = this.parseAnd();
      left = left || right;
    }
    return left;
  }

  parseAnd(): boolean {
    let left = this.parseEquality();
    while (this.match('OP', '&&')) {
      const right = this.parseEquality();
      left = left && right;
    }
    return left;
  }

  parseEquality(): boolean {
    const startPos = this.pos;
    const leftVal = this.parseUnaryValue();

    const op = this.peek();
    if (op.type === 'OP' && ['==', '!=', '===', '!==', '=~', '>', '<', '>=', '<=', 'in'].includes(op.value)) {
      this.consume();
      let isNegatedIn = false;
      if (op.value === 'not') {
        if (this.match('OP', 'in')) {
          isNegatedIn = true;
        } else {
          throw new Error('"not" without "in" not supported');
        }
      }
      if (isNegatedIn) {
        const right = this.parseUnaryValueRaw();
        return !inOperator(leftVal, right);
      }
      const rightVal = this.parseUnaryValueRaw();
      switch (op.value) {
        case '==':
        case '===':
          return looseEqual(leftVal, rightVal);
        case '!=':
        case '!==':
          return !looseEqual(leftVal, rightVal);
        case '=~':
          return regexMatch(String(leftVal ?? ''), String(rightVal ?? ''));
        case '>':
          return compare(leftVal, rightVal) > 0;
        case '<':
          return compare(leftVal, rightVal) < 0;
        case '>=':
          return compare(leftVal, rightVal) >= 0;
        case '<=':
          return compare(leftVal, rightVal) <= 0;
        case 'in':
          return inOperator(leftVal, rightVal);
        default:
          return false;
      }
    } else {
      if (typeof leftVal === 'boolean' && this.tokens[startPos]?.value === '!') {
        return leftVal;
      }
      return !!leftVal && leftVal !== 'false' ? truthy(leftVal) : false;
    }
  }

  parseUnaryValue(): unknown {
    if (this.match('OP', '!')) {
      const v = this.parseUnaryValue();
      return !truthy(v);
    }
    if (this.peek().type === 'OP' && this.peek().value === 'not') {
      const next = this.tokens[this.pos + 1];
      if (!next || next.value !== 'in') {
        this.consume();
        const v = this.parseUnaryValue();
        return !truthy(v);
      }
    }
    const t = this.peek();
    if (t.type === 'LPAREN') {
      this.consume();
      const inner = this.parseExpression();
      this.expect('RPAREN');
      return inner;
    }
    if (t.type === 'STRING') {
      this.consume();
      return t.value;
    }
    if (t.type === 'IDENT') {
      this.consume();
      if (t.value === 'true') return true;
      if (t.value === 'false') return false;
      if (t.value === 'null') return null;
      if (t.value === 'undefined') return undefined;
      if (t.value in this.context) return this.context[t.value];
      if (t.value.includes('.')) {
        const resolved = getNested(this.context, t.value);
        if (resolved !== undefined) return resolved;
      }
      return undefined;
    }
    if (t.type === 'EOF') return undefined;
    throw new Error(`Unexpected token ${t.type}:${t.value}`);
  }

  parseUnaryValueRaw(): unknown {
    const t = this.peek();
    if (t.type === 'LPAREN') {
      this.consume();
      const inner = this.parseExpression();
      this.expect('RPAREN');
      return inner;
    }
    if (t.type === 'STRING') {
      this.consume();
      return t.value;
    }
    if (t.type === 'IDENT') {
      this.consume();
      if (t.value === 'true') return true;
      if (t.value === 'false') return false;
      if (t.value === 'null') return null;
      if (t.value === 'undefined') return undefined;
      if (t.value in this.context) {
        return this.context[t.value];
      }
      if (t.value.includes('.')) {
        const resolved = getNested(this.context, t.value);
        if (resolved !== undefined) return resolved;
      }
      return t.value;
    }
    if (t.type === 'EOF') return undefined;
    throw new Error(`Unexpected token ${t.type}:${t.value}`);
  }
}

function truthy(v: unknown): boolean {
  if (v === false || v === null || v === undefined) return false;
  if (v === 0 || v === '' || v === 'false') return false;
  if (typeof v === 'string') {
    return v.length > 0 && v !== 'false' && v !== '0';
  }
  return !!v;
}

function looseEqual(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

function regexMatch(value: string, pattern: string): boolean {
  try {
    const p = pattern;
    if (p.length >= 2 && p.startsWith('/') && p.lastIndexOf('/') > 0) {
      const lastSlash = p.lastIndexOf('/');
      const body = p.slice(1, lastSlash);
      const flags = p.slice(lastSlash + 1);
      return new RegExp(body, flags).test(value);
    }
    return new RegExp(p).test(value);
  } catch {
    return false;
  }
}

function compare(a: unknown, b: unknown): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function inOperator(left: unknown, right: unknown): boolean {
  if (Array.isArray(right)) return right.includes(left);
  if (typeof right === 'string') return right.split(',').map((s) => s.trim()).includes(String(left));
  if (right && typeof right === 'object') return String(left) in (right as Record<string, unknown>);
  return false;
}

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function evaluateWhenClause(expression: string, context: WhenContext): boolean {
  if (!expression || !expression.trim()) return true;
  try {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens, context);
    const result = parser.parseExpression();
    if (parser.peek().type !== 'EOF') {
      console.warn(`[menus] evaluateWhenClause: unconsumed tokens after "${expression}"`);
    }
    return !!result;
  } catch (err) {
    console.warn(`[menus] evaluateWhenClause failed for "${expression}":`, err);
    return false;
  }
}

interface MenuEntry {
  command: string;
  when?: string;
  group?: string;
  alt?: string;
  extensionId?: string;
}

const menuContributions = new Map<MenuLocation, MenuEntry[]>();
let menusDelegate: MenusDelegate | null = null;

export interface MenusDelegate {
  registerMenuItem?(location: MenuLocation, entry: MenuEntry): Disposable;
  getMenuItems?(location: MenuLocation, context: WhenContext): MenuEntry[];
}

export function setMenusDelegate(d: MenusDelegate | null): void {
  menusDelegate = d;
}

export function __registerMenu(location: MenuLocation, entry: MenuEntry): Disposable {
  if (menusDelegate?.registerMenuItem) {
    return menusDelegate.registerMenuItem(location, entry);
  }
  if (!menuContributions.has(location)) menuContributions.set(location, []);
  const arr = menuContributions.get(location)!;
  arr.push(entry);
  return toDisposable(() => {
    const list = menuContributions.get(location);
    if (list) {
      const idx = list.indexOf(entry);
      if (idx !== -1) list.splice(idx, 1);
    }
  });
}

export function getMenus(location: MenuLocation, context: WhenContext = {}): MenuEntry[] {
  if (menusDelegate?.getMenuItems) return menusDelegate.getMenuItems(location, context);
  const all = menuContributions.get(location) ?? [];
  return all.filter((e) => !e.when || evaluateWhenClause(e.when, context));
}

export function __getMenuContributions(): Map<MenuLocation, MenuEntry[]> {
  return menuContributions;
}

export function __clearMenus(): void {
  menuContributions.clear();
}

export const menus = {
  evaluateWhenClause,
  getMenus,
} as const;

export const menusNamespace = menus;
