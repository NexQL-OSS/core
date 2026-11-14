import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import {
  MarkdownUtils,
  ErrorHandlers,
  getDatabaseConnection,
  NotebookBuilder,
  QueryBuilder
} from './helper';
import { ConstraintSQL } from './sql';

/**
 * Show constraint properties in a notebook
 */
export async function showConstraintProperties(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { client, metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    // Get detailed constraint information
    const result = await client.query(QueryBuilder.constraintDetails(schema, tableName, constraintName));

    if (result.rows.length === 0) {
      vscode.window.showErrorMessage('Constraint not found');
      return;
    }

    const constraint = result.rows[0];

    const nb = new NotebookBuilder(metadata)
      .addMarkdown(
        `### 🛡️ Constraint Properties: \`${constraint.constraint_name}\`\n\n` +
        `Table: \`${schema}.${tableName}\` — Type: \`${constraint.constraint_type}\``
      );

    if (constraint.constraint_definition) {
      nb.addMarkdown(`##### Definition`);
      nb.addMarkdown(`\`\`\`sql\n${constraint.constraint_definition}\n\`\`\``);
    }

    if (constraint.check_clause) {
      nb.addMarkdown(`##### Check Clause`);
      nb.addMarkdown(`\`\`\`sql\n${constraint.check_clause}\n\`\`\``);
    }

    // Get foreign key details if applicable
    if (constraint.constraint_type === 'FOREIGN KEY') {
      const fkResult = await client.query(QueryBuilder.foreignKeyDetails(schema, constraintName));

      if (fkResult.rows.length > 0) {
        const refs = fkResult.rows.map((row: any) =>
          `${row.column_name} → ${row.foreign_table_schema}.${row.foreign_table_name}.${row.foreign_column_name} (ON UPDATE ${row.update_rule}, ON DELETE ${row.delete_rule})`
        ).join('\n');
        nb.addMarkdown(`##### Foreign Key References\n\n\`\`\`\n${refs}\n\`\`\``);
      }
    }

    await nb.showTemp();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show constraint properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Copy constraint name to clipboard
 */
export async function copyConstraintName(treeItem: DatabaseTreeItem): Promise<void> {
  const constraintName = treeItem.label;
  await vscode.env.clipboard.writeText(constraintName);
  vscode.window.showInformationMessage(`Copied: ${constraintName}`);
}

/**
 * Generate DROP CONSTRAINT script
 */
export async function generateDropConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🗑️ Drop Constraint: \`${constraintName}\``, `Removes constraint from \`${schema}.${tableName}\`.`) +
        MarkdownUtils.dangerBox(`Dropping \`${schema}.${tableName}.${constraintName}\` is permanent and will fail if dependent objects exist.`)
      )
      .addMarkdown(`##### 🗑️ Drop Constraint`)
      .addSql(ConstraintSQL.drop(schema, tableName, constraintName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate drop constraint script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate ALTER CONSTRAINT script (RENAME)
 */
export async function generateAlterConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✏️ Rename Constraint: \`${constraintName}\``, `Renames constraint on \`${schema}.${tableName}\`. `)
      )
      .addMarkdown(`##### ✏️ Rename Constraint`)
      .addSql(
        `-- Rename constraint
ALTER TABLE "${schema}"."${tableName}"
RENAME CONSTRAINT "${constraintName}" TO new_constraint_name;`
      )
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate alter constraint script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Validate constraint
 */
export async function validateConstraint(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✅ Validate Constraint: \`${constraintName}\``, `Validates a NOT VALID constraint on \`${schema}.${tableName}\` by scanning existing rows.`)
      )
      .addMarkdown(`##### ✅ Validate Constraint`)
      .addSql(ConstraintSQL.validate(schema, tableName, constraintName))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'validate constraint');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate ADD CONSTRAINT template script
 */
export async function generateAddConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`➕ Add Constraint: \`${schema}.${tableName}\``, 'Templates for adding primary key, foreign key, unique, and check constraints.')
      )
      .addMarkdown(`##### 🔑 Add Primary Key`)
      .addSql(ConstraintSQL.addPrimaryKey(schema, tableName))
      .addMarkdown(`##### 🔗 Add Foreign Key`)
      .addSql(ConstraintSQL.addForeignKey(schema, tableName))
      .addMarkdown(`##### ⭐ Add Unique Constraint`)
      .addSql(ConstraintSQL.addUnique(schema, tableName))
      .addMarkdown(`##### ✓ Add Check Constraint`)
      .addSql(ConstraintSQL.addCheck(schema, tableName))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate add constraint script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * View constraint dependencies
 */
export async function viewConstraintDependencies(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🕸️ Constraint Dependencies: \`${constraintName}\``, `Shows objects that depend on this constraint in \`${schema}.${tableName}\`.`)
      )
      .addMarkdown(`##### 🕸️ Find Dependencies`)
      .addSql(`-- Find all dependencies for this constraint
SELECT 
    d.deptype as dependency_type,
    c.relname as dependent_object,
    n.nspname as dependent_schema,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 'f' THEN 'foreign table'
        ELSE c.relkind::text
    END as object_type
FROM pg_constraint con
JOIN pg_depend d ON d.refobjid = con.oid
JOIN pg_class c ON c.oid = d.objid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.conname = '${constraintName}'
    AND con.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
ORDER BY dependent_schema, dependent_object;`)
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'view constraint dependencies');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Constraint Operations notebook — read → write → destructive
 */
export async function cmdConstraintOperations(item: DatabaseTreeItem, _context?: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const schema = item.schema!;
    const tableName = item.tableName!;
    const constraintName = item.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🛡️ Constraint Operations: \`${constraintName}\``, `Manage constraint on \`${schema}.${tableName}\`: validate, add variants, and drop.`)
      )
      .addMarkdown(`##### ✅ Validate Constraint`)
      .addSql(ConstraintSQL.validate(schema, tableName, constraintName))
      .addMarkdown(`##### 🔑 Add Primary Key`)
      .addSql(ConstraintSQL.addPrimaryKey(schema, tableName))
      .addMarkdown(`##### 🔗 Add Foreign Key`)
      .addSql(ConstraintSQL.addForeignKey(schema, tableName))
      .addMarkdown(`##### ⭐ Add Unique Constraint`)
      .addSql(ConstraintSQL.addUnique(schema, tableName))
      .addMarkdown(`##### ✓ Add Check Constraint`)
      .addSql(ConstraintSQL.addCheck(schema, tableName))
      .addMarkdown(`##### 🗑️ Drop Constraint`)
      .addSql(ConstraintSQL.drop(schema, tableName, constraintName))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create constraint operations notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Add new constraint to table
 */
export async function cmdAddConstraint(item: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const schema = item.schema!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`➕ Add Constraint: \`${schema}.${tableName}\``, 'Templates for adding constraints to enforce data integrity.')
      )
      .addMarkdown(`##### 🔑 Add Primary Key`)
      .addSql(ConstraintSQL.addPrimaryKey(schema, tableName))
      .addMarkdown(`##### 🔗 Add Foreign Key`)
      .addSql(ConstraintSQL.addForeignKey(schema, tableName))
      .addMarkdown(`##### ⭐ Add Unique Constraint`)
      .addSql(ConstraintSQL.addUnique(schema, tableName))
      .addMarkdown(`##### ✓ Add Check Constraint`)
      .addSql(ConstraintSQL.addCheck(schema, tableName))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'add constraint');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}
