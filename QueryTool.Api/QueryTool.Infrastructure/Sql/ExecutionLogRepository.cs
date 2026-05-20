// QueryTool.Infrastructure/Sql/ExecutionLogRepository.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using QueryTool.Core;

namespace QueryTool.Infrastructure
{
    public sealed class SqlExecutionLogRepository : IExecutionLogRepository
    {
        private readonly IDbConnections _c;
        public SqlExecutionLogRepository(IDbConnections c) { _c = c; }

        public async Task LogAsync(int userId, int queryId, int? firmId, int durationMs, int rowCount, string parametersJson, bool success, string? errorMessage)
        {
            const string sql = @"
INSERT INTO [dbo].[ExecutionLog]
([UserId],[FirmId],[QueryId],[ExecutedAt],[DurationMs],[RowCount],[ParametersJson],[Success],[ErrorMessage])
VALUES
(@U,@F,@Q, SYSUTCDATETIME(), @D,@R,@P,@S,@E);";
            using var db = new SqlConnection(_c.Data);
            await db.ExecuteAsync(sql, new
            {
                U = userId,
                F = firmId,
                Q = queryId,
                D = durationMs,
                R = rowCount,
                P = parametersJson,
                S = success,
                E = errorMessage
            });
        }

        // Top queries by run count (Data -> aggregate; Catalog -> names)
        public async Task<QueryUsageDto> QueryUsageAsync(DateTime from, DateTime to, int? firmId)
        {
            const string sql = @"
SELECT TOP 10 
    q.[QueryID]           AS [QueryId],
    q.[QueryName]         AS [Name],
    q.[QueryDescription]  AS [Description],
    f.[FirmName]          AS [FirmName],
    COUNT(*)              AS [RunCount]
FROM [dbo].[ExecutionLog] el
JOIN [dbo].[Query] q ON q.[QueryID] = el.[QueryId]
LEFT JOIN [dbo].[Firm]  f ON f.[FirmID] = q.[FirmID]
WHERE el.[ExecutedAt] BETWEEN @F AND @T
  AND (@FirmId IS NULL OR el.[FirmId] = @FirmId)
GROUP BY q.[QueryID], q.[QueryName], q.[QueryDescription], f.[FirmName]
ORDER BY COUNT(*) DESC;

SELECT COUNT(*)
FROM [dbo].[ExecutionLog] el
WHERE el.[ExecutedAt] BETWEEN @F AND @T
  AND (@FirmId IS NULL OR el.[FirmId] = @FirmId);";

            using var db = new SqlConnection(_c.Data);
            using var multi = await db.QueryMultipleAsync(sql, new { F = from, T = to, FirmId = firmId });

            var items = (await multi.ReadAsync())
                .Select(r => new UsageItem(
                    (int)r.QueryId,
                    (string)r.Name,
                    (string?)r.Description,
                    (string?)r.FirmName,
                    (int)r.RunCount
                ))
                .ToList();

            var total = await multi.ReadFirstAsync<int>();
            return new QueryUsageDto(items, total);
        }

        // Top users by run count (both tables are in DATA DB)
        public async Task<UserActivityDto> UserActivityAsync(DateTime from, DateTime to)
        {
            const string sql = @"
SELECT TOP 10 
    u.[UserID] AS [UserId],
    u.[Email]  AS [User],
    COUNT(*)   AS [RunCount]
FROM [dbo].[ExecutionLog] el
LEFT JOIN [dbo].[User] u ON u.[UserID] = el.[UserId]
WHERE el.[ExecutedAt] BETWEEN @F AND @T
GROUP BY u.[UserID], u.[Email]
ORDER BY COUNT(*) DESC;

SELECT COUNT(DISTINCT el.[UserId])
FROM [dbo].[ExecutionLog] el
WHERE el.[ExecutedAt] BETWEEN @F AND @T;";

            using var db = new SqlConnection(_c.Data);
            using var multi = await db.QueryMultipleAsync(sql, new { F = from, T = to });

            var items = (await multi.ReadAsync())
                .Select(r => new ActivityItem(
                    (int)r.UserId,
                    (string)r.User,
                    (int)r.RunCount
                ))
                .ToList();

            var totalUsers = await multi.ReadFirstAsync<int>();
            return new UserActivityDto(items, totalUsers);
        }

        public async Task<TimeseriesDto> TimeseriesAsync(string bucket, DateTime? from, DateTime? to)
        {
            var b = (bucket ?? "day").ToLowerInvariant();
            var fromVal = from ?? DateTime.UtcNow.AddDays(-7);
            var toVal = to ?? DateTime.UtcNow;

            string dateExpr = b switch
            {
                "hour" => "DATETIME2FROMPARTS(DATEPART(year, el.ExecutedAt), DATEPART(month, el.ExecutedAt), DATEPART(day, el.ExecutedAt), DATEPART(hour, el.ExecutedAt), 0, 0, 0, 7)",
                "month" => "DATETIME2FROMPARTS(DATEPART(year, el.ExecutedAt), DATEPART(month, el.ExecutedAt), 1, 0, 0, 0, 0, 7)",
                _ => "DATETIME2FROMPARTS(DATEPART(year, el.ExecutedAt), DATEPART(month, el.ExecutedAt), DATEPART(day, el.ExecutedAt), 0, 0, 0, 0, 7)"
            };

            var sql = $@"
SELECT
    {dateExpr} AS [At],
    COUNT(*)   AS [Count]
FROM [dbo].[ExecutionLog] el
WHERE el.[ExecutedAt] BETWEEN @F AND @T
GROUP BY {dateExpr}
ORDER BY [At];";

            using var db = new SqlConnection(_c.Data);
            var rows = await db.QueryAsync(sql, new { F = fromVal, T = toVal });
            var points = rows.Select(r => new TimeseriesPoint((DateTime)r.At, (int)r.Count)).ToList();
            return new TimeseriesDto(points);

        }
    }
}
