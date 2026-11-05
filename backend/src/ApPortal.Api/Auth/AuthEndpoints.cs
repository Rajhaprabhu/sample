using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Npgsql;

namespace ApPortal.Api.Auth;

public static class AuthEndpoints
{
    public const string RateLimitPolicy = "auth";
    private const string BadCredentials = "Incorrect email or password.";

    public sealed record LoginRequest(string? Email, string? Password, bool Remember);
    public sealed record ForgotPasswordRequest(string? Email);
    public sealed record ResetPasswordRequest(string? Token, string? Password);

    private sealed class LoginRow
    {
        public long Id { get; set; }
        public string Email { get; set; } = "";
        public string FullName { get; set; } = "";
        public string PasswordHash { get; set; } = "";
        public string Status { get; set; } = "";
        public int FailedLoginCount { get; set; }
        public DateTime? LockedUntil { get; set; }
        public string[] Roles { get; set; } = [];
    }

    private sealed class UserRef
    {
        public long Id { get; set; }
        public string Email { get; set; } = "";
        public string FullName { get; set; } = "";
    }

    private sealed class ResetRow
    {
        public long Id { get; set; }
        public long UserId { get; set; }
    }

    // Verified against when the email is unknown, so both cases take the same time.
    private static readonly string DummyHash = new PasswordHasher<AppUser>().HashPassword(new AppUser(), "not-a-real-password");

    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder api)
    {
        var auth = api.MapGroup("/auth");

        auth.MapPost("/login", Login).RequireRateLimiting(RateLimitPolicy);
        auth.MapPost("/logout", Logout);
        auth.MapGet("/me", (ClaimsPrincipal user) => user.ToCurrentUser()).RequireAuthorization();
        auth.MapPost("/forgot-password", ForgotPassword).RequireRateLimiting(RateLimitPolicy);
        auth.MapGet("/reset-password/verify", VerifyResetToken).RequireRateLimiting(RateLimitPolicy);
        auth.MapPost("/reset-password", ResetPassword).RequireRateLimiting(RateLimitPolicy);
        return api;
    }

    private static async Task<IResult> Login(
        LoginRequest request, HttpContext http, NpgsqlDataSource db,
        IPasswordHasher<AppUser> hasher, IOptions<AuthOptions> options)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
        {
            return Problem(StatusCodes.Status400BadRequest, "Enter your work email and password.");
        }

        await using var conn = await db.OpenConnectionAsync();
        var user = await conn.QuerySingleOrDefaultAsync<LoginRow>("""
            SELECT u.id, u.email, u.full_name, u.password_hash, u.status::text AS status,
                   u.failed_login_count, u.locked_until,
                   ARRAY(SELECT role_code FROM user_roles r WHERE r.user_id = u.id ORDER BY role_code) AS roles
              FROM users u WHERE lower(u.email) = lower(@email)
            """, new { email = request.Email.Trim() });

        if (user is null || user.Status == "disabled")
        {
            hasher.VerifyHashedPassword(new AppUser(), DummyHash, request.Password);
            return Problem(StatusCodes.Status401Unauthorized, BadCredentials);
        }
        if (user.LockedUntil > DateTime.UtcNow)
        {
            return Problem(StatusCodes.Status401Unauthorized,
                $"Too many failed attempts. Try again in {Math.Ceiling((user.LockedUntil.Value - DateTime.UtcNow).TotalMinutes)} minutes, or reset your password.");
        }

        // Seeded users have a placeholder ("!...") instead of a hash: they can't sign in.
        var result = user.PasswordHash.StartsWith('!')
            ? PasswordVerificationResult.Failed
            : hasher.VerifyHashedPassword(new AppUser(), user.PasswordHash, request.Password);

        if (result == PasswordVerificationResult.Failed)
        {
            var failures = user.FailedLoginCount + 1;
            var lockNow = failures >= o.LockoutAttempts;
            await conn.ExecuteAsync("""
                UPDATE users SET failed_login_count = @count,
                       locked_until = CASE WHEN @lockNow THEN now() + make_interval(mins => @minutes) ELSE locked_until END
                 WHERE id = @id
                """, new { id = user.Id, count = lockNow ? 0 : failures, lockNow, minutes = o.LockoutMinutes });
            return Problem(StatusCodes.Status401Unauthorized, lockNow
                ? $"Too many failed attempts. Sign-in is locked for {o.LockoutMinutes} minutes."
                : BadCredentials);
        }

        var newHash = result == PasswordVerificationResult.SuccessRehashNeeded
            ? hasher.HashPassword(new AppUser(), request.Password)
            : null;
        await conn.ExecuteAsync("""
            UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now(),
                   password_hash = coalesce(@newHash, password_hash)
             WHERE id = @id
            """, new { id = user.Id, newHash });

        var token = SessionTokens.Create();
        var expires = request.Remember ? DateTimeOffset.UtcNow.AddDays(o.RememberMeDays) : DateTimeOffset.UtcNow.AddHours(o.SessionHours);
        await conn.ExecuteAsync("""
            INSERT INTO user_sessions (user_id, token_hash, remember_me, expires_at, ip_address, user_agent)
            VALUES (@userId, @hash, @remember, @expires, @ip::inet, @agent)
            """, new
        {
            userId = user.Id,
            hash = SessionTokens.Hash(token),
            remember = request.Remember,
            expires = expires.UtcDateTime,
            ip = http.Connection.RemoteIpAddress?.ToString(),
            agent = http.Request.Headers.UserAgent.ToString(),
        });

        http.Response.Cookies.Append(SessionTokens.CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = http.Request.IsHttps,
            SameSite = SameSiteMode.Strict,
            Path = "/",
            // "Keep me signed in" survives closing the browser; otherwise it's a browser-session cookie.
            Expires = request.Remember ? expires : null,
        });
        return Results.Ok(new CurrentUser(user.FullName, user.Email, user.Roles));
    }

    private static async Task<IResult> Logout(HttpContext http, NpgsqlDataSource db)
    {
        var token = http.Request.Cookies[SessionTokens.CookieName];
        if (!string.IsNullOrEmpty(token))
        {
            await using var conn = await db.OpenConnectionAsync();
            await conn.ExecuteAsync(
                "UPDATE user_sessions SET revoked_at = now() WHERE token_hash = @hash AND revoked_at IS NULL",
                new { hash = SessionTokens.Hash(token) });
        }
        http.Response.Cookies.Delete(SessionTokens.CookieName, new CookieOptions { Path = "/" });
        return Results.NoContent();
    }

    // Always answers the same way, so it never reveals which emails have accounts.
    private static async Task<IResult> ForgotPassword(
        ForgotPasswordRequest request, HttpContext http, NpgsqlDataSource db,
        IEmailSender email, IOptions<AuthOptions> options, IConfiguration config)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return Problem(StatusCodes.Status400BadRequest, "Enter your work email.");
        }

        await using var conn = await db.OpenConnectionAsync();
        var user = await conn.QuerySingleOrDefaultAsync<UserRef>(
            "SELECT id, email, full_name FROM users WHERE lower(email) = lower(@email) AND status <> 'disabled'",
            new { email = request.Email.Trim() });

        string? link = null;
        if (user is not null)
        {
            var token = SessionTokens.Create();
            await conn.ExecuteAsync("""
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
                VALUES (@id, @hash, now() + make_interval(mins => @minutes), @ip::inet)
                """, new { id = user.Id, hash = SessionTokens.Hash(token), minutes = options.Value.ResetLinkMinutes, ip = http.Connection.RemoteIpAddress?.ToString() });

            var baseUrl = config["App:PublicBaseUrl"];
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                baseUrl = $"{http.Request.Scheme}://{http.Request.Host}{http.Request.PathBase}";
            }
            link = $"{baseUrl.TrimEnd('/')}/login/reset-password.html?token={Uri.EscapeDataString(token)}";
            await email.SendPasswordResetAsync(user.Email, user.FullName, link, http.RequestAborted);
        }

        return Results.Accepted(value: new
        {
            message = "If that email belongs to an account, a reset link is on its way.",
            devResetLink = options.Value.ExposeResetLinkInResponse ? link : null,
        });
    }

    private static async Task<IResult> VerifyResetToken(string? token, NpgsqlDataSource db)
    {
        if (string.IsNullOrEmpty(token))
        {
            return ExpiredLink();
        }
        await using var conn = await db.OpenConnectionAsync();
        var email = await conn.QuerySingleOrDefaultAsync<string>("""
            SELECT u.email FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = @hash AND t.used_at IS NULL AND t.expires_at > now()
            """, new { hash = SessionTokens.Hash(token) });
        return email is null ? ExpiredLink() : Results.Ok(new { email });
    }

    private static async Task<IResult> ResetPassword(
        ResetPasswordRequest request, NpgsqlDataSource db, IPasswordHasher<AppUser> hasher)
    {
        var problems = PasswordPolicy.Problems(request.Password);
        if (problems.Count > 0)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]> { ["password"] = problems.ToArray() },
                detail: "Your new password does not meet all the requirements. " + string.Join(" ", problems));
        }
        if (string.IsNullOrEmpty(request.Token))
        {
            return ExpiredLink();
        }

        await using var conn = await db.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        var reset = await conn.QuerySingleOrDefaultAsync<ResetRow>("""
            SELECT id, user_id FROM password_reset_tokens
             WHERE token_hash = @hash AND used_at IS NULL AND expires_at > now()
             FOR UPDATE
            """, new { hash = SessionTokens.Hash(request.Token) }, tx);
        if (reset is null)
        {
            return ExpiredLink();
        }

        await conn.ExecuteAsync("""
            UPDATE users SET password_hash = @hash, password_changed_at = now(),
                   failed_login_count = 0, locked_until = NULL
             WHERE id = @userId
            """, new { reset.UserId, hash = hasher.HashPassword(new AppUser(), request.Password!) }, tx);
        await conn.ExecuteAsync("UPDATE password_reset_tokens SET used_at = now() WHERE id = @id", new { reset.Id }, tx);
        // A new password signs the account out everywhere.
        await conn.ExecuteAsync(
            "UPDATE user_sessions SET revoked_at = now() WHERE user_id = @userId AND revoked_at IS NULL", new { reset.UserId }, tx);
        await tx.CommitAsync();
        return Results.NoContent();
    }

    private static IResult ExpiredLink() => Problem(StatusCodes.Status410Gone,
        "This link has expired or has already been used. Request a new one.");

    private static IResult Problem(int status, string detail) => Results.Problem(detail: detail, statusCode: status);
}
