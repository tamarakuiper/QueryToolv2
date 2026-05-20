namespace QueryTool.Core;

public record LoginRequest(string EmailAddress, string Password);
public record AuthResponse(string AccessToken, UserProfile User);
public record UserProfile(int Id, string Email, string Name, bool IsAdmin, IEnumerable<GroupLite> Groups);
public record GroupLite(int GroupId, string Name);

public record FirmDto(int Id, string FirmName);
public record ExecuteResult(IEnumerable<string> Columns, IEnumerable<Dictionary<string, object>> Rows);

public record UserDto(int Id, string Email, string? DisplayName, bool IsAdmin, bool IsEnabled); 
public record CreateUserDto(string Email, string? DisplayName, bool IsAdmin);
public record UpdateUserDto(string? DisplayName, bool? IsAdmin, bool? IsEnabled);

public record GroupDto(int GroupId, string Name, string? Description, bool IsActive);
public record CreateGroupDto(string Name, string? Description);
public record UpdateGroupDto(string? Name, string? Description, bool? IsActive);


public record BulkUsersDto(int[] UserIds);
public record BulkQueriesDto(int[] QueryIds);



public record RegisterUserDto(string Email, string? DisplayName);
public record ActivateUserDto(string Email, string Password);
public record LoginDto(string Email, string Password);

public sealed record UserRow(
        int UserId,
        string Email,
        string DisplayName,
        bool IsAdmin,
        string HashedPassword
    // Row for auth can omit IsEnabled because your GetByEmailAsync already enforces IsEnabled=1 (good!)
    );



public record CreateQueryDto(
    string Name,
    string? Description,
    string Sql,
    int? FirmId,
    int? QueryTypeId,     // optional
    bool? IsAggregate     // optional
);


// Read model
public sealed record QueryDto(
    int Id,
    int? FirmId,
    string Name,
    string? Description,
    string Sql,
    int QueryTypeId,
    bool IsAggregate
);



// Update (all optional)
public sealed record UpdateQueryDto(
    string? Name,
    string? Description,
    string? Sql,
    int? FirmId,
    int? QueryTypeId,
    bool? IsAggregate
);
