import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils } from './helper';
import { SequenceSQL } from './sql/sequences';

export async function cmdListSequences(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Sequences in Schema: ${schema}`) +
        MarkdownUtils.infoBox('Lists all sequences in this schema with their current values and settings.')
      )
      .addSql(SequenceSQL.list(schema))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdCreateSequence(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(MarkdownUtils.header(`➕ Create Sequence in Schema: \`${schema}\``, 'Create a new sequence in the current schema.'))
      .addSql(SequenceSQL.create(schema))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdDropSequence(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const seqName = item.label;
  const confirm = await vscode.window.showWarningMessage(
    `Drop sequence "${seqName}"? This action cannot be undone.`,
    { modal: true },
    'Drop'
  );
  if (confirm !== 'Drop') { return; }
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Drop Sequence: ${schema}.${seqName}`) +
        MarkdownUtils.dangerBox(`Dropping sequence "${schema}"."${seqName}". This is permanent.`)
      )
      .addSql(SequenceSQL.drop(schema, seqName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdSequenceNextValue(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const seqName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Next Value: ${schema}.${seqName}`) +
        MarkdownUtils.warningBox('Calling nextval() will advance the sequence and cannot be rolled back even if the transaction fails.')
      )
      .addSql(SequenceSQL.nextValue(schema, seqName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdShowSequenceProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const seqName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`Sequence Properties: ${schema}.${seqName}`) +
        MarkdownUtils.infoBox('Full sequence definition including min/max values, increment, and current state.')
      )
      .addSql(SequenceSQL.getDefinition(schema, seqName))
      .addMarkdown('##### Current Value')
      .addSql(SequenceSQL.currentValue(schema, seqName))
      .addMarkdown('##### Alter Sequence Template')
      .addSql(SequenceSQL.alter(schema, seqName))
      .showTemp();
  } finally {
    release();
  }
}

export async function cmdSequenceOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  const { metadata, release } = await getDatabaseConnection(item);
  try {
    const schema = item.schema!;
    const seqName = item.label;
    await new NotebookBuilder(metadata)
      .addMarkdown(MarkdownUtils.header(`🔢 Sequence Operations: \`${schema}.${seqName}\``, 'Common sequence actions are rendered below as notebook cells.'))
      .addMarkdown('##### Sequence Properties')
      .addSql(SequenceSQL.getDefinition(schema, seqName))
      .addMarkdown('##### Current Value')
      .addSql(SequenceSQL.currentValue(schema, seqName))
      .addMarkdown('##### Next Value — WARNING: advances the sequence permanently')
      .addSql(SequenceSQL.nextValue(schema, seqName))
      .addMarkdown('##### Alter Sequence')
      .addSql(SequenceSQL.alter(schema, seqName))
        .addMarkdown('##### 🗑️ Drop Sequence')
      .addSql(SequenceSQL.drop(schema, seqName))
      .showTemp();
  } finally {
    release();
  }
}
