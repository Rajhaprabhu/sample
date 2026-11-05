using System.Security.Claims;
using System.Text.Encodings.Web;
using Dapper;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Npgsql;

namespace ApPortal.Api.Auth;

// Signs requests in from the ap_session cookie by looking the session up in
// user_sessions. Signing out (or resetting a password) revokes the row, which
// ends the session immediately, unlike a self-contained cookie.
public sealed class SessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    NpgsqlDataSource db)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "ApSession";

    private sealed class SessionRow
    {
        public Guid SessionId { get; set; }
        public long UserId { get; set; }
        public string Email { get; set; } = "";
        public string FullName { get; set; } = "";
        public string[] Roles { get; set; } = [];
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var token = Request.Cookies[SessionTokens.CookieName];
        if (string.IsNullOrEmpty(token))
        {
            return AuthenticateResult.NoResult();
        }

        await using var conn = await db.OpenConnectionAsync(Context.RequestAborted);
        var row = await conn.QuerySingleOrDefaultAsync<SessionRow>("""
            UPDATE user_sessions s SET last_seen_at = now()
              FROM users u
             WHERE s.token_hash = @hash AND s.revoked_at IS NULL AND s.expires_at > now()
               AND u.id = s.user_id AND u.status = 'active'
            RETURNING s.id AS session_id, u.id AS user_id, u.email, u.full_name,
                      ARRAY(SELECT role_code FROM user_roles r WHERE r.user_id = u.id ORDER BY role_code) AS roles
            """, new { hash = SessionTokens.Hash(token) });
        if (row is null)
        {
            return AuthenticateResult.Fail("The session has expired or was signed out.");
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, row.UserId.ToString()),
            new(ClaimTypes.Name, row.FullName),
            new(ClaimTypes.Email, row.Email),
            new(ClaimTypes.Sid, row.SessionId.ToString()),
        };
        claims.AddRange(row.Roles.Select(role => new Claim(ClaimTypes.Role, role)));
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
    }

    // API callers get JSON, not a redirect to a login page.
    protected override Task HandleChallengeAsync(AuthenticationProperties properties) =>
        WriteProblem(StatusCodes.Status401Unauthorized, "Sign in to continue.");

    protected override Task HandleForbiddenAsync(AuthenticationProperties properties) =>
        WriteProblem(StatusCodes.Status403Forbidden, "Your role doesn't allow this action.");

    private Task WriteProblem(int status, string detail)
    {
        Response.StatusCode = status;
        return Response.WriteAsJsonAsync(
            new { status, title = status == 401 ? "Not signed in" : "Not allowed", detail },
            options: null, contentType: "application/problem+json");
    }
}
