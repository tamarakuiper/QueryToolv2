using Microsoft.AspNetCore.Mvc;
using QueryTool.Core;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("")]
public class CatalogController : ControllerBase
{
    private readonly ICatalogService _catalog;
    public CatalogController(ICatalogService catalog) => _catalog = catalog;

    // New paths
    [HttpGet("catalog/firms")]
    public Task<IEnumerable<FirmDto>> GetFirmsNew() => _catalog.GetFirmsAsync();

    [HttpGet("catalog/firms/{firmId:int}/queries")]
    public Task<IEnumerable<QueryDto>> GetQueriesNew(int firmId) => _catalog.GetQueriesForCurrentUserAsync(firmId, User);

    
}