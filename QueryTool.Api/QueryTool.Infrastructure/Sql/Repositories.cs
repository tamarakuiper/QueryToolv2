// QueryTool.Infrastructure/Sql/Repositories.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using QueryTool.Core;

namespace QueryTool.Infrastructure
{
    // ========================= Users =========================
    public class UserRepository : IUserRepository
    {
        private readonly IDbConnections _c;
        public UserRepository(IDbConnections c) { _c = c; }

        // Enabled-only (used for login)
        public async Task<UserRow?> GetByEmailAsync(string email)
        {
            const string sql = @"
SELECT TOP 1
    u.[UserID]        AS [UserId],
    u.[Email]         AS [Email],
    LTRIM(RTRIM(CONCAT(NULLIF(u.[FirstName],''),' ',NULLIF(u.[LastName],'')))) AS [DisplayName],
    u.[IsAdmin]       AS [IsAdmin],
    u.[Password]      AS [HashedPassword]
FROM [dbo].[User] u
WHERE u.[Email] = @Email AND u.[IsEnabled] = 1;";
            using var db = new SqlConnection(_c.Data);
            return await db.QueryFirstOrDefaultAsync<UserRow>(sql, new { Email = email });
        }

        // Returns regardless of IsEnabled (for activation/admin)
        public async Task<UserRow?> GetAnyByEmailAsync(string email)
        {
            const string sql = @"
SELECT TOP 1
    u.[UserID]        AS [UserId],
    u.[Email]         AS [Email],
    LTRIM(RTRIM(CONCAT(NULLIF(u.[FirstName],''),' ',NULLIF(u.[LastName],'')))) AS [DisplayName],
    u.[IsAdmin]       AS [IsAdmin],
    u.[Password]      AS [HashedPassword]
FROM [dbo].[User] u
WHERE u.[Email] = @Email;";
            using var db = new SqlConnection(_c.Data);
            return await db.QueryFirstOrDefaultAsync<UserRow>(sql, new { Email = email });
        }

        public async Task<IEnumerable<UserDto>> ListAsync()
        {
            const string sql = @"
SELECT
    u.[UserID]                                                      AS [Id],
    u.[Email]                                                       AS [Email],
    LTRIM(RTRIM(CONCAT(NULLIF(u.[FirstName],''),' ',NULLIF(u.[LastName],'')))) AS [DisplayName],
    u.[IsAdmin]                                                     AS [IsAdmin],
    u.[IsEnabled]                                                   AS [IsEnabled]
FROM [dbo].[User] u
ORDER BY u.[UserID];";   
            using var db = new SqlConnection(_c.Data);
            return await db.QueryAsync<UserDto>(sql);
        }


        public async Task<UserDto> CreateAsync(CreateUserDto dto, string? hashedPassword = null, bool enabled = false)
        {
            var (first, last) = SplitName(dto.DisplayName ?? dto.Email);

            const string sql = @"
INSERT INTO [dbo].[User] ([Email],[FirstName],[LastName],[Password],[IsAdmin],[IsEnabled])
VALUES (@Email,@FirstName,@LastName,@Password,@IsAdmin,@IsEnabled);
SELECT CAST(SCOPE_IDENTITY() AS int);";

            using var db = new SqlConnection(_c.Data);
            var id = await db.ExecuteScalarAsync<int>(sql, new
            {
                Email = dto.Email,
                FirstName = first,
                LastName = last,
                Password = string.IsNullOrWhiteSpace(hashedPassword) ? "DISABLED" : hashedPassword,
                IsAdmin = dto.IsAdmin,
                IsEnabled = enabled ? 1 : 0                          // ← control default here
            });

            var display = string.IsNullOrWhiteSpace(dto.DisplayName)
                ? (first, last) switch
                {
                    (null or "", null or "") => dto.Email,
                    (not null and not "", null or "") => first!,
                    (null or "", not null and not "") => last!,
                    _ => $"{first} {last}"
                }
                : dto.DisplayName!;

            return new UserDto(id, dto.Email, display, dto.IsAdmin, enabled);
        }

        public async Task<UserDto> UpdateAsync(int id, UpdateUserDto dto)
        {
            var (first, last) = SplitName(dto.DisplayName);

            const string sql = @"
UPDATE [dbo].[User]
SET
    [FirstName] = COALESCE(@FirstName, [FirstName]),
    [LastName]  = COALESCE(@LastName,  [LastName]),
    [IsAdmin]   = COALESCE(@IsAdmin,   [IsAdmin]),
    [IsEnabled] = COALESCE(@IsEnabled, [IsEnabled])   -- ← new
WHERE [UserID] = @Id;

SELECT
    [UserID]                                                      AS [Id],
    [Email]                                                       AS [Email],
    LTRIM(RTRIM(CONCAT(NULLIF([FirstName],''),' ',NULLIF([LastName],'')))) AS [DisplayName],
    [IsAdmin]                                                     AS [IsAdmin],
    [IsEnabled]                                                   AS [IsEnabled]
FROM [dbo].[User]
WHERE [UserID] = @Id;";

            using var db = new SqlConnection(_c.Data);
            return await db.QuerySingleAsync<UserDto>(sql, new
            {
                Id = id,
                FirstName = first,
                LastName = last,
                IsAdmin = dto.IsAdmin,
                IsEnabled = dto.IsEnabled
            });
        }

        public async Task DeleteAsync(int id)
        {
            using var db = new SqlConnection(_c.Data);
            await db.ExecuteAsync(@"DELETE FROM [dbo].[User] WHERE [UserID]=@Id;", new { Id = id });
        }

        public async Task HardDeleteAsync(int id)
        {
            using var db = new SqlConnection(_c.Data);
            await db.OpenAsync();
            using var tx = db.BeginTransaction();

            // Delete dependents first
            await db.ExecuteAsync("DELETE FROM [dbo].[LoginHistory] WHERE [UserID] = @Id;", new { Id = id }, tx);
            await db.ExecuteAsync("DELETE FROM [dbo].[UserGroup] WHERE [UserID] = @Id;", new { Id = id }, tx);
            await db.ExecuteAsync("DELETE FROM [dbo].[ExecutionLog] WHERE [UserId] = @Id;", new { Id = id }, tx);

            // Finally, delete the user
            await db.ExecuteAsync("DELETE FROM [dbo].[User] WHERE [UserID] = @Id;", new { Id = id }, tx);

            tx.Commit();
        }

        public async Task<bool> SetPasswordIfEnabledAsync(string email, string hashedPassword)
        {
            const string sql = @"
UPDATE [dbo].[User]
SET [Password] = @Pwd
WHERE [Email] = @Email AND [IsEnabled] = 1;";
            using var db = new SqlConnection(_c.Data);
            var n = await db.ExecuteAsync(sql, new { Email = email, Pwd = hashedPassword });
            return n > 0; // false if not enabled or not found
        }

        private static (string? First, string? Last) SplitName(string? displayName)
        {
            if (string.IsNullOrWhiteSpace(displayName)) return (null, null);
            var parts = displayName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 1) return (parts[0], "");
            return (parts[0], string.Join(' ', parts.Skip(1)));
        }

        public async Task<bool> IsEnabledAsync(int userId)
        {
            const string sql = @"SELECT CAST(ISNULL([IsEnabled],0) AS bit) FROM [dbo].[User] WHERE [UserID] = @Id;";
            using var db = new SqlConnection(_c.Data);
            var v = await db.ExecuteScalarAsync<bool?>(sql, new { Id = userId });
            return v ?? false;
        }

        public async Task<bool> ActivateByEmailAsync(string email, string hashedPassword)
        {
            const string sql = @"
UPDATE u
   SET u.[Password] = @Password
FROM [dbo].[User] u
WHERE u.[Email] = @Email
  AND u.[IsEnabled] = 1; -- only if admin enabled
";
            using var db = new SqlConnection(_c.Data);
            var rows = await db.ExecuteAsync(sql, new { Email = email, Password = hashedPassword });
            return rows > 0;
        }


    }


    // ========================= Firms =========================
    public class FirmRepository : IFirmRepository
    {
        private readonly IDbConnections _c;
        public FirmRepository(IDbConnections c) { _c = c; }

        public async Task<IEnumerable<FirmDto>> ListAsync()
        {
            using var db = new SqlConnection(_c.Catalog);
            return await db.QueryAsync<FirmDto>(
                "SELECT FirmID AS Id, FirmName AS FirmName FROM [dbo].[Firm] ORDER BY FirmName");
        }
    }

    // ========================= Queries =========================
    public class QueryRepository : IQueryRepository
    {
        private readonly IDbConnections _c;
        public QueryRepository(IDbConnections c) { _c = c; }

        public async Task<IEnumerable<QueryDto>> ListAllAsync()
        {
            const string sql = @"
SELECT 
  q.[QueryID]          AS [Id],
  q.[FirmID]           AS [FirmId],
  q.[QueryName]        AS [Name],
  q.[QueryDescription] AS [Description],
  q.[QueryCommand]     AS [Sql],
  q.[QueryTypeID]      AS [QueryTypeId],
  q.[IsAggregate]      AS [IsAggregate]
FROM [dbo].[Query] q
ORDER BY q.[QueryName];";
            using var db = new SqlConnection(_c.Catalog);
            return await db.QueryAsync<QueryDto>(sql);
        }

        public async Task<IEnumerable<QueryDto>> ListForFirmAsync(int firmId)
        {
            const string sql = @"
SELECT 
  q.[QueryID]          AS [Id],
  q.[FirmID]           AS [FirmId],
  q.[QueryName]        AS [Name],
  q.[QueryDescription] AS [Description],
  q.[QueryCommand]     AS [Sql],
  q.[QueryTypeID]      AS [QueryTypeId],
  q.[IsAggregate]      AS [IsAggregate]
FROM [dbo].[Query] q
WHERE (q.[FirmID] = @FirmId OR q.[FirmID] = 0)
ORDER BY q.[QueryName];";
            using var db = new SqlConnection(_c.Catalog);
            return await db.QueryAsync<QueryDto>(sql, new { FirmId = firmId });
        }

        public async Task<IEnumerable<QueryDto>> ListForFirmAndGroupsAsync(int firmId, int[] groupIds)
        {
            const string sql = @"
SELECT DISTINCT
  q.[QueryID]          AS [Id],
  q.[FirmID]           AS [FirmId],
  q.[QueryName]        AS [Name],
  q.[QueryDescription] AS [Description],
  q.[QueryCommand]     AS [Sql],
  q.[QueryTypeID]      AS [QueryTypeId],
  q.[IsAggregate]      AS [IsAggregate]
FROM [dbo].[Query] q
JOIN [dbo].[QueryGroup] qg ON qg.[QueryId] = q.[QueryID]
WHERE (q.[FirmID] = @FirmId OR q.[FirmID] = 0)
  AND qg.[GroupId] IN @G
ORDER BY q.[QueryName];";
            using var db = new SqlConnection(_c.Catalog);
            var gids = (groupIds is { Length: > 0 }) ? groupIds : new[] { -1 };
            return await db.QueryAsync<QueryDto>(sql, new { FirmId = firmId, G = gids });
        }

        public async Task<bool> UserCanAccessQueryAsync(int queryId, int[] groupIds)
        {
            const string sql = @"SELECT COUNT(*) FROM [dbo].[QueryGroup] WHERE [QueryId]=@Q AND [GroupId] IN @G;";
            using var db = new SqlConnection(_c.Catalog);
            var gids = (groupIds is { Length: > 0 }) ? groupIds : new[] { -1 };
            var n = await db.ExecuteScalarAsync<int>(sql, new { Q = queryId, G = gids });
            return n > 0;
        }

        public async Task<QueryDto?> GetByIdAsync(int id)
        {
            const string sql = @"
SELECT 
  q.[QueryID]          AS [Id],
  q.[FirmID]           AS [FirmId],
  q.[QueryName]        AS [Name],
  q.[QueryDescription] AS [Description],
  q.[QueryCommand]     AS [Sql],
  q.[QueryTypeID]      AS [QueryTypeId],
  q.[IsAggregate]      AS [IsAggregate]
FROM [dbo].[Query] q
WHERE q.[QueryID] = @Id;";
            using var db = new SqlConnection(_c.Catalog);
            return await db.QueryFirstOrDefaultAsync<QueryDto>(sql, new { Id = id });
        }

        public async Task<int> CreateAsync(CreateQueryDto dto)
        {
            const int DEFAULT_QUERY_TYPE_ID = 1;
            const bool DEFAULT_IS_AGGREGATE = false;

            const string sql = @"
INSERT INTO [dbo].[Query]
(QueryName, QueryDescription, QueryCommand, QueryTypeID, IsAggregate, FirmID)
VALUES (@Name, @Description, @Sql, @QueryTypeID, @IsAggregate, @FirmId);
SELECT CAST(SCOPE_IDENTITY() AS INT);";

            using var db = new SqlConnection(_c.Catalog);
            return await db.ExecuteScalarAsync<int>(sql, new
            {
                dto.Name,
                dto.Description,
                Sql = dto.Sql,
                QueryTypeID = dto.QueryTypeId ?? DEFAULT_QUERY_TYPE_ID,
                IsAggregate = dto.IsAggregate ?? DEFAULT_IS_AGGREGATE,
                FirmId = dto.FirmId
            });
        }

        public async Task<QueryDto> UpdateAsync(int id, UpdateQueryDto dto)
        {
            const string sql = @"
UPDATE [dbo].[Query] SET
  [QueryName]        = ISNULL(@Name,        [QueryName]),
  [QueryDescription] = ISNULL(@Description, [QueryDescription]),
  [QueryCommand]     = ISNULL(@Sql,         [QueryCommand]),
  [FirmID]           = ISNULL(@FirmId,      [FirmID]),
  [QueryTypeID]      = ISNULL(@QueryTypeId, [QueryTypeID]),
  [IsAggregate]      = ISNULL(@IsAggregate, [IsAggregate])
WHERE [QueryID] = @Id;

SELECT 
  q.[QueryID]          AS [Id],
  q.[FirmID]           AS [FirmId],
  q.[QueryName]        AS [Name],
  q.[QueryDescription] AS [Description],
  q.[QueryCommand]     AS [Sql],
  q.[QueryTypeID]      AS [QueryTypeId],
  q.[IsAggregate]      AS [IsAggregate]
FROM [dbo].[Query] q
WHERE q.[QueryID] = @Id;";
            using var db = new SqlConnection(_c.Catalog);
            return await db.QueryFirstAsync<QueryDto>(sql, new
            {
                Id = id,
                dto.Name,
                dto.Description,
                Sql = dto.Sql,
                dto.FirmId,
                dto.QueryTypeId,
                dto.IsAggregate
            });
        }

        public async Task DeleteAsync(int id)
        {
            using var db = new SqlConnection(_c.Catalog);
            await db.ExecuteAsync("DELETE FROM [dbo].[Query] WHERE [QueryID]=@Id", new { Id = id });
        }

            }

    // ========================= Groups =========================
    public class GroupRepository : IGroupRepository
    {
        private readonly IDbConnections _c;
        public GroupRepository(IDbConnections c) { _c = c; }

        public async Task<IEnumerable<GroupDto>> ListAsync()
        {
            const string sql = @"
SELECT
    g.[GroupID]   AS [GroupId],
    g.[GroupName] AS [Name]
FROM [dbo].[Group] g
ORDER BY g.[GroupName];";
            using var db = new SqlConnection(_c.Data);
            var rows = await db.QueryAsync(sql);
            return rows.Select(r => new GroupDto((int)r.GroupId, (string)r.Name, null, true));
        }

        public async Task<GroupDto> CreateAsync(CreateGroupDto dto)
        {
            const string sql = @"
INSERT INTO [dbo].[Group] ([GroupName]) VALUES (@Name);
SELECT CAST(SCOPE_IDENTITY() AS int);";
            using var db = new SqlConnection(_c.Data);
            var id = await db.ExecuteScalarAsync<int>(sql, new { Name = dto.Name });
            return new GroupDto(id, dto.Name, dto.Description, true);
        }

        public async Task<GroupDto> UpdateGroupAsync(int id, UpdateGroupDto dto)
        {
            const string sql = @"
UPDATE [dbo].[Group]
SET [GroupName] = COALESCE(@Name, [GroupName])
WHERE [GroupID] = @Id;

SELECT [GroupID] AS [GroupId], [GroupName] AS [Name]
FROM [dbo].[Group] WHERE [GroupID] = @Id;";
            using var db = new SqlConnection(_c.Data);
            var row = await db.QuerySingleAsync(sql, new { Id = id, Name = dto.Name });
            return new GroupDto((int)row.GroupId, (string)row.Name, dto.Description, true);
        }

        public async Task DeleteGroupAsync(int id)
        {
            // 1) Remove user assignments (Data DB)
            using (var dbData = new SqlConnection(_c.Data))
            {
                await dbData.OpenAsync();
                using var tx = dbData.BeginTransaction();
                try
                {
                    await dbData.ExecuteAsync(
                        "DELETE FROM [dbo].[UserGroup] WHERE [GroupID] = @Id;",
                        new { Id = id }, tx);

                    tx.Commit();
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }

            // 2) Remove query assignments (Catalog DB)
            using (var dbCat = new SqlConnection(_c.Catalog))
            {
                await dbCat.ExecuteAsync(
                    "DELETE FROM [dbo].[QueryGroup] WHERE [GroupId] = @Id;",
                    new { Id = id });
            }

            // 3) Delete the group (Data DB)
            using (var dbData2 = new SqlConnection(_c.Data))
            {
                await dbData2.ExecuteAsync(
                    "DELETE FROM [dbo].[Group] WHERE [GroupID] = @Id;",
                    new { Id = id });
            }
        }

        public async Task<IEnumerable<GroupLite>> GetByUserIdAsync(int userId)
        {
            const string sql = @"
SELECT g.[GroupID] AS [GroupId], g.[GroupName] AS [Name]
FROM [dbo].[UserGroup] ug
JOIN [dbo].[Group] g ON g.[GroupID] = ug.[GroupID]
WHERE ug.[UserID] = @UserId
ORDER BY g.[GroupName];";
            using var db = new SqlConnection(_c.Data);
            var rows = await db.QueryAsync(sql, new { UserId = userId });
            return rows.Select(r => new GroupLite((int)r.GroupId, (string)r.Name));
        }

        public async Task<IEnumerable<int>> GetUserIdsAsync(int groupId)
        {
            const string sql = @"SELECT [UserID] FROM [dbo].[UserGroup] WHERE [GroupID]=@G;";
            using var db = new SqlConnection(_c.Data);
            return await db.QueryAsync<int>(sql, new { G = groupId });
        }

        public async Task<IEnumerable<int>> GetQueryIdsAsync(int groupId)
        {
            using var db = new SqlConnection(_c.Catalog);
            return await db.QueryAsync<int>(
                @"SELECT [QueryId] FROM [dbo].[QueryGroup] WHERE [GroupId]=@G;",
                new { G = groupId });
        }

        public async Task<IEnumerable<QueryDto>> GetQueriesByGroupAsync(int groupId)
        {
            const string sql = @"
SELECT q.[QueryID]          AS [Id],
       q.[FirmID]           AS [FirmId],
       q.[QueryName]        AS [Name],
       q.[QueryDescription] AS [Description],
       q.[QueryCommand]     AS [Sql],
       q.[QueryTypeID]      AS [QueryTypeId],
       q.[IsAggregate]      AS [IsAggregate]
FROM [dbo].[QueryGroup] qg
JOIN [dbo].[Query] q ON q.[QueryID] = qg.[QueryId]
WHERE qg.[GroupId] = @G
ORDER BY q.[QueryName];";
            using var db = new SqlConnection(_c.Catalog);
            return await db.QueryAsync<QueryDto>(sql, new { G = groupId });
        }

        public async Task AssignUsersAsync(int groupId, IEnumerable<int> userIds)
        {
            using var db = new SqlConnection(_c.Data);
            await db.OpenAsync();
            using var tx = db.BeginTransaction();

            await db.ExecuteAsync("DELETE FROM [dbo].[UserGroup] WHERE [GroupID]=@G", new { G = groupId }, tx);

            const string ins = @"INSERT INTO [dbo].[UserGroup] ([UserID],[GroupID]) VALUES (@U,@G);";
            foreach (var uid in userIds.Distinct())
                await db.ExecuteAsync(ins, new { U = uid, G = groupId }, tx);

            tx.Commit();
        }

        public async Task AssignQueriesAsync(int groupId, IEnumerable<int> queryIds)
        {
            using var db = new SqlConnection(_c.Catalog);
            await db.OpenAsync();
            using var tx = db.BeginTransaction();

            await db.ExecuteAsync("DELETE FROM [dbo].[QueryGroup] WHERE [GroupID]=@G", new { G = groupId }, tx);

            const string ins = @"INSERT INTO [dbo].[QueryGroup] ([QueryId],[GroupId]) VALUES (@Q,@G);";
            foreach (var qid in queryIds.Distinct())
                await db.ExecuteAsync(ins, new { Q = qid, G = groupId }, tx);

            tx.Commit();
        }
    }

 
    
}
