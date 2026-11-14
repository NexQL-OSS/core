import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { AggregateSQL } from './sql/aggregates';

export async function cmdListAggregates(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Aggregates in Schema: ${schema}`) +
        MarkdownUtils.infoBox('Aggregate functions compute a single result from multiple input rows (e.g., SUM, AVG, custom aggregates).')
      )
      .addSql(AggregateSQL.list(schema))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropAggregate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const aggName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop aggregate function "${aggName}"? This action cannot be undone.`,
    { modal: true },
    'Drop'
  );
  if (confirm !== 'Drop') { return; }
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Drop Aggregate: ${schema}.${aggName}`) +
        MarkdownUtils.dangerBox(`Dropping aggregate "${schema}"."${aggName}". Specify the argument types if needed.`)
      )
      .addSql(AggregateSQL.drop(schema, aggName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowAggregateProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const aggName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Aggregate Properties: ${schema}.${aggName}`) +
        MarkdownUtils.infoBox('Shows state transition function, final function, initial value, and data types.')
      )
      .addSql(AggregateSQL.getDefinition(schema, aggName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdCreateAggregate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Create Aggregate in Schema: ${schema}`) +
        MarkdownUtils.infoBox('Fill in the transition function (SFUNC), state data type (STYPE), and optionally a final function (FINALFUNC).')
      )
      .addSql(AggregateSQL.create(schema))
      .showTemp();
  } finally {
    release();
  }
}
