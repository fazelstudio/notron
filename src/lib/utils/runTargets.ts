// ── Run target registry ─────────────────────────────────────────────────────
//
// Single source of truth for "which files can Notron run" and HOW to run them.
// Both the configuration detector (runService) and the command builder read
// from this table, so adding a language means adding ONE entry here.
//
// Commands are expressed as PowerShell statements (Notron spawns a PowerShell
// PTY) and must never use `&&` / `||` — Windows PowerShell 5.1 does not
// support them. Compile-and-run targets emit two statements:
//   <compile>; if ($?) { & <exe> }
// mirroring VS Code task chaining while staying 5.1-compatible.

/** A file that can be run standalone, mapped to its runner. */
export interface RunFileTarget {
  /** Stable runner id (also used as the launch config "type"). */
  type: string;
  /** Human label used in generated configuration names. */
  label: string;
  /** Lowercase extensions (without dot) this runner handles. */
  exts: string[];
}

/**
 * Which command language the statements will be typed into. Windows hosts
 * run Windows PowerShell 5.1 (no `&&`), macOS/Linux hosts run POSIX shells.
 */
export type ShellDialect = 'powershell' | 'posix';

export interface StatementContext {
  file: string;
  base: string;
  dir: string;
  /** Interpreter override supplied by the caller (e.g. project venv python). */
  exe?: string;
  /** Target shell dialect — builders emit matching syntax. */
  shell: ShellDialect;
}

/**
 * Build the statements that run `file` in the given shell dialect.
 * Return null when the file cannot run standalone (needs a project or an
 * interpreter unavailable on this platform).
 */
type StatementBuilder = (ctx: StatementContext) => string[] | null;

interface RunTargetDef extends RunFileTarget {
  build: StatementBuilder;
}

/**
 * Quote a value as a single-quoted literal for the target shell.
 * PowerShell doubles embedded quotes; POSIX ends/escapes/reopens ('\'').
 */
export function quoteFor(shell: ShellDialect, value: string): string {
  if (shell === 'posix') return `'${value.replace(/'/g, `'\\''`)}'`;
  return `'${value.replace(/'/g, "''")}'`;
}

/** Back-compat alias: PowerShell quoting. */
export function quotePs(value: string): string {
  return quoteFor('powershell', value);
}

/**
 * Interpreter invocation honoring an optional caller-provided executable.
 * PowerShell only executes quoted paths through the call operator (`&`);
 * POSIX shells execute them directly.
 */
function runWith(exe: string | undefined, fallback: string, file: string, shell: ShellDialect): string {
  const q = quoteFor(shell, exe || fallback);
  if (shell === 'powershell') return `& ${q} ${quoteFor(shell, file)}`;
  return `${q} ${quoteFor(shell, file)}`;
}

function compileAndRun(compiler: string, flags: string[], ctx: StatementContext): string[] {
  const q = (v: string) => quoteFor(ctx.shell, v);
  const out = `${ctx.base}.exe`;
  const compile = [compiler, ...flags, q(ctx.file), '-o', q(out)].join(' ');
  if (ctx.shell === 'posix') {
    // POSIX shells support && chaining; ./ prefix is mandatory there too.
    return [`${compile} && ./${out}`];
  }
  // Windows PowerShell 5.1 has no `&&`: chain via $? instead. Bare names are
  // never resolved from the CWD, so launch through the explicit ./ path.
  return [compile, `if ($?) { & ${q(`./${out}`)} }`];
}

/**
 * Registry order matters only for lookup speed — extensions are unique.
 * `build` receives unquoted absolute path parts and returns raw statements.
 */
export const RUN_TARGETS: RunTargetDef[] = [
  {
    type: 'node', label: 'Node.js',
    exts: ['js', 'cjs', 'mjs'],
    build: (ctx) => [runWith(ctx.exe, 'node', ctx.file, ctx.shell)],
  },
  {
    // Plain `node file.ts`: Node ≥23.6 strips types natively; older versions
    // surface a clear error instead of silently mis-running.
    type: 'node-ts', label: 'TypeScript',
    exts: ['ts', 'mts', 'cts', 'tsx', 'jsx'],
    build: (ctx) => [runWith(ctx.exe, 'node', ctx.file, ctx.shell)],
  },
  {
    type: 'python', label: 'Python',
    exts: ['py', 'pyw'],
    build: (ctx) => [runWith(ctx.exe, 'python', ctx.file, ctx.shell)],
  },
  {
    type: 'go', label: 'Go',
    exts: ['go'],
    // `go run .` in the file's directory also handles multi-file packages.
    build: () => ['go run .'],
  },
  {
    type: 'ruby', label: 'Ruby',
    exts: ['rb'],
    build: (ctx) => [runWith(ctx.exe, 'ruby', ctx.file, ctx.shell)],
  },
  {
    type: 'rust', label: 'Rust',
    exts: ['rs'],
    build: (ctx) => compileAndRun('rustc', [], ctx),
  },
  {
    type: 'c', label: 'C',
    exts: ['c'],
    build: (ctx) => compileAndRun('gcc', [], ctx),
  },
  {
    type: 'cpp', label: 'C++',
    exts: ['cpp', 'cc', 'cxx', 'c++'],
    build: (ctx) => compileAndRun('g++', [], ctx),
  },
  {
    // Single-file source launcher (JDK 11+). Project builds go through Maven/
    // Gradle manually or via launch.json.
    type: 'java', label: 'Java',
    exts: ['java'],
    build: ({ file, shell }) => [`java ${quoteFor(shell, file)}`],
  },
  {
    type: 'php', label: 'PHP',
    exts: ['php'],
    build: ({ file, shell }) => [`php ${quoteFor(shell, file)}`],
  },
  {
    type: 'lua', label: 'Lua',
    exts: ['lua'],
    build: ({ file, shell }) => [`lua ${quoteFor(shell, file)}`],
  },
  {
    type: 'perl', label: 'Perl',
    exts: ['pl', 'pm'],
    build: ({ file, shell }) => [`perl ${quoteFor(shell, file)}`],
  },
  {
    type: 'dart', label: 'Dart',
    exts: ['dart'],
    build: ({ file, shell }) => [`dart run ${quoteFor(shell, file)}`],
  },
  {
    type: 'r', label: 'R',
    exts: ['r', 'rmd'],
    build: ({ file, shell }) => [`Rscript ${quoteFor(shell, file)}`],
  },
  {
    type: 'swift', label: 'Swift',
    exts: ['swift'],
    build: ({ file, shell }) => [`swift ${quoteFor(shell, file)}`],
  },
  {
    // dotnet run needs a project file in scope — the service verifies one
    // exists next to the source before offering this target.
    type: 'csharp', label: 'C# (.NET)',
    exts: ['cs'],
    build: () => ['dotnet run'],
  },
  {
    type: 'powershell', label: 'PowerShell',
    exts: ['ps1'],
    build: ({ file, shell }) => {
      // .ps1 needs PowerShell; on POSIX hosts that means pwsh (Core).
      if (shell === 'posix') return [`pwsh ${quoteFor(shell, file)}`];
      return [`& ${quoteFor(shell, file)}`];
    },
  },
  {
    type: 'batch', label: 'Batch',
    exts: ['bat', 'cmd'],
    build: ({ file, shell }) => {
      // cmd.exe does not exist on POSIX hosts — nothing to run them with.
      if (shell === 'posix') return null;
      return [`cmd /c ${quoteFor(shell, file)}`];
    },
  },
  {
    type: 'shell', label: 'Shell',
    exts: ['sh', 'bash', 'zsh'],
    build: ({ file, shell }) => [`bash ${quoteFor(shell, file)}`],
  },
];

const EXT_INDEX = new Map<string, RunTargetDef>();
for (const t of RUN_TARGETS) {
  for (const e of t.exts) EXT_INDEX.set(e, t);
}

export function extensionOf(path: string): string {
  const name = path.split(/[/\\]/).pop() || '';
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}

export function basenameOf(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

export function dirnameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut === -1 ? path : path.slice(0, cut);
}

export function stemOf(path: string): string {
  const name = basenameOf(path);
  const idx = name.lastIndexOf('.');
  return idx === -1 ? name : name.slice(0, idx);
}

/** Find the registered run target for a file path, or null if not runnable. */
export function getRunTarget(path: string): RunFileTarget | null {
  const def = EXT_INDEX.get(extensionOf(path));
  return def ? { type: def.type, label: def.label, exts: [...def.exts] } : null;
}

export function isRunnableFile(path: string): boolean {
  return EXT_INDEX.has(extensionOf(path));
}

/**
 * Build the terminal statements for running a standalone file.
 * `opts.executable` overrides the default interpreter/runtime for the target;
 * `opts.shell` selects the command dialect (defaults to PowerShell).
 * Returns null when the target exists but cannot run without extra context
 * (e.g. C# outside a .NET project, or a .bat on POSIX).
 */
export function buildStandaloneStatements(
  type: string,
  filePath: string,
  opts?: { executable?: string; shell?: ShellDialect }
): string[] | null {
  const def = RUN_TARGETS.find(t => t.type === type);
  if (!def) return null;
  const ctx: StatementContext = {
    file: filePath,
    base: stemOf(filePath),
    dir: dirnameOf(filePath),
    exe: opts?.executable,
    shell: opts?.shell || 'powershell',
  };
  return def.build(ctx);
}
