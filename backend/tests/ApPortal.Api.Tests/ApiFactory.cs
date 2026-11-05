using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace ApPortal.Api.Tests;

// Starts the real app against a test database that is rebuilt from
// db/schema.sql and db/seed.sql once per test run.
// Set AP_TEST_DATABASE to point at a different PostgreSQL database.
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string DemoPassword = "Test-Password-2026!";

    public static readonly string ConnectionString =
        Environment.GetEnvironmentVariable("AP_TEST_DATABASE")
        ?? "Host=localhost;Port=5432;Database=ap_portal_test;Username=ap_portal;Password=ap_portal_dev;Search Path=ap";

    public async Task InitializeAsync()
    {
        var repoRoot = FindRepoRoot();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using (var drop = new NpgsqlCommand("DROP SCHEMA IF EXISTS ap CASCADE", conn))
        {
            await drop.ExecuteNonQueryAsync();
        }
        foreach (var file in new[] { "schema.sql", "seed.sql" })
        {
            await using var cmd = new NpgsqlCommand(await File.ReadAllTextAsync(Path.Combine(repoRoot, "db", file)), conn);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    Task IAsyncLifetime.DisposeAsync() => Task.CompletedTask;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:ApPortal"] = ConnectionString,
            ["DemoData:Password"] = DemoPassword,
            ["Auth:ExposeResetLinkInResponse"] = "true",
            ["Auth:AuthRequestsPerMinute"] = "1000",
        }));
    }

    // A client with its own cookie jar, signed in as the given seeded user.
    public async Task<HttpClient> SignInAsync(string email, string? password = null)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = password ?? DemoPassword, remember = false });
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static string FindRepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "db", "schema.sql"))) return dir.FullName;
        }
        throw new InvalidOperationException("Could not find db/schema.sql above the test output folder.");
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
