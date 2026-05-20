using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QueryTool.Core;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("admin/queries")]
[Authorize(Policy = "AdminOnly")]
public class QueriesController : ControllerBase
{
    private readonly IQueryRepository _repo;
    public QueriesController(IQueryRepository repo) { _repo = repo; }

    // GET /admin/queries  → list ALL queries (no firm filter)
    [HttpGet]
    public async Task<ActionResult<IEnumerable<QueryDto>>> ListAll()
    {
        var items = await _repo.ListAllAsync();
        return Ok(items);
    }

    // POST /admin/queries  → create a query
    [HttpPost]
    public async Task<ActionResult<int>> Create([FromBody] CreateQueryDto dto)
    {
        var id = await _repo.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id }, id);
    }

    // GET /admin/queries/{id}
    [HttpGet("{id:int}")]
    public async Task<ActionResult<QueryDto>> GetById([FromRoute] int id)
    {
        var q = await _repo.GetByIdAsync(id);
        return q is null ? NotFound() : Ok(q);
    }

    // PUT /admin/queries/{id}
    [HttpPut("{id:int}")]
    public async Task<ActionResult<QueryDto>> Update([FromRoute] int id, [FromBody] UpdateQueryDto dto)
    {
        var updated = await _repo.UpdateAsync(id, dto);
        return Ok(updated);
    }

    // DELETE /admin/queries/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete([FromRoute] int id)
    {
        await _repo.DeleteAsync(id);
        return NoContent();
    }
}
