import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// React Native rejects even a space directly under a View. Jest's host renderer
// does not enforce that native invariant, so inspect literal JSX children too.
it.each(['result', 'round-result', 'waiting', 'prompt-entry', 'matchmaking'])(
  '%s has no literal native text outside a text component',
  (route) => {
    const source = ts.createSourceFile(
      route + '.tsx',
      fs.readFileSync(
        path.join(__dirname, '../app/(battle)', route + '.tsx'),
        'utf8',
      ),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const invalid: number[] = [];
    function inspect(node: ts.Node) {
      const literal = ts.isJsxText(node)
        ? node.getText(source).trim()
        : ts.isJsxExpression(node) &&
            node.expression &&
            ts.isStringLiteral(node.expression)
          ? node.expression.text
          : '';
      if (literal.length) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
        if (
          parent &&
          ts.isJsxElement(parent) &&
          !['Text', 'GameText', 'GameDisplayTitle'].includes(
            parent.openingElement.tagName.getText(source),
          )
        )
          invalid.push(source.getLineAndCharacterOfPosition(node.pos).line + 1);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
    expect(invalid).toEqual([]);
  },
);
