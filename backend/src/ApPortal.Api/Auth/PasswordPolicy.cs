namespace ApPortal.Api.Auth;

// The same rules as the "Choose a new password" page.
public static class PasswordPolicy
{
    public static List<string> Problems(string? password)
    {
        var problems = new List<string>();
        password ??= "";
        if (password.Length < 12) problems.Add("Use at least 12 characters.");
        if (!password.Any(char.IsUpper)) problems.Add("Include an uppercase letter.");
        if (!password.Any(char.IsLower)) problems.Add("Include a lowercase letter.");
        if (!password.Any(char.IsDigit)) problems.Add("Include a number.");
        if (password.All(char.IsLetterOrDigit)) problems.Add("Include a symbol, such as ! or #.");
        return problems;
    }
}
