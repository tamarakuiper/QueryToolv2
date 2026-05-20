using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QueryTool.Core;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("admin")]
[Authorize(Policy = "AdminOnly")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _svc;
    private readonly IGroupRepository _groups;

    public AdminController(IAdminService svc, IGroupRepository groups)
    {
        _svc = svc;
        _groups = groups;
    }

    // ---- Users ----
    [HttpGet("users")]
    public Task<IEnumerable<UserDto>> Users() => _svc.ListUsersAsync();

    [HttpPost("users")]
    public Task<UserDto> CreateUser([FromBody] CreateUserDto dto) => _svc.CreateUserAsync(dto);

    [HttpPut("users/{id:int}")]
    public Task<UserDto> UpdateUser(int id, [FromBody] UpdateUserDto dto) => _svc.UpdateUserAsync(id, dto);

    [HttpDelete("users/{id:int}")]
    public Task DeleteUser(int id) => _svc.DeleteUserAsync(id);

    [HttpDelete("users/{id:int}/hard")]
    public async Task<IActionResult> HardDelete(int id)
    {
        await _svc.HardDeleteUserAsync(id);
        return NoContent();
    }

    // ---- Groups (CRUD) ----
    [HttpGet("groups")]
    public Task<IEnumerable<GroupDto>> Groups() => _svc.ListGroupsAsync();

    [HttpPost("groups")]
    public Task<GroupDto> CreateGroup([FromBody] CreateGroupDto dto) => _svc.CreateGroupAsync(dto);

    [HttpPut("groups/{id:int}")]
    public Task<GroupDto> UpdateGroup(int id, [FromBody] UpdateGroupDto dto) => _svc.UpdateGroupAsync(id, dto);

    [HttpDelete("groups/{id:int}")]
    public Task DeleteGroup(int id) => _svc.DeleteGroupAsync(id);

    // ---- Groups (Assignments READ) ----
    // Returns { userIds: [...] }
    [HttpGet("groups/{groupId:int}/members")]
    public async Task<IActionResult> GetGroupMembers(int groupId)
    {
        var ids = await _groups.GetUserIdsAsync(groupId);
        return Ok(new { userIds = ids });
    }

    // Returns QueryDto[] (Id, FirmId, Name, Description, Sql, etc.)
    [HttpGet("groups/{groupId:int}/queries")]
    public async Task<IActionResult> GetGroupQueries(int groupId)
    {
        var items = await _groups.GetQueriesByGroupAsync(groupId);
        return Ok(items);
    }

    // ---- Groups (Assignments WRITE) ----
    [HttpPost("groups/{id:int}/members")]
    public Task AssignUsers(int id, [FromBody] BulkUsersDto dto)
        => _svc.AssignUsersToGroupAsync(id, dto.UserIds);

    [HttpPost("groups/{id:int}/queries")]
    public Task AssignQueries(int id, [FromBody] BulkQueriesDto dto)
        => _svc.AssignQueriesToGroupAsync(id, dto.QueryIds);
}
