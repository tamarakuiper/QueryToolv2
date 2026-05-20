// QueryTool.Core/Models/AnalyticsDtos.cs
using System;
using System.Collections.Generic;

namespace QueryTool.Core
{
    // Top queries
    public record QueryUsageDto(IReadOnlyList<UsageItem> Top, int TotalExecutions);
    public record UsageItem(int QueryId, string Name, string? Description, string? FirmName, int RunCount);

    // Top users
    public record UserActivityDto(IReadOnlyList<ActivityItem> Top, int TotalUsers);
    public record ActivityItem(int UserId, string User, int RunCount);

    // Time series
    public record TimeseriesDto(IReadOnlyList<TimeseriesPoint> Points);
    public record TimeseriesPoint(DateTime At, int Count);
}