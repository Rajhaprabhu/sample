namespace ApPortal.Api.Auth;

public interface IEmailSender
{
    Task SendPasswordResetAsync(string toEmail, string toName, string resetLink, CancellationToken cancellationToken);
}

// Placeholder until an email service is connected: writes the message to the log.
// Replace it with an implementation for your provider (SMTP, SendGrid, Amazon SES...).
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendPasswordResetAsync(string toEmail, string toName, string resetLink, CancellationToken cancellationToken)
    {
        logger.LogInformation("Password reset email for {Email}: {Link}", toEmail, resetLink);
        return Task.CompletedTask;
    }
}
