using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QueryTool.Core;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("admin/analytics")]
[Authorize(Policy = "AdminOnly")]
public class AnalyticsController : ControllerBase
{
    private readonly IAnalyticsService _svc;
    public AnalyticsController(IAnalyticsService svc) { _svc = svc; }

    [HttpGet("query-usage")]
    public Task<QueryUsageDto> QueryUsage([FromQuery] DateTime from, [FromQuery] DateTime to, [FromQuery] int? firmId)
        => _svc.GetQueryUsageAsync(from, to, firmId);

    [HttpGet("user-activity")]
    public Task<UserActivityDto> UserActivity([FromQuery] DateTime from, [FromQuery] DateTime to)
        => _svc.GetUserActivityAsync(from, to);

    [HttpGet("timeseries")]
    public Task<TimeseriesDto> Timeseries([FromQuery] string bucket = "day", [FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null)
        => _svc.GetTimeseriesAsync(bucket, from, to);
}
