using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace ApPortal.Api.Auth;

// Random tokens for session cookies and password reset links. Only their
// SHA-256 hash is stored, so a copy of the database can't be used to sign in.
public static class SessionTokens
{
    public const string CookieName = "ap_session";

    public static string Create() => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    public static byte[] Hash(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));
}
