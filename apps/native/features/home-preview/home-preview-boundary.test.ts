import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

function parseScreen(filename: string): ts.SourceFile {
  const source = readFileSync(path.join(__dirname, "screens", filename), "utf8");
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function parseHomeScreen(): ts.SourceFile {
  return parseScreen("home-preview-screen.tsx");
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

function identifiers(root: ts.Node, name: string): ts.Identifier[] {
  const matches: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) matches.push(node);
    node.forEachChild(visit);
  };
  root.forEachChild(visit);
  return matches;
}

function importsFrom(sourceFile: ts.SourceFile, modulePath: string): ts.ImportDeclaration[] {
  return sourceFile.statements.filter(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === modulePath,
  );
}

function namedImportNames(declaration: ts.ImportDeclaration): string[] {
  const namedBindings = declaration.importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return [];
  return namedBindings.elements
    .flatMap((element) => [
      element.name.text,
      element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : null,
    ])
    .filter((name): name is string => name !== null);
}

function objectBindingNames(pattern: ts.ObjectBindingPattern): string[] {
  return pattern.elements
    .flatMap((element) => [
      ts.isIdentifier(element.name) ? element.name.text : null,
      element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : null,
    ])
    .filter((name): name is string => name !== null);
}

describe("Home preview data boundary", () => {
  it("uses the bounded read model for the rendered Home body", () => {
    const sourceFile = parseHomeScreen();
    const homeFunction = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === "HomePreviewScreen",
    );
    expect(homeFunction).toBeDefined();
    if (!homeFunction) return;

    expect(callExpressions(homeFunction, "useHomeReadModel")).not.toHaveLength(0);
    expect(callExpressions(homeFunction, "createHomePreviewDataFromReadModel")).not.toHaveLength(0);

    const dataImports = importsFrom(sourceFile, "../data");
    expect(dataImports).toHaveLength(1);
    const dataImportNames = dataImports.flatMap(namedImportNames);
    expect(dataImportNames).toContain("createHomePreviewDataFromReadModel");
    expect(dataImportNames).not.toContain("createHomePreviewData");
    // Comments and similarly-prefixed names cannot satisfy this AST check:
    // the legacy builder must be absent as an actual import or call.
    expect(identifiers(sourceFile, "createHomePreviewData")).toHaveLength(0);

    const syncCalls = callExpressions(homeFunction, "useDashboardSync");
    expect(syncCalls).toHaveLength(1);
    const syncBindingNames = syncCalls.flatMap((call) => {
      const declaration = call.parent;
      return ts.isVariableDeclaration(declaration) && ts.isObjectBindingPattern(declaration.name)
        ? objectBindingNames(declaration.name)
        : [];
    });
    expect(syncBindingNames).toEqual(
      expect.arrayContaining(["status", "progress", "newSinceLastView"]),
    );
    expect(syncBindingNames).not.toContain("dashboard");
    expect(syncBindingNames).not.toContain("aggregates");
  });

  it("uses the bounded read model for the Cards screen body", () => {
    const sourceFile = parseScreen("cards-screen.tsx");
    const cardsFunction = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === "CardsScreen",
    );
    expect(cardsFunction).toBeDefined();
    if (!cardsFunction) return;

    expect(callExpressions(cardsFunction, "useHomeReadModel")).not.toHaveLength(0);
    expect(callExpressions(cardsFunction, "createHomePreviewDataFromReadModel")).not.toHaveLength(0);
    expect(identifiers(sourceFile, "createHomePreviewData")).toHaveLength(0);

    const syncCalls = callExpressions(cardsFunction, "useDashboardSync");
    expect(syncCalls).toHaveLength(1);
    const syncBindingNames = syncCalls.flatMap((call) => {
      const declaration = call.parent;
      return ts.isVariableDeclaration(declaration) && ts.isObjectBindingPattern(declaration.name)
        ? objectBindingNames(declaration.name)
        : [];
    });
    expect(syncBindingNames).toEqual(expect.arrayContaining(["status", "progress"]));
    expect(syncBindingNames).not.toContain("dashboard");
  });

  it("uses FinanceDataSource for the subscriptions list body", () => {
    const sourceFile = parseScreen("subscriptions-screen.tsx");
    const subscriptionsFunction = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === "SubscriptionsScreen",
    );
    expect(subscriptionsFunction).toBeDefined();
    if (!subscriptionsFunction) return;

    expect(callExpressions(subscriptionsFunction, "useSubscriptionsCatalog")).not.toHaveLength(0);
    expect(identifiers(sourceFile, "createHomePreviewData")).toHaveLength(0);
    expect(identifiers(sourceFile, "useDashboardSync")).toHaveLength(0);
  });

  it("uses FinanceDataSource for subscription detail", () => {
    const sourceFile = parseScreen("subscription-detail-screen.tsx");
    const detailFunction = sourceFile.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === "SubscriptionDetailScreen",
    );
    expect(detailFunction).toBeDefined();
    if (!detailFunction) return;

    expect(callExpressions(detailFunction, "useSubscriptionDetail")).not.toHaveLength(0);
    expect(identifiers(sourceFile, "createHomePreviewData")).toHaveLength(0);
    expect(identifiers(sourceFile, "useDashboardSync")).toHaveLength(0);
  });
});
