using Dapper;
using Microsoft.AspNetCore.Identity;
using Npgsql;

namespace ApPortal.Api.Auth;

// Development only: gives the sample users from db/seed.sql (which have no
// usable password) the password in DemoData:Password, so you can sign in.
public sealed class DemoPasswordSeeder(
    NpgsqlDataSource db,
    IPasswordHasher<AppUser> hasher,
    IConfiguration config,
    ILogger<DemoPasswordSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var password = config["DemoData:Password"];
        if (string.IsNullOrEmpty(password))
        {
            return;
        }

        await using var conn = await db.OpenConnectionAsync(cancellationToken);
        var ids = (await conn.QueryAsync<long>("SELECT id FROM users WHERE password_hash LIKE '!%'")).ToList();
        foreach (var id in ids)
        {
            await conn.ExecuteAsync(
                "UPDATE users SET password_hash = @hash, password_changed_at = now() WHERE id = @id",
                new { id, hash = hasher.HashPassword(new AppUser(), password) });
        }
        if (ids.Count > 0)
        {
            logger.LogWarning("Set the demo password for {Count} sample users. Never set DemoData:Password in production.", ids.Count);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
