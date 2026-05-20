using Microsoft.AspNetCore.Mvc;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet] public IActionResult Get() => Ok(new { ok = true });
}
