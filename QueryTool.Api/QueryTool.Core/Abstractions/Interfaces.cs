using System.Security.Claims;

namespace QueryTool.Core;

public interface ILegacyPasswordHasher { bool Verify(string hashedPassword, string providedPassword); }

public interface IDbConnections { string Catalog { get; } string Data { get; } }

// QueryTool.Core/Abstractions/Interfaces.cs (adjust signatures)
public interface IUserRepository
{
    Task<UserRow?> GetByEmailAsync(string email);
    Task<UserRow?> GetAnyByEmailAsync(string email); 
    Task<IEnumerable<UserDto>> ListAsync();

    // add 'enabled' flag (default true to keep existing callers working)
    Task<UserDto> CreateAsync(CreateUserDto dto, string? hashedPassword = null, bool enabled = true);

    Task<UserDto> UpdateAsync(int id, UpdateUserDto dto);
    Task DeleteAsync(int id);
    Task HardDeleteAsync(int id);
    Task<bool> IsEnabledAsync(int userId);
    Task<bool> SetPasswordIfEnabledAsync(string email, string hashedPassword); // new
    // new: activate by email (set password + enable)
    Task<bool> ActivateByEmailAsync(string email, string hashedPassword);
}


public interface IFirmRepository { Task<IEnumerable<FirmDto>> ListAsync(); }

public interface IQueryRepository
{
    Task<IEnumerable<QueryDto>> ListAllAsync();                      // NEW
    Task<IEnumerable<QueryDto>> ListForFirmAsync(int firmId);
    Task<IEnumerable<QueryDto>> ListForFirmAndGroupsAsync(int firmId, int[] groupIds);
    Task<bool> UserCanAccessQueryAsync(int queryId, int[] groupIds);
    Task<QueryDto?> GetByIdAsync(int id);
    Task<int> CreateAsync(CreateQueryDto dto);
    Task<QueryDto> UpdateAsync(int id, UpdateQueryDto dto);
    Task DeleteAsync(int id);
}

public interface IGroupRepository
{
    Task<IEnumerable<GroupDto>> ListAsync();
    Task<GroupDto> CreateAsync(CreateGroupDto dto);
    Task<GroupDto> UpdateGroupAsync(int id, UpdateGroupDto dto);
    Task DeleteGroupAsync(int id);
    Task<IEnumerable<GroupLite>> GetByUserIdAsync(int userId);
    Task<IEnumerable<int>> GetUserIdsAsync(int groupId);
    Task<IEnumerable<int>> GetQueryIdsAsync(int groupId);
    Task<IEnumerable<QueryDto>> GetQueriesByGroupAsync(int groupId);
    Task AssignUsersAsync(int groupId, IEnumerable<int> userIds);
    Task AssignQueriesAsync(int groupId, IEnumerable<int> queryIds);
}

public interface IExecutionLogRepository
{
    Task LogAsync(int userId, int queryId, int? firmId, int durationMs, int rowCount, string parametersJson, bool success, string? errorMessage);
    Task<QueryUsageDto> QueryUsageAsync(DateTime from, DateTime to, int? firmId);
    Task<UserActivityDto> UserActivityAsync(DateTime from, DateTime to);
    Task<TimeseriesDto> TimeseriesAsync(string bucket, DateTime? from, DateTime? to);
}

// Keep only if you still use legacy login anywhere. Safe to leave defined.
public interface IAuthService { Task<AuthResponse?> LoginAsync(string email, string password); }

public interface ICatalogService
{
    Task<IEnumerable<FirmDto>> GetFirmsAsync();
    Task<IEnumerable<QueryDto>> GetQueriesForCurrentUserAsync(int firmId, ClaimsPrincipal user);
}

public interface IExecutionService
{
    Task<ExecuteResult> ExecuteAsync(ClaimsPrincipal user, int queryId, Dictionary<string, object> parameters);
}

public interface IAdminService
{
    Task<IEnumerable<UserDto>> ListUsersAsync();
    Task<UserDto> CreateUserAsync(CreateUserDto dto);
    Task<UserDto> UpdateUserAsync(int id, UpdateUserDto dto);
    Task DeleteUserAsync(int id);
    Task HardDeleteUserAsync(int id);

    Task<IEnumerable<GroupDto>> ListGroupsAsync();
    Task<GroupDto> CreateGroupAsync(CreateGroupDto dto);
    Task<GroupDto> UpdateGroupAsync(int id, UpdateGroupDto dto);
    Task DeleteGroupAsync(int id);

    Task AssignUsersToGroupAsync(int groupId, IEnumerable<int> userIds);
    Task AssignQueriesToGroupAsync(int groupId, IEnumerable<int> queryIds);
}

public interface IAnalyticsService
{
    Task<QueryUsageDto> GetQueryUsageAsync(DateTime from, DateTime to, int? firmId);
    Task<UserActivityDto> GetUserActivityAsync(DateTime from, DateTime to);
    Task<TimeseriesDto> GetTimeseriesAsync(string bucket, DateTime? from, DateTime? to);
}


