using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QueryTool.Core;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("queries")] // LEGACY-ONLY route
public class ExecuteController : ControllerBase
{
    private readonly IExecutionService _exec;

    public ExecuteController(IExecutionService exec) => _exec = exec;

    /// <summary>
    /// Legacy endpoint: POST /queries
    /// Body shape:
    /// {
    ///   "QueryExecutorModel": { "FirmID": 7, "QueryID": 88, "QueryParameters": [ { "Name":"Param", "Value":..., "Values":[...] } ] },
    ///   "PagingModel": { "Start": 0, "Limit": 10 }
    /// }
    /// </summary>
    [Authorize]
    [HttpPost]
    public async Task<IActionResult> RunLegacy([FromBody] JsonElement body)
    {
        if (!body.TryGetProperty("QueryExecutorModel", out var qem) || qem.ValueKind != JsonValueKind.Object)
            return BadRequest("Missing QueryExecutorModel.");

        var firmId = qem.GetProperty("FirmID").GetInt32();
        var queryId = qem.GetProperty("QueryID").GetInt32();

        // Flatten legacy QueryParameters => { ParamName: value/values }
        var flatParams = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
        {
            ["firmId"] = firmId
        };

        if (qem.TryGetProperty("QueryParameters", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var p in arr.EnumerateArray())
            {
                var name = p.GetProperty("Name").GetString()!;
                if (p.TryGetProperty("Values", out var vals) && vals.ValueKind == JsonValueKind.Array)
                {
                    flatParams[name] = vals.EnumerateArray().Select(JsonToObj).ToArray();
                }
                else if (p.TryGetProperty("Value", out var v))
                {
                    flatParams[name] = JsonToObj(v);
                }
                else
                {
                    flatParams[name] = null;
                }
            }
        }

        // (Optional) You can read PagingModel here if your SQL wants @Start/@Limit
        if (body.TryGetProperty("PagingModel", out var paging) && paging.ValueKind == JsonValueKind.Object)
        {
            if (paging.TryGetProperty("Start", out var s) && s.ValueKind is JsonValueKind.Number) flatParams["Start"] = s.GetInt32();
            if (paging.TryGetProperty("Limit", out var l) && l.ValueKind is JsonValueKind.Number) flatParams["Limit"] = l.GetInt32();
        }

        var result = await _exec.ExecuteAsync(User, queryId, flatParams);
        return Ok(result);
    }

    private static object? JsonToObj(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.String => e.GetString(),
        JsonValueKind.Number => e.TryGetInt64(out var i) ? i : e.TryGetDouble(out var d) ? d : null,
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Array => e.EnumerateArray().Select(JsonToObj).ToArray(),
        JsonValueKind.Null => null,
        _ => e.GetRawText()
    };
}
