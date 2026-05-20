using Microsoft.Extensions.Configuration;
using QueryTool.Core;

namespace QueryTool.Infrastructure;
public class DbConnections : IDbConnections
{
    private readonly IConfiguration _cfg;
    public DbConnections(IConfiguration cfg) { _cfg = cfg; }
    public string Catalog => _cfg.GetConnectionString("Catalog")!;
    public string Data => _cfg.GetConnectionString("Data")!;
}
