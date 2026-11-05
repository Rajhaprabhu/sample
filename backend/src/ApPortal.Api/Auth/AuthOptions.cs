namespace ApPortal.Api.Auth;

public sealed class AuthOptions
{
    public const string Section = "Auth";

    public int SessionHours { get; set; } = 12;
    public int RememberMeDays { get; set; } = 30;
    public int LockoutAttempts { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int ResetLinkMinutes { get; set; } = 30;
    public int AuthRequestsPerMinute { get; set; } = 10;

    // Development only: return the reset link in the API response because no email is sent.
    public bool ExposeResetLinkInResponse { get; set; }
}
