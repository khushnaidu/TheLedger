// Syntax highlighting for notebook code blocks — hljs core plus the
// handful of grammars an interview grind actually meets. This module is
// dynamically imported by CodeItem, so pages without code never load it.
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import sql from 'highlight.js/lib/languages/sql';

hljs.registerLanguage('python', python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('sql', sql);

const AUTO_POOL = ['python', 'javascript', 'typescript', 'java', 'cpp', 'sql'];

// returns escaped, highlighted HTML — hljs escapes the source itself,
// which is what makes the innerHTML render safe
export function highlight(code, lang) {
  try {
    if (lang && lang !== 'auto' && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code, AUTO_POOL).value;
  } catch {
    return null;
  }
}
