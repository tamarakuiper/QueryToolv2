using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using QueryTool.Core;

namespace QueryTool.Api.Controllers;

[ApiController]
[Route("auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IUserRepository _users;
    private readonly IPasswordHasher _hasher;

    public AuthController(IUserRepository users, IPasswordHasher hasher)
    {
        _users = users;
        _hasher = hasher;
    }

    // --- Helpers ---
    private static bool IsAllowedRegistrationDomain(string email)
    {
        // Normalize
        var e = email.Trim().ToLowerInvariant();
        // allow @amk.com exactly, and @adh.com or any subdomain of adh.com
        return e.EndsWith("@adhesionwealth.com")
            || e.EndsWith("@assetmark.com");
    }

    // Anyone can register -> creates DISABLED shell account (no password)
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterUserDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Email))
            return BadRequest("Email is required.");

        var email = dto.Email.Trim().ToLowerInvariant();

        if (!IsAllowedRegistrationDomain(email))
            return BadRequest("Registration is limited to @adhesionwealth.com and @assetmark.com (including subdomains).");

        // NOTE: If your GetByEmailAsync filters by IsEnabled=1,
        // you may want a repo method that checks for ANY user by email to avoid duplicates.
        var existing = await _users.GetByEmailAsync(email);
        if (existing is not null)
            return Conflict("An account with this email already exists.");

        // Create disabled, no password yet
        var created = await _users.CreateAsync(
            new CreateUserDto(email, dto.DisplayName ?? email, false),
            hashedPassword: null,
            enabled: false
        );

        return Ok(new
        {
            created.Id,
            created.Email,
            created.DisplayName,
            created.IsAdmin,
            Enabled = false
        });
    }

    // User can set (BCrypt) password ONLY AFTER admin enables account
    [HttpPost("activate")]
    [AllowAnonymous]
    public async Task<IActionResult> Activate([FromBody] ActivateUserDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
            return BadRequest("Email and password are required.");

        var email = dto.Email.Trim();
        var hash = _hasher.Hash(dto.Password);

        var ok = await _users.ActivateByEmailAsync(email, hash);
        if (!ok)
            return BadRequest("Activation failed. Your account may not be enabled yet, or email is incorrect.");

        return Ok(new { Activated = true });
    }

    // Cookie login for enabled users only (BCrypt-only verification)
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
            return BadRequest("Email and password are required.");

        // If your repo returns only enabled users, this doubles as the enabled check.
        var u = await _users.GetByEmailAsync(dto.Email.Trim());
        if (u is null)
            return Unauthorized("Invalid credentials or user not enabled.");

        if (string.IsNullOrWhiteSpace(u.HashedPassword) || !_hasher.Verify(u.HashedPassword, dto.Password))
            return Unauthorized("Invalid email or password.");

        // Issue auth cookie
        var id = new ClaimsIdentity(CookieAuthenticationDefaults.AuthenticationScheme);
        id.AddClaim(new Claim(ClaimTypes.NameIdentifier, u.UserId.ToString()));
        id.AddClaim(new Claim(ClaimTypes.Email, u.Email));
        id.AddClaim(new Claim("IsAdmin", u.IsAdmin ? "true" : "false"));

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(id));

        return Ok(new { ok = true });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [HttpGet("me")]
    public IActionResult Me()
    {
        if (!(User?.Identity?.IsAuthenticated ?? false))
            return Unauthorized(new { authenticated = false });

        var email = User.FindFirst(ClaimTypes.Email)?.Value;
        return Ok(new
        {
            authenticated = true,
            email,
            isAdmin = User.HasClaim("IsAdmin", "true")
        });
    }
}
