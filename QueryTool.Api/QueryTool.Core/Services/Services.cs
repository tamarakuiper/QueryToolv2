// QueryTool.Core/Services/Services.cs
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using System.Security.Claims;
using Dapper;
using Microsoft.Data.SqlClient;

namespace QueryTool.Core;

public class CatalogService : ICatalogService
{
    private readonly IFirmRepository _firms;
    private readonly IQueryRepository _queries;
    private readonly IUserRepository _users;
    private readonly IGroupRepository _groups;

    public CatalogService(
        IFirmRepository firms,
        IQueryRepository queries,
        IUserRepository users,
        IGroupRepository groups)
    {
        _firms = firms;
        _queries = queries;
        _users = users;
        _groups = groups;
    }

    public Task<IEnumerable<FirmDto>> GetFirmsAsync() => _firms.ListAsync();
    
  
    public async Task<IEnumerable<QueryDto>> GetQueriesForCurrentUserAsync(int firmId, ClaimsPrincipal user)
    {
        var isAdmin =
            user.FindFirst("IsAdmin")?.Value == "true" ||
            user.FindFirst("is_admin")?.Value == "true";

        if (isAdmin)
        {
            return await _queries.ListForFirmAsync(firmId);
        }

        var claimGroups = user.FindAll("group")
                              .Select(c => int.TryParse(c.Value, out var g) ? g : (int?)null)
                              .Where(g => g.HasValue)
                              .Select(g => g!.Value)
                              .ToArray();

        int[] groups = claimGroups;

        if (groups.Length == 0)
        {
            var email =
                user.FindFirst("preferred_username")?.Value
                ?? user.FindFirst(ClaimTypes.Upn)?.Value
                ?? user.FindFirst(ClaimTypes.Email)?.Value;

            if (!string.IsNullOrWhiteSpace(email))
            {
                var row = await _users.GetByEmailAsync(email);
                if (row is not null)
                {
                    var groupRows = await _groups.GetByUserIdAsync(row.UserId);
                    groups = groupRows.Select(g => g.GroupId).ToArray();
                }
            }
        }

        return await _queries.ListForFirmAndGroupsAsync(firmId, groups);
    }
}

public class ExecutionService : IExecutionService
{
    private readonly IQueryRepository _queries;
    private readonly IExecutionLogRepository _log;
    private readonly IConnectionStringService _connStrings; // <-- Core interface

    public ExecutionService(IQueryRepository queries, IExecutionLogRepository log, IConnectionStringService connStrings)
    {
        _queries = queries;
        _log = log;
        _connStrings = connStrings;
    }

    public async Task<ExecuteResult> ExecuteAsync(ClaimsPrincipal user, int queryId, Dictionary<string, object> parameters)
    {
        var isAdmin = user.HasClaim("IsAdmin", "true") ||
                      user.FindFirst("is_admin")?.Value == "true";

        var sub = user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? throw new UnauthorizedAccessException("Missing user id claim.");

        if (!int.TryParse(sub, out var userId))
            throw new UnauthorizedAccessException("Invalid user id claim.");

        if (!parameters.TryGetValue("firmId", out var firmObj) ||
            !int.TryParse(Convert.ToString(firmObj), out var firmId))
            throw new InvalidOperationException("firmId is required.");

        var def = await _queries.GetByIdAsync(queryId)
                  ?? throw new InvalidOperationException("Query not found.");

        // Build execution connection string from catalog metadata
        var cs = await _connStrings.BuildForExecutionAsync(firmId, queryId);

        var dyn = new DynamicParameters();
        foreach (var kv in parameters)
        {
            if (kv.Key.Equals("firmId", StringComparison.OrdinalIgnoreCase)) continue;

            if (kv.Value is System.Collections.IEnumerable enumerable && kv.Value is not string)
            {
                dyn.Add(kv.Key, enumerable); // Dapper expands IEnumerable
            }
            else
            {
                dyn.Add(kv.Key, kv.Value);
            }
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            using var conn = new SqlConnection(cs);
            await conn.OpenAsync();

            // If stored proc, change CommandType.Text -> CommandType.StoredProcedure
            using DbDataReader reader = await conn.ExecuteReaderAsync(
                new CommandDefinition(def.Sql, dyn, commandType: CommandType.Text));

            var result = await ReadExecuteResultAsync(reader);

            sw.Stop();

            await _log.LogAsync(
                userId: userId,
                queryId: queryId,
                firmId: def.FirmId,
                durationMs: (int)sw.ElapsedMilliseconds,
                rowCount: result.Rows.Count(),
                parametersJson: System.Text.Json.JsonSerializer.Serialize(parameters),
                success: true,
                errorMessage: null
            );

            return result;
        }
        catch (Exception ex)
        {
            sw.Stop();

            await _log.LogAsync(
                userId: userId,
                queryId: queryId,
                firmId: def.FirmId,
                durationMs: (int)sw.ElapsedMilliseconds,
                rowCount: 0,
                parametersJson: System.Text.Json.JsonSerializer.Serialize(parameters),
                success: false,
                errorMessage: ex.Message
            );

            throw;
        }
    }

    private static async Task<ExecuteResult> ReadExecuteResultAsync(DbDataReader rdr)
    {
        var cols = Enumerable.Range(0, rdr.FieldCount)
                             .Select(rdr.GetName)
                             .ToArray();

        var rows = new List<Dictionary<string, object>>(); // non-nullable values
        while (await rdr.ReadAsync())
        {
            var row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < rdr.FieldCount; i++)
            {
                // if null -> assign null! to satisfy non-nullability on ExecuteResult ctor
                row[cols[i]] = await rdr.IsDBNullAsync(i) ? null! : rdr.GetValue(i);
            }
            rows.Add(row);
        }

        return new ExecuteResult(cols, rows);
    }
}

public class AdminService : IAdminService
{
    private readonly IUserRepository _users;
    private readonly IGroupRepository _groups;
    public AdminService(IUserRepository users, IGroupRepository groups) { _users = users; _groups = groups; }

    public Task<IEnumerable<UserDto>> ListUsersAsync() => _users.ListAsync();
    public Task<UserDto> CreateUserAsync(CreateUserDto dto) => _users.CreateAsync(dto);
    public Task<UserDto> UpdateUserAsync(int id, UpdateUserDto dto) => _users.UpdateAsync(id, dto);
    public Task DeleteUserAsync(int id) => _users.DeleteAsync(id);

    public async Task HardDeleteUserAsync(int id) => await _users.HardDeleteAsync(id);

    public Task<IEnumerable<GroupDto>> ListGroupsAsync() => _groups.ListAsync();
    public Task<GroupDto> CreateGroupAsync(CreateGroupDto dto) => _groups.CreateAsync(dto);
    public Task<GroupDto> UpdateGroupAsync(int id, UpdateGroupDto dto) => _groups.UpdateGroupAsync(id, dto);
    public Task DeleteGroupAsync(int id) => _groups.DeleteGroupAsync(id);

    public Task AssignUsersToGroupAsync(int groupId, IEnumerable<int> userIds) => _groups.AssignUsersAsync(groupId, userIds);
    public Task AssignQueriesToGroupAsync(int groupId, IEnumerable<int> queryIds) => _groups.AssignQueriesAsync(groupId, queryIds);
}

public class AnalyticsService : IAnalyticsService
{
    private readonly IExecutionLogRepository _repo;
    public AnalyticsService(IExecutionLogRepository repo) { _repo = repo; }
    public Task<QueryUsageDto> GetQueryUsageAsync(DateTime from, DateTime to, int? firmId) => _repo.QueryUsageAsync(from, to, firmId);
    public Task<UserActivityDto> GetUserActivityAsync(DateTime from, DateTime to) => _repo.UserActivityAsync(from, to);
    public Task<TimeseriesDto> GetTimeseriesAsync(string bucket, DateTime? from, DateTime? to) => _repo.TimeseriesAsync(bucket, from, to);
}
