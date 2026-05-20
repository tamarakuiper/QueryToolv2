using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QueryTool.Core;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("execute")]
public class ExecuteController : ControllerBase
{
    private readonly IExecutionService _svc;
    public ExecuteController(IExecutionService svc) { _svc = svc; }

    // Run a query by id
    // POST /execute/123
    [HttpPost("{queryId:int}")]
    [Authorize] // or [AllowAnonymous] if you rely on DevBypass only; recommend [Authorize]
    public async Task<ActionResult<ExecuteResult>> Execute([FromRoute] int queryId, [FromBody] Dictionary<string, object>? parameters)
    {
        var result = await _svc.ExecuteAsync(User, queryId, parameters ?? new Dictionary<string, object>());
        return Ok(result);
    }
}
