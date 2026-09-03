import type { Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';

import { foldInside, foldNodeProp, LRLanguage, LanguageSupport } from '@codemirror/language';

function patchFold(lang: any, nodeMap: any, langName: string) {
  if (lang.language && lang.language.parser) {
    const patched = lang.language.parser.configure({
      props: [foldNodeProp.add(nodeMap)]
    });
    return new LanguageSupport(LRLanguage.define({ name: langName, parser: patched }), lang.support || []);
  }
  return lang;
}

export async function getLanguageExtension(filename: string): Promise<Extension> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // Note: @codemirror/lang-angular is intentionally not in this switch
  // because it's meant for inline Angular templates inside .ts files.

  // 1. Exact filename match for dotfiles and extensionless config files.
  //    Handles cases where Path.extension() is useless:
  //      - ".gitignore" → ext "gitignore" (not in the extension map)
  //      - ".env"        → ext "env" (happens to match, but also covered here for clarity)
  const basename = filename.split(/[\\/]/).pop() || filename;

  // Shared lazy loaders (avoids duplicating the same dynamic import per entry).
  const loadProps      = async () => { const { properties } = await import('@codemirror/legacy-modes/mode/properties'); return StreamLanguage.define(properties); };
  const loadShell      = async () => { const { shell }      = await import('@codemirror/legacy-modes/mode/shell');      return StreamLanguage.define(shell);      };
  const loadJson       = async () => { const { json }        = await import('@codemirror/lang-json');                    return json();                             };
  const loadDockerfile = async () => { const { dockerFile }  = await import('@codemirror/legacy-modes/mode/dockerfile'); return StreamLanguage.define(dockerFile);  };

  const filenameMap: Record<string, () => Promise<Extension>> = {
    // .env variants → properties/INI highlighter
    '.env':                   loadProps,
    '.env.local':             loadProps,
    '.env.development':       loadProps,
    '.env.development.local': loadProps,
    '.env.test':              loadProps,
    '.env.test.local':        loadProps,
    '.env.production':        loadProps,
    '.env.production.local':  loadProps,
    '.env.staging':           loadProps,
    '.env.example':           loadProps,
    '.env.sample':            loadProps,
    // git / vcs ignore files — shell highlighting handles # comments + globs
    '.gitignore':       loadShell,
    '.npmignore':       loadShell,
    '.dockerignore':    loadShell,
    '.prettierignore':  loadShell,
    '.eslintignore':    loadShell,
    '.stylelintignore': loadShell,
    // git metadata
    '.gitattributes':  loadProps,
    '.gitmodules':     loadProps,
    // editor / tool config
    '.editorconfig':  loadProps,
    '.babelrc':       loadJson,
    '.eslintrc':      loadJson,
    '.prettierrc':    loadJson,
    '.stylelintrc':   loadJson,
    // shell rc/profile
    '.bashrc':       loadShell,
    '.bash_profile': loadShell,
    '.bash_aliases': loadShell,
    '.zshrc':        loadShell,
    '.zprofile':     loadShell,
    '.profile':      loadShell,
    // Dockerfile variants
    'Dockerfile':    loadDockerfile,
    'dockerfile':    loadDockerfile,
    // Makefile variants (shell highlighting works well for make syntax)
    'Makefile':    loadShell,
    'makefile':    loadShell,
    'GNUmakefile': loadShell,
    // --- Lock files ---
    // bun.lock: Bun uses a JSON-based lockfile format
    'bun.lock':       loadJson,
    // composer.lock: PHP Composer → JSON
    'composer.lock':  loadJson,
    // Cargo.lock / poetry.lock / Pipfile → TOML
    'Cargo.lock':  async () => { const { toml } = await import('@codemirror/legacy-modes/mode/toml'); return StreamLanguage.define(toml); },
    'poetry.lock': async () => { const { toml } = await import('@codemirror/legacy-modes/mode/toml'); return StreamLanguage.define(toml); },
    'Pipfile':     async () => { const { toml } = await import('@codemirror/legacy-modes/mode/toml'); return StreamLanguage.define(toml); },
    // yarn.lock / Gemfile.lock → yaml mode (closest approximation for indented key-value)
    'yarn.lock':    async () => { const { yaml } = await import('@codemirror/lang-yaml'); return yaml(); },
    'Gemfile.lock': async () => { const { yaml } = await import('@codemirror/lang-yaml'); return yaml(); },
    // requirements.txt / constraints.txt → properties (pkg==ver, # comments)
    'requirements.txt':  loadProps,
    'constraints.txt':   loadProps,
    // --- Ruby-based config files ---
    // Gemfile / Vagrantfile / Brewfile → Ruby syntax
    'Gemfile':     async () => { const { ruby } = await import('@codemirror/legacy-modes/mode/ruby'); return StreamLanguage.define(ruby); },
    'Vagrantfile': async () => { const { ruby } = await import('@codemirror/legacy-modes/mode/ruby'); return StreamLanguage.define(ruby); },
    'Brewfile':    async () => { const { ruby } = await import('@codemirror/legacy-modes/mode/ruby'); return StreamLanguage.define(ruby); },
    // Rakefile → Ruby
    'Rakefile':    async () => { const { ruby } = await import('@codemirror/legacy-modes/mode/ruby'); return StreamLanguage.define(ruby); },
    // Jenkinsfile → Groovy
    'Jenkinsfile': async () => { const { groovy } = await import('@codemirror/legacy-modes/mode/groovy'); return StreamLanguage.define(groovy); },
    // Procfile → properties (KEY: command)
    'Procfile': loadProps,
  };

  if (basename in filenameMap) return filenameMap[basename]();

  // 2. Extension-based detection.
  switch (ext) {
    case 'js': case 'mjs': case 'cjs': case 'jsx': case 'ts': case 'mts': case 'cts': case 'tsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true, typescript: ext.includes('ts') });
    }
    case 'py': case 'pyw': case 'pyi': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'rs': {
      const { rust } = await import('@codemirror/lang-rust');
      return rust();
    }
    case 'c': case 'h': case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hh': case 'hxx': case 'ino': {
      const { cpp } = await import('@codemirror/lang-cpp');
      return cpp();
    }
    case 'java': {
      const { java } = await import('@codemirror/lang-java');
      return java();
    }
    case 'html': case 'htm': case 'xhtml': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'less': {
      const { less } = await import('@codemirror/lang-less');
      return less();
    }
    case 'sass': case 'scss': {
      const { sass } = await import('@codemirror/lang-sass');
      return sass({ indented: ext === 'sass' });
    }
    case 'json': case 'jsonc': case 'json5': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'xml': case 'xsd': case 'xsl': case 'svg': case 'plist': {
      const { xml } = await import('@codemirror/lang-xml');
      return xml();
    }
    case 'md': case 'markdown': case 'mdx': {
      const [{ markdown, markdownLanguage }, { LanguageDescription, LanguageSupport }] = await Promise.all([
        import('@codemirror/lang-markdown'),
        import('@codemirror/language'),
      ]);
      
      // Instead of a hardcoded list, we dynamically load ANY language Notron supports
      // by intercepting the tag and calling getLanguageExtension recursively!
      const codeLanguages = (info: string) => {
        const lang = info.trim().split(/\s+/)[0].toLowerCase();
        if (!lang) return null;
        
        // Map common full language names to their primary extension so the switch 
        // statement in getLanguageExtension can match them.
        const aliasMap: Record<string, string> = {
          javascript: 'js', typescript: 'ts', python: 'py', ruby: 'rb', 
          rust: 'rs', shell: 'sh', bash: 'sh', zsh: 'sh', csharp: 'cs', 
          fsharp: 'fs', cplusplus: 'cpp', golang: 'go', markdown: 'md', 
          yaml: 'yml', dockerfile: 'dockerfile'
        };
        const searchExt = aliasMap[lang] || lang;

        return LanguageDescription.of({
          name: lang,
          load: async () => {
            // Recursive call to our own language detector!
            const ext = await getLanguageExtension(`dummy.${searchExt}`);
            
            if (Array.isArray(ext) && ext.length === 0) {
              throw new Error(`Language ${lang} not found`);
            }
            
            // Normalize the return to LanguageSupport, as LanguageDescription requires it.
            if (ext && (ext as any).language) {
              return ext as any; // It's already a LanguageSupport (e.g. javascript())
            }
            if (ext && (ext as any).parser) {
              return new LanguageSupport(ext as any); // It's a StreamLanguage (legacy) or LRLanguage
            }
            
            throw new Error(`Cannot convert extension to LanguageSupport for ${lang}`);
          }
        });
      };

      return markdown({ base: markdownLanguage, codeLanguages });
    }
    case 'sql': {
      const { sql } = await import('@codemirror/lang-sql');
      return sql();
    }
    case 'php': case 'phtml': {
      const { php } = await import('@codemirror/lang-php');
      return php();
    }
    case 'go': {
      const { go } = await import('@codemirror/lang-go');
      return go();
    }
    case 'yaml': case 'yml': {
      const { yaml } = await import('@codemirror/lang-yaml');
      return yaml();
    }
    case 'vue': {
      const { vue } = await import('@codemirror/lang-vue');
      return vue();
    }
    case 'liquid': {
      const { liquid } = await import('@codemirror/lang-liquid');
      return liquid();
    }
    case 'jinja': case 'jinja2': case 'j2': {
      const { jinja } = await import('@codemirror/lang-jinja');
      return jinja();
    }
    case 'wat': case 'wast': {
      const { wast } = await import('@codemirror/lang-wast');
      return wast();
    }
    case 'svelte': {
      const { svelte } = await import('codemirror-lang-svelte');
      return svelte();
    }
    case 'grammar': {
      const { lezer } = await import('@codemirror/lang-lezer');
      return lezer();
    }
    case 'ex': case 'exs': {
      const { elixir } = await import('codemirror-lang-elixir');
      return elixir();
    }
    // .pyx = Cython — Python is the closest highlighter
    case 'pyx': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }


    case 'astro': {
      const { astro } = await import('@fazelstudio/codemirror-lang-astro');
      return astro();
    }
    case 'prisma': {
      const { prisma } = await import('@fazelstudio/codemirror-lang-prisma');
      return prisma();
    }
    case 'bib': {
      const { bibtex } = await import('@citedrive/codemirror-lang-bibtex');
      return bibtex();
    }
    case 'gs': {
      const { golfScript } = await import('codemirror-lang-golfscript');
      return patchFold(golfScript(), { Block: foldInside }, 'golfscript');
    }
    case 'dot': case 'gv': {
      const { dot } = await import('cm-lang-dot');
      return patchFold(dot(), { GraphBody: foldInside }, 'dot');
    }
    case 'hbs': case 'handlebars': {
      const { handlebarsLanguage } = await import('@xiechao/codemirror-lang-handlebars');
      const lang = handlebarsLanguage.configure({ props: [foldNodeProp.add({ BlockStatement: foldInside })] });
      return new LanguageSupport(LRLanguage.define({ name: 'handlebars', parser: lang.parser }));
    }
    case 'hcl': case 'tf': case 'tfvars': {
      const { hcl } = await import('codemirror-lang-hcl');
      return hcl();
    }
    case 'ijs': {
      const { j } = await import('codemirror-lang-j');
      return patchFold(j(), { Block: foldInside }, 'j');
    }
    case 'janet': {
      const { janet } = await import('codemirror-lang-janet');
      return janet();
    }
    case 'jl': {
      const { julia } = await import('@plutojl/lang-julia');
      return patchFold(julia(), { Block: foldInside, ForStatement: foldInside, FunctionDefinition: foldInside, IfStatement: foldInside }, 'julia');
    }
    case 'mustache': {
      const { parser } = await import('@grumptech/lezer-mustache');
      const lang = LRLanguage.define({
        name: 'mustache',
        parser: parser.configure({ props: [foldNodeProp.add({ Section: foldInside })] })
      });
      return new LanguageSupport(lang);
    }
    case 'pkl': {
      const { pkl } = await import('codemirror-lang-pkl');
      return pkl();
    }
    case 'rq': case 'sparql': {
      const { sparql } = await import('codemirror-lang-sparql');
      return sparql();
    }
    case 'wgsl': {
      const { wgsl } = await import('@iizukak/codemirror-lang-wgsl');
      return patchFold(wgsl(), { CompoundStatement: foldInside, StructBodyDeclaration: foldInside }, 'wgsl');
    }
    case 'graphql': case 'gql': {
      const { graphqlLanguage } = await import('cm6-graphql');
      return new LanguageSupport(graphqlLanguage);
    }
    case 'zig': {
      const { parser } = await import('@ndim/lezer-zig');
      const patchedParser = parser.configure({ 
        props: [foldNodeProp.add({ Block: foldInside, ContainerBlock: foldInside, SwitchBlock: foldInside, ErrBlock: foldInside })] 
      });
      return new LanguageSupport(LRLanguage.define({ name: 'zig', parser: patchedParser }));
    }
    // NOTE: 'fs' is intentionally removed from this case — .fs belongs to F#,
    // not GLSL. GLSL shaders typically use .vert/.frag/.glsl/.vs only.
    case 'glsl': case 'vert': case 'frag': case 'vs': {
      const { glsl } = await import('codemirror-lang-glsl');
      return glsl();
    }
    case 'nix': {
      const { nix } = await import('@replit/codemirror-lang-nix');
      return nix();
    }
    case 'gleam': {
      const { gleam } = await import('@exercism/codemirror-lang-gleam');
      return gleam();
    }
    case 'csharp': case 'cs': {
      const { csharp } = await import('@replit/codemirror-lang-csharp');
      return csharp();
    }
    case 'solidity': case 'sol': {
      const { solidity } = await import('@fazelstudio/codemirror-lang-solidity');
      return solidity();
    }
    case 'clojure': case 'clj': case 'cljs': case 'cljc': case 'edn': {
      const { clojure } = await import('@nextjournal/lang-clojure');
      return clojure();
    }
  
    // --- Legacy Modes ---
    case 'sh': case 'bash': case 'zsh': case 'fish': {
      const { shell } = await import('@codemirror/legacy-modes/mode/shell');
      return StreamLanguage.define(shell);
    }
    case 'rb': case 'erb': case 'rake': case 'gemspec': {
      const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
      return StreamLanguage.define(ruby);
    }
    case 'lua': {
      const { lua } = await import('@codemirror/legacy-modes/mode/lua');
      return StreamLanguage.define(lua);
    }
    case 'pl': case 'pm': {
      const { perl } = await import('@codemirror/legacy-modes/mode/perl');
      return StreamLanguage.define(perl);
    }
    case 'ps1': case 'psm1': case 'psd1': {
      const { powerShell } = await import('@codemirror/legacy-modes/mode/powershell');
      return StreamLanguage.define(powerShell);
    }
    case 'dockerfile': {
      const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile');
      return StreamLanguage.define(dockerFile);
    }
    case 'toml': {
      const { toml } = await import('@codemirror/legacy-modes/mode/toml');
      return StreamLanguage.define(toml);
    }
    case 'ini': case 'cfg': case 'properties': case 'env': {
      const { properties } = await import('@codemirror/legacy-modes/mode/properties');
      return StreamLanguage.define(properties);
    }
    case 'diff': case 'patch': {
      const { diff } = await import('@codemirror/legacy-modes/mode/diff');
      return StreamLanguage.define(diff);
    }
    case 'cmake': {
      const { cmake } = await import('@codemirror/legacy-modes/mode/cmake');
      return StreamLanguage.define(cmake);
    }
    case 'kt': case 'kts': case 'kl': {
      const { kotlin } = await import('@fazelstudio/codemirror-lang-kotlin');
      return kotlin();
    }
    case 'scala': case 'sc': {
      const { scala } = await import('@codemirror/legacy-modes/mode/clike');
      return StreamLanguage.define(scala);
    }
    case 'm': case 'mm': {
      const { objectiveC } = await import('@codemirror/legacy-modes/mode/clike');
      return StreamLanguage.define(objectiveC);
    }
    case 'dart': {
      const { dart } = await import('@codemirror/legacy-modes/mode/clike');
      return StreamLanguage.define(dart);
    }
    case 'swift': {
      const { swift } = await import('@fazelstudio/codemirror-lang-swift');
      return swift();
    }
    case 'r': {
      const { r } = await import('codemirror-lang-r');
      return r();
    }
    case 'pas': case 'pp': {
      const { pascal } = await import('@codemirror/legacy-modes/mode/pascal');
      return StreamLanguage.define(pascal);
    }
    case 'hs': {
      const { haskell } = await import('@codemirror/legacy-modes/mode/haskell');
      return StreamLanguage.define(haskell);
    }
    case 'erl': case 'hrl': {
      const { erlang } = await import('@codemirror/legacy-modes/mode/erlang');
      return StreamLanguage.define(erlang);
    }
    case 'groovy': case 'gradle': {
      const { groovy } = await import('@codemirror/legacy-modes/mode/groovy');
      return StreamLanguage.define(groovy);
    }
    // .fs is F# (now that GLSL no longer claims it)
    case 'fs': case 'fsi': case 'fsx': {
      const { fSharp } = await import('@codemirror/legacy-modes/mode/mllike');
      return StreamLanguage.define(fSharp);
    }
    case 'ml': case 'mli': {
      const { oCaml } = await import('@codemirror/legacy-modes/mode/mllike');
      return StreamLanguage.define(oCaml);
    }
    case 'nginx': case 'conf': {
      const { nginx } = await import('@codemirror/legacy-modes/mode/nginx');
      return StreamLanguage.define(nginx);
    }
    case 'proto': {
      const { protobuf } = await import('@codemirror/legacy-modes/mode/protobuf');
      return StreamLanguage.define(protobuf);
    }
    case 'pug': case 'jade': {
      const { pug } = await import('@codemirror/legacy-modes/mode/pug');
      return StreamLanguage.define(pug);
    }
    case 'styl': case 'stylus': {
      const { stylus } = await import('@codemirror/legacy-modes/mode/stylus');
      return StreamLanguage.define(stylus);
    }
    case 'tex': case 'sty': case 'cls': {
      const { stex } = await import('@codemirror/legacy-modes/mode/stex');
      return StreamLanguage.define(stex);
    }
    default:
      return [];
  }
}

export function formatLanguageName(lang: string): string {
  const overrides: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    cpp: 'C++',
    csharp: 'C#',
    fsharp: 'F#',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    xml: 'XML',
    sql: 'SQL',
    php: 'PHP',
    yaml: 'YAML',
    toml: 'TOML',
    markdown: 'Markdown',
    svelte: 'Svelte',
    prisma: 'Prisma',
    astro: 'Astro',
    vue: 'Vue',
    dockerfile: 'Dockerfile',
    powershell: 'PowerShell',
    'objective-c': 'Objective-C',
    ocaml: 'OCaml',
    sass: 'Sass',
    less: 'Less',
    go: 'Go',
    lezer: 'Lezer',
    elixir: 'Elixir',
    nix: 'Nix',
    gleam: 'Gleam',
    shell: 'Shell Script',
    ruby: 'Ruby',
    lua: 'Lua',
    perl: 'Perl',
    properties: 'Properties/INI',
    diff: 'Diff',
    cmake: 'CMake',
    solidity: 'Solidity',
    kotlin: 'Kotlin',
    clojure: 'Clojure',
    erlang: 'Erlang',
    groovy: 'Groovy',
    nginx: 'Nginx',
    protobuf: 'Protobuf',
    pug: 'Pug',
    stylus: 'Stylus',
    latex: 'LaTeX',
    bibtex: 'BibTeX',
    golfscript: 'GolfScript',
    dot: 'Graphviz DOT',
    handlebars: 'Handlebars',
    hcl: 'HCL / Terraform',
    j: 'J',
    janet: 'Janet',
    julia: 'Julia',
    mustache: 'Mustache',
    pkl: 'Pkl',
    sparql: 'SPARQL',
    wgsl: 'WGSL',
    graphql: 'GraphQL',
    zig: 'Zig',
    glsl: 'GLSL'
  };
  return overrides[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
}
