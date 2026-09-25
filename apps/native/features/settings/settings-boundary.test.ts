import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

function parseScreen(filename: string): ts.SourceFile {
  const source = readFileSync(path.join(__dirname, "screens", filename), "utf8");
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function identifiers(root: ts.Node, name: string): ts.Identifier[] {
  const matches: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) matches.push(node);
    node.forEachChild(visit);
  };
  root.forEachChild(visit);
  return matches;
}

function callExpressions(root: ts.Node, name: string): ts.CallExpression[] {
  const matches: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      matches.push(node);
    }
    node.forEachChild(visit);
  };
  root.forEachChild(visit);
  return matches;
}

describe("Settings data boundary", () => {
  it("loads account scope counts from FinanceDataSource instead of dashboard", () => {
    const sourceFile = parseScreen("profile-screen.tsx");
    expect(callExpressions(sourceFile, "useAccountScopeCounts")).not.toHaveLength(0);
    expect(identifiers(sourceFile, "dashboard")).toHaveLength(0);
  });
});
