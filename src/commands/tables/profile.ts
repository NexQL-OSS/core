import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils, ErrorHandlers } from '../helper';
import * as ProfileSQL from '../sql/profile';

/**
 * Show comprehensive table profile with statistics
 */
export async function cmdTableProfile(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  try {
    if (!item.schema || !item.label) {
      throw new Error('Schema and table name are required');
    }

    const { connection, client, metadata, release } = await getDatabaseConnection(item);

    try {
      // Get table stats
      const statsResult = await client.query(ProfileSQL.tableStats(item.schema, item.label));
      const stats = statsResult.rows[0] || {};

      // Get column statistics
      const colStatsResult = await client.query(ProfileSQL.columnStats(item.schema, item.label));
      const columnStats = colStatsResult.rows;

      // Get column details
      const colDetailsResult = await client.query(ProfileSQL.columnDetails(item.schema, item.label));
      const columnDetails = colDetailsResult.rows;

      // Build profile notebook
      const builder = new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`📊 Table Profile: \`${item.schema}.${item.label}\``) +
          MarkdownUtils.infoBox('Comprehensive table statistics, column analysis, and distribution metrics.') +
          '\n\n---'
        );

      // Table Overview Section
      builder.addMarkdown('#### 📈 Table Overview');

      let overviewMarkdown = '| Metric | Value |\n' +
        '|--------|-------|\n' +
        `| **Approximate Row Count** | ${stats.approximate_row_count?.toLocaleString() || 'N/A'} |\n` +
        `| **Total Size** | ${stats.total_size || 'N/A'} |\n` +
        `| **Table Size** | ${stats.table_size || 'N/A'} |\n` +
        `| **Indexes Size** | ${stats.indexes_size || 'N/A'} |\n` +
        `| **TOAST Size** | ${stats.toast_size || 'N/A'} |\n`;
      builder.addMarkdown(overviewMarkdown + '\n---');

      // Column Statistics Section
      builder.addMarkdown('#### 📋 Column Statistics');

      if (columnStats.length > 0) {
        let statsMarkdown = '| Column | Null % | Distinct | Avg Bytes | Correlation |\n' +
          '|--------|---------|----------|-----------|-------------|\n';
        columnStats.forEach((col: any) => {
          const nullPct = col.null_fraction ? (col.null_fraction * 100).toFixed(1) + '%' : '0%';
          const distinct = col.distinct_values || 'N/A';
          const avgBytes = col.avg_bytes || 'N/A';
          const correlation = col.correlation ? col.correlation.toFixed(3) : 'N/A';
          statsMarkdown += `| \`${col.column_name}\` | ${nullPct} | ${distinct} | ${avgBytes} | ${correlation} |\n`;
        });
        builder.addMarkdown(statsMarkdown + '\n---');
      } else {
        builder.addMarkdown(MarkdownUtils.warningBox('No statistics available. Run ANALYZE on this table first.') + '\n\n---');
      }

      // Column Details Section
      builder.addMarkdown('#### 🔍 Column Definitions');

      if (columnDetails.length > 0) {
        let detailsMarkdown = '| Column | Type | Not Null | Default | Key |\n' +
          '|--------|------|----------|---------|-----|\n';
        columnDetails.forEach((col: any) => {
          const notNull = col.not_null ? '✓' : '';
          const defaultVal = col.default_value || '';
          const keyType = col.key_type || '';
          detailsMarkdown += `| \`${col.column_name}\` | ${col.data_type} | ${notNull} | ${defaultVal} | ${keyType} |\n`;
        });
        builder.addMarkdown(detailsMarkdown + '\n---');
      }

      // SQL Query Details
      builder.addMarkdown('#### 📊 Query: Table Size & Row Count\n\nFetch approximate row count and storage size breakdown.');
      builder.addSql(ProfileSQL.tableStats(item.schema, item.label));

      builder.addMarkdown('#### 📋 Query: Column Statistics\n\nStatistical analysis including null ratios, distinct value counts, and correlations.');
      builder.addSql(ProfileSQL.columnStats(item.schema, item.label));

      builder.addMarkdown('#### 🔍 Query: Column Details\n\nDetailed column information with types, defaults, and constraints.');
      builder.addSql(ProfileSQL.columnDetails(item.schema, item.label));

      await builder.showTemp();

    } finally {
      release();
    }

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate table profile');
  }
}

/**
 * Show table activity and maintenance statistics
 */
export async function cmdTableActivity(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  try {
    if (!item.schema || !item.label) {
      throw new Error('Schema and table name are required');
    }

    const { connection, client, metadata, release } = await getDatabaseConnection(item);

    try {
      const activityResult = await client.query(ProfileSQL.tableActivity(item.schema, item.label));
      const activity = activityResult.rows[0] || {};

      const builder = new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`⚡ Table Activity: \`${item.schema}.${item.label}\``) +
          MarkdownUtils.infoBox('Real-time access patterns, modification statistics, and maintenance operations.') +
          '\n\n---'
        );

      // Access Patterns
      builder.addMarkdown('#### 👁️ Access Patterns');

      let accessMarkdown = '| Metric | Value |\n' +
        '|--------|-------|\n' +
        `| **Sequential Scans** | ${activity.sequential_scans?.toLocaleString() || '0'} |\n` +
        `| **Rows Read (Seq)** | ${activity.rows_seq_read?.toLocaleString() || '0'} |\n` +
        `| **Index Scans** | ${activity.index_scans?.toLocaleString() || '0'} |\n` +
        `| **Rows Fetched (Index)** | ${activity.rows_idx_fetched?.toLocaleString() || '0'} |\n`;
      builder.addMarkdown(accessMarkdown + '\n---');

      // Data Changes
      builder.addMarkdown('#### ✏️ Data Modifications');

      let changesMarkdown = '| Operation | Count |\n' +
        '|-----------|-------|\n' +
        `| **Inserted** | ${activity.rows_inserted?.toLocaleString() || '0'} |\n` +
        `| **Updated** | ${activity.rows_updated?.toLocaleString() || '0'} |\n` +
        `| **Deleted** | ${activity.rows_deleted?.toLocaleString() || '0'} |\n` +
        `| **HOT Updates** | ${activity.hot_updates?.toLocaleString() || '0'} |\n`;
      builder.addMarkdown(changesMarkdown + '\n---');

      // Table Health
      builder.addMarkdown('#### 🏥 Table Health');

      let healthMarkdown = '| Metric | Value |\n' +
        '|--------|-------|\n' +
        `| **Live Rows** | ${activity.live_rows?.toLocaleString() || '0'} |\n` +
        `| **Dead Rows** | ${activity.dead_rows?.toLocaleString() || '0'} |\n`;
      
      const bloatRatio = activity.live_rows > 0 
        ? ((activity.dead_rows / activity.live_rows) * 100).toFixed(1)
        : '0';
      healthMarkdown += `| **Bloat Ratio** | ${bloatRatio}% |\n`;
      builder.addMarkdown(healthMarkdown + '\n---');

      // Maintenance History
      builder.addMarkdown('#### 🔧 Maintenance History');

      let maintenanceMarkdown = '| Operation | Last Run | Count |\n' +
        '|-----------|----------|-------|\n' +
        `| **VACUUM** | ${activity.last_vacuum || 'Never'} | ${activity.vacuum_count || '0'} |\n` +
        `| **Auto-VACUUM** | ${activity.last_autovacuum || 'Never'} | ${activity.autovacuum_count || '0'} |\n` +
        `| **ANALYZE** | ${activity.last_analyze || 'Never'} | ${activity.analyze_count || '0'} |\n` +
        `| **Auto-ANALYZE** | ${activity.last_autoanalyze || 'Never'} | ${activity.autoanalyze_count || '0'} |\n`;
      builder.addMarkdown(maintenanceMarkdown + '\n---');

      // Add warnings if needed
      if (activity.dead_rows > activity.live_rows * 0.2) {
        builder.addMarkdown(
          MarkdownUtils.warningBox(
            `High bloat detected! Dead rows represent ${bloatRatio}% of live rows. Consider running VACUUM to reclaim space.`
          )
        );
      }

      // SQL Query Details
      builder.addMarkdown('#### ⚡ Query: Table Activity Statistics\n\nAccess patterns, data modifications, and maintenance history.');
      builder.addSql(ProfileSQL.tableActivity(item.schema, item.label));

      await builder.showTemp();

    } finally {
      release();
    }

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show table activity');
  }
}

/**
 * Show index usage for a table
 */
export async function cmdIndexUsage(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  try {
    if (!item.schema || !item.label) {
      throw new Error('Schema and table name are required');
    }

    const { connection, client, metadata, release } = await getDatabaseConnection(item);

    try {
      const indexResult = await client.query(ProfileSQL.indexUsage(item.schema, item.label));
      const indexes = indexResult.rows;

      const builder = new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`📑 Index Usage: \`${item.schema}.${item.label}\``) +
          MarkdownUtils.infoBox('Index definitions, usage statistics, and performance metrics.') +
          '\n\n---'
        );

      if (indexes.length === 0) {
        builder.addMarkdown(MarkdownUtils.warningBox('No indexes found on this table.'));
      } else {
        // Index Statistics Overview
        builder.addMarkdown('#### 📊 Index Statistics');

        let statsMarkdown = '| Index | Type | Size | Scans | Tuples Read | Tuples Fetched |\n' +
          '|-------|------|------|-------|-------------|----------------|\n';
        
        indexes.forEach((idx: any) => {
          statsMarkdown += `| \`${idx.index_name}\` | ${idx.index_type} | ${idx.index_size} | `;
          statsMarkdown += `${idx.number_of_scans?.toLocaleString() || '0'} | `;
          statsMarkdown += `${idx.tuples_read?.toLocaleString() || '0'} | `;
          statsMarkdown += `${idx.tuples_fetched?.toLocaleString() || '0'} |\n`;
        });
        
        builder.addMarkdown(statsMarkdown + '\n---');

        // Find unused indexes
        const unusedIndexes = indexes.filter((idx: any) => !idx.number_of_scans || idx.number_of_scans === 0);
        if (unusedIndexes.length > 0) {
          builder.addMarkdown(
            MarkdownUtils.warningBox(
              `${unusedIndexes.length} unused index(es) detected! These indexes consume space without being used. Consider dropping: ${unusedIndexes.map((i: any) => `\`${i.index_name}\``).join(', ')}`
            )
          );
        }

        // Index Definitions
        builder.addMarkdown('#### 🔍 Index Definitions');

        let indexDefMarkdown = '';
        indexes.forEach((idx: any) => {
          indexDefMarkdown += `\n##### \`${idx.index_name}\` (${idx.index_type})\n\n`;
          indexDefMarkdown += '```sql\n';
          indexDefMarkdown += idx.index_definition + ';\n';
          indexDefMarkdown += '```\n';
        });
        builder.addMarkdown(indexDefMarkdown + '\n---');
      }

      // SQL Query Details
      builder.addMarkdown('#### 📑 Query: Index Usage Details\n\nFetch index names, types, sizes, and access statistics.');
      builder.addSql(ProfileSQL.indexUsage(item.schema, item.label));

      await builder.showTemp();

    } finally {
      release();
    }

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show index usage');
  }
}
