using System.Security.Claims;

namespace ApPortal.Api.Auth;

// The type parameter for ASP.NET Core's PasswordHasher; the hash doesn't depend on it.
public sealed class AppUser;

public sealed record CurrentUser(string Name, string Email, string[] Roles);

public static class ClaimsPrincipalExtensions
{
    public static long UserId(this ClaimsPrincipal user) =>
        long.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? throw new InvalidOperationException("Not signed in."));

    public static CurrentUser ToCurrentUser(this ClaimsPrincipal user) => new(
        user.FindFirstValue(ClaimTypes.Name) ?? "",
        user.FindFirstValue(ClaimTypes.Email) ?? "",
        user.FindAll(ClaimTypes.Role).Select(c => c.Value).ToArray());
}
