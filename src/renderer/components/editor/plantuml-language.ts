import type * as Monaco from 'monaco-editor';

export const PLANTUML_LANGUAGE_ID = 'plantuml';

/** Mots-clés structurels (déclarations et blocs). */
const KEYWORDS = [
  'abstract',
  'actor',
  'agent',
  'artifact',
  'boundary',
  'card',
  'class',
  'cloud',
  'collections',
  'component',
  'control',
  'database',
  'entity',
  'enum',
  'file',
  'folder',
  'frame',
  'interface',
  'node',
  'object',
  'package',
  'participant',
  'queue',
  'rectangle',
  'state',
  'storage',
  'usecase',
];

/** Mots-clés de contrôle (séquence, activité, états). */
const CONTROL_KEYWORDS = [
  'activate',
  'again',
  'alt',
  'also',
  'as',
  'autonumber',
  'backward',
  'break',
  'caption',
  'critical',
  'deactivate',
  'destroy',
  'detach',
  'else',
  'elseif',
  'end',
  'endif',
  'endwhile',
  'footer',
  'fork',
  'group',
  'header',
  'hide',
  'if',
  'is',
  'legend',
  'loop',
  'namespace',
  'newpage',
  'note',
  'of',
  'on',
  'opt',
  'par',
  'partition',
  'ref',
  'repeat',
  'return',
  'scale',
  'show',
  'skinparam',
  'split',
  'start',
  'stop',
  'then',
  'title',
  'together',
  'while',
];

/**
 * Coloration syntaxique PlantUML (Monarch).
 * Volontairement tolérante : PlantUML accepte beaucoup de variantes, mieux
 * vaut sous-colorer que colorer à tort du texte valide.
 */
export const plantumlMonarchLanguage: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: true,
  keywords: KEYWORDS,
  controlKeywords: CONTROL_KEYWORDS,

  tokenizer: {
    root: [
      // Directives @startuml / @enduml / @startmindmap …
      [/@(start|end)\w+/, 'keyword.directive'],

      // Préprocesseur : !define, !include, !theme …
      [/^\s*!\w+/, 'keyword.preprocessor'],

      // Commentaires
      [/'.*$/, 'comment'],
      [/\/'/, 'comment', '@blockComment'],

      // Stéréotypes <<interface>>
      [/<<[^>]*>>/, 'annotation'],

      // Couleurs (#AliceBlue, #33AA55)
      [/#[a-zA-Z0-9]+/, 'number.hex'],

      // Flèches et relations
      [/(-+|\.+)(\|>|>|\*|o|\\|\/)?/, 'operator'],
      [/(<\|?|\*|o)(-+|\.+)/, 'operator'],

      // Chaînes
      [/"/, 'string', '@string'],

      // Multiplicités et étiquettes entre crochets
      [/\[[^\]]*\]/, 'string.escape'],

      // Identifiants et mots-clés
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@controlKeywords': 'keyword.control',
            '@default': 'identifier',
          },
        },
      ],

      [/\d+/, 'number'],
      [/[{}()]/, 'delimiter.bracket'],
      [/[;,:]/, 'delimiter'],
    ],

    blockComment: [
      [/[^'/]+/, 'comment'],
      [/'\//, 'comment', '@pop'],
      [/[\/']/, 'comment'],
    ],

    string: [
      [/[^"]+/, 'string'],
      [/"/, 'string', '@pop'],
    ],
  },
};

export const plantumlLanguageConfiguration: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: "'",
    blockComment: ["/'", "'/"],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /^\s*@start\w+/,
      end: /^\s*@end\w+/,
    },
  },
};

/** Extraits de code proposés à l'autocomplétion, commentés en français. */
const SNIPPETS: Array<{ label: string; detail: string; body: string }> = [
  {
    label: 'startuml',
    detail: 'Squelette de diagramme',
    body: ['@startuml', 'title ${1:Titre}', '', '$0', '', '@enduml'].join('\n'),
  },
  {
    label: 'classe',
    detail: 'Déclaration de classe',
    body: ['class ${1:NomClasse} {', '  +${2:attribut} : ${3:Type}', '  +${4:methode}()', '}'].join(
      '\n'
    ),
  },
  {
    label: 'sequence',
    detail: 'Échange de séquence',
    body: '${1:Alice} -> ${2:Bob} : ${3:message}',
  },
  {
    label: 'note',
    detail: 'Note attachée',
    body: ['note ${1|left,right,top,bottom|} : ${2:contenu}'].join('\n'),
  },
  {
    label: 'if',
    detail: "Bloc conditionnel d'activité",
    body: ['if (${1:condition}) then (${2:oui})', '  :${3:action};', 'else (${4:non})', '  :${5:action};', 'endif'].join('\n'),
  },
];

let registered = false;

/**
 * Enregistre le langage PlantUML auprès de Monaco (idempotent : Monaco est un
 * singleton global et le rechargement à chaud rejoue ce module).
 */
export function registerPlantUmlLanguage(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({
    id: PLANTUML_LANGUAGE_ID,
    extensions: ['.puml', '.plantuml', '.pu', '.iuml', '.wsd'],
    aliases: ['PlantUML', 'plantuml'],
  });

  monaco.languages.setMonarchTokensProvider(PLANTUML_LANGUAGE_ID, plantumlMonarchLanguage);
  monaco.languages.setLanguageConfiguration(PLANTUML_LANGUAGE_ID, plantumlLanguageConfiguration);

  monaco.languages.registerCompletionItemProvider(PLANTUML_LANGUAGE_ID, {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const keywordItems = [...KEYWORDS, ...CONTROL_KEYWORDS].map((keyword) => ({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        range,
      }));

      const snippetItems = SNIPPETS.map((snippet) => ({
        label: snippet.label,
        detail: snippet.detail,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: snippet.body,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
      }));

      return { suggestions: [...snippetItems, ...keywordItems] };
    },
  });

  monaco.editor.defineTheme('plantuml-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword.directive', foreground: 'c586c0', fontStyle: 'bold' },
      { token: 'keyword.preprocessor', foreground: 'd7ba7d' },
      { token: 'keyword.control', foreground: '569cd6' },
      { token: 'keyword', foreground: '4ec9b0' },
      { token: 'annotation', foreground: 'dcdcaa' },
      { token: 'operator', foreground: 'd4d4d4' },
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#1e1e2e',
    },
  });

  monaco.editor.defineTheme('plantuml-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword.directive', foreground: 'af00db', fontStyle: 'bold' },
      { token: 'keyword.preprocessor', foreground: '795e26' },
      { token: 'keyword.control', foreground: '0000ff' },
      { token: 'keyword', foreground: '267f99' },
      { token: 'annotation', foreground: '795e26' },
      { token: 'operator', foreground: '333333' },
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#ffffff',
    },
  });
}
