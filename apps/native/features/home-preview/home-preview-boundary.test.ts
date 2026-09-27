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

function screenFunction(sourceFile: ts.SourceFile, name: string) {
  return sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

// Names a screen pulls out of the sync store: destructured bindings, plus the
// property names of an object-returning selector (useDashboardSync((s) => ({…}))).
function syncStoreNames(root: ts.Node): string[] {
  return callExpressions(root, "useDashboardSync").flatMap((call) => {
    const names: string[] = [];
    const declaration = call.parent;
    if (ts.isVariableDeclaration(declaration) && ts.isObjectBindingPattern(declaration.name)) {
      names.push(...objectBindingNames(declaration.name));
    }
    const selector = call.arguments[0];
    if (selector && ts.isArrowFunction(selector)) {
      const body = ts.isParenthesizedExpression(selector.body)
        ? selector.body.expression
        : selector.body;
      if (ts.isObjectLiteralExpression(body)) {
        for (const property of body.properties) {
          if (property.name && ts.isIdentifier(property.name)) names.push(property.name.text);
        }
      }
    }
    return names;
  });
}

describe("Home preview data boundary", () => {
  // The shared Home data hook is the one place the read model becomes
  // presentation data — screens go through it, never the legacy builder.
  it("builds Home presentation data only from the bounded read model", () => {
    const source = readFileSync(path.join(__dirname, "hooks", "use-home-data.ts"), "utf8");
    const sourceFile = ts.createSourceFile("use-home-data.ts", source, ts.ScriptTarget.Latest, true);

    expect(callExpressions(sourceFile, "useHomeReadModel")).not.toHaveLength(0);
    expect(callExpressions(sourceFile, "createHomePreviewDataFromReadModel")).not.toHaveLength(0);
    const dataImportNames = importsFrom(sourceFile, "../data").flatMap(namedImportNames);
    expect(dataImportNames).toContain("createHomePreviewDataFromReadModel");
    // Comments and similarly-prefixed names cannot satisfy this AST check:
    // the legacy builder must be absent as an actual import or call.
    expect(identifiers(sourceFile, "createHomePreviewData")).toHaveLength(0);
  });

  it("renders the Home body from the shared read-model hook, not the synced dashboard", () => {
    const sourceFile = parseHomeScreen();
    const homeFunction = screenFunction(sourceFile, "HomePreviewScreen");
    expect(homeFunction).toBeDefined();
    if (!homeFunction) return;

    expect(callExpressions(homeFunction, "useHomeData")).not.toHaveLength(0);
    expect(identifiers(sourceFile, "createHomePreviewData")).toHaveLength(0);

    const syncNames = syncStoreNames(homeFunction);
    expect(syncNames).toEqual(expect.arrayContaining(["status", "caughtUpTransactions"]));
    expect(syncNames).not.toContain("dashboard");
    expect(syncNames).not.toContain("aggregates");
    // Per-page sync progress belongs to the permission card alone — the
    // screen subscribing to it would re-render Home on every inbox page.
    expect(syncNames).not.toContain("progress");
  });

  it("renders the Cards body from the shared read-model hook, not the synced dashboard", () => {
    const sourceFile = parseScreen("cards-screen.tsx");
    const cardsFunction = screenFunction(sourceFile, "CardsScreen");
    expect(cardsFunction).toBeDefined();
    if (!cardsFunction) return;

    expect(callExpressions(cardsFunction, "useHomeData")).not.toHaveLength(0);
    expect(identifiers(sourceFile, "createHomePreviewData")).toHaveLength(0);
    expect(syncStoreNames(cardsFunction)).not.toContain("dashboard");
    expect(syncStoreNames(cardsFunction)).not.toContain("progress");
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
