namespace QueryTool.Core
{
    public interface IConnectionStringService
    {
        Task<string> BuildForExecutionAsync(int firmId, int queryId);
    }
}