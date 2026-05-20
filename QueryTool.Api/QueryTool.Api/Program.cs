
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using QueryTool.Core;
using QueryTool.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// MVC + Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS for your UI hosts
builder.Services.AddCors(o =>
{
    o.AddPolicy("ui", p => p
        .WithOrigins("http://localhost:5173", "https://query2.adhesionwealth.com")
        .AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});

// Cookie authentication only
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, opt =>
    {
        opt.Cookie.Name = "qt.auth";
        opt.Cookie.HttpOnly = true;

        if (builder.Environment.IsDevelopment())
        {
            opt.Cookie.SameSite = SameSiteMode.Lax;
            opt.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        }
        else
        {
            opt.Cookie.SameSite = SameSiteMode.None;
            opt.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        }

        opt.SlidingExpiration = true;
        // Avoid 302s for XHR/API calls
        opt.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        opt.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("AdminOnly", p => p.RequireClaim("IsAdmin", "true"));
});

// ---------- DI ----------
builder.Services.AddSingleton<IDbConnections>(sp =>
{
    var cfg = builder.Configuration;
    return new DbConnections(
        Data: cfg.GetConnectionString("Data")!,
        Catalog: cfg.GetConnectionString("Catalog")!
    );
});

// Core/Infra
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IGroupRepository, GroupRepository>();
builder.Services.AddScoped<IFirmRepository, FirmRepository>();
builder.Services.AddScoped<IQueryRepository, QueryRepository>();
builder.Services.AddScoped<IExecutionLogRepository, SqlExecutionLogRepository>(); 
builder.Services.AddScoped<ICatalogService, CatalogService>();
builder.Services.AddScoped<IExecutionService, ExecutionService>();
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<IAnalyticsService, AnalyticsService>();
builder.Services.AddScoped<IConnectionStringService, ConnectionStringService>();

builder.Services.AddSingleton<IPasswordHasher, BCryptPasswordHasher>();
builder.Services.AddHealthChecks();

var app = builder.Build();

// Swagger in dev/staging
if (app.Environment.IsDevelopment() || app.Environment.IsStaging())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("ui");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();
app.Run();

// helper
public record DbConnections(string Data, string Catalog) : IDbConnections
{
    public string Data { get; } = Data;
    public string Catalog { get; } = Catalog;
}
