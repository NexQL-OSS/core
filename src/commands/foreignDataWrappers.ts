import * as vscode from 'vscode';

import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import {
  MarkdownUtils,
  ErrorHandlers,
  getDatabaseConnection,
  NotebookBuilder,
  QueryBuilder,
  validateCategoryItem
} from './helper';
import { ForeignDataWrapperSQL } from './sql';



/**
 * cmdForeignDataWrapperOperations - Command to create operations notebook for a Foreign Data Wrapper
 * @param {DatabaseTreeItem} item - The selected FDW item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdForeignDataWrapperOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    // FDW nodes don't have schema, use validateCategoryItem
    dbConn = await getDatabaseConnection(item, validateCategoryItem);
    const { client, metadata } = dbConn;

    try {
      const fdwResult = await client.query(ForeignDataWrapperSQL.query.fdwDetails(item.label));
      const serversResult = await client.query(ForeignDataWrapperSQL.query.listServers(item.label));

      const fdw = fdwResult.rows[0] || {};
      const servers = serversResult.rows;

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`🔌 Foreign Data Wrapper Operations: \`${item.label}\``) +
          MarkdownUtils.infoBox('This notebook contains operations for managing the Foreign Data Wrapper (FDW). Execute the cells below to perform operations.') +
          `\n\n#### 📊 FDW Information\n\n` +
          MarkdownUtils.propertiesTable({
            'FDW Name': fdw.fdw_name || item.label,
            'Owner': fdw.owner || 'N/A',
            'Handler Function': fdw.handler_function || 'N/A',
            'Validator Function': fdw.validator_function || 'N/A',
            'Servers Using This FDW': `${fdw.server_count || 0}`
          }) +
          `\n\n#### 🎯 Available Operations\n\n` +
          MarkdownUtils.operationsTable([
            { operation: '📝 List Servers', description: 'Show all foreign servers using this FDW' },
            { operation: '➕ Create Server', description: 'Create a new foreign server' },
            { operation: '🔍 View Details', description: 'Detailed FDW information and functions' },
            { operation: '🔐 Grant USAGE', description: 'Grant permissions to roles' },
            { operation: '❌ Drop FDW', description: 'Remove FDW (Warning: CASCADE required)' }
          ])
        )
        .addMarkdown('##### 📝 List Foreign Servers')
        .addSql(ForeignDataWrapperSQL.query.listServers(item.label))
        .addMarkdown('##### ➕ Create New Foreign Server')
        .addSql(ForeignDataWrapperSQL.create.server.basic(item.label))
        .addMarkdown('##### 🔍 FDW Details and Functions')
        .addSql(ForeignDataWrapperSQL.query.fdwFunctions(item.label))
        .addMarkdown('##### 🔐 Grant USAGE Permission')
        .addSql(ForeignDataWrapperSQL.grant.usageOnFDW(item.label, 'role_name'))
        .addMarkdown('##### ❌ Drop Foreign Data Wrapper')
        .addSql(ForeignDataWrapperSQL.drop.fdw(item.label))
        .showTemp();
    } finally {
      // Do not close shared client
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create FDW operations notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdShowForeignDataWrapperProperties - Show detailed properties of a Foreign Data Wrapper
 */
export async function cmdShowForeignDataWrapperProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    // FDW nodes don't have schema, use validateCategoryItem
    dbConn = await getDatabaseConnection(item, validateCategoryItem);
    const { client, metadata } = dbConn;

    try {
      const fdwResult = await client.query(ForeignDataWrapperSQL.query.fdwDetails(item.label));
      const serversResult = await client.query(ForeignDataWrapperSQL.query.listServers(item.label));

      const fdw = fdwResult.rows[0] || {};
      const servers = serversResult.rows;

      // Build servers table HTML
      const serverRows = servers.map((srv: any) => {
        return `    <tr>
        <td><strong>${srv.server_name}</strong></td>
        <td>${srv.owner}</td>
        <td>${srv.user_mapping_count || 0}</td>
        <td>${srv.foreign_table_count || 0}</td>
    </tr>`;
      }).join('\n');

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`🔌 Foreign Data Wrapper Properties: \`${item.label}\``) +
          MarkdownUtils.infoBox(`**Owner:** ${fdw.owner || 'N/A'} ${fdw.comment ? `| **Comment:** ${fdw.comment}` : ''}`) +
          `\n\n#### 💾 General Information\n\n` +
          MarkdownUtils.propertiesTable({
            'FDW Name': fdw.fdw_name || item.label,
            'Owner': fdw.owner || 'N/A',
            'Handler Function': fdw.handler_function || 'None',
            'Validator Function': fdw.validator_function || 'None',
            'Total Servers': `${fdw.server_count || 0}`
          }) +
          (servers.length > 0 ? `\n\n#### 🖥️ Foreign Servers (${servers.length})\n\n` +
            `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 30%;">Server Name</th>
        <th style="text-align: left; width: 25%;">Owner</th>
        <th style="text-align: left; width: 20%;">User Mappings</th>
        <th style="text-align: left;">Foreign Tables</th>
    </tr>
${serverRows}
</table>\n\n` : '\n\n_No servers using this FDW_\n\n') +
          '---'
        )
        .addMarkdown('##### 📋 FDW Details Query')
        .addSql(ForeignDataWrapperSQL.query.fdwDetails(item.label))
        .addMarkdown('##### 🔍 Handler and Validator Functions')
        .addSql(ForeignDataWrapperSQL.query.fdwFunctions(item.label))
        .showTemp();
    } finally {
      // Do not close shared client
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show FDW properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdCreateForeignServer - Command to create a new foreign server
 */
export async function cmdCreateForeignServer(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    // Use validateCategoryItem for category-level calls, not validateItem which requires schema
    dbConn = await getDatabaseConnection(item, validateCategoryItem);
    const { metadata } = dbConn;

    // Determine the FDW name from context
    // If called from category-level (+button), type will be 'category'
    // If called from individual FDW node, type will be 'foreign-data-wrapper'
    const fdwName = item.type === 'foreign-data-wrapper' ? item.label : 'postgres_fdw';
    const titleSuffix = item.type === 'foreign-data-wrapper' ? ` for: \`${item.label}\`` : '';

    const markdown = MarkdownUtils.header(`➕ Create New Foreign Server${titleSuffix}`) +
      MarkdownUtils.infoBox('This notebook provides templates for creating foreign servers. Modify the templates below and execute to create servers.') +
      `\n\n#### 📋 Foreign Server Design Guidelines\n\n` +
      MarkdownUtils.operationsTable([
        { operation: '<strong>Naming</strong>', description: 'Use descriptive names (e.g., prod_db_server, analytics_server, remote_mysql)' },
        { operation: '<strong>Security</strong>', description: 'Always use SSL/TLS for production servers. Store credentials securely.' },
        { operation: '<strong>Options</strong>', description: 'Configure connection options (host, port, dbname, fetch_size, timeouts)' },
        { operation: '<strong>Testing</strong>', description: 'Test connection before creating user mappings and foreign tables' },
        { operation: '<strong>Permissions</strong>', description: 'Grant USAGE permission to roles that need access to the server' }
      ]) +
      `\n\n#### 🏷️ Common Server Patterns\n\n` +
      MarkdownUtils.propertiesTable({
        'PostgreSQL Remote': 'Connect to another PostgreSQL database (postgres_fdw)',
        'MySQL/MariaDB': 'Connect to MySQL or MariaDB database (mysql_fdw)',
        'File-based': 'Access CSV or other file data (file_fdw)',
        'MongoDB': 'Connect to MongoDB (mongo_fdw)',
        'Oracle': 'Connect to Oracle Database (oracle_fdw)',
        'Custom FDW': 'Use specialized FDW extensions'
      }) +
      MarkdownUtils.successBox('Foreign servers define connection parameters. You\'ll need to create USER MAPPING after creating the server to specify authentication credentials.') +
      `\n\n---`;

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 📝 Basic Foreign Server (Recommended Start)')
      .addSql(ForeignDataWrapperSQL.create.server.basic(fdwName))
      .addMarkdown('##### 🐘 PostgreSQL Remote Server')
      .addSql(ForeignDataWrapperSQL.create.server.postgres(fdwName))
      .addMarkdown('##### 🐬 MySQL Server')
      .addSql(ForeignDataWrapperSQL.create.server.mysql())
      .addMarkdown('##### 📁 File-based Server')
      .addSql(ForeignDataWrapperSQL.create.server.file())
      .addMarkdown('##### 🔐 Server with SSL Authentication')
      .addSql(ForeignDataWrapperSQL.create.server.withAuth(fdwName))
      .addMarkdown('##### ✅ Test Server Connection')
      .addSql(ForeignDataWrapperSQL.test.connection('server_name'))
      .addMarkdown(MarkdownUtils.warningBox('Remember to: 1) Replace placeholder values with actual connection details, 2) Use SSL/TLS for production, 3) Test the connection, 4) Create USER MAPPING for authentication, 5) Grant USAGE permission to appropriate roles.'))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create foreign server notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdForeignServerOperations - Command to create operations notebook for a foreign server
 */
export async function cmdForeignServerOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    try {
      const serverResult = await client.query(ForeignDataWrapperSQL.query.serverDetails(item.label));
      const mappingsResult = await client.query(ForeignDataWrapperSQL.query.listUserMappings(item.label));
      const tablesResult = await client.query(ForeignDataWrapperSQL.query.foreignTablesByServer(item.label));

      const server = serverResult.rows[0] || {};
      const mappings = mappingsResult.rows;
      const tables = tablesResult.rows;

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`🖥️ Foreign Server Operations: \`${item.label}\``) +
          MarkdownUtils.infoBox('This notebook contains operations for managing the foreign server. Execute the cells below to perform operations.') +
          `\n\n#### 📊 Server Information\n\n` +
          MarkdownUtils.propertiesTable({
            'Server Name': server.server_name || item.label,
            'FDW': server.fdw_name || 'N/A',
            'Owner': server.owner || 'N/A',
            'User Mappings': `${mappings.length}`,
            'Foreign Tables': `${tables.length}`
          }) +
          `\n\n#### 🎯 Available Operations\n\n` +
          MarkdownUtils.operationsTable([
            { operation: '📋 Server Details', description: 'View server configuration and options' },
            { operation: '👥 User Mappings', description: 'List all user mappings for this server' },
            { operation: '📊 Foreign Tables', description: 'List all foreign tables using this server' },
            { operation: '✏️ Alter Server', description: 'Modify server options or owner' },
            { operation: '➕ Create User Mapping', description: 'Add authentication for users' },
            { operation: '🔐 Grant USAGE', description: 'Grant server access to roles' },
            { operation: '✅ Test Connection', description: 'Verify server connectivity' },
            { operation: '❌ Drop Server', description: 'Delete server (Warning: CASCADE required)' }
          ])
        )
        .addMarkdown('##### 📋 Server Details and Options')
        .addSql(ForeignDataWrapperSQL.query.serverDetails(item.label))
        .addMarkdown('##### 👥 User Mappings')
        .addSql(ForeignDataWrapperSQL.query.listUserMappings(item.label))
        .addMarkdown('##### 📊 Foreign Tables Using This Server')
        .addSql(ForeignDataWrapperSQL.query.foreignTablesByServer(item.label))
        .addMarkdown('##### ✏️ Alter Server Options')
        .addSql(ForeignDataWrapperSQL.alter.serverOptions(item.label))
        .addMarkdown('##### ➕ Create User Mapping')
        .addSql(ForeignDataWrapperSQL.create.userMapping.basic(item.label))
        .addMarkdown('##### 🔐 Grant USAGE Permission')
        .addSql(ForeignDataWrapperSQL.grant.usageOnServer(item.label, 'role_name'))
        .addMarkdown('##### ✅ Test Server Connection')
        .addSql(ForeignDataWrapperSQL.test.connection(item.label))
        .addMarkdown('##### ❌ Drop Foreign Server')
        .addSql(ForeignDataWrapperSQL.drop.server(item.label))
        .showTemp();
    } finally {
      // Do not close shared client
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create foreign server operations notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdShowForeignServerProperties - Show detailed properties of a foreign server
 */
export async function cmdShowForeignServerProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    try {
      const serverResult = await client.query(ForeignDataWrapperSQL.query.serverDetails(item.label));
      const mappingsResult = await client.query(ForeignDataWrapperSQL.query.listUserMappings(item.label));
      const tablesResult = await client.query(ForeignDataWrapperSQL.query.foreignTablesByServer(item.label));
      const optionsResult = await client.query(ForeignDataWrapperSQL.manage.showServerOptions(item.label));
      const statsResult = await client.query(ForeignDataWrapperSQL.manage.serverStatistics(item.label));

      const server = serverResult.rows[0] || {};
      const mappings = mappingsResult.rows;
      const tables = tablesResult.rows;
      const options = optionsResult.rows;
      const stats = statsResult.rows[0] || {};

      // Build user mappings table HTML
      const mappingRows = mappings.map((mapping: any) => {
        return `    <tr>
        <td><strong>${mapping.user_name}</strong></td>
        <td>${mapping.options ? mapping.options.filter((opt: string) => !opt.includes('password')).join(', ') : '—'}</td>
    </tr>`;
      }).join('\n');

      // Build foreign tables table HTML
      const tableRows = tables.map((table: any) => {
        return `    <tr>
        <td><code>${table.schema_name}.${table.table_name}</code></td>
        <td>${table.size || '—'}</td>
        <td>${table.comment || '—'}</td>
    </tr>`;
      }).join('\n');

      // Build options table HTML
      const optionRows = options.map((opt: any) => {
        const optParts = opt.option?.split('=') || ['', ''];
        return `    <tr>
        <td><strong>${optParts[0]}</strong></td>
        <td>${optParts[1] || '—'}</td>
    </tr>`;
      }).join('\n');

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`🖥️ Foreign Server Properties: \`${item.label}\``) +
          MarkdownUtils.infoBox(`**Owner:** ${server.owner || 'N/A'} | **FDW:** ${server.fdw_name || 'N/A'} ${server.comment ? `| **Comment:** ${server.comment}` : ''}`) +
          `\n\n#### 💾 General Information\n\n` +
          MarkdownUtils.propertiesTable({
            'Server Name': server.server_name || item.label,
            'FDW': server.fdw_name || 'N/A',
            'Owner': server.owner || 'N/A',
            'Server Type': server.server_type || 'N/A',
            'Server Version': server.server_version || 'N/A',
            'User Mappings': `${stats.user_mappings || 0}`,
            'Foreign Tables': `${stats.foreign_tables || 0}`,
            'Total Size': stats.total_size || '0 bytes'
          }) +
          (options.length > 0 ? `\n\n#### ⚙️ Server Options\n\n` +
            `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 30%;">Option</th>
        <th style="text-align: left;">Value</th>
    </tr>
${optionRows}
</table>\n\n` : '\n\n_No options configured_\n\n') +
          (mappings.length > 0 ? `#### 👥 User Mappings (${mappings.length})\n\n` +
            `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 30%;">User</th>
        <th style="text-align: left;">Options</th>
    </tr>
${mappingRows}
</table>\n\n` : '\n\n_No user mappings_\n\n') +
          (tables.length > 0 ? `#### 📊 Foreign Tables (${tables.length})\n\n` +
            `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 40%;">Table</th>
        <th style="text-align: left; width: 20%;">Size</th>
        <th style="text-align: left;">Comment</th>
    </tr>
${tableRows}
</table>\n\n` : '\n\n_No foreign tables using this server_\n\n') +
          '---'
        )
        .addMarkdown('##### 📝 CREATE SERVER Script')
        .addSql(`-- Recreate server (modify options as needed)\n${ForeignDataWrapperSQL.create.server.basic(server.fdw_name || 'postgres_fdw')}`)
        .addMarkdown('##### ✏️ ALTER SERVER Templates')
        .addSql(`${ForeignDataWrapperSQL.alter.serverOptions(item.label)}\n\n${ForeignDataWrapperSQL.alter.serverOwner(item.label)}\n\n${ForeignDataWrapperSQL.alter.serverRename(item.label)}`)
        .addMarkdown('##### 🗑️ DROP SERVER')
        .addSql(ForeignDataWrapperSQL.drop.server(item.label, true))
        .showTemp();
    } finally {
      // Do not close shared client
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show foreign server properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdCreateUserMapping - Command to create a new user mapping
 */
export async function cmdCreateUserMapping(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    const serverName = item.type === 'foreign-server' ? item.label : 'server_name';

    const markdown = MarkdownUtils.header(`➕ Create New User Mapping${item.type === 'foreign-server' ? ` for: \`${item.label}\`` : ''}`) +
      MarkdownUtils.infoBox('User mappings define authentication credentials for accessing foreign servers. Each database user needs a mapping to use the foreign server.') +
      `\n\n#### 📋 User Mapping Design Guidelines\n\n` +
      MarkdownUtils.operationsTable([
        { operation: '<strong>Security</strong>', description: 'Never hardcode passwords in scripts. Use secure storage or environment variables.' },
        { operation: '<strong>Credentials</strong>', description: 'Each user can have different remote credentials. Use least-privilege principle.' },
        { operation: '<strong>Scope</strong>', description: 'Mappings apply per-user or PUBLIC (all users)' },
        { operation: '<strong>Testing</strong>', description: 'Test user mapping by querying a foreign table' },
        { operation: '<strong>Rotation</strong>', description: 'Regularly rotate passwords using ALTER USER MAPPING' }
      ]) +
      `\n\n#### 🏷️ Common User Mapping Patterns\n\n` +
      MarkdownUtils.propertiesTable({
        'Per-User Mapping': 'Each database user maps to their own remote account',
        'PUBLIC Mapping': 'All users share the same remote credentials (read-only recommended)',
        'Service Account': 'Map to dedicated service account for application access',
        'Role-based': 'Different roles map to different remote accounts',
        'Passwordless': 'Use certificate-based authentication where supported'
      }) +
      MarkdownUtils.warningBox('⚠️ **Security Warning:** Passwords in user mappings are stored encrypted in PostgreSQL, but can be viewed by superusers. Use least-privilege accounts on remote servers.') +
      `\n\n---`;

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 📝 Basic User Mapping (Recommended Start)')
      .addSql(ForeignDataWrapperSQL.create.userMapping.basic(serverName))
      .addMarkdown('##### 🔐 User Mapping with Password')
      .addSql(ForeignDataWrapperSQL.create.userMapping.withPassword(serverName))
      .addMarkdown('##### 🌐 PUBLIC User Mapping (All Users)')
      .addSql(ForeignDataWrapperSQL.create.userMapping.public(serverName))
      .addMarkdown('##### ⚙️ User Mapping with Advanced Options')
      .addSql(ForeignDataWrapperSQL.create.userMapping.withOptions(serverName))
      .addMarkdown('##### ✅ Test User Mapping')
      .addSql(`-- Test by querying a foreign table\n-- SELECT * FROM foreign_table_name LIMIT 1;\n\n-- Or test permissions\n${ForeignDataWrapperSQL.test.permissions(serverName)}`)
      .addMarkdown(MarkdownUtils.successBox('After creating user mapping, test it by querying a foreign table. If you get permission errors, check the remote server permissions and credentials.', 'Tip'))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create user mapping notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdUserMappingOperations - Command to create operations notebook for a user mapping
 */
export async function cmdUserMappingOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    // For user mappings, we need server name from parent and username from label
    const serverName = item.schema || 'server_name'; // Using schema field to store server name
    const userName = item.label;

    try {
      const mappingResult = await client.query(ForeignDataWrapperSQL.query.userMappingDetails(serverName, userName));
      const serverResult = await client.query(ForeignDataWrapperSQL.query.serverDetails(serverName));

      const mapping = mappingResult.rows[0] || {};
      const server = serverResult.rows[0] || {};

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`👤 User Mapping Operations: \`${userName}@${serverName}\``) +
          MarkdownUtils.infoBox('This notebook contains operations for managing the user mapping. Execute the cells below to perform operations.') +
          `\n\n#### 📊 User Mapping Information\n\n` +
          MarkdownUtils.propertiesTable({
            'User': userName,
            'Server': serverName,
            'FDW': mapping.fdw_name || server.fdw_name || 'N/A',
            'Server Owner': mapping.server_owner || server.owner || 'N/A'
          }) +
          `\n\n#### 🎯 Available Operations\n\n` +
          MarkdownUtils.operationsTable([
            { operation: '📋 View Details', description: 'Show mapping configuration and options' },
            { operation: '✏️ Alter Mapping', description: 'Update credentials or options' },
            { operation: '✅ Test Access', description: 'Verify connection and permissions' },
            { operation: '🔄 Rotate Credentials', description: 'Update remote password' },
            { operation: '❌ Drop Mapping', description: 'Remove user mapping' }
          ])
        )
        .addMarkdown('##### 📋 User Mapping Details')
        .addSql(ForeignDataWrapperSQL.query.userMappingDetails(serverName, userName))
        .addMarkdown('##### ✏️ Alter User Mapping Options')
        .addSql(ForeignDataWrapperSQL.alter.userMappingOptions(serverName, userName))
        .addMarkdown('##### 🔄 Rotate Password (Change Remote Credentials)')
        .addSql(`-- Update remote password\nALTER USER MAPPING FOR ${userName}\nSERVER ${serverName}\nOPTIONS (SET password 'new_password_here');`)
        .addMarkdown('##### ✅ Test Permissions')
        .addSql(ForeignDataWrapperSQL.test.permissions(serverName))
        .addMarkdown('##### ❌ Drop User Mapping')
        .addSql(ForeignDataWrapperSQL.drop.userMapping(serverName, userName))
        .showTemp();
    } catch (err: any) {
      // If query fails, still show templates
      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`👤 User Mapping Operations: \`${userName}@${serverName}\``) +
          MarkdownUtils.infoBox('Operations for managing the user mapping.')
        )
        .addMarkdown('##### 📋 User Mapping Details')
        .addSql(ForeignDataWrapperSQL.query.userMappingDetails(serverName, userName))
        .addMarkdown('##### ✏️ Alter User Mapping')
        .addSql(ForeignDataWrapperSQL.alter.userMappingOptions(serverName, userName))
        .addMarkdown('##### ❌ Drop User Mapping')
        .addSql(ForeignDataWrapperSQL.drop.userMapping(serverName, userName))
        .showTemp();
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create user mapping operations notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdShowUserMappingProperties - Show detailed properties of a user mapping
 */
export async function cmdShowUserMappingProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    const serverName = item.schema || 'server_name';
    const userName = item.label;

    try {
      const mappingResult = await client.query(ForeignDataWrapperSQL.query.userMappingDetails(serverName, userName));
      const serverResult = await client.query(ForeignDataWrapperSQL.query.serverDetails(serverName));
      const optionsResult = await client.query(ForeignDataWrapperSQL.manage.showUserMappingOptions(serverName, userName));

      const mapping = mappingResult.rows[0] || {};
      const server = serverResult.rows[0] || {};
      const options = optionsResult.rows;

      // Build options table HTML (censor passwords)
      const optionRows = options.map((opt: any) => {
        const optParts = opt.option?.split('=') || ['', ''];
        const value = optParts[0] === 'password' ? '********' : (optParts[1] || '—');
        return `    <tr>
        <td><strong>${optParts[0]}</strong></td>
        <td>${value}</td>
    </tr>`;
      }).join('\n');

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`👤 User Mapping Properties: \`${userName}@${serverName}\``) +
          MarkdownUtils.infoBox(`Maps database user **${userName}** to remote credentials on server **${serverName}**`) +
          `\n\n#### 💾 General Information\n\n` +
          MarkdownUtils.propertiesTable({
            'Database User': userName,
            'Foreign Server': serverName,
            'FDW': mapping.fdw_name || server.fdw_name || 'N/A',
            'Server Owner': mapping.server_owner || server.owner || 'N/A'
          }) +
          (options.length > 0 ? `\n\n#### ⚙️ Mapping Options\n\n` +
            MarkdownUtils.warningBox('Password values are censored for security. Only superusers can view actual passwords in system catalogs.', 'Security') +
            `\n<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 30%;">Option</th>
        <th style="text-align: left;">Value</th>
    </tr>
${optionRows}
</table>\n\n` : '\n\n_No options configured_\n\n') +
          `#### 📊 Associated Server Information\n\n` +
          MarkdownUtils.propertiesTable({
            'Server Name': server.server_name || serverName,
            'FDW': server.fdw_name || 'N/A',
            'Owner': server.owner || 'N/A'
          }) +
          '---'
        )
        .addMarkdown('##### 📝 CREATE USER MAPPING Script')
        .addSql(`-- Recreate user mapping (update password!)\n${ForeignDataWrapperSQL.create.userMapping.withPassword(serverName)}`)
        .addMarkdown('##### ✏️ ALTER USER MAPPING Templates')
        .addSql(ForeignDataWrapperSQL.alter.userMappingOptions(serverName, userName))
        .addMarkdown('##### 🗑️ DROP USER MAPPING')
        .addSql(ForeignDataWrapperSQL.drop.userMapping(serverName, userName))
        .showTemp();
    } finally {
      // Do not close shared client
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show user mapping properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdDropForeignServer - Command to drop a foreign server
 */
export async function cmdDropForeignServer(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop Foreign Server: \`${item.label}\``) +
        MarkdownUtils.dangerBox('This action will <strong>PERMANENTLY DELETE</strong> the foreign server. All foreign tables and user mappings using this server will also be dropped with CASCADE.', 'Caution') +
        `\n\n#### 🔍 Pre-Drop Checklist\n\n` +
        MarkdownUtils.propertiesTable({
          '✅ Backups': 'Do you have backups of data accessed through this server?',
          '✅ Dependencies': 'Check for foreign tables and user mappings',
          '✅ Applications': 'Ensure no applications are actively using this server',
          '✅ Documentation': 'Update documentation and connection inventories'
        }) +
        `\n\n#### 🔗 Check Dependencies\n\nRun this query first to see what will be dropped:`
      )
      .addSql(ForeignDataWrapperSQL.manage.dependencies(item.label))
      .addMarkdown('#### 🗑️ Drop Server')
      .addSql(ForeignDataWrapperSQL.drop.server(item.label))
      .addMarkdown('#### 🗑️ Drop Server with CASCADE (Drops All Foreign Tables)')
      .addSql(ForeignDataWrapperSQL.drop.server(item.label, true))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create drop server notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdDropUserMapping - Command to drop a user mapping
 */
export async function cmdDropUserMapping(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    const serverName = item.schema || 'server_name';
    const userName = item.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop User Mapping: \`${userName}@${serverName}\``) +
        MarkdownUtils.warningBox('Dropping this user mapping will remove access to the foreign server for this user. They will no longer be able to query foreign tables.') +
        `\n\n#### 🔍 Verification Checklist\n\n` +
        MarkdownUtils.propertiesTable({
          '✅ User': `Confirm this is for user: ${userName}`,
          '✅ Server': `Confirm this is for server: ${serverName}`,
          '✅ Impact': 'User will lose access to all foreign tables on this server',
          '✅ Alternative': 'Can you revoke access another way instead?'
        })
      )
      .addMarkdown('#### 🗑️ Drop User Mapping')
      .addSql(ForeignDataWrapperSQL.drop.userMapping(serverName, userName))
      .showTemp();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create drop user mapping notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Refresh commands for tree view
 */
export async function cmdRefreshForeignDataWrapper(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
  databaseTreeProvider?.refresh(item);
}

export async function cmdRefreshForeignServer(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
  databaseTreeProvider?.refresh(item);
}

export async function cmdRefreshUserMapping(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
  databaseTreeProvider?.refresh(item);
}
