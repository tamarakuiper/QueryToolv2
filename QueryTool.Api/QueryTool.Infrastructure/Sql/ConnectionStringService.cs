using System;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using QueryTool.Core;

namespace QueryTool.Infrastructure
{
    public sealed class ConnectionStringService : IConnectionStringService
    {
        private readonly IConfiguration _cfg;
        private readonly IDbConnections _db; // Catalog, Data connection strings provisioned in Program.cs

        public ConnectionStringService(IConfiguration cfg, IDbConnections db)
        {
            _cfg = cfg;
            _db = db;
        }

        public async Task<string> BuildForExecutionAsync(int firmId, int queryId)
        {
            using var cat = new SqlConnection(_db.Catalog);
            await cat.OpenAsync();

            // Use YOUR real column names (from your dump)
            // - Query: QueryID, QueryCommand, QueryTypeID, FirmID (nullable)
            // - QueryType: QueryTypeID, QueryTypeName
            // - Firm: FirmID, WAPInstanceID, PCInstanceID, PCDatabaseID
            // - WAPInstance: WAPInstanceID, WAPInstanceName
            // - PCInstance: PCInstanceID, PCInstanceName
            // - PCDatabase: PCDatabaseID, PCDatabaseName
            //
            // Prefer an exact firm match; if the query is global (FirmID NULL/0), still use THIS firm’s mapping.
            const string sql = @"
SELECT TOP 1
    q.QueryID,
    q.QueryCommand                          AS QuerySql,
    qt.QueryTypeName                        AS QueryTypeName,
    f.FirmID                                AS FirmID,
    f.WAPInstanceID,
    f.PCInstanceID,
    f.PCDatabaseID,
    wi.WAPInstanceName,
    pci.PCInstanceName,
    pcd.PCDatabaseName
FROM dbo.[Query] AS q
JOIN dbo.[QueryType] AS qt ON qt.QueryTypeID = q.QueryTypeID
JOIN dbo.[Firm]      AS f  ON f.FirmID = @firmId
LEFT JOIN dbo.WAPInstance AS wi ON wi.WAPInstanceID = f.WAPInstanceID
LEFT JOIN dbo.PCInstance  AS pci ON pci.PCInstanceID = f.PCInstanceID
LEFT JOIN dbo.PCDatabase  AS pcd ON pcd.PCDatabaseID = f.PCDatabaseID
WHERE q.QueryID = @queryId
  AND (q.FirmID = @firmId OR q.FirmID IS NULL OR q.FirmID = 0)
ORDER BY CASE WHEN q.FirmID = @firmId THEN 0 ELSE 1 END;";

            var row = await cat.QuerySingleOrDefaultAsync(sql, new { firmId, queryId });
            if (row == null)
                throw new InvalidOperationException($"Query {queryId} not found (firm {firmId}).");

            string type = (string)row.QueryTypeName;

            if (type.Equals("WAP", StringComparison.OrdinalIgnoreCase))
            {
                // Server from Firm → WAPInstance
                string? server = (string?)row.WAPInstanceName;
                if (string.IsNullOrWhiteSpace(server))
                    throw new InvalidOperationException($"Firm {firmId} has no WAPInstance mapping.");

                // DB is fixed for WAP
                var builder = new SqlConnectionStringBuilder
                {
                    DataSource = server,                 // e.g. PROD0WAP or localhost\SQLEXPRESS
                    InitialCatalog = "WAPDB",
                    UserID = _cfg["Wap:User"] ?? "wap",
                    Password = _cfg["Wap:Password"] ?? "pinklokijh",
                    TrustServerCertificate = true,
                    Encrypt = false
                };
                return builder.ToString();
            }
            else if (type.Equals("PortfolioCenter", StringComparison.OrdinalIgnoreCase))
            {
                // Server + DB from Firm → PCInstance + PCDatabase
                string? server = (string?)row.PCInstanceName;
                string? dbName = (string?)row.PCDatabaseName;

                if (string.IsNullOrWhiteSpace(server) || string.IsNullOrWhiteSpace(dbName))
                    throw new InvalidOperationException(
                        $"Firm {firmId} missing PCInstance/PCDatabase mapping (PCInstanceName/PCDatabaseName).");

                var builder = new SqlConnectionStringBuilder
                {
                    DataSource = server,
                    InitialCatalog = dbName,
                    UserID = _cfg["PC:User"] ?? "pcuser",
                    Password = _cfg["PC:Password"] ?? "pcpassword",
                    TrustServerCertificate = true,
                    Encrypt = false
                };
                return builder.ToString();
            }

            throw new InvalidOperationException($"Unsupported QueryType: {type}");
        }
    }
}
