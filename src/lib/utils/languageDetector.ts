/**
 * Language Detector
 *
 * Utility helpers for language detector.
 */

import type { Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { languageRegistry } from '../editor/languageRegistry';
import { foldInside, foldNodeProp, LRLanguage, LanguageSupport } from '@codemirror/language';
import langMap from '../constants/languages.json';

// Extension → lang name reverse map (built from languages.json at import time)
// languages.json is the single source of truth for extension mapping;
// Rust's file_ops.rs uses the same file via include_str!().
const EXT_TO_LANG: Record<string, string> = {};
for (const [lang, exts] of Object.entries(langMap)) {
  for (const ext of exts as string[]) {
    EXT_TO_LANG[ext] = lang;
  }
}

// Exact basename → lang name (dotfiles / extensionless config files)
// These cannot live in languages.json because they are matched by full filename,
// not by extension. Note: @codemirror/lang-angular is intentionally absent
// it's for inline Angular templates inside .ts files, not standalone files.
const FILENAME_TO_LANG: Record<string, string> = {
  // .env variants → properties/INI
  '.env':                   'properties',
  '.env.local':             'properties',
  '.env.development':       'properties',
  '.env.development.local': 'properties',
  '.env.test':              'properties',
  '.env.test.local':        'properties',
  '.env.production':        'properties',
  '.env.production.local':  'properties',
  '.env.staging':           'properties',
  '.env.example':           'properties',
  '.env.sample':            'properties',
  // vcs ignore files — shell (#-comments + globs)
  '.gitignore':       'shell',
  '.npmignore':       'shell',
  '.dockerignore':    'shell',
  '.prettierignore':  'shell',
  '.eslintignore':    'shell',
  '.stylelintignore': 'shell',
  // git metadata
  '.gitattributes': 'properties',
  '.gitmodules':    'properties',
  // editor / tool config
  '.editorconfig': 'properties',
  '.babelrc':      'json',
  '.eslintrc':     'json',
  '.prettierrc':   'json',
  '.stylelintrc':  'json',
  // shell rc / profile
  '.bashrc':       'shell',
  '.bash_profile': 'shell',
  '.bash_aliases': 'shell',
  '.zshrc':        'shell',
  '.zprofile':     'shell',
  '.profile':      'shell',
  // Dockerfile variants
  'Dockerfile':  'dockerfile',
  'dockerfile':  'dockerfile',
  // Makefile variants
  'Makefile':    'shell',
  'makefile':    'shell',
  'GNUmakefile': 'shell',
  // Lock files
  'bun.lock':      'json',
  'composer.lock': 'json',
  'Cargo.lock':    'toml',
  'poetry.lock':   'toml',
  'Pipfile':       'toml',
  'yarn.lock':     'yaml',
  'Gemfile.lock':  'yaml',
  'requirements.txt': 'properties',
  'constraints.txt':  'properties',
  // Ruby-based config
  'Gemfile':     'ruby',
  'Vagrantfile': 'ruby',
  'Brewfile':    'ruby',
  'Rakefile':    'ruby',
  // Groovy
  'Jenkinsfile': 'groovy',
  // Procfile
  'Procfile': 'properties',
};

// Aliases for Markdown code fence language labels
// Maps fence tags that differ from LANG_LOADERS keys to their canonical key.
const MARKDOWN_LANG_ALIAS: Record<string, string> = {
  bash:       'shell',
  sh:         'shell',
  zsh:        'shell',
  golang:     'go',
  'c++':      'cpp',
  cplusplus:  'cpp',
  dockerfile: 'dockerfile',
};

// Fold-patch helper for community packages without built-in fold support
function patchFold(lang: any, nodeMap: any, langName: string) {
  if (lang.language?.parser) {
    const patched = lang.language.parser.configure({ props: [foldNodeProp.add(nodeMap)] });
    return new LanguageSupport(LRLanguage.define({ name: langName, parser: patched }), lang.support ?? []);
  }
  return lang;
}

// Language loader registry
// Keys MUST match the lang names used in languages.json.
// Each loader receives the original file extension for ext-sensitive configs
// (e.g. sass vs scss, haxe vs hxml, verilog vs tlv).
// To add a new language: add extension(s) to languages.json + one entry here.
// To add a new extension for an existing language: only languages.json needs updating.
type Loader = (ext: string) => Promise<Extension>;

const LANG_LOADERS: Record<string, Loader> = {

 // Dedicated first-party / community packages

  javascript: async () => {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ jsx: true, typescript: false });
  },
  typescript: async () => {
    // TypeScript shares the same package — typescript flag differentiates them
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ jsx: true, typescript: true });
  },
  python: async () => {
    const { python } = await import('@codemirror/lang-python');
    return python();
  },
  rust: async () => {
    const { rust } = await import('@codemirror/lang-rust');
    return rust();
  },
  c: async () => {
    const { c } = await import('@fazelstudio/codemirror-lang-c');
    return c();
  },
  cpp: async () => {
    const { cpp } = await import('@codemirror/lang-cpp');
    return cpp();
  },
  java: async () => {
    const { java } = await import('@codemirror/lang-java');
    return java();
  },
  html: async () => {
    const { html } = await import('@codemirror/lang-html');
    return html();
  },
  css: async () => {
    const { css } = await import('@codemirror/lang-css');
    return css();
  },
  less: async () => {
    const { less } = await import('@codemirror/lang-less');
    return less();
  },
  sass: async (ext) => {
    // .sass = indented syntax; .scss = CSS-like syntax
    const { sass } = await import('@codemirror/lang-sass');
    return sass({ indented: ext === 'sass' });
  },
  json: async () => {
    const { json } = await import('@codemirror/lang-json');
    return json();
  },
  xml: async () => {
    const { xml } = await import('@codemirror/lang-xml');
    return xml();
  },
  markdown: async () => {
    const [
      { markdown, markdownLanguage },
      { LanguageDescription, LanguageSupport: LS },
    ] = await Promise.all([
      import('@codemirror/lang-markdown'),
      import('@codemirror/language'),
    ]);

    // Instead of routing through a dummy filename, query LANG_LOADERS directly
    // by the fence tag name, which already matches our lang key convention.
    const codeLanguages = (info: string) => {
      const rawName = info.trim().split(/\s+/)[0].toLowerCase();
      if (!rawName) return null;
      const langName = MARKDOWN_LANG_ALIAS[rawName] ?? rawName;
      if (!LANG_LOADERS[langName]) return null;

      return LanguageDescription.of({
        name: rawName,
        load: async () => {
          const loaded = await LANG_LOADERS[langName](langName);
          if (loaded && (loaded as any).language) return loaded as any;
          if (loaded && (loaded as any).parser) return new LS(loaded as any);
          throw new Error(`Cannot convert to LanguageSupport for "${langName}"`);
        },
      });
    };

    return markdown({ base: markdownLanguage, codeLanguages });
  },
  sql: async () => {
    const { sql } = await import('@codemirror/lang-sql');
    return sql();
  },
  php: async () => {
    const { php } = await import('@codemirror/lang-php');
    return php();
  },
  go: async () => {
    const { go } = await import('@codemirror/lang-go');
    return go();
  },
  yaml: async () => {
    const { yaml } = await import('@codemirror/lang-yaml');
    return yaml();
  },
  vue: async () => {
    const { vue } = await import('@codemirror/lang-vue');
    return vue();
  },
  liquid: async () => {
    const { liquid } = await import('@codemirror/lang-liquid');
    return liquid();
  },
  jinja: async () => {
    const { jinja } = await import('@codemirror/lang-jinja');
    return jinja();
  },
  wast: async () => {
    const { wast } = await import('@codemirror/lang-wast');
    return wast();
  },
  svelte: async () => {
    const { svelte } = await import('codemirror-lang-svelte');
    return svelte();
  },
  lezer: async () => {
    const { lezer } = await import('@codemirror/lang-lezer');
    return lezer();
  },
  elixir: async () => {
    const { elixir } = await import('codemirror-lang-elixir');
    return elixir();
  },
  nix: async () => {
    const { nix } = await import('@replit/codemirror-lang-nix');
    return nix();
  },
  prisma: async () => {
    const { prisma } = await import('@fazelstudio/codemirror-lang-prisma');
    return prisma();
  },
  astro: async () => {
    const { astro } = await import('@fazelstudio/codemirror-lang-astro');
    return astro();
  },
  bibtex: async () => {
    const { bibtex } = await import('@citedrive/codemirror-lang-bibtex');
    return bibtex();
  },
  golfscript: async () => {
    const { golfScript } = await import('codemirror-lang-golfscript');
    return patchFold(golfScript(), { Block: foldInside }, 'golfscript');
  },
  dot: async () => {
    const { dot } = await import('cm-lang-dot');
    return patchFold(dot(), { GraphBody: foldInside }, 'dot');
  },
  handlebars: async () => {
    const { handlebarsLanguage } = await import('@xiechao/codemirror-lang-handlebars');
    const lang = handlebarsLanguage.configure({ props: [foldNodeProp.add({ BlockStatement: foldInside })] });
    return new LanguageSupport(LRLanguage.define({ name: 'handlebars', parser: lang.parser }));
  },
  hcl: async () => {
    const { hcl } = await import('codemirror-lang-hcl');
    return hcl();
  },
  j: async () => {
    const { j } = await import('codemirror-lang-j');
    return patchFold(j(), { Block: foldInside }, 'j');
  },
  janet: async () => {
    const { janet } = await import('codemirror-lang-janet');
    return janet();
  },
  julia: async () => {
    const { julia } = await import('@plutojl/lang-julia');
    return patchFold(julia(), {
      Block: foldInside, ForStatement: foldInside,
      FunctionDefinition: foldInside, IfStatement: foldInside,
    }, 'julia');
  },
  mustache: async () => {
    const { parser } = await import('@grumptech/lezer-mustache');
    const lang = LRLanguage.define({
      name: 'mustache',
      parser: parser.configure({ props: [foldNodeProp.add({ Section: foldInside })] }),
    });
    return new LanguageSupport(lang);
  },
  pkl: async () => {
    const { pkl } = await import('codemirror-lang-pkl');
    return pkl();
  },
  sparql: async () => {
    const { sparql } = await import('codemirror-lang-sparql');
    return sparql();
  },
  wgsl: async () => {
    const { wgsl } = await import('@iizukak/codemirror-lang-wgsl');
    return patchFold(wgsl(), { CompoundStatement: foldInside, StructBodyDeclaration: foldInside }, 'wgsl');
  },
  graphql: async () => {
    const { graphqlLanguage } = await import('cm6-graphql');
    return new LanguageSupport(graphqlLanguage);
  },
  zig: async () => {
    const { parser } = await import('@ndim/lezer-zig');
    const patchedParser = parser.configure({
      props: [foldNodeProp.add({
        Block: foldInside, ContainerBlock: foldInside,
        SwitchBlock: foldInside, ErrBlock: foldInside,
      })],
    });
    return new LanguageSupport(LRLanguage.define({ name: 'zig', parser: patchedParser }));
  },
  glsl: async () => {
    const { glsl } = await import('codemirror-lang-glsl');
    return glsl();
  },
  gleam: async () => {
    const { gleam } = await import('@exercism/codemirror-lang-gleam');
    return gleam();
  },
  csharp: async () => {
    const { csharp } = await import('@replit/codemirror-lang-csharp');
    return csharp();
  },
  solidity: async () => {
    const { solidity } = await import('@fazelstudio/codemirror-lang-solidity');
    return solidity();
  },
  clojure: async () => {
    const { clojure } = await import('@nextjournal/lang-clojure');
    return clojure();
  },
  r: async () => {
    const { r } = await import('codemirror-lang-r');
    return r();
  },
  kotlin: async () => {
    const { kotlin } = await import('@fazelstudio/codemirror-lang-kotlin');
    return kotlin();
  },
  scala: async () => {
    const { scala } = await import('@fazelstudio/codemirror-lang-scala');
    return scala();
  },
  swift: async () => {
    const { swift } = await import('@fazelstudio/codemirror-lang-swift');
    return swift();
  },
  lua: async () => {
    const { lua } = await import('@fazelstudio/codemirror-lang-lua');
    return lua();
  },
  luau: async () => {
    const { luau } = await import('@fazelstudio/codemirror-lang-luau');
    return luau();
  },

 // Legacy modes (StreamLanguage wrappers)

  shell: async () => {
    const { shell } = await import('@codemirror/legacy-modes/mode/shell');
    return StreamLanguage.define(shell);
  },
  ruby: async () => {
    const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
    return StreamLanguage.define(ruby);
  },
  perl: async () => {
    const { perl } = await import('@codemirror/legacy-modes/mode/perl');
    return StreamLanguage.define(perl);
  },
  powershell: async () => {
    const { powerShell } = await import('@codemirror/legacy-modes/mode/powershell');
    return StreamLanguage.define(powerShell);
  },
  dockerfile: async () => {
    const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile');
    return StreamLanguage.define(dockerFile);
  },
  toml: async () => {
    const { toml } = await import('@codemirror/legacy-modes/mode/toml');
    return StreamLanguage.define(toml);
  },
  properties: async () => {
    const { properties } = await import('@codemirror/legacy-modes/mode/properties');
    return StreamLanguage.define(properties);
  },
  diff: async () => {
    const { diff } = await import('@codemirror/legacy-modes/mode/diff');
    return StreamLanguage.define(diff);
  },
  cmake: async () => {
    const { cmake } = await import('@codemirror/legacy-modes/mode/cmake');
    return StreamLanguage.define(cmake);
  },
  // clike exports multiple languages; dart and objective-c each get their own entry
  'objective-c': async () => {
    const { objectiveC } = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(objectiveC);
  },
  dart: async () => {
    const { dart } = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(dart);
  },
  pascal: async () => {
    const { pascal } = await import('@codemirror/legacy-modes/mode/pascal');
    return StreamLanguage.define(pascal);
  },
  haskell: async () => {
    const { haskell } = await import('@codemirror/legacy-modes/mode/haskell');
    return StreamLanguage.define(haskell);
  },
  erlang: async () => {
    const { erlang } = await import('@codemirror/legacy-modes/mode/erlang');
    return StreamLanguage.define(erlang);
  },
  groovy: async () => {
    const { groovy } = await import('@codemirror/legacy-modes/mode/groovy');
    return StreamLanguage.define(groovy);
  },
  // mllike exports F# and OCaml — each gets its own entry keyed by lang name
  fsharp: async () => {
    const { fSharp } = await import('@codemirror/legacy-modes/mode/mllike');
    return StreamLanguage.define(fSharp);
  },
  ocaml: async () => {
    const { oCaml } = await import('@codemirror/legacy-modes/mode/mllike');
    return StreamLanguage.define(oCaml);
  },
  nginx: async () => {
    const { nginx } = await import('@codemirror/legacy-modes/mode/nginx');
    return StreamLanguage.define(nginx);
  },
  protobuf: async () => {
    const { protobuf } = await import('@codemirror/legacy-modes/mode/protobuf');
    return StreamLanguage.define(protobuf);
  },
  pug: async () => {
    const { pug } = await import('@codemirror/legacy-modes/mode/pug');
    return StreamLanguage.define(pug);
  },
  stylus: async () => {
    const { stylus } = await import('@codemirror/legacy-modes/mode/stylus');
    return StreamLanguage.define(stylus);
  },
  latex: async () => {
    const { stex } = await import('@codemirror/legacy-modes/mode/stex');
    return StreamLanguage.define(stex);
  },
  apl: async () => {
    const { apl } = await import('@codemirror/legacy-modes/mode/apl');
    return StreamLanguage.define(apl);
  },
  asciiarmor: async () => {
    const { asciiArmor } = await import('@codemirror/legacy-modes/mode/asciiarmor');
    return StreamLanguage.define(asciiArmor);
  },
  asn1: async () => {
    // asn1 is a factory function (accepts a config object), not a plain StreamParser
    const { asn1 } = await import('@codemirror/legacy-modes/mode/asn1');
    return StreamLanguage.define(asn1({}));
  },
  brainfuck: async () => {
    const { brainfuck } = await import('@codemirror/legacy-modes/mode/brainfuck');
    return StreamLanguage.define(brainfuck);
  },
  cobol: async () => {
    const { cobol } = await import('@codemirror/legacy-modes/mode/cobol');
    return StreamLanguage.define(cobol);
  },
  coffeescript: async () => {
    const { coffeeScript } = await import('@codemirror/legacy-modes/mode/coffeescript');
    return StreamLanguage.define(coffeeScript);
  },
  commonlisp: async () => {
    const { commonLisp } = await import('@codemirror/legacy-modes/mode/commonlisp');
    return StreamLanguage.define(commonLisp);
  },
  crystal: async () => {
    const { crystal } = await import('@codemirror/legacy-modes/mode/crystal');
    return StreamLanguage.define(crystal);
  },
  cypher: async () => {
    const { cypher } = await import('@codemirror/legacy-modes/mode/cypher');
    return StreamLanguage.define(cypher);
  },
  d: async () => {
    const { d } = await import('@codemirror/legacy-modes/mode/d');
    return StreamLanguage.define(d);
  },
  dtd: async () => {
    const { dtd } = await import('@codemirror/legacy-modes/mode/dtd');
    return StreamLanguage.define(dtd);
  },
  dylan: async () => {
    const { dylan } = await import('@codemirror/legacy-modes/mode/dylan');
    return StreamLanguage.define(dylan);
  },
  ebnf: async () => {
    const { ebnf } = await import('@codemirror/legacy-modes/mode/ebnf');
    return StreamLanguage.define(ebnf);
  },
  ecl: async () => {
    const { ecl } = await import('@codemirror/legacy-modes/mode/ecl');
    return StreamLanguage.define(ecl);
  },
  eiffel: async () => {
    const { eiffel } = await import('@codemirror/legacy-modes/mode/eiffel');
    return StreamLanguage.define(eiffel);
  },
  elm: async () => {
    const { elm } = await import('@codemirror/legacy-modes/mode/elm');
    return StreamLanguage.define(elm);
  },
  factor: async () => {
    const { factor } = await import('@codemirror/legacy-modes/mode/factor');
    return StreamLanguage.define(factor);
  },
  fcl: async () => {
    const { fcl } = await import('@codemirror/legacy-modes/mode/fcl');
    return StreamLanguage.define(fcl);
  },
  forth: async () => {
    const { forth } = await import('@codemirror/legacy-modes/mode/forth');
    return StreamLanguage.define(forth);
  },
  fortran: async () => {
    const { fortran } = await import('@codemirror/legacy-modes/mode/fortran');
    return StreamLanguage.define(fortran);
  },
  gas: async () => {
    const { gas } = await import('@codemirror/legacy-modes/mode/gas');
    return StreamLanguage.define(gas);
  },
  gherkin: async () => {
    const { gherkin } = await import('@codemirror/legacy-modes/mode/gherkin');
    return StreamLanguage.define(gherkin);
  },
  haxe: async (ext) => {
    // haxe mode bundles two parsers: haxe (.hx) and hxml (.hxml)
    if (ext === 'hxml') {
      const { hxml } = await import('@codemirror/legacy-modes/mode/haxe');
      return StreamLanguage.define(hxml);
    }
    const { haxe } = await import('@codemirror/legacy-modes/mode/haxe');
    return StreamLanguage.define(haxe);
  },
  http: async () => {
    const { http } = await import('@codemirror/legacy-modes/mode/http');
    return StreamLanguage.define(http);
  },
  idl: async () => {
    const { idl } = await import('@codemirror/legacy-modes/mode/idl');
    return StreamLanguage.define(idl);
  },
  livescript: async () => {
    const { liveScript } = await import('@codemirror/legacy-modes/mode/livescript');
    return StreamLanguage.define(liveScript);
  },
  mathematica: async () => {
    const { mathematica } = await import('@codemirror/legacy-modes/mode/mathematica');
    return StreamLanguage.define(mathematica);
  },
  mbox: async () => {
    const { mbox } = await import('@codemirror/legacy-modes/mode/mbox');
    return StreamLanguage.define(mbox);
  },
  mirc: async () => {
    const { mirc } = await import('@codemirror/legacy-modes/mode/mirc');
    return StreamLanguage.define(mirc);
  },
  modelica: async () => {
    const { modelica } = await import('@codemirror/legacy-modes/mode/modelica');
    return StreamLanguage.define(modelica);
  },
  mscgen: async () => {
    const { mscgen } = await import('@codemirror/legacy-modes/mode/mscgen');
    return StreamLanguage.define(mscgen);
  },
  nsis: async () => {
    const { nsis } = await import('@codemirror/legacy-modes/mode/nsis');
    return StreamLanguage.define(nsis);
  },
  ntriples: async () => {
    const { ntriples } = await import('@codemirror/legacy-modes/mode/ntriples');
    return StreamLanguage.define(ntriples);
  },
  oz: async () => {
    const { oz } = await import('@codemirror/legacy-modes/mode/oz');
    return StreamLanguage.define(oz);
  },
  pegjs: async () => {
    const { pegjs } = await import('@codemirror/legacy-modes/mode/pegjs');
    return StreamLanguage.define(pegjs);
  },
  pig: async () => {
    const { pig } = await import('@codemirror/legacy-modes/mode/pig');
    return StreamLanguage.define(pig);
  },
  puppet: async () => {
    const { puppet } = await import('@codemirror/legacy-modes/mode/puppet');
    return StreamLanguage.define(puppet);
  },
  q: async () => {
    const { q } = await import('@codemirror/legacy-modes/mode/q');
    return StreamLanguage.define(q);
  },
  rpm: async () => {
    const { rpmSpec } = await import('@codemirror/legacy-modes/mode/rpm');
    return StreamLanguage.define(rpmSpec);
  },
  sas: async () => {
    const { sas } = await import('@codemirror/legacy-modes/mode/sas');
    return StreamLanguage.define(sas);
  },
  scheme: async () => {
    const { scheme } = await import('@codemirror/legacy-modes/mode/scheme');
    return StreamLanguage.define(scheme);
  },
  sieve: async () => {
    const { sieve } = await import('@codemirror/legacy-modes/mode/sieve');
    return StreamLanguage.define(sieve);
  },
  smalltalk: async () => {
    const { smalltalk } = await import('@codemirror/legacy-modes/mode/smalltalk');
    return StreamLanguage.define(smalltalk);
  },
  tcl: async () => {
    const { tcl } = await import('@codemirror/legacy-modes/mode/tcl');
    return StreamLanguage.define(tcl);
  },
  textile: async () => {
    const { textile } = await import('@codemirror/legacy-modes/mode/textile');
    return StreamLanguage.define(textile);
  },
  tiddlywiki: async () => {
    const { tiddlyWiki } = await import('@codemirror/legacy-modes/mode/tiddlywiki');
    return StreamLanguage.define(tiddlyWiki);
  },
  troff: async () => {
    const { troff } = await import('@codemirror/legacy-modes/mode/troff');
    return StreamLanguage.define(troff);
  },
  ttcn: async () => {
    const { ttcn } = await import('@codemirror/legacy-modes/mode/ttcn');
    return StreamLanguage.define(ttcn);
  },
  'ttcn-cfg': async () => {
    const { ttcnCfg } = await import('@codemirror/legacy-modes/mode/ttcn-cfg');
    return StreamLanguage.define(ttcnCfg);
  },
  turtle: async () => {
    const { turtle } = await import('@codemirror/legacy-modes/mode/turtle');
    return StreamLanguage.define(turtle);
  },
  vb: async () => {
    const { vb } = await import('@codemirror/legacy-modes/mode/vb');
    return StreamLanguage.define(vb);
  },
  vbscript: async () => {
    const { vbScript } = await import('@codemirror/legacy-modes/mode/vbscript');
    return StreamLanguage.define(vbScript);
  },
  velocity: async () => {
    const { velocity } = await import('@codemirror/legacy-modes/mode/velocity');
    return StreamLanguage.define(velocity);
  },
  verilog: async (ext) => {
    // verilog mode bundles two parsers: verilog and tlv (TL-Verilog)
    if (ext === 'tlv') {
      const { tlv } = await import('@codemirror/legacy-modes/mode/verilog');
      return StreamLanguage.define(tlv);
    }
    const { verilog } = await import('@codemirror/legacy-modes/mode/verilog');
    return StreamLanguage.define(verilog);
  },
  vhdl: async () => {
    const { vhdl } = await import('@codemirror/legacy-modes/mode/vhdl');
    return StreamLanguage.define(vhdl);
  },
  webidl: async () => {
    const { webIDL } = await import('@codemirror/legacy-modes/mode/webidl');
    return StreamLanguage.define(webIDL);
  },
  xquery: async () => {
    const { xQuery } = await import('@codemirror/legacy-modes/mode/xquery');
    return StreamLanguage.define(xQuery);
  },
  yacas: async () => {
    const { yacas } = await import('@codemirror/legacy-modes/mode/yacas');
    return StreamLanguage.define(yacas);
  },
  z80: async () => {
    const { z80 } = await import('@codemirror/legacy-modes/mode/z80');
    return StreamLanguage.define(z80);
  },
};

// Public API

// Every loader is published as a language contribution so the language
// registry is the single lookup path for loading a language. Adding a
// language stays one entry in languages.json + one loader here.
for (const [id, load] of Object.entries(LANG_LOADERS)) {
  languageRegistry.register({
    id,
    extensions: [...(((langMap as Record<string, string[]>)[id]) ?? [])],
    load: (ext) => load(ext)
  });
}

async function loadLanguage(langId: string, ext: string): Promise<Extension | null> {
  const contrib = languageRegistry.get(langId);
  if (!contrib) return null;
  return (await contrib.load(ext)) as Extension;
}

export async function getLanguageExtension(filename: string): Promise<Extension> {
  const basename = filename.split(/[\\\/]/).pop() ?? filename;
  const ext = basename.includes('.') ? basename.split('.').pop()!.toLowerCase() : '';

  // 1. Exact filename match (dotfiles, lock files, extensionless config files)
  const filenameLang = FILENAME_TO_LANG[basename];
  if (filenameLang) {
    const loaded = await loadLanguage(filenameLang, ext);
    if (loaded) return loaded;
  }

  // 2. Extension → lang name via languages.json reverse map, then load
  const lang = EXT_TO_LANG[ext];
  if (lang) {
    const loaded = await loadLanguage(lang, ext);
    if (loaded) return loaded;
  }

  return [];
}

export function formatLanguageName(lang: string): string {
  const overrides: Record<string, string> = {
    // Core
    c: 'C', javascript: 'JavaScript', typescript: 'TypeScript',
    cpp: 'C++', csharp: 'C#', fsharp: 'F#',
    html: 'HTML', css: 'CSS', json: 'JSON', xml: 'XML',
    sql: 'SQL', php: 'PHP', yaml: 'YAML', toml: 'TOML', markdown: 'Markdown',
    // Frameworks / tools
    svelte: 'Svelte', prisma: 'Prisma', astro: 'Astro', vue: 'Vue',
    dockerfile: 'Dockerfile', powershell: 'PowerShell',
    'objective-c': 'Objective-C', ocaml: 'OCaml',
    sass: 'Sass', less: 'Less', go: 'Go', lezer: 'Lezer',
    elixir: 'Elixir', nix: 'Nix', gleam: 'Gleam',
    shell: 'Shell Script', ruby: 'Ruby', lua: 'Lua', luau: 'Luau', perl: 'Perl',
    properties: 'Properties / INI', diff: 'Diff', cmake: 'CMake',
    solidity: 'Solidity', kotlin: 'Kotlin', clojure: 'Clojure',
    erlang: 'Erlang', groovy: 'Groovy', nginx: 'Nginx',
    protobuf: 'Protobuf', pug: 'Pug', stylus: 'Stylus',
    latex: 'LaTeX', bibtex: 'BibTeX',
    golfscript: 'GolfScript', dot: 'Graphviz DOT',
    handlebars: 'Handlebars', hcl: 'HCL / Terraform',
    j: 'J', janet: 'Janet', julia: 'Julia',
    mustache: 'Mustache', pkl: 'Pkl', sparql: 'SPARQL',
    wgsl: 'WGSL', graphql: 'GraphQL', zig: 'Zig', glsl: 'GLSL',
    // Legacy modes
    apl: 'APL', asciiarmor: 'ASCII Armor (PGP)', asn1: 'ASN.1',
    brainfuck: 'Brainfuck', cobol: 'COBOL', coffeescript: 'CoffeeScript',
    commonlisp: 'Common Lisp', crystal: 'Crystal', cypher: 'Cypher (Neo4j)',
    d: 'D', dtd: 'DTD', dylan: 'Dylan', ebnf: 'EBNF', ecl: 'ECL',
    eiffel: 'Eiffel', elm: 'Elm', factor: 'Factor', fcl: 'FCL',
    forth: 'Forth', fortran: 'Fortran', gas: 'Assembly (GAS)',
    gherkin: 'Gherkin', haxe: 'Haxe', http: 'HTTP', idl: 'IDL',
    livescript: 'LiveScript', mathematica: 'Mathematica', mbox: 'Mbox',
    mirc: 'mIRC Script', modelica: 'Modelica', mscgen: 'Mscgen',
    nsis: 'NSIS', ntriples: 'N-Triples (RDF)', oz: 'Mozart/Oz',
    pegjs: 'PEG.js', pig: 'Pig Latin', puppet: 'Puppet', q: 'Q (kdb+)',
    rpm: 'RPM Spec', sas: 'SAS', scheme: 'Scheme', sieve: 'Sieve',
    smalltalk: 'Smalltalk', tcl: 'Tcl', textile: 'Textile',
    tiddlywiki: 'TiddlyWiki', troff: 'Troff / Man Page',
    ttcn: 'TTCN-3', 'ttcn-cfg': 'TTCN-3 Config',
    turtle: 'RDF Turtle', vb: 'Visual Basic', vbscript: 'VBScript',
    velocity: 'Apache Velocity', verilog: 'Verilog', vhdl: 'VHDL',
    webidl: 'Web IDL', xquery: 'XQuery', yacas: 'Yacas', z80: 'Z80 Assembly',
  };
  return overrides[lang] ?? (lang.charAt(0).toUpperCase() + lang.slice(1));
}
